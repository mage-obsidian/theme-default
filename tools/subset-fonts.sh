#!/usr/bin/env bash
# Regenerates web/fonts/jetbrains-mono-latin-wght-normal.woff2 from a pristine
# Fontsource file, dropping the programming ligatures a storefront never renders.
#
# The upstream face ships 394 glyphs for 229 codepoints; the surplus is =>, !=,
# ->, and friends. Removing them halves the file (40.4 KB -> 20.6 KB) with every
# codepoint, advance width and the wght axis untouched.
#
# Usage: tools/subset-fonts.sh <pristine-jetbrains-mono.woff2>
# Requires: pip install fonttools brotli

set -euo pipefail

src="${1:?usage: tools/subset-fonts.sh <pristine-jetbrains-mono.woff2>}"
dest="$(cd "$(dirname "$0")/.." && pwd)/web/fonts/jetbrains-mono-latin-wght-normal.woff2"
codepoints="$(mktemp)"
trap 'rm -f "$codepoints"' EXIT

python3 - "$src" "$codepoints" <<'PY'
import sys
from fontTools.ttLib import TTFont

src, out = sys.argv[1], sys.argv[2]
with open(out, "w") as fh:
    fh.write("\n".join("U+%04X" % cp for cp in sorted(TTFont(src).getBestCmap())))
PY

pyftsubset "$src" \
  --output-file="$dest" \
  --flavor=woff2 \
  --unicodes-file="$codepoints" \
  --layout-features-='liga,dlig,clig,calt,ss01,ss02,ss03,ss04,ss05,ss06,ss07,ss08,ss09,ss10,ss11,ss12,ss13,ss14,ss15,ss16,ss17,ss18,ss19,ss20,zero' \
  --no-hinting

python3 - "$src" "$dest" <<'PY'
import sys
from fontTools.ttLib import TTFont

before, after = TTFont(sys.argv[1]), TTFont(sys.argv[2])
cmap_before, cmap_after = before.getBestCmap(), after.getBestCmap()
missing = set(cmap_before) - set(cmap_after)
if missing:
    raise SystemExit(f"subset dropped {len(missing)} codepoints")

hmtx_before, hmtx_after = before["hmtx"], after["hmtx"]
shifted = [cp for cp in cmap_before if hmtx_before[cmap_before[cp]][0] != hmtx_after[cmap_after[cp]][0]]
if shifted:
    raise SystemExit(f"subset changed {len(shifted)} advance widths")

if "fvar" not in after or after["fvar"].axes[0].axisTag != "wght":
    raise SystemExit("subset lost the weight axis")

print(f"ok: {len(cmap_after)} codepoints, {len(after.getGlyphOrder())} glyphs, wght axis intact")
PY
