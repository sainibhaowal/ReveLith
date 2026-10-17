import type { BoardState, ID, Project } from '../domain/types'
import { isTaskDone, ticketId } from './selectors'

/**
 * Render a project as a single self-contained HTML file.
 *
 * This is how "sharing" works without a server: the app writes a file the user
 * sends however they like, and the recipient opens it in any browser. Nothing
 * is hosted, nothing is fetched, and no login exists anywhere in the output.
 * Scripts are inlined rather than linked so the file works offline.
 */
export function boardToHtml(state: BoardState, projectId: ID, title?: string): string {
  const project = state.projects.find((entry) => entry.id === projectId)
  if (!project) throw new Error(`No project ${projectId}`)
  return renderProjectHtml(state, project, title ?? `${project.name} — ReveLith Tasks`)
}

function renderProjectHtml(state: BoardState, project: Project, title: string): string {
  const columns = state.columns
    .filter((column) => column.projectId === project.id)
    .sort((a, b) => a.position - b.position)

  const members = new Map(state.members.map((member) => [member.id, member]))

  const columnHtml = columns
    .map((column) => {
      const tasks = state.tasks
        .filter((task) => task.columnId === column.id && !task.archived && !task.parentId)
        .sort((a, b) => a.position - b.position)

      const cards = tasks
        .map((task) => {
          const labels = state.labels.filter((label) => task.labelIds.includes(label.id))
          const owner = members.get(task.assigneeId ?? '')
          const done = isTaskDone(state, task)
          return `      <li class="card${done ? ' done' : ''}">
        <div class="card-head"><span class="tid">${esc(ticketId(state, task))}</span><span class="pri p-${esc(task.priority)}">${esc(task.priority)}</span></div>
        <div class="title">${esc(task.title)}</div>
        ${task.description ? `<p class="desc">${esc(task.description).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="meta">
          ${task.dueDate ? `<span class="due">due ${esc(task.dueDate)}</span>` : ''}
          ${owner ? `<span class="owner"><i style="background:var(--c-${esc(owner.color)})"></i>${esc(owner.name)}</span>` : ''}
        </div>
        ${labels.length ? `<div class="labels">${labels.map((label) => `<span class="lbl" style="border-color:var(--c-${esc(label.color)});color:var(--c-${esc(label.color)})">${esc(label.name)}</span>`).join('')}</div>` : ''}
      </li>`
        })
        .join('\n')

      return `    <section class="col">
      <h2><i class="dot" style="background:var(--c-${esc(column.color)})"></i>${esc(column.name)}<span class="count">${tasks.length}</span></h2>
      <ul>
${cards}
      </ul>
    </section>`
    })
    .join('\n')

  const stamp = new Date().toISOString().slice(0, 10)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root{--bg:#0f1115;--surface:#171a21;--border:#272b34;--text:#e8eaed;--muted:#9aa3b2;
    --accent:#5b8def;--c-slate:#8b95a5;--c-blue:#5b8def;--c-violet:#a78bfa;--c-magenta:#e879f9;
    --c-rose:#fb7185;--c-red:#f87171;--c-orange:#fb923c;--c-amber:#fbbf24;--c-lime:#a3e635;
    --c-green:#4ade80;--c-teal:#2dd4bf;--c-cyan:#22d3ee}
  @media (prefers-color-scheme:light){:root{--bg:#f7f8fa;--surface:#fff;--border:#e3e6ec;--text:#111827;--muted:#5b6472}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  header{padding:20px 24px 12px;border-bottom:1px solid var(--border)}
  h1{margin:0;font-size:19px}
  .sub{color:var(--muted);font-size:12px;margin-top:3px}
  .board{display:flex;gap:14px;padding:18px 24px;overflow-x:auto;align-items:flex-start}
  .col{min-width:258px;flex:1;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px}
  .col h2{display:flex;align-items:center;gap:7px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px;color:var(--muted)}
  .dot{width:8px;height:8px;border-radius:50%}
  .count{margin-left:auto}
  ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
  .card{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 10px}
  .card.done .title{text-decoration:line-through;opacity:.6}
  .card-head{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--muted)}
  .tid{font-family:ui-monospace,monospace}
  .pri{font-weight:700;text-transform:uppercase}
  .p-urgent{color:var(--c-red)}.p-high{color:var(--c-orange)}.p-medium{color:var(--c-amber)}.p-low{color:var(--c-slate)}
  .title{font-weight:600;margin-top:4px}
  .desc{color:var(--muted);font-size:12px;margin:5px 0 0}
  .meta{display:flex;flex-wrap:wrap;gap:9px;margin-top:7px;font-size:11px;color:var(--muted)}
  .owner{display:inline-flex;align-items:center;gap:4px}
  .owner i{width:13px;height:13px;border-radius:50%;display:inline-block}
  .labels{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
  .lbl{font-size:10px;border:1px solid;border-radius:999px;padding:1px 7px}
  footer{padding:12px 24px;color:var(--muted);font-size:11px;border-top:1px solid var(--border)}
</style>
</head>
<body>
<header>
  <h1>${esc(project.name)}</h1>
  <p class="sub">${esc(project.description || `Key ${project.key}`)}</p>
</header>
<main class="board">
${columnHtml}
</main>
<footer>Exported from ReveLith Tasks on ${stamp}. Read-only — this file is static and works offline.</footer>
</body>
</html>`
}

/** Escape text for interpolation into HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
