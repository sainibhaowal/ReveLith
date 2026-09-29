#!/usr/bin/env python3
"""Build the bundled Poppins subset: real Poppins outlines, upstream metrics.

A cloud-font face is downloaded at render time and laid out with its own
metrics, while a Helvetica-class local fallback runs measurably narrower and
slightly tighter in line spacing — so the same document reflows differently
depending on whether the font was already cached. Bundling a Latin subset of the
real face removes the fork entirely. This is a pure subset: advances and
vertical metrics are not touched, and the build asserts that.

Renamed so a locally installed Poppins still wins the CSS font chain ahead of the
bundled copy (the OFL declares no Reserved Font Name, so the rename is
permitted).

Upstream: https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Regular.ttf
          https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf

Usage: python3 tools/build-poppins-font.py <Poppins-Weight.ttf> [out.woff2]
"""

import re
import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData

FAMILY = "ReveLith Poppins"
PS_FAMILY = "ReveLithPoppins"
OUT_DIR = "apps/docs/src/renderer/fonts"

# Latin + Latin Extended + combining marks + punctuation/currency + f-ligatures
UNICODE_RANGES = (
    (0x0020, 0x024F),
    (0x0300, 0x036F),
    (0x1E00, 0x1EFF),
    (0x2000, 0x206F),
    (0x20A0, 0x20CF),
    (0x2122, 0x2122),
    (0x2212, 0x2212),
    (0xFB00, 0xFB06),
)

# (space, digit) advances per weight, in upstream units. Subsetting must leave
# these alone: they are what the cloud-served face lays out with.
UPSTREAM_ADVANCES = {"Regular": (267, 628), "Bold": (212, 652)}


def rename_primary_names(font: TTFont, subfamily: str) -> None:
    ps_name = f"{PS_FAMILY}-{subfamily}"
    values = {
        1: FAMILY,
        2: subfamily,
        3: f"{FAMILY} {subfamily}",
        4: f"{FAMILY} {subfamily}",
        6: ps_name,
        16: FAMILY,
        17: subfamily,
        18: f"{FAMILY} {subfamily}",
        20: ps_name,
        21: FAMILY,
        22: subfamily,
        25: PS_FAMILY,
    }
    name = font["name"]
    for record in list(name.names):
        value = values.get(record.nameID)
        if value is not None:
            name.setName(value, record.nameID, record.platformID, record.platEncID, record.langID)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    m = re.search(r"Poppins-(\w+)\.ttf$", src.name)
    if not m or m.group(1) not in UPSTREAM_ADVANCES:
        sys.exit(f"expected Poppins-Regular.ttf or Poppins-Bold.ttf, got {src.name}")
    subfamily = m.group(1)
    root = Path(__file__).resolve().parent.parent
    default_out = root / OUT_DIR / f"{PS_FAMILY}-{subfamily}-subset.woff2"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else default_out

    font = TTFont(str(src), recalcTimestamp=False)
    unicodes: set[int] = set()
    for lo, hi in UNICODE_RANGES:
        unicodes.update(range(lo, hi + 1))
    opts = Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.drop_tables += ["DSIG"]
    subsetter = Subsetter(options=opts)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)

    rename_primary_names(font, subfamily)

    upm = font["head"].unitsPerEm
    hhea = font["hhea"]
    assert (hhea.ascent, hhea.descent, hhea.lineGap) == (
        round(1.05 * upm),
        round(-0.35 * upm),
        round(0.1 * upm),
    ), "line box must keep 1.5em"
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    space, zero = UPSTREAM_ADVANCES[subfamily]
    assert hmtx[cmap[0x20]][0] == space, "space advance must stay upstream"
    assert hmtx[cmap[0x30]][0] == zero, "digit advance must stay upstream"

    font.flavor = "woff2"
    # Plain glyf/loca (no woff2 transform), matching the other bundled subsets.
    font.flavorData = WOFF2FlavorData(transformedTables=())
    font.save(str(out))
    print(f"{out.name}: {len(font.getGlyphOrder())} glyphs")


if __name__ == "__main__":
    main()
