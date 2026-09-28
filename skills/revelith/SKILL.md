# ReveLith Skill — Build & Edit Real Office Files Locally

You are helping the user work with real Office documents through ReveLith's
local engines. Nothing leaves the machine. Prefer the `revelith` CLI for
deterministic file work; use structured edits over full rewrites.

## Commands

```bash
# Inspect
revelith info <file>                 # type, pages/sheets/slides, metadata
revelith read <file> --json          # structured dump (text, tables, comments)
revelith render <file> --out ./shot  # one PNG per page/slide/sheet for visual check

# Create / convert (all local, byte-preserving where possible)
revelith create --type docx|xlsx|pptx|md|html|csv --out <file>
revelith convert <in> <out>          # docx<->pdf/md/html, xlsx<->csv, pptx->pdf, pdf->docx|pptx
```

## Structured edits (in place, no re-serialization damage)

````bash
# Docs: text, images, tables, comments, header/footer
revelith docs set-text --file a.docx --find "Hello" --replace "Hi"
revelith docs insert-image --file a.docx --src ./logo.png --width 480
revelith docs insert-table --file a.docx --rows 3 --cols 2
revelith docs comments-add --file a.docx --text "Review this" --author "AI"

# Sheets: values, filters, rules, charts, pictures
revelith sheets set-cell --file b.xlsx --cell A1 --value "Total"
revelith sheets autofit --file b.xlsx
revelith sheets sort --file b.xlsx --range A1:B10 --col 1
revelith sheets add-chart --file b.xlsx --range A1:B10 --kind bar

# Slides: guided deck pipeline (outline -> spec/slide -> audit -> build)
revelith deck outline --topic "Q3 review" --slides 8 --out outline.json
revelith deck build --outline outline.json --out deck.pptx
revelith deck replace --file deck.pptx --slide 3 --title "New title"
revelith deck audit --file deck.pptx   # layout audit: overflow, contrast, fonts
## Model Context Protocol (MCP)

```bash
# Stdio mode (Claude Code, Cursor, Windsurf)
revelith mcp

# Streamable HTTP mode (sandboxes, containers, remote agents)
revelith mcp --http 3930 --token <secret>
# Supports PUT /files/<name>, GET /files/<name>, auto-downloading http(s):// parameters,
# and extended tools: pdf_read_text, docs_edit_text, sheet_set_cells
````

## Rules

1. Files stay local — never upload contents to any cloud.
2. After `build`/`replace`/`convert`, run `render` and look at the PNG
   before claiming done.
3. Prefer single-slide `replace` over rebuilding whole decks.
4. Keep OOXML byte-preserving: only touch dirty nodes (ReveLith engines do this).
5. For PDFs, keep highlight geometry aligned to the text layer; verify with render.
