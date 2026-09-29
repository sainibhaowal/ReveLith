#!/usr/bin/env python3
"""Build the bundled PUA-Blank face: every BMP Private Use codepoint maps to one
blank 1em glyph.

A document that has picked up Private Use Area codepoints (an unreleased icon
font, a token from a tool that mapped glyphs to PUA) renders as tofu in some
font chains and as nothing in others, because a chain headed by a real installed
face falls back to that face's .notdef. Giving those chains an explicit blank
glyph makes PUA invisible everywhere, at the same 1em advance the other bundled
subsets have.

Usage: python3 tools/build-pua-blank-font.py [out.woff2]
"""

import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.woff2 import WOFF2FlavorData

DEFAULT_OUT = "apps/docs/src/renderer/fonts/ReveLithPUABlank.woff2"
FAMILY = "ReveLith PUA Blank"
UPM = 1000


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder([".notdef", "blank"])
    empty = TTGlyphPen(None).glyph()
    fb.setupGlyf({".notdef": empty, "blank": empty})
    # the BMP PUA plane: E000..F8FF
    fb.setupCharacterMap({cp: "blank" for cp in range(0xE000, 0xF900)})
    fb.setupHorizontalMetrics({".notdef": (UPM, 0), "blank": (UPM, 0)})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupNameTable({"familyName": FAMILY, "styleName": "Regular"})
    fb.setupPost()
    fb.font.flavor = "woff2"
    # untransformed glyf, like the other bundled subsets
    fb.font.flavorData = WOFF2FlavorData(transformedTables=())
    fb.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
