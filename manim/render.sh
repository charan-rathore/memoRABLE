#!/usr/bin/env bash
# Render memoRABLE Manim explainer → public/media/manim/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="public/media/manim"
QUALITY="${1:-m}"   # l | m | h  (low / medium / high)
mkdir -p "$OUT"

if [[ -f .venv-manim/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv-manim/bin/activate
else
  echo "Run: python3.12 -m venv .venv-manim && source .venv-manim/bin/activate && pip install manim"
  exit 1
fi

case "$QUALITY" in
  l) FLAGS=(-ql --fps 24) ;;
  m) FLAGS=(-qm --fps 30) ;;
  h) FLAGS=(-qh --fps 30) ;;
  *) echo "Usage: $0 [l|m|h]"; exit 1 ;;
esac

manim "${FLAGS[@]}" \
  --media_dir manim/media \
  --output_file explainer \
  -o explainer \
  manim/memoRABLE_explainer.py MemoRableExplainer

# Manim writes under manim/media/videos/... — pick the newest render.
RENDERED=$(find manim/media/videos -name 'explainer.mp4' -type f -print0 | xargs -0 ls -t | head -1)
if [[ -z "$RENDERED" ]]; then
  echo "Render failed — no explainer.mp4 found"
  exit 1
fi
cp "$RENDERED" "$OUT/explainer.mp4"
echo "Wrote $OUT/explainer.mp4"

# Silent GIF preview (README candidate — do not swap until approved)
ffmpeg -y -i "$OUT/explainer.mp4" -vf "fps=12,scale=960:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" -update 1 /tmp/manim-pal.png
ffmpeg -y -i "$OUT/explainer.mp4" -i /tmp/manim-pal.png \
  -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none" \
  "$OUT/explainer.gif"
echo "Wrote $OUT/explainer.gif"
