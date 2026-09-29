# ooxml-validate

Schema gate for `.pptx` output. `validate-pptx.mjs` runs every
PresentationML / DrawingML part through Markup Compatibility preprocessing and
validates it with `xmllint` against the ISO/IEC 29500-4 (Transitional) XML
schemas in `schemas/`.

A well-formedness check cannot see a second fill child in an `a:rPr`, an
`a:ln` after `a:effectLst`, or `sz="50"`; PowerPoint can, and answers with a
repair prompt that drops shapes. This tool sees them too.

```bash
node tools/ooxml-validate/validate-pptx.mjs deck.pptx                 # absolute
node tools/ooxml-validate/validate-pptx.mjs --base original.pptx edited.pptx   # only what the edit introduced
node tools/ooxml-validate/validate-pptx.mjs --json ...                # machine-readable
```

Requires `xmllint` (macOS ships it; Debian/Ubuntu: `libxml2-utils`) and the
root devDependencies `jszip` and `@xmldom/xmldom`.

Consumers: `packages/pptx-engine/tests/ooxml-schema.test.ts` (engine output must
validate, and a fixture edit must add no violation) and
`packages/pptx-engine/tests/corpus-edit-fuzz.test.ts`, which runs with `--base`
so a foreign deck's pre-existing quirks are not charged to the edit.

## Schemas

`schemas/*.xsd` are the ISO/IEC 29500-4:2016 Transitional schemas (identical to
ECMA-376 Part 4). Only the PresentationML closure is kept: `pml`, `dml-main`,
`dml-chart`, `dml-chartDrawing`, `dml-diagram`, `dml-lockedCanvas`,
`dml-picture`, `shared-commonSimpleTypes`, `shared-relationshipReference`.

The schema bodies are the published text and are kept byte-identical. The one
local amendment (marked `ReveLith amendment` in the file):

- `dml-main.xsd` binds `CT_TextBulletSizePercent/@val` to `ST_TextBulletSize`
  — the union that includes the 25000..400000 decimal form. The published
  schema binds it to the percent-string form only, which rejects every
  `a:buSzPct` PowerPoint itself writes.

Calibration: 41 PowerPoint-authored decks (built-in themes and layouts) validate
clean, and edited copies of them add no violation over their originals.

## MCE preprocessing

No extension namespace is treated as understood: attributes and elements in
`mc:Ignorable` namespaces are dropped, every `mc:AlternateContent` collapses to
its `mc:Fallback`, and `mc:*` attributes are removed. Extension payloads inside
`a:ext` / `p:ext` are `lax` in the schema and pass through untouched.

## Well-formedness before schema

Every XML part is checked for well-formedness on its raw bytes before any
preprocessing. The DOM used for MCE silently repairs unbalanced tags, so it
must never be what `xmllint` sees — otherwise the one class of malformation this
tool exists to catch is the one it would hide.
