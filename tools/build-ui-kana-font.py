#!/usr/bin/env python3
"""Build the bundled Korean kana face: Noto Sans JP kana condensed to the
reference face's advances, at full glyph height.

The reference Japanese UI face lays kana out proportionally while a generic
Japanese fallback keeps them full-width, so kana come out visibly wider than
the surrounding text. A CSS `size-adjust` alias would reproduce the advances but
also shrink the glyphs, leaving kana at ~77% next to full-size kanji. Instead,
every glyph whose reference advance differs from 1em is given exactly that
advance and its outline scaled horizontally to fit — height, baseline and the
kanji themselves (which fall through to the rest of the chain) are untouched.
Regular and Bold each carry their own reference advances.

The advance table lives in tools/meiryo-ui-kana-advances.json. Regenerate it
from a machine that has the reference face installed with --dump-advances.

Usage:
    python3 tools/build-ui-kana-font.py <NotoSansJP[wght].ttf> [outdir]
    python3 tools/build-ui-kana-font.py --dump-advances <regular.ttc> <bold.ttc>
"""

import json
import sys
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTCollection, TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
ADVANCES = ROOT / "tools/ui-kana-advances.json"
OUT_DIR = ROOT / "apps/docs/src/renderer/fonts"
FAMILY = "ReveLith UI Kana"
PS_PREFIX = "ReveLithUIKana"
WEIGHTS = {"regular": (400, "Regular"), "bold": (700, "Bold")}
# Chromium places a fallback glyph using that face's own ascent. Mirror the
# face these glyphs sit next to so a mixed line shares one baseline geometry.
ASCENT, DESCENT = 880, -120


def dump_advances(regular_ttc: Path, bold_ttc: Path) -> None:
    """Re-measure the reference advances and rewrite the JSON table."""

    def ui_face(path: Path) -> TTFont:
        for font in TTCollection(str(path)).fonts:
            if font["name"].getDebugName(4).startswith("Meiryo UI") and "Italic" not in font[
                "name"
            ].getDebugName(4):
                return font
        raise SystemExit(f"no Meiryo UI face in {path}")

    faces = {"regular": ui_face(regular_ttc), "bold": ui_face(bold_ttc)}
    table: dict[str, dict[str, float]] = {}
    for key, font in faces.items():
        upm = font["head"].unitsPerEm
        cmap = font.getBestCmap()
        hmtx = font["hmtx"]
        table[key] = {}
        for cp in range(0x3000, 0x3100):
            glyph = cmap.get(cp)
            if glyph is None:
                continue
            adv = round(hmtx[glyph][0] / upm, 4)
            if adv != 1.0:
                table[key][f"{cp:04X}"] = adv
    ADVANCES.write_text(json.dumps(table, indent=1, sort_keys=True) + "\n")
    print(f"{ADVANCES.name}: {len(table['regular'])} regular / {len(table['bold'])} bold")


def rename(font: TTFont, style: str) -> None:
    ps_name = f"{PS_PREFIX}-{style}"
    values = {
        1: FAMILY,
        2: style,
        3: f"{FAMILY} {style}",
        4: f"{FAMILY} {style}",
        6: ps_name,
        16: FAMILY,
        17: style,
        18: f"{FAMILY} {style}",
        20: ps_name,
        21: FAMILY,
        22: style,
        25: PS_PREFIX,
    }
    name = font["name"]
    for record in list(name.names):
        value = values.get(record.nameID)
        if value is not None:
            name.setName(value, record.nameID, record.platformID, record.platEncID, record.langID)
    for record in name.names:
        if record.nameID in values:
            assert "source" not in record.toUnicode().casefold(), record.toUnicode()


def condense(font: TTFont, advances: dict[str, float]) -> None:
    """Scale each listed glyph horizontally onto its reference advance."""
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    # Record every outline from the untouched glyph set FIRST. Drawing as we go
    # would mean a composite re-emitted on top of an already condensed base
    # picks up the scale twice.
    outlines: dict[str, tuple[DecomposingRecordingPen, float]] = {}
    for hex_cp, target in advances.items():
        glyph_name = cmap.get(int(hex_cp, 16))
        if glyph_name is None:
            continue
        source_adv = hmtx[glyph_name][0] / upm
        if source_adv == 0:
            continue
        rec = DecomposingRecordingPen(glyph_set)
        glyph_set[glyph_name].draw(rec)
        outlines[glyph_name] = (rec, target / source_adv)
    for glyph_name, (rec, scale) in outlines.items():
        pen = TTGlyphPen(None)
        rec.replay(TransformPen(pen, (scale, 0, 0, 1, 0, 0)))
        glyph = pen.glyph()
        glyph.recalcBounds(glyf)
        glyf[glyph_name] = glyph
        hmtx[glyph_name] = (round(hmtx[glyph_name][0] * scale), getattr(glyph, "xMin", 0))


def build(src: Path, out_dir: Path) -> None:
    table = json.loads(ADVANCES.read_text())
    for key, (weight, style) in WEIGHTS.items():
        font = instantiateVariableFont(TTFont(str(src), recalcTimestamp=False), {"wght": weight})
        # each weight keeps only its own table; a zero-advance source glyph
        # (combining marks) cannot be condensed to a spacing advance, so it
        # falls through the chain untouched
        cmap = font.getBestCmap()
        hmtx = font["hmtx"]
        unicodes = {
            int(cp, 16)
            for cp in table[key]
            if cmap.get(int(cp, 16)) is not None and hmtx[cmap[int(cp, 16)]][0] > 0
        }
        opts = Options()
        opts.layout_features = []
        opts.name_IDs = ["*"]
        opts.drop_tables += ["DSIG", "BASE", "GDEF", "GPOS", "GSUB", "vhea", "vmtx", "STAT"]
        opts.notdef_outline = True
        subsetter = Subsetter(options=opts)
        subsetter.populate(unicodes=unicodes)
        subsetter.subset(font)
        condense(font, table[key])
        rename(font, style)
        font["OS/2"].usWeightClass = weight
        font["OS/2"].fsSelection |= 1 << 7  # USE_TYPO_METRICS
        font["hhea"].ascent = font["OS/2"].sTypoAscender = font["OS/2"].usWinAscent = ASCENT
        font["hhea"].descent = font["OS/2"].sTypoDescender = DESCENT
        font["OS/2"].usWinDescent = -DESCENT
        font["hhea"].lineGap = font["OS/2"].sTypoLineGap = 0
        font.flavor = "woff2"
        font.flavorData = WOFF2FlavorData(transformedTables=())
        out = out_dir / f"{PS_PREFIX}-{style}.woff2"
        font.save(str(out))
        print(f"{out.name}: {len(font.getGlyphOrder())} glyphs")


def main() -> None:
    args = sys.argv[1:]
    if len(args) == 3 and args[0] == "--dump-advances":
        dump_advances(Path(args[1]), Path(args[2]))
        return
    if not args:
        sys.exit(__doc__)
    build(Path(args[0]), Path(args[1]) if len(args) > 1 else OUT_DIR)


if __name__ == "__main__":
    main()
