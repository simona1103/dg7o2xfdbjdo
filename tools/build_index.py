#!/usr/bin/env python3
"""docs/data/issues/*.json から docs/data/index.json を作る（GitHub Actions が配信前に毎回実行）。
壊れた号ファイルは飛ばして警告だけ出すので、1 日分の失敗でページ全体が止まらない。"""
import json, os, re, sys, glob
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..", "docs", "data")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TOPICS = {"claude", "dev", "model", "local", "sec", "biz"}

issues, stories = [], {}
for path in sorted(glob.glob(os.path.join(ROOT, "issues", "*.json"))):
    name = os.path.basename(path)[:-5]
    try:
        d = json.load(open(path, encoding="utf-8"))
        assert isinstance(d, dict) and d.get("date") == name and DATE.match(name), "date がファイル名と一致しない"
        news = [n for n in d.get("news", []) if isinstance(n, dict) and n.get("id")]
    except Exception as e:
        print(f"::warning file={path}::読み込めないので飛ばす: {e}"); continue
    topics, items = {}, []
    for n in news:
        if n.get("topic") in TOPICS: topics[n["topic"]] = topics.get(n["topic"], 0) + 1
        if n.get("story") and n.get("storyTitle"): stories[n["story"]] = n["storyTitle"]
        pts = n.get("points") or [""]
        it = {k: n.get(k, "") for k in ("id", "title", "topic", "source", "date")}
        it["point"] = pts[0] if isinstance(pts, list) and pts else ""
        if n.get("story"): it["story"] = n["story"]
        if isinstance(n.get("deadline"), dict): it["deadline"] = n["deadline"]
        items.append(it)
    src = [s for s in d.get("sources", []) if isinstance(s, list) and len(s) == 2]
    issues.append({"date": name, "weekday": d.get("weekday", ""), "headline": d.get("headline", ""),
                   "costUsd": d.get("costUsd", 0), "sourcesOk": sum(1 for s in src if s[1]), "sourcesTotal": len(src),
                   "topics": topics, "items": items})

out = {"version": 1, "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "stories": stories,
       "issues": sorted(issues, key=lambda e: e["date"], reverse=True)}
json.dump(out, open(os.path.join(ROOT, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"index.json: {len(issues)} 号")
