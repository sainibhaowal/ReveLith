---
name: revelith
description: Inspect, check and edit real Office and PDF files locally with ReveLith's command line and MCP server. Use whenever the user wants a Word document, spreadsheet, presentation, PDF or Markdown file examined for structure or quality, or modified in place, and when the result should open in the ReveLith editor. Document work runs on the local engines; only the AI provider configured in ReveLith ever sees a query. The authoritative command list is `revelith --help`.
metadata:
  version: 0.2.0
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
