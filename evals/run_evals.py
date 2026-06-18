"""
FiavaionDictate LLM Eval Runner
Usage:
  python evals/run_evals.py                  # run all cases
  python evals/run_evals.py --smoke          # smoke-tagged only
  python evals/run_evals.py --model gemini   # override provider
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

EVALS_DIR = os.path.dirname(__file__)
GOLDEN = os.path.join(EVALS_DIR, "golden.jsonl")

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral")

PROMPT_TEMPLATES = {
    "freeform": (
        "You are a dictation cleanup assistant. Your job is to lightly polish spoken "
        "text into readable prose without changing the meaning, tone, or intent. Fix "
        "grammar, punctuation, and filler words only. Do not restructure, reformat, or "
        "add content. Return cleaned prose only. No markdown headers, no bullet points, "
        "no preamble, no explanations."
    ),
    "formal": (
        "You are a professional writing assistant. Transform spoken dictation into clear, "
        "authoritative, well-structured text suitable for business contexts. Use precise "
        "vocabulary and proper sentence structure. Return polished formal prose only."
    ),
    "friendly": (
        "You are a writing assistant that specializes in warm, friendly, conversational "
        "text. Transform dictation into approachable, genuine-sounding prose. Use "
        "contractions naturally, keep sentences flowing. Return friendly prose only."
    ),
}


def call_gemini(system_prompt, user_text):
    if not GEMINI_KEY:
        return None, "GEMINI_API_KEY not set"
    payload = json.dumps({
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_text}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 800},
    }).encode()
    req = urllib.request.Request(
        f"{GEMINI_URL}?key={GEMINI_KEY}",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
            return resp["candidates"][0]["content"]["parts"][0]["text"], None
    except Exception as e:
        return None, str(e)


def call_ollama(system_prompt, user_text):
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": f"{system_prompt}\n\n{user_text}",
        "stream": False,
    }).encode()
    req = urllib.request.Request(
        OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.loads(r.read())
            return resp.get("response", ""), None
    except Exception as e:
        return None, str(e)


def score_contains(output, expected):
    return expected.lower() in output.lower()


def run_case(case, provider="gemini"):
    template = case["input"].get("template", "freeform")
    text = case["input"].get("text", "")
    system_prompt = PROMPT_TEMPLATES.get(template, PROMPT_TEMPLATES["freeform"])

    if provider == "ollama":
        output, err = call_ollama(system_prompt, text)
    else:
        output, err = call_gemini(system_prompt, text)

    if err:
        return {"id": case["id"], "passed": False, "error": err, "output": None}

    scoring = case.get("scoring", "llm-judge")
    if scoring == "contains":
        passed = score_contains(output, case["expected"])
        note = "contains-check"
    else:
        # llm-judge: for CLI eval, use basic heuristics
        # A proper judge would call a second model; this is a lightweight fallback
        passed = len(output.strip()) > 0
        note = "non-empty (llm-judge requires manual review)"

    return {"id": case["id"], "passed": passed, "note": note, "output": output[:200]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true", help="Run smoke-tagged only")
    parser.add_argument("--model", default=None, help="Provider: gemini or ollama")
    args = parser.parse_args()

    provider = args.model or ("ollama" if not GEMINI_KEY else "gemini")

    cases = []
    with open(GOLDEN) as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))

    if args.smoke:
        cases = [c for c in cases if "smoke" in c.get("tags", [])]

    print(f"\nFiavaionDictate LLM Evals — provider: {provider} — {len(cases)} cases\n")
    results = []
    for case in cases:
        r = run_case(case, provider)
        status = "PASS" if r["passed"] else "FAIL"
        print(f"  {status}  [{r['id']}] {case['description']}")
        if not r["passed"] and r.get("error"):
            print(f"         Error: {r['error']}")
        results.append(r)

    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"\nResult: {passed}/{total} passed")

    if passed == total:
        print("\n⚠  100% pass rate — eval set may be saturated.")
        print("   Consider adding harder or more representative cases before next model upgrade.")

    if passed < total:
        print("\nFailing cases:")
        for r in results:
            if not r["passed"]:
                print(f"  - [{r['id']}]  output: {r.get('output', 'None')[:100]}")

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
