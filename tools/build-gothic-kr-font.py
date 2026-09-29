#!/usr/bin/env python3
"""Build the ReveLith KR Gothic subset from upstream NanumGothic, metrics untouched.

Documents that declare NanumGothic hit the real downloadable face, so a
reference renderer lays them out with Nanum's own metrics (hangul 0.94em, space
0.28em, digits 0.606em) while the bundled Batang-normalized subset lays the same
run out wider (hangul 1.0em, space 0.333em) — roughly 6% per hangul line and 19%
per space, which shows up as line breaks that drift from the reference. Shipping
this real-metric derivative closes the gap by construction: the advances are
NOT modified, only the glyph set is narrowed and the family renamed.

The subset covers what the KR fallback subsets cover: KS X 1001 syllables plus
jamo, and Basic Latin / punctuation / fullwidth forms.

Renamed under OFL 1.1: the upstream family and PostScript names are Reserved
Font Names, and subsetting is itself a modification.

Upstream: https://github.com/google/fonts/raw/main/ofl/nanumgothic/NanumGothic-Regular.ttf

Usage: python3 tools/build-gothic-kr-font.py <NanumGothic-Regular.ttf> [out.woff2]
"""

import sys
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData

DEFAULT_OUT = "apps/docs/src/renderer/fonts/ReveLithGothicKR-Regular-subset.woff2"
FAMILY = "ReveLith Gothic KR"
PS_NAME = "ReveLithGothicKR-Regular"
PS_PREFIX = "ReveLithGothicKR"
PRIMARY_NAME_IDS = {1, 2, 3, 4, 6, 16, 17, 18, 20, 21, 22, 25}


def ksx1001_syllables() -> set[int]:
    """Every codepoint the KS X 1001 EUC-KR index decodes to."""
    cps = set()
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                cps.add(ord(bytes((hi, lo)).decode("euc_kr")))
            except UnicodeDecodeError:
                pass
    return cps


def rename_primary_names(font: TTFont) -> None:
    """Rewrite the primary name IDs in place, on every platform/encoding/language."""
    values = {
        1: FAMILY,
        2: "Regular",
        3: f"{FAMILY} Regular",
        4: f"{FAMILY} Regular",
        6: PS_NAME,
        16: FAMILY,
        17: "Regular",
        18: f"{FAMILY} Regular",
        20: PS_NAME,
        21: FAMILY,
        22: "Regular",
        25: PS_PREFIX,
    }
    name = font["name"]
    for record in list(name.names):
        value = values.get(record.nameID)
        if value is not None:
            name.setName(
                value,
                record.nameID,
                record.platformID,
                record.platEncID,
                record.langID,
            )


def assert_primary_names(font: TTFont) -> None:
    """No Reserved Font Name may survive in a name a font matcher can read."""
    for record in font["name"].names:
        if record.nameID not in PRIMARY_NAME_IDS:
            continue
        value = record.toUnicode()
        assert "nanum" not in value.casefold(), (
            f"Reserved Font Name remains in name ID {record.nameID}: {value!r}"
        )


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    root = Path(__file__).resolve().parent.parent
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / DEFAULT_OUT

    font = TTFont(str(src), recalcTimestamp=False)
    unicodes = ksx1001_syllables()
    for lo, hi in (
        (0x1100, 0x11FF),  # Hangul Jamo
        (0x3130, 0x318F),  # Hangul Compatibility Jamo
        (0x0020, 0x024F),  # Basic Latin + Latin Extended
        (0x2000, 0x206F),  # general punctuation
        (0x3000, 0x303F),  # CJK symbols and punctuation
        (0xFF00, 0xFFEF),  # halfwidth and fullwidth forms
    ):
        unicodes.update(range(lo, hi + 1))
    opts = Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.drop_tables += ["DSIG"]
    subsetter = Subsetter(options=opts)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)

    rename_primary_names(font)
    assert_primary_names(font)

    # the whole point of shipping this face is that these do not move
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    ga = cmap.get(0xAC00)
    assert ga and hmtx[ga][0] == round(0.94 * upm), "hangul must keep 0.94em"
    assert hmtx[cmap[0x20]][0] == round(0.28 * upm), "space must keep 0.28em"
    assert hmtx[cmap[0x30]][0] == round(0.606 * upm), "digits must keep 0.606em"

    font.flavor = "woff2"
    # Plain glyf/loca (no woff2 table transform), matching the other bundled
    # subsets so a test helper can read the tables straight out of the file.
    font.flavorData = WOFF2FlavorData(transformedTables=())
    font.save(str(out))
    print(f"{out.name}: {len(font.getGlyphOrder())} glyphs")


if __name__ == "__main__":
    main()
