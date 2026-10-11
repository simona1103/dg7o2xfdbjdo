#!/usr/bin/env python3
"""号ファイル（docs/data/issues/YYYY-MM-DD.json）の検査。エージェントがコミット前に実行する。
使い方: python3 validate_issue.py issue.json [YYYY-MM-DD]
問題があれば 1 行ずつ表示して終了コード 1。問題がなければ "OK" と表示して 0。"""
import json, re, sys
from urllib.parse import urlparse

TOPICS = {"claude", "dev", "model", "local", "sec", "biz"}
FIG_TYPES = {"compare", "timeline", "delta", "stats", "flow", "callout"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MD = re.compile(r"^\d{2}/\d{2}$")
ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,60}$")
LIMITS = {"news": 8, "tips": 4, "unverified": 3, "domestic": 3, "keyPoints": 3}
errs = []

def err(msg): errs.append(msg)
def is_str(v): return isinstance(v, str)
def url_ok(u, https_only=False):
    try: p = urlparse(u)
    except Exception: return False
    return p.scheme in (("https",) if https_only else ("https", "http")) and bool(p.netloc)

def check_figure(where, f):
    if f is None: return
    if not isinstance(f, dict) or f.get("type") not in FIG_TYPES:
        return err(f"{where}.figure: type は {sorted(FIG_TYPES)} のどれか")
    t = f["type"]
    if t == "compare":
        cols, rows = f.get("cols"), f.get("rows")
        if not (isinstance(cols, list) and len(cols) >= 2 and all(map(is_str, cols))): err(f"{where}.figure.cols: 2 個以上の文字列")
        elif not (isinstance(rows, list) and rows and all(isinstance(r, list) and len(r) == len(cols) + 1 and all(map(is_str, r)) for r in rows)):
            err(f"{where}.figure.rows: 各行は [見出し, 列ごとの値…] で cols より 1 つ多い文字列")
    elif t == "timeline":
        pts = f.get("points")
        if not (isinstance(pts, list) and pts and all(isinstance(p, dict) and DATE.match(str(p.get("date", ""))) and is_str(p.get("label")) for p in pts)):
            err(f"{where}.figure.points: [{{date: YYYY-MM-DD, label}}]")
        if f.get("today") and not DATE.match(str(f["today"])): err(f"{where}.figure.today: YYYY-MM-DD")
    elif t == "delta":
        rows = f.get("rows")
        if not (isinstance(rows, list) and rows and all(isinstance(r, dict) and isinstance(r.get("before"), (int, float)) and isinstance(r.get("after"), (int, float)) and r.get("before") for r in rows)):
            err(f"{where}.figure.rows: [{{label, before(0 以外の数値), after(数値), unit, digits}}]")
    elif t == "stats":
        items = f.get("items")
        if not (isinstance(items, list) and items and all(isinstance(i, dict) and is_str(i.get("value")) and is_str(i.get("label")) for i in items)):
            err(f"{where}.figure.items: [{{value, label}}]（どちらも文字列）")
    elif t == "flow":
        cols = f.get("cols")
        if not (isinstance(cols, list) and len(cols) >= 2 and all(isinstance(c, list) and c and all(isinstance(n, dict) and is_str(n.get("label")) for n in c) for c in cols)):
            err(f"{where}.figure.cols: [[{{label, sub?, emph?}}], …] を 2 列以上")
    elif t == "callout":
        if not (is_str(f.get("heading")) and is_str(f.get("body"))): err(f"{where}.figure: heading と body（文字列）")

def main(path, expect_date=None):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"JSON として読めない: {e}"); return 1
    if not isinstance(d, dict): print("最上位はオブジェクト"); return 1
    if not DATE.match(str(d.get("date", ""))): err("date: YYYY-MM-DD")
    if expect_date and d.get("date") != expect_date: err(f"date が {expect_date} ではない")
    for k in ("weekday", "headline", "generatedAt"):
        if not is_str(d.get(k)) or not d.get(k): err(f"{k}: 空でない文字列")
    if is_str(d.get("headline")) and len(d["headline"]) > 60: err("headline: 60 字以内")
    for k, lim in LIMITS.items():
        v = d.get(k, [])
        if not isinstance(v, list): err(f"{k}: 配列"); continue
        if len(v) > lim: err(f"{k}: 最大 {lim} 件（{len(v)} 件ある）")
    news = d.get("news") if isinstance(d.get("news"), list) else []
    ids = [n.get("id") for n in news if isinstance(n, dict)]
    if len(set(ids)) != len(ids): err("news.id が重複している")
    if news and sum(1 for n in news if isinstance(n, dict) and n.get("lead") is True) != 1: err("news: lead: true はちょうど 1 件")
    figs = 0
    for i, n in enumerate(news):
        w = f"news[{i}]"
        if not isinstance(n, dict): err(f"{w}: オブジェクト"); continue
        if not ID.match(str(n.get("id", ""))): err(f"{w}.id: 小文字英数字とハイフン")
        if n.get("topic") not in TOPICS: err(f"{w}.topic: {sorted(TOPICS)} のどれか")
        for k in ("title", "source", "date", "url"):
            if not is_str(n.get(k)) or not n.get(k): err(f"{w}.{k}: 空でない文字列")
        if is_str(n.get("date")) and not (MD.match(n["date"]) or n["date"] in ("最新版",)): err(f"{w}.date: MM/DD")
        pts = n.get("points")
        if not (isinstance(pts, list) and 1 <= len(pts) <= 3 and all(is_str(p) and p for p in pts)): err(f"{w}.points: 1〜3 個の文字列")
        if not is_str(n.get("impact", "")): err(f"{w}.impact: 文字列（なければ空文字）")
        if is_str(n.get("url")) and not url_ok(n["url"]): err(f"{w}.url: http(s) の URL")
        if n.get("image") and not url_ok(str(n["image"]), https_only=True): err(f"{w}.image: https の URL か空文字")
        if not isinstance(n.get("reactions", []), list): err(f"{w}.reactions: 配列")
        if n.get("story") and not ID.match(str(n["story"])): err(f"{w}.story: 小文字英数字とハイフン")
        if n.get("story") and not is_str(n.get("storyTitle")): err(f"{w}.storyTitle: story があるときは話題名を入れる")
        dl = n.get("deadline")
        if dl is not None and not (isinstance(dl, dict) and DATE.match(str(dl.get("from", ""))) and DATE.match(str(dl.get("date", ""))) and is_str(dl.get("label"))):
            err(f"{w}.deadline: {{from: YYYY-MM-DD, date: YYYY-MM-DD, label}}")
        if n.get("figure") is not None: figs += 1
        check_figure(w, n.get("figure"))
    if figs > 4: err(f"図は 1 号で最大 4 個（{figs} 個ある）")
    for i, k in enumerate(d.get("keyPoints", []) if isinstance(d.get("keyPoints"), list) else []):
        if not (isinstance(k, list) and len(k) == 2 and is_str(k[0]) and k[1] in ids): err(f"keyPoints[{i}]: [要点の文, news の id]")
    for i, t in enumerate(d.get("tips", []) if isinstance(d.get("tips"), list) else []):
        w = f"tips[{i}]"
        if not isinstance(t, dict): err(f"{w}: オブジェクト"); continue
        for k in ("kind", "title", "where", "date", "heat", "summary", "url"):
            if not is_str(t.get(k)) or not t.get(k): err(f"{w}.{k}: 空でない文字列")
        if is_str(t.get("url")) and not url_ok(t["url"]): err(f"{w}.url: http(s) の URL")
        if t.get("sample"): err(f"{w}.sample: 本番では使わない")
    for i, u in enumerate(d.get("unverified", []) if isinstance(d.get("unverified"), list) else []):
        if not (isinstance(u, dict) and all(is_str(u.get(k)) and u.get(k) for k in ("title", "origin", "note", "url")) and url_ok(u["url"])): err(f"unverified[{i}]: title, origin, note, url（http(s)）")
    for i, x in enumerate(d.get("domestic", []) if isinstance(d.get("domestic"), list) else []):
        if not (isinstance(x, dict) and all(is_str(x.get(k)) and x.get(k) for k in ("title", "where", "date", "desc", "url")) and url_ok(x["url"])): err(f"domestic[{i}]: title, where, date, desc, url（http(s)）")
        elif x.get("image") and not url_ok(str(x["image"]), https_only=True): err(f"domestic[{i}].image: https の URL か空文字")
    src = d.get("sources")
    if not (isinstance(src, list) and src and all(isinstance(s, list) and len(s) == 2 and is_str(s[0]) and s[1] in (0, 1) for s in src)): err("sources: [[情報源名, 1 または 0], …]")
    if errs:
        print("\n".join(errs)); return 1
    print("OK"); return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
