# CLI port — dependency map

The skill contract (`skills/revelith/SKILL.md`) documents 19 commands. This is
which source package each one needs, and therefore the order they can land in.

## Unblockable now (engines already in ReveLith)

| Skill command   | Needs                                            |
| --------------- | ------------------------------------------------ |
| `info`, `read`  | `@revelith/docx-engine`, `@revelith/pptx-engine` |
| `render`        | `@revelith/pptx-render`                          |
| `docs *`        | `@revelith/docx-engine`                          |
| `deck *`        | `@revelith/pptx-engine`                          |
| `check`, `open` | already present in the CLI                       |
| `mcp`           | already present (stdio + HTTP)                   |

## Blocked on a package that does not exist yet

| Skill command                                    | Needs          | Phase |
| ------------------------------------------------ | -------------- | ----- |
| `sheets *`, `create --type xlsx`, xlsx `convert` | `xlsx-gateway` | 2     |
| `create --type pptx`, `slides *`                 | `pptx-ops`     | 3     |
| `guide`, `slide-spec`                            | `pipelines`    | 3     |
| `convert` (pdf->docx/pptx)                       | `pdf2docx`     | 4     |
| `convert` (html->docx)                           | `html2docx`    | 4     |

## Consequence

A command is only worth documenting once it runs. Phases 1-4 each end with the
skill gaining the commands that phase unblocked, so the shipped contract never
claims more than the binary can do.
