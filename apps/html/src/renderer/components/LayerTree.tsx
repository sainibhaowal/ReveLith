import { useState } from 'react'

export interface DomNodeInfo {
  id: string // generated unique key for tree
  selectorPath: string
  tagName: string
  elementId?: string
  className?: string
  textContent?: string
  children: DomNodeInfo[]
}

export function parseDomToTree(root: Element, depth = 0, maxDepth = 15): DomNodeInfo | null {
  if (depth > maxDepth) return null
  const tagName = root.tagName.toLowerCase()
  if (tagName === 'script' || tagName === 'style' || tagName === 'svg') return null

  const elementId = root.id || undefined
  const className =
    root.className && typeof root.className === 'string' ? root.className.trim() : undefined
  const directText = Array.from(root.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 30)

  const children: DomNodeInfo[] = []
  for (let i = 0; i < root.children.length; i++) {
    const childTree = parseDomToTree(root.children[i]!, depth + 1, maxDepth)
    if (childTree) children.push(childTree)
  }

  // Construct selector path
  let path = tagName
  if (elementId) path += `#${elementId}`
  else if (className) path += `.${className.split(/\s+/)[0]}`

  return {
    id: `${tagName}-${Math.random().toString(36).slice(2, 9)}`,
    selectorPath: path,
    tagName,
    elementId,
    className,
    textContent: directText || undefined,
    children,
  }
}

interface LayerTreeProps {
  tree: DomNodeInfo | null
  selectedSelector: string | null
  onSelect: (selector: string, node: DomNodeInfo) => void
  onHover?: (selector: string | null) => void
  onMove?: (selector: string, direction: 'up' | 'down') => void
  onReorder?: (source: string, target: string, position: 'before' | 'after') => void
}

function TreeNode({
  node,
  selectedSelector,
  onSelect,
  onHover,
  onMove,
  onReorder,
  depth = 0,
}: {
  node: DomNodeInfo
  selectedSelector: string | null
  onSelect: (selector: string, node: DomNodeInfo) => void
  onHover?: (selector: string | null) => void
  onMove?: (selector: string, direction: 'up' | 'down') => void
  onReorder?: (source: string, target: string, position: 'before' | 'after') => void
  depth?: number
}) {
  const [collapsed, setCollapsed] = useState(depth > 2)
  const isSelected = selectedSelector === node.selectorPath
  const hasChildren = node.children.length > 0

  return (
    <div className="layer-tree-item" style={{ marginLeft: depth * 12 }}>
      <div
        className={`layer-tree-row ${isSelected ? 'selected' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 6px',
          borderRadius: 4,
          fontSize: 12,
          cursor: 'pointer',
          background: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
          color: isSelected ? '#60a5fa' : '#e5e7eb',
        }}
        onClick={() => onSelect(node.selectorPath, node)}
        onMouseEnter={() => onHover?.(node.selectorPath)}
        onMouseLeave={() => onHover?.(null)}
        draggable={onReorder ? true : undefined}
        onDragStart={(e) => {
          if (!onReorder) return
          e.dataTransfer.setData('text/revelith-layer', node.selectorPath)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          if (onReorder) e.preventDefault()
        }}
        onDrop={(e) => {
          if (!onReorder) return
          e.preventDefault()
          e.stopPropagation()
          const source = e.dataTransfer.getData('text/revelith-layer')
          if (!source || source === node.selectorPath) return
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const position = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
          onReorder(source, node.selectorPath, position)
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              fontSize: 10,
              cursor: 'pointer',
              padding: 0,
              width: 14,
            }}
            onClick={(e) => {
              e.stopPropagation()
              setCollapsed(!collapsed)
            }}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span style={{ width: 14 }} />
        )}
        <span style={{ fontWeight: 600, color: '#f43f5e' }}>&lt;{node.tagName}&gt;</span>
        {node.elementId && (
          <span style={{ color: '#3b82f6', fontSize: 11 }}>#{node.elementId}</span>
        )}
        {node.className && (
          <span
            style={{
              color: '#10b981',
              fontSize: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 100,
            }}
          >
            .{node.className.split(' ')[0]}
          </span>
        )}
        {node.textContent && (
          <span
            style={{
              color: '#6b7280',
              fontSize: 11,
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 80,
            }}
          >
            "{node.textContent}"
          </span>
        )}
        {isSelected && onMove && (
          <span style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            <button
              type="button"
              title="Move up"
              onClick={(e) => {
                e.stopPropagation()
                onMove(node.selectorPath, 'up')
              }}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
            >
              ↑
            </button>
            <button
              type="button"
              title="Move down"
              onClick={(e) => {
                e.stopPropagation()
                onMove(node.selectorPath, 'down')
              }}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
            >
              ↓
            </button>
          </span>
        )}
      </div>

      {!collapsed && hasChildren && (
        <div className="layer-tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedSelector={selectedSelector}
              onSelect={onSelect}
              onHover={onHover}
              onMove={onMove}
              onReorder={onReorder}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function LayerTree({
  tree,
  selectedSelector,
  onSelect,
  onHover,
  onMove,
  onReorder,
}: LayerTreeProps) {
  const [filter, setFilter] = useState('')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#18181b',
        borderRight: '1px solid #27272a',
        width: 260,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>🌳</span> Layers
        </span>
        <span style={{ fontSize: 11, color: '#71717a' }}>DOM Tree</span>
      </div>

      <div style={{ padding: '6px 10px', borderBottom: '1px solid #27272a' }}>
        <input
          type="text"
          placeholder="Filter elements..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: 11,
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: 4,
            color: '#fff',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {tree ? (
          <TreeNode
            node={tree}
            selectedSelector={selectedSelector}
            onSelect={onSelect}
            onHover={onHover}
            onMove={onMove}
            onReorder={onReorder}
          />
        ) : (
          <div style={{ color: '#71717a', fontSize: 12, padding: 12, textAlign: 'center' }}>
            No elements found
          </div>
        )}
      </div>
    </div>
  )
}
