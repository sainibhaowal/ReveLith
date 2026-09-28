# @revelith/cli (`revelith`)

Headless command-line interface and Model Context Protocol (MCP) server for ReveLith Office Suite.

## Features

- **Document Inspection**: Inspect slides, sheets, docs, PDFs, and markdown files.
- **Quality Checks**: Run automated fidelity and quality issue checks (`revelith check <file>`).
- **Selective Open**: Target specific slides, sheet ranges, or PDF pages directly (`revelith open <file> --slide <n>`).
- **MCP over stdio**: Standard JSON-RPC MCP server (`revelith mcp`).
- **MCP over HTTP**: Streamable HTTP MCP server (`revelith mcp --http <port> [--token <secret>]`) for remote agents, sandboxes, and containers.
  - Multipart / binary file uploads via `PUT /files/<name>`
  - File downloads via `GET /files/<name>`
  - Auto-download of `http(s)://` URL parameters
  - Written files returned as download URLs
  - Bearer token security

## MCP Tools

| Tool                  | Description                                                   |
| :-------------------- | :------------------------------------------------------------ |
| `guided_deck_builder` | Generates complete, professionally designed presentations     |
| `pdf_read_text`       | Extracts text from PDF documents with optional page filtering |
| `docs_edit_text`      | Modifies text in open Word documents                          |
| `sheet_set_cells`     | Updates cell values and formulas in spreadsheets              |
| `revelith_info`       | Inspects document metadata and structural summaries           |
| `revelith_check`      | Runs automated consistency checks on office files             |

## Usage

```bash
# Stdio MCP Server (Claude Code, Claude Desktop, Cursor)
revelith mcp

# Streamable HTTP MCP Server
revelith mcp --http 3930 --token my-secret-token

# Upload file to server
curl -X PUT http://localhost:3930/files/deck.pptx --data-binary @deck.pptx -H "Authorization: Bearer my-secret-token"

# Call tool over HTTP
curl -X POST http://localhost:3930/mcp \
  -H "Authorization: Bearer my-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "revelith_info", "arguments": {"file": "http://localhost:3930/files/deck.pptx"}}}'
```
