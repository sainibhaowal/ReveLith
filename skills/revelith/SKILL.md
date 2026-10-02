---
name: revelith
description: Inspect, check and edit real Office and PDF files locally with ReveLith's command line and MCP server. Use whenever the user wants a Word document, spreadsheet, presentation, PDF or Markdown file examined for structure or quality, or modified in place, and when the result should open in the ReveLith editor. Document work runs on the local engines; only the AI provider configured in ReveLith ever sees a query. The authoritative command list is `revelith --help`.
metadata:
  version: 0.3.0
  cli: '>=0.10.100'
---

# Revelith Skill — Work With Office Files Locally

You are helping the user work with real Office documents through Revelith's
local engines. Nothing leaves the machine. Prefer the `revelith` CLI for
deterministic file work; use structured edits over full rewrites.

## Find out what exists

Do not rely on a remembered command list. The binary is the source of truth:

```bash
revelith --help            # every command, one line each
revelith <command> --help  # that command's options
revelith --version
```

`--json` on any command prints one JSON object on stdout; the exit code is
`0` ok, `1` bad command line, `2` file problem, `3` conversion, `4` app
unavailable. Progress and warnings go to stderr, so `--json` output is always
safe to parse.

## Inspecting

```bash
revelith info <file>        # structure summary: blocks, slides, rows, metadata
revelith check <file>       # quality issue report (links, structure, formatting)
```

`info` reads `.docx`, `.pptx`, `.csv`, `.md`, `.html` and `.txt`. It refuses
other formats with a clear `unsupported` error rather than guessing — for
`.xlsx` and `.pdf` it will not report a sheet or page count it has not read.

## Opening in the editor

```bash
revelith open <file>                      # open at the last position
revelith open <file> --slide 3            # pptx
revelith open <file> --page 5             # pdf
revelith open <file> --range A1:D10       # xlsx
```

## Editing in place

These patch the package rather than re-serializing it, so untouched parts stay
byte-identical.

```bash
revelith docs apply <file>     # styles, fields, comments, tables
revelith sheet apply <file>    # formulas, styles, pivot tables, sparklines
revelith slides apply <file>   # animations, alignment, themes
```

## Building a presentation

```bash
revelith deck build --spec deck.json --out deck.pptx
```

The spec is JSON: a title plus slides, each with a layout and its content. The
`guided_deck_builder` MCP tool takes the same shape and returns the file it
wrote.

## Converting, creating and filling templates

```bash
revelith convert <file> --to pdf --out out.pdf --force
revelith convert <file> --to csv --sheet Sheet1 --password <pw>
revelith create --type pptx --ops ops.json --out deck.pptx --force
revelith create --type xlsx --from data.csv --header --decimal , --out book.xlsx
revelith create --type docx --from notes.md --out doc.docx
revelith create --type pptx --spec pages/ --outline outline.json --render --audit --out deck.pptx
revelith merge template.docx --data values.json --out filled.docx --strict --force
```

`--decimal` is the CSV decimal separator (default `.`); `--outline` is the
deck outline a `--spec` directory is checked against; `--render` writes slide
PNG previews and `--audit` reports geometry findings after `create`.

## Reading precisely

```bash
revelith pdf read <file.pdf> --page 2 --password <pw>
revelith pdf read <file.pdf> --range 1-5 --full --max-chars 1000
revelith slides read <deck> --slide 0 --full --layouts --max-chars 500 --units px
revelith slides check outline.json --page 0
revelith slides apply <deck> --ops ops.json --dry-run --best-effort --stop-on-error --isolation atomic --out new.pptx --force
revelith slides render <deck> --scale 2
revelith sheet read <book> --sheet S1 --range A1:D10 --cols A,C --max-rows 50 --where formula --stats --formats
revelith sheet apply <book> --cells cells.json --ops ops.json --dry-run --best-effort --stop-on-error --out new.xlsx --force
revelith docs read <doc> --range 0-9 --html --full --max-chars 200 --comments --revisions --styles --header-footer --sections --fields --notes
revelith docs apply <doc> --ops ops.json --track --author "Reviewer" --dry-run --best-effort --stop-on-error --out new.docx --force
revelith render <file> --out previews/ --page 1 --scale 2 --el e_12 --pad 8 --grid --cols 4 --tile 320
revelith open <file> --block 3 --el e_12 --sheet Sheet1
```

`--dry-run` validates without writing; `--best-effort` / `--stop-on-error`
control partial application; `--isolation` is `atomic` (default) or `per_op`.
`--track --author` records edits as tracked changes.

## Guides, search, media and state

```bash
revelith guide slides --index --fingerprint
revelith guide docs
revelith guide sheets
revelith search "query" --images --max 10
revelith image "a logo" --aspect 16:9 --size 1k --ref base.png --model fal-bria-rmbg --out logo.png --force
revelith media clip.mp4 --ask "summarize the key points"
revelith selection <file> --json
revelith capabilities
revelith skill list
revelith skill install claude-code --dir ~/.claude/skills --force
revelith mcp install cursor --dir ~/.cursor --force --compact-schemas --host 127.0.0.1
```

`revelith guide <domain>` prints the op reference before writing ops;
`--index` lists one-line op signatures, `--fingerprint` just the catalog
fingerprint. `revelith capabilities` reports which cloud features are
configured. `revelith selection` shows the user's editor selection.

## Model Context Protocol (MCP)

```bash
revelith mcp                              # stdio (Claude Code, Cursor, Windsurf)
revelith mcp --http 3930 --token <secret> # Streamable HTTP (sandboxes, remote agents)
```

The HTTP server also exposes `PUT /files/<name>` and `GET /files/<name>`, and
will download an `http(s)://` file parameter automatically so a remote agent can
work on a document it cannot reach directly. Tools include `revelith_info`,
`revelith_check`, `revelith_open`, `docs_apply`, `sheet_apply`, `slides_apply`,
`guided_deck_builder`, `live_word_edit`, `docs_edit_text`, `pdf_read_text` and
`sheet_set_cells`.

## Rules

1. Files stay local — never upload contents to any cloud.
2. Check before you claim: run `revelith info` or `revelith check` on the file
   you changed, and read the result.
3. Prefer a targeted in-place edit over rebuilding a whole document.
4. Keep OOXML byte-preserving: only touch dirty nodes (Revelith engines do this).
5. If a command fails with `unsupported`, do not work around it with a
   different tool — say which format is not supported yet.
