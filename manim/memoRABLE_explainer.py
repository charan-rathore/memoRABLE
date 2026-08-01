"""
memoRABLE — Manim explainer (Memory Engine use case).

Design: editorial calm — warm paper, serif headlines, one idea per beat.
Render:  ./manim/render.sh  (or see manim/README.md)
"""
from __future__ import annotations

from manim import *

# memoRABLE palette
PAPER = "#F4F1EA"
INK = "#14130F"
INK_2 = "#5C5A54"
ACCENT = "#2563EB"
UNLAYER = "#E85844"
LINE = "#D8D3C8"
GREEN = "#16A34A"

MEMORY_BLOCKS = [
    ("Snapshot", "What it's about"),
    ("Signals", "Patterns"),
    ("Timeline", "When"),
    ("Decisions", "Commitments"),
    ("Risks", "Concerns"),
    ("Actions", "Next steps"),
]


class MemoRableExplainer(Scene):
    """~55s explainer: problem → memory graph → grounding → Elements → close."""

    def construct(self) -> None:
        self.camera.background_color = PAPER

        self.beat_hook()
        self.beat_problem()
        self.beat_insight()
        self.beat_pipeline()
        self.beat_grounding()
        self.beat_elements()
        self.beat_close()

    def beat_hook(self) -> None:
        line1 = Text(
            "People don't remember documents.",
            font="Georgia",
            font_size=44,
            color=INK,
        )
        line2 = Text(
            "They remember decisions.",
            font="Georgia",
            font_size=44,
            color=INK,
        )
        line2.next_to(line1, DOWN, buff=0.35)
        group = VGroup(line1, line2).move_to(ORIGIN)

        self.play(Write(line1), run_time=1.4)
        self.play(FadeIn(line2, shift=UP * 0.15), run_time=1.0)
        self.wait(1.2)
        self.play(FadeOut(group), run_time=0.6)

    def beat_problem(self) -> None:
        title = Text("One brief. Three rewrites.", font="Georgia", font_size=36, color=INK)
        title.to_edge(UP, buff=0.7)

        doc = RoundedRectangle(corner_radius=0.12, width=2.2, height=2.8, color=LINE, fill_color=WHITE, fill_opacity=1)
        doc.set_stroke(width=2)
        doc_label = Text("Board brief", font_size=22, color=INK_2).next_to(doc, UP, buff=0.2)

        targets = VGroup()
        labels = ["Email", "Status page", "Slide deck"]
        colors = [ACCENT, UNLAYER, INK_2]
        for i, (label, col) in enumerate(zip(labels, colors)):
            box = RoundedRectangle(corner_radius=0.08, width=1.8, height=1.1, color=col, fill_opacity=0.12)
            box.set_stroke(col, width=2)
            t = Text(label, font_size=20, color=col)
            t.move_to(box.get_center())
            g = VGroup(box, t)
            g.shift(RIGHT * 3.2 + UP * (1.2 - i * 1.2))
            targets.add(g)

        arrows = VGroup()
        for t in targets:
            arr = Arrow(
                doc.get_right(),
                t.get_left(),
                buff=0.15,
                color=INK_2,
                stroke_width=2,
                max_tip_length_to_length_ratio=0.12,
            )
            arrows.add(arr)

        drift = Text("Truth drifts.", font="Georgia", font_size=32, color=UNLAYER)
        drift.next_to(doc, DOWN, buff=1.4)

        self.play(FadeIn(title, shift=DOWN * 0.2), run_time=0.7)
        self.play(FadeIn(VGroup(doc, doc_label), scale=0.95), run_time=0.6)
        self.play(LaggedStart(*[Create(a) for a in arrows], lag_ratio=0.15), run_time=1.0)
        self.play(LaggedStart(*[FadeIn(t, shift=LEFT * 0.2) for t in targets], lag_ratio=0.12), run_time=0.9)
        self.play(FadeIn(drift, scale=1.05), run_time=0.6)
        self.wait(1.0)

        note = Text("Summaries don't fix this — they lose the source.", font_size=24, color=INK_2)
        note.next_to(drift, DOWN, buff=0.35)
        self.play(FadeIn(note), run_time=0.5)
        self.wait(0.8)

        self.play(
            FadeOut(VGroup(title, doc, doc_label, targets, arrows, drift, note)),
            run_time=0.6,
        )

    def beat_insight(self) -> None:
        insight = Text(
            "You need reusable knowledge\n— grounded to the source.",
            font="Georgia",
            font_size=38,
            color=INK,
            line_spacing=1.2,
        )
        badge = Text("Memory Engine", font_size=22, color=ACCENT)
        badge.next_to(insight, DOWN, buff=0.5)

        self.play(Write(insight), run_time=1.6)
        self.play(FadeIn(badge, shift=UP * 0.1), run_time=0.5)
        self.wait(1.0)
        self.play(FadeOut(VGroup(insight, badge)), run_time=0.5)

    def beat_pipeline(self) -> None:
        heading = Text("memoRABLE remembers once.", font="Georgia", font_size=34, color=INK)
        heading.to_edge(UP, buff=0.55)

        src = RoundedRectangle(corner_radius=0.1, width=2.0, height=2.4, color=LINE, fill_color=WHITE, fill_opacity=1)
        src.set_stroke(width=2)
        src.shift(LEFT * 4.2)
        src_t = Text("Document", font_size=20, color=INK_2).next_to(src, UP, buff=0.15)

        arrow1 = Arrow(src.get_right(), src.get_right() + RIGHT * 1.6, buff=0.1, color=INK_2, stroke_width=2.5)

        blocks = VGroup()
        for i, (name, sub) in enumerate(MEMORY_BLOCKS):
            row = i // 2
            col = i % 2
            rect = RoundedRectangle(corner_radius=0.06, width=2.5, height=0.72, color=ACCENT, fill_opacity=0.08)
            rect.set_stroke(ACCENT, width=1.5)
            label = Text(name, font_size=18, color=INK, weight=BOLD)
            subl = Text(sub, font_size=14, color=INK_2)
            subl.next_to(label, RIGHT, buff=0.25)
            inner = VGroup(label, subl).move_to(rect.get_center())
            card = VGroup(rect, inner)
            card.move_to(RIGHT * 0.8 + UP * (1.5 - row * 0.85) + RIGHT * col * 2.7)
            blocks.add(card)

        graph_label = Text("Memory Graph", font_size=22, color=ACCENT)
        graph_label.next_to(blocks, DOWN, buff=0.35)

        self.play(FadeIn(heading), run_time=0.5)
        self.play(FadeIn(VGroup(src, src_t)), run_time=0.5)
        self.play(GrowArrow(arrow1), run_time=0.5)
        self.play(
            LaggedStart(*[FadeIn(b, shift=RIGHT * 0.15, scale=0.98) for b in blocks], lag_ratio=0.1),
            run_time=1.8,
        )
        self.play(FadeIn(graph_label), run_time=0.4)
        self.wait(1.0)

        self.pipeline_group = VGroup(heading, src, src_t, arrow1, blocks, graph_label)

    def beat_grounding(self) -> None:
        callout = Text("Click any memory → source highlights.", font_size=26, color=INK)
        callout.to_edge(DOWN, buff=0.65)

        highlight = Rectangle(width=1.5, height=0.22, color=GREEN, fill_color=GREEN, fill_opacity=0.35)
        highlight.set_stroke(GREEN, width=2)
        highlight.move_to(self.pipeline_group[1].get_center() + DOWN * 0.35 + RIGHT * 0.1)

        provenance = Text("Remembered from", font_size=18, color=GREEN)
        provenance.next_to(highlight, UP, buff=0.12)

        self.play(
            self.pipeline_group[4][1].animate.set_stroke(width=3.5),
            FadeIn(callout),
            run_time=0.7,
        )
        self.play(FadeIn(highlight), FadeIn(provenance), run_time=0.6)
        self.wait(1.2)

        self.play(
            FadeOut(VGroup(callout, highlight, provenance, self.pipeline_group)),
            run_time=0.6,
        )

    def beat_elements(self) -> None:
        title = Text("One understanding. Three publications.", font="Georgia", font_size=32, color=INK)
        title.to_edge(UP, buff=0.6)

        hub = Circle(radius=0.55, color=ACCENT, fill_opacity=0.15)
        hub.set_stroke(ACCENT, width=2.5)
        hub_t = Text("6\nmemories", font_size=16, color=ACCENT, line_spacing=0.9)
        hub_t.move_to(hub.get_center())
        hub_g = VGroup(hub, hub_t).shift(LEFT * 3.5)

        outputs = []
        out_labels = [("Email", "600px"), ("Web", "fluid"), ("Document", "A4")]
        out_colors = [UNLAYER, ACCENT, INK_2]
        for i, ((name, sub), col) in enumerate(zip(out_labels, out_colors)):
            box = RoundedRectangle(corner_radius=0.1, width=2.4, height=1.5, color=col, fill_opacity=0.1)
            box.set_stroke(col, width=2)
            n = Text(name, font_size=24, color=col, weight=BOLD)
            s = Text(sub, font_size=16, color=INK_2)
            s.next_to(n, DOWN, buff=0.1)
            inner = VGroup(n, s).move_to(box.get_center())
            g = VGroup(box, inner)
            g.shift(RIGHT * 1.5 + UP * (1.2 - i * 1.2))
            outputs.append(g)

        arrows = VGroup(
            *[
                Arrow(hub_g.get_right(), o.get_left(), buff=0.12, color=LINE, stroke_width=2)
                for o in outputs
            ]
        )

        elements = Text("Composed with Unlayer Elements", font_size=22, color=UNLAYER)
        elements.to_edge(DOWN, buff=0.55)

        self.play(FadeIn(title), run_time=0.5)
        self.play(FadeIn(hub_g, scale=0.9), run_time=0.5)
        self.play(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.12), run_time=0.9)
        self.play(LaggedStart(*[FadeIn(o, shift=RIGHT * 0.2) for o in outputs], lag_ratio=0.12), run_time=1.0)
        self.play(FadeIn(elements), run_time=0.5)
        self.wait(1.2)
        self.play(FadeOut(VGroup(title, hub_g, *outputs, arrows, elements)), run_time=0.6)

    def beat_close(self) -> None:
        brand = Text("memoRABLE", font="Georgia", font_size=52, color=INK, slant=ITALIC)
        x = Text("×", font_size=40, color=INK_2)
        unlayer = Text("Unlayer Elements", font_size=40, color=UNLAYER)
        row = VGroup(brand, x, unlayer).arrange(RIGHT, buff=0.35)

        tag = Text(
            "Turn information into memory.",
            font="Georgia",
            font_size=28,
            color=INK_2,
        )
        tag.next_to(row, DOWN, buff=0.45)

        url = Text("memo-rable.vercel.app", font_size=22, color=ACCENT)
        url.next_to(tag, DOWN, buff=0.35)

        self.play(FadeIn(row, scale=0.96), run_time=0.8)
        self.play(FadeIn(tag), FadeIn(url), run_time=0.6)
        self.wait(2.0)
