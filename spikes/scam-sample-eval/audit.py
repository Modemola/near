"""Label audit: classify every item of a set with several TEE models, several runs each.

Usage:
    python3 -I audit.py <api_key_file> <set.json> <out.jsonl> <runs> <model> [<model> ...]

Appends one JSON line per (model, run, item) to <out.jsonl> and skips lines already
there, so an interrupted audit resumes. Only send private items to TEE-attested
models: anything else leaks the set to the model provider.
"""
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests

from eval import BASE, SYSTEM_PROMPT, parse_label, user_content

MAX_TOKENS = 4000
PER_MODEL_WORKERS = 4
lock = threading.Lock()


def call(key, model, item):
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": MAX_TOKENS,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content(item)},
        ],
    }
    headers = {"Authorization": f"Bearer {key}", "x-no-aliasing": "true"}
    error = None
    for attempt in range(6):
        try:
            t0 = time.time()
            r = requests.post(f"{BASE}/chat/completions", headers=headers, json=body, timeout=300)
            if r.status_code == 200:
                choice = r.json()["choices"][0]
                content = choice["message"].get("content")
                return {
                    "pred": parse_label(content),
                    "finish": choice.get("finish_reason"),
                    "answer": (content or "").split("</think>")[-1].strip()[:300],
                    "seconds": round(time.time() - t0, 1),
                }
            error = f"http {r.status_code}"
            if r.status_code in (401, 402, 403):
                return {"pred": None, "error": error, "fatal": True}
        except requests.RequestException as e:
            error = type(e).__name__
        time.sleep(min(60, 3 * 2 ** attempt))
    return {"pred": None, "error": error}


def run_model(key, model, items, runs, done, out_path):
    stop = threading.Event()

    def one(task):
        run, item = task
        if stop.is_set():
            return
        res = call(key, model, item)
        if res.get("fatal"):
            stop.set()
        line = {"model": model, "run": run, "id": item["id"], "label": item["label"], **res}
        with lock, open(out_path, "a") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")

    tasks = [(r, it) for r in range(1, runs + 1) for it in items if (model, r, it["id"]) not in done]
    with ThreadPoolExecutor(max_workers=PER_MODEL_WORKERS) as pool:
        list(pool.map(one, tasks))
    print(f"{model}: {'stopped (auth/credit error)' if stop.is_set() else 'finished'}", flush=True)


def main():
    key = open(sys.argv[1]).read().strip()
    items = json.load(open(sys.argv[2]))["items"]
    out_path, runs, models = sys.argv[3], int(sys.argv[4]), sys.argv[5:]
    done = set()
    if os.path.exists(out_path):
        for line in open(out_path):
            d = json.loads(line)
            if d.get("pred") is not None or d.get("finish") == "length":
                done.add((d["model"], d["run"], d["id"]))
    with ThreadPoolExecutor(max_workers=len(models)) as pool:
        for m in models:
            pool.submit(run_model, key, m, items, runs, done, out_path)


if __name__ == "__main__":
    main()
