# /evals — Run LLM eval suite

Run the golden eval suite against `evals/golden.jsonl` to verify AI correction quality.

## Usage

```
/evals                      # run against default provider (Gemini or Ollama)
/evals --model gemini       # test against Gemini
/evals --model ollama       # test against local Ollama
/evals --smoke              # run only smoke-tagged cases (release gate minimum)
```

## Steps

1. Check `evals/golden.jsonl` exists and has at least 5 cases
2. Run: `python evals/run_evals.py [--model <profile>] [--smoke]`
3. Report:
   - Pass/fail per case with case ID and description
   - Overall pass rate (X/N passed)
   - Any cases scoring below threshold (flagged for review)
4. Saturation warning: if **all cases pass**, print:
   > "100% pass rate — eval set may be saturated. Consider adding harder or more
   > representative cases before the next model upgrade."
5. Regression warning: if pass rate **drops vs baseline**, surface specific failing cases
   and block the model upgrade

## Release gate

`/release` runs `/evals --smoke` as part of the pre-ship sequence. A failing smoke eval
blocks the release the same way a failing test does.

## Maintaining the eval set

- **On production failure:** add the failing input as a new case BEFORE fixing the prompt
- **On model upgrade:** run `/evals --model <new>` first; understand any regressions
- **On saturation:** archive too-easy cases to `evals/archive/`; add 3–5 harder ones
- Baseline model: `Gemini 2.5 Flash` (cloud) / Ollama user-configured (local)
  Update `# LLM Evals` in CLAUDE.md when the baseline changes
