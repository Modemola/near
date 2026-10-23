"""Summarise a label audit and write a review file of items worth a human look.

Usage:
    python3 -I analyze.py <set.json> <audit.jsonl> <review.md>

For each item, a model's vote is its majority answer over its runs (no answer
counts as wrong). Items are flagged as:
  - "check label": most models disagree with our label, so the label may be wrong
    or the item ambiguous;
  - "hard": some models get it wrong; the items that separate models;
  - "unstable": a model gives different answers across runs.
Prints per-model results (mean and range over runs).
"""
import collections
import json
import sys


def main():
    items = {i["id"]: i for i in json.load(open(sys.argv[1]))["items"]}
    rows = [json.loads(l) for l in open(sys.argv[2])]
    out_path = sys.argv[3]

    by = collections.defaultdict(list)  # (model, id) -> preds over runs
    answers = collections.defaultdict(list)  # id -> (model, pred, answer)
    errors = collections.Counter()
    for r in rows:
        if r.get("error"):
            errors[r["model"]] += 1
        by[(r["model"], r["id"])].append(r.get("pred"))
        if r.get("pred") != r["label"]:
            answers[r["id"]].append((r["model"], r.get("pred"), r.get("answer") or r.get("finish") or r.get("error")))
    models = sorted({m for m, _ in by})

    print("Per model (accuracy, detection, false alarms; mean over runs, range in brackets):")
    for m in models:
        per_run = collections.defaultdict(lambda: collections.Counter())
        for r in rows:
            if r["model"] != m:
                continue
            c = per_run[r["run"]]
            scam = r["label"] == "SCAM"
            pred = r.get("pred")
            c["n"] += 1
            if scam:
                c["scams"] += 1
                c["tp"] += pred == "SCAM"
            else:
                c["legit"] += 1
                c["fp"] += pred != "LEGIT"
            c["ok"] += pred == r["label"]
        accs = [c["ok"] / c["n"] for c in per_run.values() if c["n"]]
        dets = [c["tp"] / c["scams"] for c in per_run.values() if c["scams"]]
        fas = [c["fp"] / c["legit"] for c in per_run.values() if c["legit"]]
        n = sum(c["n"] for c in per_run.values())
        fmt = lambda xs: f"{sum(xs)/len(xs):.1%} [{min(xs):.0%}-{max(xs):.0%}]" if xs else "-"
        print(f"  {m:32s} acc {fmt(accs):18s} det {fmt(dets):18s} false-alarm {fmt(fas):18s} answers {n} errors {errors[m]}")

    flagged = []
    for iid, it in items.items():
        votes = []
        unstable = []
        for m in models:
            preds = by.get((m, iid), [])
            if not preds:
                continue
            maj = collections.Counter(preds).most_common(1)[0][0]
            votes.append(maj == it["label"])
            if len(set(preds)) > 1:
                unstable.append(m)
        if not votes:
            continue
        wrong = votes.count(False)
        if wrong * 2 > len(votes):
            kind = "check label"
        elif wrong:
            kind = "hard"
        elif unstable:
            kind = "unstable"
        else:
            continue
        flagged.append((kind, wrong, len(votes), unstable, it))

    order = {"check label": 0, "hard": 1, "unstable": 2}
    flagged.sort(key=lambda f: (order[f[0]], -f[1], f[4]["id"]))
    counts = collections.Counter(f[0] for f in flagged)
    print(f"\nFlagged: {dict(counts)}; clean (every model right every run): {len(items) - len(flagged)}")

    with open(out_path, "w") as f:
        f.write("# Private scam set: items to review\n\n")
        f.write("PRIVATE. Do not commit or share.\n\n")
        f.write(f"Flagged {dict(counts)} of {len(items)} items. "
                "For each item: keep the label, change it, or drop the item.\n\n")
        for kind, wrong, total, unstable, it in flagged:
            f.write(f"## {it['id']} · {kind} · {wrong}/{total} models wrong · our label **{it['label']}**\n\n")
            f.write(f"- {it['category']}, {it['difficulty']}, {it['channel']}, from: {it['from']}\n")
            f.write(f"- Our rationale: {it['rationale']}\n")
            if unstable:
                f.write(f"- Changed answer between runs: {', '.join(unstable)}\n")
            f.write("\n> " + it["text"].replace("\n", "\n> ") + "\n\n")
            seen = set()
            for m, pred, ans in answers.get(it["id"], []):
                if m in seen:
                    continue
                seen.add(m)
                f.write(f"- **{m}** said {pred or 'nothing'}: {str(ans)[:220]}\n")
            f.write("\nDecision: keep / relabel / drop\n\n---\n\n")


if __name__ == "__main__":
    main()
