"""
FiavaionDictate smoke test — verifies the local server is up and serves only what it should.
Usage: python evals/smoke-test.py
Returns exit code 0 on pass, 1 on failure. A check passes only on its exact expected status.
"""
import sys
import urllib.request
import urllib.error

SERVER = "http://127.0.0.1:31000"


def check(path, label, expected=200, must_contain=None):
    try:
        with urllib.request.urlopen(f"{SERVER}{path}", timeout=5) as r:
            status, body, headers = r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        status, body, headers = e.code, e.read(), e.headers
    except Exception as e:
        print(f"  FAIL  {label}: {e}")
        return False
    if status != expected:
        print(f"  FAIL  {label}: HTTP {status}, expected {expected}")
        return False
    if must_contain and must_contain not in body:
        print(f"  FAIL  {label}: response missing {must_contain!r}")
        return False
    if expected == 200 and "Content-Security-Policy" not in headers:
        print(f"  FAIL  {label}: no Content-Security-Policy header")
        return False
    print(f"  PASS  {label}: HTTP {status}")
    return True


print("\nFiavaionDictate Smoke Test\n")
results = [
    check("/", "Serve index.html", 200, b'<script type="module" src="js/app.js">'),
    check("/api/projects-root", "API: /api/projects-root", 200, b'"path"'),
    check("/api/ollama-url", "API: /api/ollama-url", 200, b'"url"'),
    check("/js/app.js", "Serve js/app.js", 200),
    check("/css/components.css", "Serve css/components.css", 200),
    check("/server.py", "Server source is not served", 404),
    check("/config.json", "Config is not served", 404),
    check("/js/", "No directory listing", 404),
    check("/js/app.js%00", "Null byte in path", 404),
    check("/api/nope", "Unknown API route", 404),
]

passed = all(results)
print(f"\n{'SMOKE PASS' if passed else 'SMOKE FAIL'}")
print("Note: UI workflow (dictate -> AI correct -> copy) requires manual verification.\n")
sys.exit(0 if passed else 1)
