"""Tests for server.py: Ollama-origin validation (CSP injection), static-file guards.
Run: python -m unittest discover -s tests -p "test_*.py"
"""
import importlib.util
import http.server
import json
import pathlib
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("dictate_server", ROOT / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

INJECTION_PAYLOADS = [
    "http://x;script-src-elem * 'unsafe-inline';script-src-attr 'unsafe-inline'",
    "http://x;sandbox",
    "http://x,script-src",
    "http://x script-src *",
    "http://'x'",
    'http://"x"',
    "http://x%3Bsandbox",
    "http://x:0",
    "http://x:65536",
    "http://user:pass@x",
    "javascript:alert(1)",
    "file:///etc/passwd",
]


class TempConfigTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._orig_config = server.CONFIG_FILE
        server.CONFIG_FILE = pathlib.Path(self._tmp.name) / "config.json"

    def tearDown(self):
        server.CONFIG_FILE = self._orig_config
        self._tmp.cleanup()

    def stored(self):
        try:
            return json.loads(server.CONFIG_FILE.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}


class OllamaOriginTests(TempConfigTest):
    def test_injection_payloads_are_rejected(self):
        for payload in INJECTION_PAYLOADS:
            with self.subTest(payload=payload):
                self.assertIsNone(server.ollama_origin(payload))

    def test_injection_payloads_are_not_persisted(self):
        for payload in INJECTION_PAYLOADS:
            with self.subTest(payload=payload):
                ok, _ = server.set_ollama_url(payload)
                self.assertFalse(ok)
                self.assertNotIn("ollamaUrl", self.stored())

    def test_control_characters_cannot_reach_the_header(self):
        # URL parsers strip tabs/newlines (WHATWG); whatever comes out must still be a plain origin.
        for payload in ("http://x\tsandbox", "http://x\n;sandbox", "http://x\r\nSet-Cookie: a"):
            with self.subTest(payload=payload):
                origin = server.ollama_origin(payload)
                self.assertTrue(origin is None or server.OLLAMA_ORIGIN.fullmatch(origin), origin)

    def test_valid_urls_are_normalised_to_an_origin(self):
        self.assertEqual(server.ollama_origin("http://192.168.1.50:11434/api"), "http://192.168.1.50:11434")
        self.assertEqual(server.ollama_origin("https://Ollama.Example"), "https://ollama.example")
        self.assertEqual(server.ollama_origin("http://[::1]:11434"), "http://[::1]:11434")
        self.assertEqual(server.ollama_origin("http://host:80"), "http://host")

    def test_invalid_stored_value_is_dropped_on_read(self):
        server.CONFIG_FILE.write_text(json.dumps({"ollamaUrl": "http://x;sandbox", "projectsRoot": "keep"}), encoding="utf-8")
        self.assertIsNone(server.get_ollama_url())
        self.assertNotIn("sandbox", server.content_security_policy())
        self.assertEqual(self.stored(), {"projectsRoot": "keep"})

    def test_csp_contains_valid_saved_origin_only(self):
        server.set_ollama_url("http://192.168.1.50:11434")
        connect = [d for d in server.content_security_policy().split("; ") if d.startswith("connect-src")][0]
        self.assertEqual(connect, "connect-src 'self' http://localhost:* http://127.0.0.1:* http://192.168.1.50:11434")

    def test_model_id_must_match_fully(self):
        self.assertTrue(server.MODEL_ID.fullmatch("gemini-2.5-flash"))
        self.assertIsNone(server.MODEL_ID.fullmatch("gemini-2.5-flash/../x"))
        self.assertIsNone(server.MODEL_ID.fullmatch("../x"))


class HttpTests(TempConfigTest):
    def setUp(self):
        super().setUp()
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        super().tearDown()

    def request(self, path, method="GET", body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def test_null_byte_path_is_404(self):
        self.assertEqual(self.request("/js/app.js%00")[0], 404)

    def test_traversal_is_404(self):
        self.assertEqual(self.request("/js/%2e%2e/server.py")[0], 404)

    def test_injection_post_is_rejected_and_header_stays_clean(self):
        for payload in INJECTION_PAYLOADS:
            with self.subTest(payload=payload):
                status, _, _ = self.request("/api/ollama-url", "POST", {"url": payload})
                self.assertEqual(status, 400)
        status, headers, _ = self.request("/")
        self.assertEqual(status, 200)
        csp = headers["Content-Security-Policy"]
        self.assertIn("connect-src 'self' http://localhost:* http://127.0.0.1:*;", csp)
        self.assertNotIn("unsafe-inline", csp)
        self.assertNotIn("sandbox", csp)


if __name__ == "__main__":
    unittest.main()
