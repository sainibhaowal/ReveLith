#!/usr/bin/env python3
"""Normalize the bundled Korean serif subset's Latin metrics to Batang.

A document declaring Batang lays its Latin out with Batang's real metrics, but
the bundled subset kept the upstream Noto advances, which are wider — so line
breaks drift from the reference on exactly those documents. The Korean sans
subset already had the same treatment against Malgun; the Gothic subset is out of
scope because it ships a real downloadable face's unmodified metrics and must
stay that way.

For every printable Basic Latin glyph (U+0020-007E and U+00A0) this rewrites the
advance to the target face's value and reshapes the outline horizontally to the
target's per-glyph ink width and left side bearing, both measured from the local
reference font at build time. Only the transformed outlines ship.

Idempotent: a glyph already at the target advance, ink width (within 2%) and side
bearing (within 5/1000 em) is skipped.

Usage: python3 tools/normalize-kr-latin-metrics.py [fonts-dir] [reference-dir]
"""

import sys
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData

# Reference face location; override with the second argument on any platform.
DFONTS = Path("/Applications/Microsoft Word.app/Contents/Resources/DFonts")
# subset filename -> (reference collection, face index)
TARGETS = {
    "RevelithSerifKR-Regular-subset.woff2": ("batang.ttc", 0),  # Batang
}


def normalize(path: Path, target: TTFont) -> None:
    t_upm = target["head"].unitsPerEm
    t_cmap = target.getBestCmap()
    t_glyf = target["glyf"]
    t_hmtx = target["hmtx"]

    font = TTFont(str(path))
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    is_cff = "CFF " in font
    if is_cff:
        cff = font["CFF "].cff
        charstrings = cff[cff.fontNames[0]].CharStrings
    glyph_set = font.getGlyphSet()

    def replace_outline(name: str, transform: Transform, adv: int) -> None:
        if is_cff:
            pen = T2CharStringPen(adv, glyph_set)
            glyph_set[name].draw(TransformPen(pen, transform))
            charstrings[name] = pen.getCharString(
                private=charstrings[name].private, globalSubrs=cff.GlobalSubrs
            )
        else:
            pen = TTGlyphPen(glyph_set)
            glyph_set[name].draw(TransformPen(pen, transform))
            font["glyf"][name] = pen.glyph()

    changed = skipped = 0
    # Hangul advances are out of scope: they differ between the two faces by a
    # layout-wide amount that would need its own pass. Pin them untouched.
    hangul = cmap.get(0xAC00)
    hangul_before = hmtx[hangul][0] if hangul else None
    seen: set[str] = set()
    for cp in [*range(0x20, 0x7F), 0xA0]:
        name = cmap.get(cp)
        # nbsp shares the space glyph; the first (space-width) mapping wins
        t_name = t_cmap.get(cp if cp != 0xA0 else 0x20)
        if name is None or t_name is None or name in seen:
            continue
        seen.add(name)
        target_adv = round(t_hmtx[t_name][0] * upm / t_upm)
        adv_ok = hmtx[name][0] == target_adv

        t_glyph = t_glyf[t_name]
        if not getattr(t_glyph, "numberOfContours", 0):
            # no target ink (space/nbsp): the advance alone carries the width
            if not adv_ok:
                hmtx[name] = (target_adv, hmtx[name][1])
                changed += 1
            else:
                skipped += 1
            continue
        target_ink = (t_glyph.xMax - t_glyph.xMin) * upm / t_upm
        target_lsb = t_hmtx[t_name][1] * upm / t_upm

        bp = BoundsPen(glyph_set)
        glyph_set[name].draw(bp)
        if bp.bounds is None:
            if not adv_ok:
                hmtx[name] = (target_adv, hmtx[name][1])
                changed += 1
            continue
        x_min, _, x_max, _ = bp.bounds
        ink = x_max - x_min
        width_ok = ink > 0 and abs(ink - target_ink) / target_ink < 0.02
        # 5/1000 em: TrueType point rounding can hold the bbox a few units off
        lsb_ok = abs(x_min - target_lsb) < upm * 0.005
        if adv_ok and width_ok and lsb_ok:
            skipped += 1
            continue

        if ink > 0:
            sx = target_ink / ink
            transform = Transform().translate(target_lsb, 0).scale(sx, 1).translate(-x_min, 0)
            replace_outline(name, transform, target_adv)
        hmtx[name] = (target_adv, round(target_lsb))
        changed += 1

    assert hangul and hmtx[hangul][0] == hangul_before, "hangul must stay untouched"
    print(f"{path.name}: {changed} glyphs normalized, {skipped} already at target")
    if changed:
        # keep glyf untransformed in the woff2 so a test helper can read the
        # tables straight out of the file
        if not is_cff:
            font.flavorData = WOFF2FlavorData(transformedTables=())
        font.save(str(path))


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    fonts_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "apps/docs/src/renderer/fonts"
    dfonts = Path(sys.argv[2]) if len(sys.argv) > 2 else DFONTS
    for fname, (coll, num) in TARGETS.items():
        normalize(fonts_dir / fname, TTFont(str(dfonts / coll), fontNumber=num))


if __name__ == "__main__":
    main()
