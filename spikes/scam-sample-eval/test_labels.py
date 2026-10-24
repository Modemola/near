"""Check that the audit scripts read replies exactly as the grader does."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval import parse_label  # noqa: E402

cases = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "grader", "label-cases.json")))
bad = [(reply, want, parse_label(reply)) for reply, want in cases["cases"] if parse_label(reply) != want]
for reply, want, got in bad:
    print(f"MISMATCH {reply!r}: want {want}, got {got}")
print(f"{len(cases['cases']) - len(bad)}/{len(cases['cases'])} label cases match the grader")
sys.exit(1 if bad else 0)
