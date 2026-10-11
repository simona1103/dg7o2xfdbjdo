"use strict";
/* ============================================================
   AI ニュース朝刊 — 固定テンプレート（毎日は変えない）。
   データ：data/index.json（号の一覧・件数・検索用の要約）と
           data/issues/YYYY-MM-DD.json（号の本文）。エージェントが毎朝書き足す。
   安全のため：文字列はすべてエスケープしてから HTML に入れる。リンクは http(s) のみ、
   画像は https のみ。エージェントは HTML を書かず、図も {type, data} だけを渡す。
   ============================================================ */
const TOPICS = {
  claude: ["Claude", "--t-claude"], dev: ["開発ツール", "--t-dev"], model: ["他社モデル", "--t-model"],
  local: ["ローカル LLM", "--t-local"], sec: ["規制・セキュリティ", "--t-sec"], biz: ["導入事例", "--t-biz"]
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const safeUrl = (u) => { try { const x = new URL(str(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#"; } catch { return "#"; } };
const safeImg = (u) => { try { const x = new URL(str(u)); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
const validDeadline = (d) => (d && DATE_RE.test(d.date) && DATE_RE.test(d.from) ? { date: d.date, from: d.from, label: str(d.label) } : null);

let INDEX = [], idxOf = {}, dates = [], allItems = [], STORIES = {};
const issueCache = new Map();
async function getJson(path) {
  const r = await fetch(path, { cache: "no-cache", credentials: "omit" });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}
async function loadIndex() {
  const j = await getJson("data/index.json");
  STORIES = j && typeof j.stories === "object" && j.stories ? j.stories : {};
  INDEX = arr(j && j.issues).filter((e) => e && DATE_RE.test(e.date)).map((e) => {
    const topics = {};
    Object.entries(e.topics || {}).forEach(([k, v]) => { if (TOPICS[k] && num(v) > 0) topics[k] = num(v); });
    return { date: e.date, weekday: str(e.weekday), headline: str(e.headline), topics, n: Object.values(topics).reduce((a, b) => a + b, 0),
      ok: num(e.sourcesOk), total: num(e.sourcesTotal), cost: num(e.costUsd), sample: !!e.sample, full: true, items: arr(e.items) };
  }).sort((a, b) => a.date.localeCompare(b.date));
  idxOf = Object.fromEntries(INDEX.map((e) => [e.date, e]));
  dates = INDEX.map((e) => e.date).reverse();
  allItems = INDEX.flatMap((e) => e.items.filter((x) => x && x.id).map((x) => ({
    id: str(x.id), title: str(x.title), topic: str(x.topic), story: str(x.story), source: str(x.source),
    date: str(x.date), point: str(x.point), deadline: validDeadline(x.deadline), issue: e.date })));
}
function normIssue(j, date) {
  const news = arr(j.news).filter((n) => n && n.id).map((n) => ({
    id: str(n.id), lead: !!n.lead, topic: str(n.topic), story: str(n.story), title: str(n.title), source: str(n.source), date: str(n.date),
    points: arr(n.points).map(str).filter(Boolean), impact: str(n.impact), figure: n.figure && typeof n.figure === "object" ? n.figure : null,
    url: safeUrl(n.url), reactions: arr(n.reactions).map(str), image: safeImg(n.image), deadline: validDeadline(n.deadline) }))
    .map((n) => (n.points.length ? n : { ...n, points: [""] }));
  return {
    date, weekday: str(j.weekday), sample: !!j.sample, headline: str(j.headline), generatedAt: str(j.generatedAt),
    costUsd: num(j.costUsd), durationSec: num(j.durationSec),
    keyPoints: arr(j.keyPoints).map((k) => (Array.isArray(k) ? [str(k[0]), str(k[1])] : [str(k), ""])),
    news,
    tips: arr(j.tips).map((t) => ({ kind: str(t.kind), title: str(t.title), where: str(t.where), date: str(t.date), heat: str(t.heat), sample: !!t.sample, summary: str(t.summary), code: str(t.code), url: safeUrl(t.url) })),
    unverified: arr(j.unverified).map((u) => ({ title: str(u.title), origin: str(u.origin), note: str(u.note), url: safeUrl(u.url) })),
    domestic: arr(j.domestic).map((x) => ({ title: str(x.title), where: str(x.where), date: str(x.date), desc: str(x.desc), url: safeUrl(x.url), image: safeImg(x.image) })),
    sources: arr(j.sources).map((s) => [str(s[0]), s[1] ? 1 : 0])
  };
}
async function loadIssue(date) {
  if (!DATE_RE.test(date) || !idxOf[date]) throw new Error("unknown issue " + date);
  if (!issueCache.has(date)) issueCache.set(date, normIssue(await getJson(`data/issues/${date}.json`), date));
  return issueCache.get(date);
}

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const tColor = (t) => `var(${(TOPICS[t] || ["", "--ink-3"])[1]})`;
const tName = (t) => (TOPICS[t] || [t])[0];
const md = (d) => d.slice(5).replace("-", "/");
const dayMs = 864e5, T = (d) => new Date(d + "T00:00:00").getTime();
const chip = (t) => `<span class="chip" style="--c:${tColor(t)}"><i></i>${esc(tName(t))}</span>`;
const topicCount = (news) => news.reduce((o, n) => ((o[n.topic] = (o[n.topic] || 0) + 1), o), {});

/* ---------- small charts ---------- */
function spark(vals, color = "var(--accent)") {
  const W = 68, H = 26; if (vals.length < 2) return "";
  const max = Math.max(...vals), min = Math.min(...vals), r = max - min || 1;
  const pts = vals.map((v, i) => [2 + i * (W - 4) / (vals.length - 1), H - 3 - (v - min) / r * (H - 6)]);
  const [lx, ly] = pts[pts.length - 1];
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" opacity=".85"/><circle cx="${lx}" cy="${ly}" r="2.6" fill="${color}"/></svg>`;
}
function trend(entries, cur, W = 600) {
  W = Math.max(280, Math.round(W)); const H = 200, L = 26, R = 6, Tp = 10, B = 26;
  const max = Math.max(4, ...entries.map((e) => e.n)); const top = Math.ceil(max / 2) * 2;
  const slots = Math.max(entries.length, 14), off = slots - entries.length; // keep bar width steady while history is short
  const bw = (W - L - R) / slots, Y = (v) => Tp + (H - Tp - B) * (1 - v / top);
  let g = "";
  [0, top / 2, top].forEach((v) => { g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${v}</text>`; });
  const bars = entries.map((e, i) => {
    const x = L + (i + off) * bw + bw * 0.18, w = bw * 0.64; let y0 = Y(0), segs = "";
    Object.keys(TOPICS).forEach((t) => { const v = e.topics[t] || 0; if (!v) return; const h = Y(0) - Y(v);
      segs += `<rect x="${x.toFixed(1)}" y="${(y0 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h - 1, 0).toFixed(1)}" rx="2" fill="${tColor(t)}" opacity="${e.sample ? 0.55 : 1}"/>`; y0 -= h; });
    const lab = (i % 2 === entries.length % 2 || e.date === cur) ? `<text x="${x + w / 2}" y="${H - 9}" text-anchor="middle" font-size="11" fill="${e.date === cur ? "var(--ink)" : "var(--ink-3)"}" font-weight="${e.date === cur ? 700 : 400}">${md(e.date)}</text>` : "";
    const ring = e.date === cur ? `<rect x="${(x - 3).toFixed(1)}" y="${(y0 - 3).toFixed(1)}" width="${(w + 6).toFixed(1)}" height="${(Y(0) - y0 + 3).toFixed(1)}" rx="3" fill="none" stroke="var(--ink)" stroke-width="1.2"/>` : "";
    const body = `<rect class="hit" x="${(L + (i + off) * bw).toFixed(1)}" y="${Tp}" width="${bw.toFixed(1)}" height="${H - Tp - B}" fill="transparent"/>${segs}${ring}${lab}<title>${md(e.date)}：${e.n} 件${e.sample ? "（見本）" : ""}</title>`;
    return e.full ? `<a href="#d${e.date}">${body}</a>` : `<g>${body}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="直近 ${entries.length} 日の主要ニュース件数（トピック別）">${g}${bars}</svg>`;
}

/* ---------- figures: the agent writes only {type, data}; drawing is fixed here ---------- */
const textW = (s, size) => [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) < 256 ? size * 0.6 : size), 0);
let figSeq = 0;
function figFlow(f) {
  const fs = 13, ss = 11, pad = 14, gapX = 46, gapY = 12, mid = "ah" + (++figSeq);
  const hasSub = f.cols.some((c) => c.some((n) => n.sub));
  const bh = hasSub ? 48 : 36;
  const widths = f.cols.map((c) => Math.max(...c.map((n) => Math.max(textW(n.label, fs), textW(n.sub || "", ss)) + pad * 2), 76));
  const heights = f.cols.map((c) => c.length * bh + (c.length - 1) * gapY);
  const H = Math.max(...heights) + 4, xs = []; let x = 2;
  widths.forEach((w) => { xs.push(x); x += w + gapX; });
  const W = x - gapX + 2;
  const pos = f.cols.map((c, i) => c.map((n, j) => ({ x: xs[i], y: (H - heights[i]) / 2 + j * (bh + gapY), w: widths[i], n })));
  let edges = "";
  for (let i = 0; i < pos.length - 1; i++) {
    const a = pos[i], b = pos[i + 1];
    const pairs = a.length === b.length ? a.map((p, k) => [p, b[k]]) : a.flatMap((p) => b.map((q) => [p, q]));
    pairs.forEach(([p, q]) => {
      const x1 = p.x + p.w, y1 = p.y + bh / 2, x2 = q.x - 3, y2 = q.y + bh / 2, mx = (x1 + x2) / 2;
      edges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="var(--line-2)" stroke-width="1.5" marker-end="url(#${mid})"/>`;
    });
  }
  const boxes = pos.flat().map((p) => `
    <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${bh}" rx="7" fill="${p.n.emph ? "var(--accent-soft)" : "var(--surface)"}" stroke="${p.n.emph ? "var(--accent)" : "var(--line-2)"}" stroke-width="1.3"/>
    <text x="${p.x + p.w / 2}" y="${p.y + (p.n.sub ? 20 : bh / 2 + 4.5)}" text-anchor="middle" font-size="${fs}" font-weight="${p.n.emph ? 700 : 500}" fill="var(--ink)">${esc(p.n.label)}</text>
    ${p.n.sub ? `<text x="${p.x + p.w / 2}" y="${p.y + 37}" text-anchor="middle" font-size="${ss}" fill="var(--ink-3)">${esc(p.n.sub)}</text>` : ""}`).join("");
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${esc(f.title || "流れ図")}">
    <defs><marker id="${mid}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--ink-3)"/></marker></defs>${edges}${boxes}</svg>
    ${f.note ? `<div class="fig-note">${esc(f.note)}</div>` : ""}`;
}
function figCompare(f) {
  const cell = (v) => { const m = /^(ok|no|warn)\s+(.*)$/.exec(v); return m ? `<span class="badge ${m[1]}">${{ ok: "✓", no: "✗", warn: "!" }[m[1]]}</span>${inline(m[2])}` : inline(v); };
  return `<table class="cmp"><thead><tr><th></th>${f.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${f.rows.map((r) => `<tr><th>${esc(r[0])}</th>${r.slice(1).map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function figDelta(f) {
  return `<div class="delta">${f.rows.map((r) => {
    r = { ...r, before: num(r.before), after: num(r.after), digits: Math.min(4, num(r.digits)) }; if (!r.before) return "";
    const max = Math.max(r.before, r.after), pct = Math.round((r.after - r.before) / r.before * 100);
    const fmt = (v) => (r.unit === "$" ? "$" : "") + v.toFixed(r.digits ?? 0) + (r.unit && r.unit !== "$" ? " " + r.unit : "");
    return `<div><div class="delta-label"><span>${esc(r.label)}</span><span class="delta-pct ${pct < 0 ? "down" : "up"}">${pct > 0 ? "+" : ""}${pct}%</span></div>
      <div class="bars"><div><span>前</span><span class="b" style="width:${r.before / max * 100}%"></span><em>${fmt(r.before)}</em></div>
      <div class="after"><span>後</span><span class="b" style="width:${r.after / max * 100}%"></span><em>${fmt(r.after)}</em></div></div></div>`;
  }).join("")}</div>`;
}
function figTimeline(f) {
  const pts = arr(f.points).filter((p) => DATE_RE.test(p.date));
  if (!pts.length || (f.today && !DATE_RE.test(f.today))) throw new Error("bad timeline");
  const all = pts.map((p) => T(p.date)).concat(f.today ? [T(f.today)] : []);
  const lo = Math.min(...all), hi = Math.max(...all);
  const P = (d) => (hi === lo ? 50 : (T(d) - lo) / (hi - lo) * 100).toFixed(2);
  const dots = pts.map((p, i) => `<span class="tl2-pt${p.emph ? " emph" : ""}${i === 0 && pts.length > 1 ? " first" : ""}${i === pts.length - 1 && pts.length > 1 ? " last" : ""}" style="left:${P(p.date)}%"><span class="tl2-lab"><b>${md(p.date)}</b>${esc(p.label)}</span></span>`).join("");
  const today = f.today ? `<span class="tl2-today" style="left:${P(f.today)}%"><span>今日 ${md(f.today)}</span></span>` : "";
  const days = Math.round((T(pts[pts.length - 1].date) - T(f.today || pts[0].date)) / dayMs);
  return `<div class="tl2" role="img" aria-label="${esc(f.title || "日程")}"><div class="tl2-track">${today}${dots}</div></div>
    ${f.today && days > 0 ? `<div class="fig-note">${esc(pts[pts.length - 1].label)}まで あと ${days} 日</div>` : ""}`;
}
const figStats = (f) => `<div class="stats">${f.items.map((s) => `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join("")}</div>`;
const figCallout = (f) => `<div class="callout ${f.tone || "info"}"><b>${esc(f.heading || "")}</b><span>${inline(f.body || "")}</span></div>`;
const FIG = { flow: figFlow, compare: figCompare, delta: figDelta, timeline: figTimeline, stats: figStats, callout: figCallout };
const figure = (f) => {
  if (!f || !Object.prototype.hasOwnProperty.call(FIG, f.type)) return "";
  try { return `<figure class="figwrap"><div class="fig">${f.title ? `<div class="fig-title">${esc(f.title)}</div>` : ""}${FIG[f.type](f)}</div></figure>`; }
  catch { return ""; }
};

/* thumbnails: the article's og:image (hotlinked, credited) or a tile drawn from the source name */
function tile(n) {
  const name = (n.source || n.where || "").replace(/ (リリースノート|CHANGELOG|Changelog)$/, "");
  return `<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="160" height="90" fill="var(--chip)"/><rect width="5" height="90" fill="${tColor(n.topic)}"/>
    <text x="16" y="50" font-size="${textW(name, 17) > 132 ? 12.5 : 17}" font-weight="700" fill="var(--ink-2)">${esc(name)}</text>
    <text x="16" y="70" font-size="11" fill="var(--ink-3)">${esc(host(n.url))}</text></svg>`;
}
function thumb(n) {
  if (!n.image) return `<div class="thumb tile">${tile(n)}</div>`;
  return `<div class="thumb">${tile(n)}<img src="${esc(n.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="credit">画像：${esc(host(n.url))}</span></div>`;
}

/* ---------- dashboard ---------- */
function followChip(n, iss) {
  if (!n.story) return "";
  const st = allItems.filter((x) => x.story === n.story); const earlier = st.filter((x) => x.issue < iss.date);
  return earlier.length ? `<a class="chip thread" href="#t-${esc(n.story)}">続報 · ${esc(STORIES[n.story] || n.story)} ${st.length} 件目</a>` : "";
}
function card(n, iss) {
  return `<article class="card${n.image ? " has-img" : ""}" id="i-${esc(n.id)}" data-topic="${esc(n.topic)}">
    <div class="card-main"><div class="cb">
      <div class="byline"><b>${esc(n.source)}</b><span>${esc(n.date)}</span></div>
      <h3>${inline(n.title)}</h3>
      <ul class="points">${n.points.filter(Boolean).map((p) => `<li>${inline(p)}</li>`).join("")}</ul>
      ${n.impact ? `<div class="impact"><b>実務では</b>${inline(n.impact)}</div>` : ""}
    </div>${n.image ? thumb(n) : ""}</div>
    ${n.figure ? `<div class="card-fig">${figure(n.figure)}</div>` : ""}
    <div class="card-foot"><div class="tags">${chip(n.topic)}${followChip(n, iss)}</div>
      <div class="links"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">一次情報：${esc(host(n.url))}</a>${(n.reactions || []).map((r) => `<span>反応：${esc(r)}</span>`).join("")}</div></div></article>`;
}
let trendArgs = null;
function viewDash(iss) {
  const i = dates.indexOf(iss.date);
  const prev = dates[i + 1], next = dates[i - 1];
  const pos = INDEX.findIndex((e) => e.date === iss.date); const win = INDEX.slice(Math.max(0, pos - 13), pos + 1);
  const me = INDEX[pos], before = INDEX[pos - 1];
  const ok = iss.sources.filter((s) => s[1]).length, miss = iss.sources.filter((s) => !s[1]).map((s) => s[0]);
  const lead = iss.news.find((n) => n.lead) || iss.news[0];
  if (!lead) return `<header class="dhead"><div class="dhead-top"><span class="issue-no"><b>${esc(iss.date.replaceAll("-", "."))}（${esc(iss.weekday)}）</b>号</span></div><h1>${esc(iss.headline || "報告する新着はありませんでした")}</h1></header>`;
  const rest = iss.news.filter((n) => n !== lead);
  const follow = iss.news.filter((n) => n.story && allItems.some((x) => x.story === n.story && x.issue < iss.date));
  const deadlines = allItems.filter((x) => x.deadline && x.issue <= iss.date && T(x.deadline.date) >= T(iss.date))
    .sort((a, b) => a.deadline.date.localeCompare(b.deadline.date));
  const nextDl = deadlines[0]; const dlDays = nextDl ? Math.round((T(nextDl.deadline.date) - T(iss.date)) / dayMs) : null;
  const [y, m, d] = iss.date.split("-");
  const diff = before ? me.n - before.n : 0;
  const stories = [...new Set(allItems.filter((x) => x.story && x.issue <= iss.date).map((x) => x.story))]
    .map((s) => ({ s, its: allItems.filter((x) => x.story === s && x.issue <= iss.date).sort((a, b) => a.issue.localeCompare(b.issue)) }))
    .filter((o) => o.its.length > 1).sort((a, b) => b.its[b.its.length - 1].issue.localeCompare(a.its[a.its.length - 1].issue));
  const tc = topicCount(iss.news); const tmax = Math.max(1, ...Object.values(tc));
  const presentTopics = Object.keys(TOPICS).filter((t) => tc[t]);
  const sampleDays = win.filter((e) => e.sample).length;
  trendArgs = [win, iss.date];

  return `
  ${iss.sample ? '<p class="sample-note">見本の号です。過去号の見え方を確かめるために、実在の発表をもとに組み立てました。</p>' : ""}
  <header class="dhead">
    <div class="dhead-top"><span class="issue-no"><b>${y}.${m}.${d}（${iss.weekday}）</b>号</span>
      <span class="pills">${prev ? `<a class="pill" href="#d${prev}">← ${md(prev)}</a>` : '<span class="pill off">←</span>'}${next ? `<a class="pill" href="#d${next}">${md(next)} →</a>` : '<span class="pill off">→</span>'}
        <span class="pill">${esc(iss.generatedAt)} 生成 · ${(iss.durationSec / 60).toFixed(1)} 分 · $${iss.costUsd.toFixed(2)}</span></span></div>
    <h1>${esc(iss.headline)}</h1>
  </header>

  <div class="kpis">
    <a class="kpi" href="#news"><span class="lab">主要ニュース</span><span class="val">${iss.news.length}<small>件</small></span>
      <span class="sub">${before ? `前号比 <span class="${diff > 0 ? "up" : "down"}">${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(diff)}</span>` : "—"}</span>${spark(win.map((e) => e.n))}</a>
    <a class="kpi" href="#news" data-filter="claude"><span class="lab">Claude 関連</span><span class="val">${tc.claude || 0}<small>件</small></span>
      <span class="sub">${iss.news.length ? Math.round((tc.claude || 0) / iss.news.length * 100) : 0}% · 最優先トピック</span>${spark(win.map((e) => e.topics.claude || 0), "var(--t-claude)")}</a>
    <a class="kpi" href="#watch"><span class="lab">続報</span><span class="val">${follow.length}<small>件</small></span><span class="sub">過去号と同じ話題の続き</span></a>
    <a class="kpi" href="#unverified"><span class="lab">未確認の話題</span><span class="val">${iss.unverified.length}<small>件</small></span><span class="sub">一次情報が見つからない</span></a>
    ${nextDl ? `<a class="kpi warn" href="#deadlines"><span class="lab">次の期限</span><span class="val">${dlDays}<small>日後</small></span><span class="sub">${md(nextDl.deadline.date)} ${esc(nextDl.deadline.label)}</span></a>`
      : `<div class="kpi"><span class="lab">次の期限</span><span class="val">—</span><span class="sub">期限のある発表なし</span></div>`}
    <a class="kpi" href="#sources"><span class="lab">情報源</span><span class="val">${ok}<small>/${iss.sources.length}</small></span>
      <span class="sub">${miss.length ? "取得できず：" + esc(miss.join("、")) : "欠落なし"}</span>${spark(win.map((e) => e.ok / e.total), miss.length ? "var(--warn)" : "var(--ok)")}</a>
  </div>

  <div class="dash">
    <div class="stack c8">
    <article class="panel o1" id="i-${esc(lead.id)}">
      ${lead.image ? thumb(lead) : ""}
      <div class="lead"><span class="kicker">トップ</span><h3>${inline(lead.title)}</h3>
        <div class="byline"><b>${esc(lead.source)}</b><span>${esc(lead.date)}</span>${chip(lead.topic)}${followChip(lead, iss)}</div>
        <ul class="points">${lead.points.map((p) => `<li>${inline(p)}</li>`).join("")}</ul>
        ${lead.impact ? `<div class="impact"><b>実務では</b>${inline(lead.impact)}</div>` : ""}
        ${figure(lead.figure)}
        <div class="links"><a href="${esc(lead.url)}" target="_blank" rel="noopener noreferrer">一次情報：${esc(host(lead.url))}</a>${(lead.reactions || []).map((r) => `<span>反応：${esc(r)}</span>`).join("")}</div>
      </div>
    </article>
    <section class="panel o4" id="news"><div class="ph"><h2>主要ニュース <span class="count">${rest.length} 件</span></h2>
      <div class="filters" id="nf" role="group" aria-label="トピックで絞り込む"><button type="button" aria-pressed="true" data-k="">すべて</button>${presentTopics.map((t) => `<button type="button" aria-pressed="false" data-k="${t}" style="--c:${tColor(t)}"><i></i>${esc(tName(t))}</button>`).join("")}</div></div>
      <div class="pb"><p class="note">一次情報で確認できた内容だけを載せています。画像は元記事の OGP 画像です。</p>
        ${rest.length ? `<div class="cards">${rest.map((n) => card(n, iss)).join("")}</div>` : '<p class="empty">トップ以外の記事はありません。</p>'}</div></section>

    </div>

    <div class="stack c4">
      <section class="panel o2"><div class="ph"><h2>今日の要点</h2></div><div class="pb">
        <ol class="keys">${iss.keyPoints.map(([k, id]) => `<li><a href="#i-${esc(id)}" data-jump="${esc(id)}">${inline(k)}</a></li>`).join("")}</ol></div></section>
      <section class="panel o3 h6" id="deadlines"><div class="ph"><h2>期限ウォッチ</h2><span class="m">施行日・提供終了日など</span></div><div class="pb">
        ${deadlines.length ? `<div class="dl">${deadlines.map((x) => { const tot = T(x.deadline.date) - T(x.deadline.from), done = Math.min(1, Math.max(0, (T(iss.date) - T(x.deadline.from)) / tot));
          const left = Math.round((T(x.deadline.date) - T(iss.date)) / dayMs);
          return `<div class="dl-item"><div class="dl-top"><a href="#d${x.issue}" data-focus="${esc(x.id)}">${esc(x.deadline.label)}</a><span class="dl-days">あと ${left} 日</span></div>
            <div class="prog" role="img" aria-label="発表から期限までの ${Math.round(done * 100)}% が経過"><span style="width:${(done * 100).toFixed(0)}%"></span></div>
            <div class="dl-meta"><span>${md(x.deadline.from)} 発表</span><span>${md(x.deadline.date)}</span></div></div>`; }).join("")}</div>`
          : '<p class="empty">期限のある発表はありません。</p>'}</div></section>
      <section class="panel o3 h6" id="watch"><div class="ph"><h2>続報ウォッチ</h2><span class="m">複数の号にまたがる話題</span></div><div class="pb">
        ${stories.length ? `<ul class="watch">${stories.slice(0, 4).map(({ s, its }) => { const last = its[its.length - 1];
          return `<li><div class="w-top"><a href="#t-${esc(s)}">${esc(STORIES[s] || s)}</a><span class="chip">${its.length} 件</span></div>
            <span class="w-last">${md(last.issue)}：${inline(last.title)}</span>
            <div class="steps" aria-hidden="true">${its.map((x) => `<span class="${x.issue === iss.date ? "on" : ""}"></span>`).join("")}</div></li>`; }).join("")}</ul>`
          : '<p class="empty">まだありません。</p>'}</div></section>
      <section class="panel o5 h6"><div class="ph"><h2>トピック構成</h2><span class="m mono">${iss.news.length} 件</span></div><div class="pb">
        <div class="tbars">${Object.keys(TOPICS).map((t) => `<div class="tbar" style="--c:${tColor(t)}"><span>${esc(tName(t))}</span><span class="tr"><span style="width:${((tc[t] || 0) / tmax * 100).toFixed(0)}%"></span></span><span class="n">${tc[t] || 0}</span></div>`).join("")}</div></div></section>
      <section class="panel o7" id="domestic"><div class="ph"><h2>国内の解説・事例</h2><span class="m mono">${iss.domestic.length} 件</span></div><div class="pb">
        ${iss.domestic.length ? `<ul class="dom">${iss.domestic.map((x) => `<li>${thumb({ ...x, topic: "biz" })}<div><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${inline(x.title)}</a><span class="d">${inline(x.desc)}</span><span class="m">${esc(x.where)} · ${esc(x.date)}${x.image ? " · 画像：" + esc(host(x.url)) : ""}</span></div></li>`).join("")}</ul>`
          : '<p class="empty">この号では取り上げていません。</p>'}</div></section>
      <section class="panel o5 h6" id="sources"><div class="ph"><h2>取得状況</h2><span class="m mono">${ok}/${iss.sources.length}</span></div><div class="pb">
        <div class="srcs">${iss.sources.map(([nm, k]) => `<div class="${k ? "" : "bad"}"><span class="dot"></span>${esc(nm)}</div>`).join("")}</div>
        <div class="uptime">${spark(win.map((e) => e.ok / e.total), "var(--ok)")}<span>直近 ${win.length} 日の取得率 ${(win.reduce((a, e) => a + e.ok, 0) / win.reduce((a, e) => a + e.total, 0) * 100).toFixed(0)}%</span></div></div></section>
    </div>

    <section class="panel c12 o6" id="tips"><div class="ph"><h2>SNS で話題の使い方・Skills <span class="count">${iss.tips.length} 件</span></h2><span class="m">X・Reddit・Zenn・Qiita で反応が多かった実践例。手順は投稿者のもので、動作は検証していません</span></div>
      <div class="pb">${iss.tips.length ? `<ol class="lb">${iss.tips.map((t, k) => `<li><span class="rank">${k + 1}</span><div style="min-width:0">
        <div class="lb-meta"><span class="kind">${esc(t.kind)}</span><span>${esc(t.where)} · ${esc(t.date)}</span></div>
        <h3>${inline(t.title)}</h3><p>${inline(t.summary)}</p>${t.code ? `<pre>${esc(t.code)}</pre>` : ""}</div>
        <div class="lb-heat"><span>${esc(t.heat)}</span>${t.sample ? '<span class="flag">見本</span>' : `<a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">元の投稿</a>`}</div></li>`).join("")}</ol>`
        : '<p class="empty">この号では取り上げていません。</p>'}</div></section>

    <section class="panel c6 o8" id="unverified"><div class="ph"><h2>話題・未確認 <span class="count">${iss.unverified.length} 件</span></h2><span class="m">一次情報が見つからなかった話題</span></div><div class="pb">
      ${iss.unverified.length ? iss.unverified.map((u) => `<div class="unv"><span class="label">一次情報未確認</span><h3>${inline(u.title)}</h3><p>${inline(u.note)}</p>
        <p>出どころ：<a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">${esc(u.origin)}</a></p></div>`).join("") : '<p class="empty">ありません。</p>'}</div></section>

    <section class="panel c6 trend o9"><div class="ph"><h2>推移</h2><span class="m mono">直近 ${win.length} 日 · 主要ニュース件数</span></div><div class="pb">
      <div class="trend-box">${trend(win, iss.date)}</div>
      <div class="legend">${Object.keys(TOPICS).map((t) => `<span style="--c:${tColor(t)}"><i></i>${esc(tName(t))}</span>`).join("")}</div>
      ${sampleDays ? `<p class="note" style="margin:8px 0 0">${win.length} 日のうち ${sampleDays} 日は見本の件数（薄い色）。棒を押すとその号を開きます（本文があるのは ${win.filter((e) => e.full).length} 号）。</p>` : ""}</div></section>
  </div>
  <footer><span>Claude Managed Agents が ${esc(iss.generatedAt)} に生成 · 一次情報で確認できた内容だけを掲載</span><span class="mono">今月の費用 $${INDEX.filter((e) => e.date.slice(0, 7) === iss.date.slice(0, 7) && e.date <= iss.date).reduce((a, e) => a + e.cost, 0).toFixed(2)}</span></footer>`;
}
function drawTrend() { const box = $(".trend-box"); if (box && trendArgs && box.clientWidth) box.innerHTML = trend(trendArgs[0], trendArgs[1], box.clientWidth); }
let resizeTimer = 0;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawTrend, 150); });
function wireDash() {
  drawTrend();
  const nf = $("#nf"); if (!nf) return;
  const apply = (k) => { nf.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.k || "") === k)));
    document.querySelectorAll("#news .card").forEach((c) => { c.hidden = !!k && c.dataset.topic !== k; }); };
  nf.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) apply(b.dataset.k || ""); });
  document.querySelectorAll("[data-filter]").forEach((a) => a.addEventListener("click", () => apply(a.dataset.filter)));
}

/* ---------- archive / topics / search ---------- */
function viewArchive() {
  const months = [...new Set(INDEX.map((e) => e.date.slice(0, 7)))].reverse();
  const cal = (ym) => {
    const [y, m] = ym.split("-").map(Number); const first = new Date(y, m - 1, 1).getDay(); const days = new Date(y, m, 0).getDate();
    let cells = "日月火水木金土".split("").map((w) => `<span class="wd">${w}</span>`).join("") + '<span class="d pad"></span>'.repeat(first);
    for (let d = 1; d <= days; d++) {
      const key = `${ym}-${String(d).padStart(2, "0")}`, e = idxOf[key];
      const lv = e ? (e.n >= 6 ? "l3" : e.n >= 3 ? "l2" : "l1") : "";
      if (e && e.full) cells += `<a class="d ${lv}" href="#d${key}" title="${esc(e.headline)}（${e.n} 件）">${d}</a>`;
      else cells += `<span class="d ${lv}"${e ? ` title="${e.n} 件（見本・本文なし）"` : ""}>${d}</span>`;
    }
    return `<div class="month"><h3>${y} 年 ${m} 月</h3><div class="cal">${cells}</div></div>`;
  };
  return `<div class="pagehead"><h1>アーカイブ</h1><span class="m mono" style="color:var(--ink-3);font-size:12.5px">${dates.length} 号 · 主要 ${INDEX.reduce((a, e) => a + e.n, 0)} 件</span></div>
    <div class="dash">
      <section class="panel c6"><div class="ph"><h2>カレンダー</h2><span class="m">色が濃いほど主要ニュースが多い日</span></div><div class="pb">
        <div class="months">${months.map(cal).join("")}</div>
        <p class="note" style="margin:12px 0 0">日付を押すとその号を開きます。</p></div></section>
      <section class="panel c6"><div class="ph"><h2>号の一覧 <span class="count">${dates.length} 号</span></h2></div><div class="pb">
        <ul class="issues">${dates.map((d) => { const e = idxOf[d]; const tps = Object.keys(TOPICS).filter((t) => e.topics[t]);
          return `<li><span class="when">${md(d)}（${esc(e.weekday)}）</span><a href="#d${d}">${esc(e.headline)}</a>
          <span class="sub">主要 ${e.n} 件 ${tps.map(chip).join("")}${e.sample ? '<span class="flag">見本</span>' : ""}</span></li>`; }).join("")}</ul></div></section>
    </div>`;
}
function viewTopics(story) {
  const counts = Object.keys(TOPICS).map((t) => [t, allItems.filter((x) => x.topic === t).length]).filter((x) => x[1]);
  const storyIds = [...new Set(allItems.filter((x) => x.story).map((x) => x.story))].filter((s) => allItems.filter((x) => x.story === s).length > 1 || s === story);
  const tl = (sid) => { const its = allItems.filter((x) => x.story === sid).sort((a, b) => a.issue.localeCompare(b.issue));
    return `<div class="thread" id="th-${esc(sid)}"><h3>${esc(STORIES[sid] || sid)} <span class="chip">${its.length} 件</span></h3><ol class="tl">${its.map((x) =>
      `<li><span class="when">${md(x.issue)} 号 · ${esc(x.source)}</span><a href="#d${esc(x.issue)}" data-focus="${esc(x.id)}">${inline(x.title)}</a></li>`).join("")}</ol></div>`; };
  return `<div class="pagehead"><h1>トピック</h1></div>
    <div class="dash">
      <section class="panel c12"><div class="ph"><h2>トピック別の件数</h2><span class="m">押すとそのトピックで検索</span></div><div class="pb">
        <div class="topic-grid">${counts.map(([t, n]) => `<a class="topic-card" style="--c:${tColor(t)}" href="#search" data-topic="${t}"><b>${esc(tName(t))}</b><span>${n} 件</span></a>`).join("")}</div></div></section>
      <section class="panel c12"><div class="ph"><h2>続いている話題</h2><span class="m">同じ話題を複数の号で取り上げたものを時系列でつないでいます</span></div><div class="pb">
        <div class="threads">${storyIds.map(tl).join("")}</div></div></section>
    </div>`;
}
let searchState = { q: "", topic: null };
function viewSearch() {
  return `<div class="pagehead"><h1>検索</h1></div>
    <div class="dash"><section class="panel c12"><div class="pb" style="padding-top:16px">
    <div class="search"><input id="q" type="search" placeholder="例：Copilot、料金、Haiku" value="${esc(searchState.q)}" aria-label="キーワード">
    <div class="filters" id="tf">${[["", "すべて"], ...Object.entries(TOPICS).map(([k, v]) => [k, v[0]])].map(([k, v]) =>
      `<button type="button" aria-pressed="${(searchState.topic || "") === k}" data-k="${k}" style="--c:${k ? tColor(k) : "var(--ink-3)"}">${k ? "<i></i>" : ""}${esc(v)}</button>`).join("")}</div></div>
    <ul class="results" id="res" style="margin-top:10px"></ul></div></section></div>`;
}
function runSearch() {
  const q = searchState.q.trim().toLowerCase(); const words = q.split(/\s+/).filter(Boolean);
  const hit = allItems.filter((x) => (!searchState.topic || x.topic === searchState.topic) &&
    words.every((w) => [x.title, x.source, x.point, tName(x.topic)].join(" ").toLowerCase().includes(w)))
    .sort((a, b) => b.issue.localeCompare(a.issue));
  const hl = (s) => { let h = inline(s); words.forEach((w) => { h = h.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`); }); return h; };
  $("#res").innerHTML = hit.length ? hit.map((x) => `<li><span class="m">${md(x.issue)} 号 · ${esc(x.source)} ${chip(x.topic)}</span>
    <a href="#d${x.issue}" data-focus="${esc(x.id)}">${hl(x.title)}</a><span class="s">${hl(x.point)}</span></li>`).join("")
    : '<li><p class="empty">該当する記事はありません。</p></li>';
}

/* ---------- routing (#latest, #d2026-10-11, #archive, #topics, #t-<story>, #search) ---------- */
let pendingFocus = null;
function focusItem(id) {
  const el = document.getElementById("i-" + id); if (!el) return;
  el.scrollIntoView({ block: "start" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
let routeSeq = 0;
function setNav(nav) { document.querySelectorAll(".nav a").forEach((a) => (a.dataset.v === nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"))); }
async function showDash(date, v) {
  const seq = ++routeSeq;
  if (!dates.length) { v.innerHTML = '<p class="empty">まだ号がありません。</p>'; return false; }
  const d = idxOf[date] ? date : dates[0];
  if (!issueCache.has(d)) v.innerHTML = '<p class="empty">読み込み中…</p>';
  let iss;
  try { iss = await loadIssue(d); } catch { if (seq === routeSeq) v.innerHTML = '<p class="empty">この号を読み込めませんでした。時間をおいて開き直してください。</p>'; return false; }
  if (seq !== routeSeq) return false;
  figSeq = 0; v.innerHTML = viewDash(iss); wireDash(); return true;
}
async function route() {
  const h = location.hash.slice(1) || "latest"; const v = $("#view");
  const inPage = h.startsWith("i-") || ["news", "watch", "unverified", "deadlines", "sources", "tips", "domestic"].includes(h);
  if (inPage && $("#news")) return; // anchor inside the dashboard already on screen: let the browser scroll
  if (inPage) { setNav("issue"); if (await showDash(dates[0], v)) setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: "start" }), 0); return; }
  let nav = "issue";
  if (h === "archive") { ++routeSeq; v.innerHTML = viewArchive(); nav = "archive"; }
  else if (h === "topics" || h.startsWith("t-")) { ++routeSeq; v.innerHTML = viewTopics(h.slice(2)); nav = "topics";
    if (h.startsWith("t-")) setTimeout(() => document.getElementById("th-" + h.slice(2))?.scrollIntoView({ block: "start" }), 0); }
  else if (h === "search") { ++routeSeq; v.innerHTML = viewSearch(); nav = "search"; runSearch();
    $("#q").addEventListener("input", (e) => { searchState.q = e.target.value; runSearch(); });
    $("#tf").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; searchState.topic = b.dataset.k || null;
      $("#tf").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); runSearch(); });
    $("#q").focus(); }
  else { setNav("issue"); if (!(await showDash(h.startsWith("d") ? h.slice(1) : dates[0], v))) return; }
  setNav(nav);
  if (pendingFocus) { focusItem(pendingFocus); pendingFocus = null; }
  else window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const j = e.target.closest("a[data-jump]"); if (j) { e.preventDefault(); focusItem(j.dataset.jump); return; }
  const a = e.target.closest("a[data-focus], a[data-topic]"); if (!a) return;
  if (a.dataset.focus) pendingFocus = a.dataset.focus;
  if (a.dataset.topic) { searchState = { q: "", topic: a.dataset.topic }; }
  if (location.hash === a.getAttribute("href")) { e.preventDefault(); route(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); location.hash = "search"; }
});
/* theme: auto → light → dark (per viewer; storage may be unavailable) */
(() => {
  const btn = $("#theme"), order = ["auto", "light", "dark"], label = { auto: "自動", light: "ライト", dark: "ダーク" };
  let cur = "auto"; try { cur = localStorage.getItem("theme") || "auto"; } catch {}
  const set = (t) => { cur = t; if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    btn.textContent = label[t]; try { localStorage.setItem("theme", t); } catch {} };
  set(order.includes(cur) ? cur : "auto");
  btn.addEventListener("click", () => set(order[(order.indexOf(cur) + 1) % 3]));
})();
/* images that fail to load are removed, uncovering the drawn tile underneath */
document.addEventListener("error", (e) => { const t = e.target; if (t && t.tagName === "IMG" && t.closest(".thumb")) { t.nextElementSibling?.remove(); t.remove(); } }, true);
window.addEventListener("hashchange", route);
loadIndex().then(route).catch(() => { $("#view").innerHTML = '<p class="empty">データを読み込めませんでした。時間をおいて開き直してください。</p>'; });
