# memoRABLE Manim explainer

Animated explainer for the **Memory Engine** use case — problem → six grounded memories → Unlayer Elements → three publications.

**Not wired into the root README yet.** If you approve the render, replace `public/media/replay.gif` with `public/media/manim/explainer.gif`.

## Setup (once)

```bash
python3.12 -m venv .venv-manim
source .venv-manim/bin/activate
brew install pkg-config pango   # macOS, if pycairo fails
pip install manim
```

## Render

```bash
chmod +x manim/render.sh
./manim/render.sh m    # medium (default) — l | m | h
```

Outputs:

- `public/media/manim/explainer.mp4`
- `public/media/manim/explainer.gif` (silent preview)

## Story beats (~55s)

1. Hook — people remember decisions, not documents  
2. Problem — one brief, three rewrites, truth drifts  
3. Insight — reusable knowledge, grounded to source  
4. Pipeline — document → six memory blocks → memory graph  
5. Grounding — click memory, source highlights  
6. Elements — one graph → Email · Web · Document  
7. Close — memoRABLE × Unlayer Elements  

## Design

- Warm paper background (`#F4F1EA`), Georgia headlines, blue accent, Unlayer red for composition  
- One idea per beat, no clutter  
- Matches editorial tone of the live product  
