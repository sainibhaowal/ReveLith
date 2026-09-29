#!/usr/bin/env python3
"""Generate a synthetic line-spacing probe deck.

One slide per font; per slide a row of text boxes, one per lnSpc variant
(absent / 70% / 105% / 120% / 150% / 200% / 24pt / 36pt / 48pt exact). Each box
holds a single paragraph of identical lines separated by <a:br/>, so the measured
pitch is pure line advance with no paragraph spacing folded in. Box tops sit on
a known EMU grid, which makes the first-baseline offset measurable too.

This is the calibration fixture for line spacing: render the deck in the target
engine and in the reference application, and compare the two pitches per font
and per variant.

Usage: python3 tools/gen-linespacing-probe.py /path/probe.pptx
"""
import sys
import tempfile
import zipfile
from pathlib import Path

# (font, sample text) — the sample carries the glyphs the metric matters for
FONTS = [
    ("Arial", "HIKE"),
    ("Calibri", "HIKE"),
    ("Verdana", "HIKE"),
    ("Times New Roman", "HIKE"),
    ("Microsoft YaHei", "国线测"),
    ("Bebas Neue", "HIKE"),
    ("Trebuchet MS", "HIKE"),
    ("Georgia", "HIKE"),
    ("ＭＳ Ｐゴシック", "国線測"),
    ("Malgun Gothic", "한글측"),
]
# (label, lnSpc XML or '' for "inherit from the layout")
VARIANTS = [
    ("none", ""),
    ("70", '<a:lnSpc><a:spcPct val="70000"/></a:lnSpc>'),
    ("105", '<a:lnSpc><a:spcPct val="105000"/></a:lnSpc>'),
    ("120", '<a:lnSpc><a:spcPct val="120000"/></a:lnSpc>'),
    ("150", '<a:lnSpc><a:spcPct val="150000"/></a:lnSpc>'),
    ("200", '<a:lnSpc><a:spcPct val="200000"/></a:lnSpc>'),
    ("pts36", '<a:lnSpc><a:spcPts val="3600"/></a:lnSpc>'),
    ("pts48", '<a:lnSpc><a:spcPts val="4800"/></a:lnSpc>'),
    ("pts80", '<a:lnSpc><a:spcPts val="8000"/></a:lnSpc>'),
]
SZ = 4800  # 48pt: 1 reference pixel is then ~0.016em, well under the quantisation floor
LINES = 5
CX, CY = 12192000, 6858000
BOX_W, BOX_H = 1150000, 5600000
BOX_Y = 600000
GAP = 120000


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slide_xml(font, sample):
    shapes = []
    for i, (label, ln) in enumerate(VARIANTS):
        x = 150000 + i * (BOX_W + GAP)
        runs = []
        for li in range(LINES):
            if li:
                runs.append("<a:br/>")
            runs.append(
                f'<a:r><a:rPr lang="en-US" sz="{SZ}" dirty="0">'
                f'<a:latin typeface="{esc(font)}"/><a:ea typeface="{esc(font)}"/></a:rPr>'
                f"<a:t>{esc(sample)}</a:t></a:r>"
            )
        shapes.append(
            f'<p:sp><p:nvSpPr><p:cNvPr id="{i + 2}" name="probe-{label}"/>'
            f'<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{BOX_Y}"/><a:ext cx="{BOX_W}" cy="{BOX_H}"/></a:xfrm>'
            f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>'
            f'<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>'
            f'<a:p><a:pPr>{ln}</a:pPr>{"".join(runs)}</a:p></p:txBody></p:sp>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        f"{''.join(shapes)}</p:spTree></p:cSld></p:sld>"
    )


MASTER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
    '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>'
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" '
    'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
    "</p:sldMaster>"
)

LAYOUT = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">'
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>'
    "</p:sldLayout>"
)

THEME = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="probe">'
    '<a:themeElements><a:clrScheme name="p"><a:dk1><a:srgbClr val="000000"/></a:dk1>'
    '<a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="000000"/></a:dk2>'
    '<a:lt2><a:srgbClr val="FFFFFF"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1>'
    '<a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>'
    '<a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>'
    '<a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink>'
    '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
    '<a:fontScheme name="p"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
    '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    '<a:fmtScheme name="p"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
    '<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    '<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:ln></a:lnStyleLst>'
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>'
    '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
    "</a:fmtScheme></a:themeElements></a:theme>"
)


def main(out):
    n = len(FONTS)
    z = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)
    slide_overrides = "".join(
        f'<Override PartName="/ppt/slides/slide{i + 1}.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(n)
    )
    z.writestr(
        "[Content_Types].xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        f"{slide_overrides}</Types>",
    )
    z.writestr(
        "_rels/.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
        "</Relationships>",
    )
    slide_ids = "".join(f'<p:sldId id="{256 + i}" r:id="rId{i + 2}"/>' for i in range(n))
    z.writestr(
        "ppt/presentation.xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        f"<p:sldIdLst>{slide_ids}</p:sldIdLst>"
        f'<p:sldSz cx="{CX}" cy="{CY}"/><p:notesSz cx="6858000" cy="9144000"/>'
        "</p:presentation>",
    )
    slide_rels = "".join(
        f'<Relationship Id="rId{i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i + 1}.xml"/>'
        for i in range(n)
    )
    z.writestr(
        "ppt/_rels/presentation.xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
        f"{slide_rels}</Relationships>",
    )
    z.writestr("ppt/slideMasters/slideMaster1.xml", MASTER)
    z.writestr(
        "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
        "</Relationships>",
    )
    z.writestr("ppt/slideLayouts/slideLayout1.xml", LAYOUT)
    z.writestr(
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
        "</Relationships>",
    )
    z.writestr("ppt/theme/theme1.xml", THEME)
    for i, (font, sample) in enumerate(FONTS):
        z.writestr(f"ppt/slides/slide{i + 1}.xml", slide_xml(font, sample))
        z.writestr(
            f"ppt/slides/_rels/slide{i + 1}.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
            "</Relationships>",
        )
    z.close()
    print("wrote", out, f"({n} slides x {len(VARIANTS)} variants)")


if __name__ == "__main__":
    # tempfile.gettempdir() rather than a literal /tmp: this runs on Windows too,
    # where /tmp does not exist and zipfile would fail with FileNotFoundError.
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path(tempfile.gettempdir()) / "linespacing-probe.pptx"))
