"""Run the public scam sample on NEAR AI Cloud TEE models and report how hard it is.

Pre-hackathon research only: calls the API directly from this machine, not
through OutLayer. Usage:

    python3 -I eval.py <api_key_file> <sample.json> <model> [<model> ...]

The key is read from a file and never printed. Prints per-model totals and
the ids of missed items (ids only, so it is safe to run on any set).
"""
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

BASE = "https://cloud-api.near.ai/v1"
SYSTEM_PROMPT = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "grader", "prompt.txt")).read()
WORD = re.compile(r"[A-Za-z0-9]+")
LINE_START = re.compile(r"^[\s*_`>#\-\"']*([A-Za-z0-9]*)")


def user_content(item):
    return f"Channel: {item['channel']}\nFrom: {item['from']}\nMessage:\n{item['text']}"


def parse_label(content):
    """The verdict in a reply, read exactly as the grader does (grader/src/lib.rs
    parse_label; cases in grader/label-cases.json). None is scored as wrong."""
    if content is None:
        return None
    if "</think>" in content:
        answer = content[content.rfind("</think>") + len("</think>"):]
    elif "<think>" in content:
        return None
    else:
        answer = content
    labels = ("SCAM", "LEGIT")
    for line in answer.splitlines():
        first = LINE_START.match(line).group(1)
        if first in labels:
            return first
    found = [w for w in WORD.findall(answer) if w in labels]
    return found[0] if found and all(w == found[0] for w in found) else None


def classify(key, model, item):
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 2000,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content(item)},
        ],
    }
    headers = {"Authorization": f"Bearer {key}", "x-no-aliasing": "true"}
    for attempt in range(3):
        try:
            r = requests.post(f"{BASE}/chat/completions", headers=headers, json=body, timeout=120)
            if r.status_code == 200:
                return parse_label(r.json()["choices"][0]["message"].get("content"))
            if r.status_code < 500 and r.status_code != 429:
                return None
        except requests.RequestException:
            pass
        time.sleep(2 * (attempt + 1))
    return None


def main():
    key = open(sys.argv[1]).read().strip()
    items = json.load(open(sys.argv[2]))["items"]
    for model in sys.argv[3:]:
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=4) as pool:
            preds = list(pool.map(lambda it: classify(key, model, it), items))
        c = {"tp": 0, "fp": 0, "tn": 0, "fn": 0, "unparsed": 0}
        missed = []
        for item, pred in zip(items, preds):
            scam = item["label"] == "SCAM"
            if pred is None:
                c["unparsed"] += 1
                c["fn" if scam else "fp"] += 1
                missed.append(item["id"] + "?")
            elif pred == "SCAM":
                c["tp" if scam else "fp"] += 1
                if not scam:
                    missed.append(item["id"])
            else:
                c["fn" if scam else "tn"] += 1
                if scam:
                    missed.append(item["id"])
        scams, legit = c["tp"] + c["fn"], c["tn"] + c["fp"]
        print(json.dumps({
            "model": model,
            "detection_rate": round(c["tp"] / scams, 3) if scams else None,
            "false_alarm_rate": round(c["fp"] / legit, 3) if legit else None,
            "accuracy": round((c["tp"] + c["tn"]) / len(items), 3),
            "counts": c,
            "wrong_ids": missed,
            "seconds": round(time.time() - t0, 1),
        }))


if __name__ == "__main__":
    main()
