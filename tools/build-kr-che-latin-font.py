#!/usr/bin/env python3
"""Build the ReveLith KR Gothic subset's half-width Latin companion.

A document that declares a fixed-pitch Korean face (BatangChe, GulimChe,
DotumChe, GungsuhChe) gets Latin at a fixed 0.5em pitch. Our Korean chains laid
those runs out with proportional Latin instead, so every line break after such a
run drifted. This builds a small ASCII-only face out of the Korean sans subset's
own outlines: advances forced to 0.5em, and each glyph reshaped to the fixed-
pitch face's per-glyph ink box so the letterforms fill their cell the way the
original does.

Only the transformed outlines ship. The reference face is read at build time
from a local Microsoft Office install, so the path is an argument rather than a
constant.

Usage:
    python3 tools/build-kr-che-latin-font.py [out.woff2] [reference-font]
    python3 tools/build-kr-che-latin-font.py out.woff2 gulim.ttc
"""

import sys
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

SOURCE = "apps/docs/src/renderer/fonts/RevelithSansKR-Regular-subset.woff2"
DEFAULT_OUT = "apps/docs/src/renderer/fonts/ReveLithCheLatinKR.woff2"
# macOS Office font bundle; override with the second argument on any platform.
DOTUMCHE = "/Applications/Microsoft Word.app/Contents/Resources/DFonts/gulim.ttc"
FAMILY = "ReveLith Che Latin KR"
PS_NAME = "ReveLithCheLatinKR"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / DEFAULT_OUT
    reference = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(DOTUMCHE)

    target = TTFont(str(reference), fontNumber=3)
    t_upm = target["head"].unitsPerEm
    t_cmap = target.getBestCmap()
    t_glyf = target["glyf"]
    t_hmtx = target["hmtx"]

    font = TTFont(str(root / SOURCE))
    upm = font["head"].unitsPerEm
    half = round(upm / 2)

    subsetter = Subsetter(options=Options(notdef_outline=True, glyph_names=False))
    subsetter.populate(unicodes=list(range(0x20, 0x7F)))
    subsetter.subset(font)

    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    cff = font["CFF "].cff
    charstrings = cff[cff.fontNames[0]].CharStrings
    glyph_set = font.getGlyphSet()

    for cp in range(0x20, 0x7F):
        name = cmap.get(cp)
        t_name = t_cmap.get(cp)
        if name is None or t_name is None:
            continue
        t_glyph = t_glyf[t_name]
        bp = BoundsPen(glyph_set)
        glyph_set[name].draw(bp)
        if not getattr(t_glyph, "numberOfContours", 0) or bp.bounds is None:
            # no target ink (space): the advance alone carries the pitch
            hmtx[name] = (half, hmtx[name][1])
            continue
        # both faces are measured in their own upm, so rescale the target box
        target_ink = (t_glyph.xMax - t_glyph.xMin) * upm / t_upm
        target_lsb = t_hmtx[t_name][1] * upm / t_upm
        x_min, _, x_max, _ = bp.bounds
        ink = x_max - x_min
        if ink > 0:
            sx = target_ink / ink
            transform = Transform().translate(target_lsb, 0).scale(sx, 1).translate(-x_min, 0)
            pen = T2CharStringPen(half, glyph_set)
            glyph_set[name].draw(TransformPen(pen, transform))
            charstrings[name] = pen.getCharString(
                private=charstrings[name].private, globalSubrs=cff.GlobalSubrs
            )
        hmtx[name] = (half, round(target_lsb))

    for rec in list(font["name"].names):
        if rec.nameID in (1, 4, 16):
            font["name"].setName(FAMILY, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
        elif rec.nameID in (3, 6):
            font["name"].setName(PS_NAME, rec.nameID, rec.platformID, rec.platEncID, rec.langID)

    font.flavor = "woff2"
    font.save(str(out))
    print(f"built {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
