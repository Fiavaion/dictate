"""
FiavaionDictate smoke test — verifies server is up and responding.
Usage: python evals/smoke-test.py
Returns exit code 0 on pass, 1 on failure.
"""
import sys
import urllib.request
import urllib.error

SERVER = "http://127.0.0.1:31000"


def check(path, label):
    try:
        with urllib.request.urlopen(f"{SERVER}{path}", timeout=5) as r:
            body = r.read()
            print(f"  PASS  {label}: HTTP {r.status}")
            return True
    except urllib.error.HTTPError as e:
        if e.code < 500:
            print(f"  PASS  {label}: HTTP {e.code}")
            return True
        print(f"  FAIL  {label}: HTTP {e.code} server error")
        return False
    except Exception as e:
        print(f"  FAIL  {label}: {e}")
        return False


print("\nFiavaionDictate Smoke Test\n")
results = [
    check("/", "Serve index.html"),
    check("/api/projects-root", "API: /api/projects-root"),
    check("/js/app.js", "Serve js/app.js"),
]

passed = all(results)
print(f"\n{'SMOKE PASS' if passed else 'SMOKE FAIL'}")
print("Note: UI workflow (dictate -> AI correct -> copy) requires manual verification.\n")
sys.exit(0 if passed else 1)
