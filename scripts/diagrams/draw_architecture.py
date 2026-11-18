import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
from sketch import Sketch, ICONS

s = Sketch(2420, 1430, seed=23)
s.box(40, 36, 120, 120, "#111", rad=26)
s.parts.append('<g transform="translate(100,96)" fill="none" stroke="#c9a2ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M-22 -28 H22 V30 L0 14 L-22 30Z"/></g>')
s.text(190, 104, "memoRABLE", "title")
s.text(192, 146, "How a note becomes memory you can still trust months later", "sub")

# You
s.box(30, 430, 290, 330, "#f7c9d9")
s.parts.append('<g transform="translate(175,500)" fill="none" stroke="#111" stroke-width="3.4" stroke-linecap="round"><circle cx="0" cy="-7" r="11"/><path d="M-20 22 Q0 2 20 22"/></g>')
s.text(175, 585, "You", "h", "middle")
s.lines(175, 635, ["write what you worked", "on, learned, decided;", "link one with #handle", "or replace it"], "bs", 30, "middle")

# Workspace
s.box(400, 190, 370, 470, "#bcdcf9")
s.text(585, 262, "Workspace", "h", "middle")
s.text(585, 298, "Next.js · runs in your browser", "s", "middle")
s.lines(585, 360, ["Today · Recall · Next", "Still true? · Look back", "Review", "", "opens offline, saves", "before the network answers"], "bs", 32, "middle")

# Documents
s.box(400, 900, 370, 330, "#fbe6a2")
s.parts.append('<g transform="translate(585,960)" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + ICONS["doc"] + "</g>")
s.text(585, 1022, "Document → brief", "h2", "middle")
s.lines(585, 1070, ["PDF · Markdown · JSON", "six source-linked blocks", "email · web · document", "outputs, editable"], "bs", 30, "middle")

# Engine
s.box(840, 170, 720, 1170, "#bfeec3", rad=34)
s.text(1200, 236, "Local engine · no server, no model", "h2", "middle")
cards = [
    (270, "event log", "append-only · IndexedDB · deletes redact", "db"),
    (408, "projection", "replay → entries, status, #links, supersedes", "graph"),
    (546, "recall", "BM25F, + on-device vectors if enabled", "search"),
    (684, "next", "rule-based planner, a reason per point", "next"),
    (822, "still true?", "FSRS-5 · back when recall < 90%", "clock"),
    (960, "look back", "replay the log up to a date", "rewind"),
]
for y, t, sub, ic in cards:
    s.card(890, y, 620, 112, t, sub, ic)
s.card(890, 1180, 620, 120, "receipts", ["every operation: measured ms, cache", "hits, invalidations · model calls: 0"], "check")
s.box(870, 1158, 660, 164, "none", rad=22, sw=2.4, dash="10 9")

for y0, y1, n, lab in [(382, 408, "3", "replay"), (520, 546, "4", "search"), (658, 684, "5", "suggest"), (796, 822, "6", "resurface"), (934, 960, "7", "as of a date")]:
    s.arrow([(1200, y0), (1200, y1)])
    s.badge(1236, y0 + 13, n); s.text(1262, y0 + 21, lab, "lab")

s.arrow([(320, 520), (400, 470)], "write", "1", loff=(-40, -34))
s.arrow([(770, 300), (890, 326)], "append", "2", loff=(-12, -30))
s.arrow([(890, 880), (770, 600)], None)
s.badge(668, 712, "8"); s.text(692, 720, "still holds?", "lab")
s.text(704, 1270, "", "lab")
s.arrow([(585, 900), (585, 660)])
s.badge(585, 830, "C", True); s.text(609, 838, "open a brief", "lab")

# GitHub
s.box(1650, 190, 740, 380, "#f8d3a8")
s.parts.append('<circle cx="2020" cy="262" r="34" fill="#111"/><g transform="translate(2020,262)" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"><circle cx="-9" cy="-14" r="5"/><circle cx="-9" cy="14" r="5"/><circle cx="11" cy="-4" r="5"/><path d="M-9 -9 V9 M11 1 Q11 8 -4 11"/></g>')
s.text(2020, 342, "GitHub issues + PRs", "h2", "middle")
s.lines(2020, 392, ["fetched by your browser, not", "our server; an optional token", "stays in browser storage", "(not encrypted: scope it)"], "bs", 32, "middle")

# Model
s.box(1650, 640, 740, 270, "#d9cff8")
s.parts.append('<g transform="translate(1720,700)" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + ICONS["chip"] + "</g>")
s.text(1765, 712, "On-device search model", "h2")
s.lines(1700, 772, ["bge-small-en-v1.5 · int8 · ~34 MB, opt-in", "embeds in a Web Worker; vectors cached", "off or failed → keyword search still works"], "bs", 32)

s.arrow([(1650, 540), (1600, 540), (1600, 602), (1510, 602)])
s.badge(1608, 470, "A", True); s.text(1632, 478, "sync", "lab")
s.arrow([(1650, 880), (1560, 880), (1510, 620)])
s.badge(1672, 945, "B", True); s.text(1696, 953, "embed locally", "lab")

s.box(1650, 980, 740, 340, "#f8f8f4")
s.text(1690, 1044, "How to read it", "h3")
s.pill(1690, 1104, "1–2"); s.text(1786, 1112, "you write; it is appended, never edited", "leg")
s.pill(1690, 1162, "3–7"); s.text(1786, 1170, "every view is a replay of the log", "leg")
s.pill(1690, 1220, "8"); s.text(1786, 1228, "decisions return before the why fades", "leg")
s.pill(1690, 1278, "A–C", hollow=True); s.text(1786, 1286, "optional: GitHub, local model, briefs", "leg")

open(sys.argv[1], "w").write(s.svg())
