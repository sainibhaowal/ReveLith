// ReveLith Drawboard — pure board transforms shared by the ribbon buttons
// and the agent tools. No engine imports: operates on plain element records,
// returns new arrays, never mutates inputs.

export interface BoardEl {
  id: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  groupIds?: string[];
  locked?: boolean;
  containerId?: string;
  boundElements?: Array<{ id: string }> | null;
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  strokeWidth?: number;
  opacity?: number;
  points?: Array<[number, number] | { x: number; y: number }> | null;
  [key: string]: unknown;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

export function getBounds(el: BoardEl): Bounds | null {
  if (typeof el.x !== 'number' || typeof el.y !== 'number') return null;
  const w = typeof el.width === 'number' ? el.width : 0;
  const h = typeof el.height === 'number' ? el.height : 0;
  return { minX: el.x, minY: el.y, maxX: el.x + w, maxY: el.y + h };
}

export function selectionBounds(elements: readonly BoardEl[], ids: ReadonlySet<string>): Bounds | null {
  let out: Bounds | null = null;
  for (const el of elements) {
    if (!ids.has(el.id)) continue;
    const b = getBounds(el);
    if (!b) continue;
    out = out
      ? { minX: Math.min(out.minX, b.minX), minY: Math.min(out.minY, b.minY), maxX: Math.max(out.maxX, b.maxX), maxY: Math.max(out.maxY, b.maxY) }
      : { ...b };
  }
  return out;
}

/** Scale a selected group around its shared top-left corner, including points and text. */
export function scaleElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  scale: number,
): { elements: BoardEl[]; scaled: number } {
  const box = selectionBounds(elements, ids);
  if (!box || !Number.isFinite(scale) || scale <= 0) return { elements: [...elements], scaled: 0 };
  let scaled = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    const x = typeof el.x === 'number' ? box.minX + (el.x - box.minX) * scale : el.x;
    const y = typeof el.y === 'number' ? box.minY + (el.y - box.minY) * scale : el.y;
    const out: BoardEl = {
      ...el,
      x,
      y,
      width: typeof el.width === 'number' ? el.width * scale : el.width,
      height: typeof el.height === 'number' ? el.height * scale : el.height,
      fontSize: typeof el.fontSize === 'number' ? Math.max(8, Math.round(el.fontSize * scale)) : el.fontSize,
      strokeWidth: typeof el.strokeWidth === 'number' ? Math.max(1, el.strokeWidth * scale) : el.strokeWidth,
    };
    if (Array.isArray(el.points)) {
      out.points = el.points.map((point) =>
        Array.isArray(point) ? [point[0] * scale, point[1] * scale] : [point.x * scale, point.y * scale],
      );
    }
    scaled += 1;
    return out;
  });
  return { elements: next, scaled };
}

/** Apply a deliberately narrow, safe visual style to selected native elements. */
export function styleElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  style: { strokeColor?: string; backgroundColor?: string; strokeWidth?: number },
): { elements: BoardEl[]; changed: number } {
  let changed = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    changed += 1;
    return { ...el, ...style };
  });
  return { elements: next, changed };
}

export type ArrangeOp = 'front' | 'forward' | 'backward' | 'back';

/** Reorder z-index. Selected block keeps its relative order. */
export function arrangeElements(elements: readonly BoardEl[], ids: ReadonlySet<string>, op: ArrangeOp): BoardEl[] {
  const list = [...elements];
  const selected = list.filter((el) => ids.has(el.id));
  const rest = list.filter((el) => !ids.has(el.id));
  if (selected.length === 0) return list;
  if (op === 'front') return [...rest, ...selected];
  if (op === 'back') return [...selected, ...rest];
  const out = [...list];
  if (op === 'forward') {
    for (let i = out.length - 1; i >= 0; i--) {
      if (ids.has(out[i]!.id) && i + 1 < out.length && !ids.has(out[i + 1]!.id)) {
        const [el] = out.splice(i, 1);
        out.splice(i + 1, 0, el!);
      }
    }
    return out;
  }
  for (let i = 0; i < out.length; i++) {
    if (ids.has(out[i]!.id) && i > 0 && !ids.has(out[i - 1]!.id)) {
      const [el] = out.splice(i, 1);
      out.splice(i - 1, 0, el!);
    }
  }
  return out;
}

export type Alignment = 'left' | 'centerX' | 'right' | 'top' | 'middle' | 'bottom';

/** Align selected elements to the selection bounding box. Returns moved count. */
export function alignElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  alignment: Alignment,
): { elements: BoardEl[]; moved: number } {
  const box = selectionBounds(elements, ids);
  if (!box) return { elements: [...elements], moved: 0 };
  let moved = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    const b = getBounds(el);
    if (!b) return el;
    let dx = 0;
    let dy = 0;
    if (alignment === 'left') dx = box.minX - b.minX;
    else if (alignment === 'right') dx = box.maxX - b.maxX;
    else if (alignment === 'centerX') dx = (box.minX + box.maxX) / 2 - (b.minX + b.maxX) / 2;
    else if (alignment === 'top') dy = box.minY - b.minY;
    else if (alignment === 'bottom') dy = box.maxY - b.maxY;
    else dy = (box.minY + box.maxY) / 2 - (b.minY + b.maxY) / 2;
    if (dx === 0 && dy === 0) return el;
    moved += 1;
    return { ...el, x: (el.x as number) + dx, y: (el.y as number) + dy };
  });
  return { elements: next, moved };
}

/** Spread 3+ elements evenly along an axis. Returns moved count. */
export function distributeElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  axis: 'horizontal' | 'vertical',
): { elements: BoardEl[]; moved: number } {
  const items = elements
    .map((el, index) => ({ el, index, b: getBounds(el) }))
    .filter((item) => ids.has(item.el.id) && item.b);
  if (items.length < 3) return { elements: [...elements], moved: 0 };
  const horizontal = axis === 'horizontal';
  const sorted = [...items].sort((a, b2) => (horizontal ? a.b!.minX - b2.b!.minX : a.b!.minY - b2.b!.minY));
  const first = sorted[0]!.b!;
  const last = sorted[sorted.length - 1]!.b!;
  const span = horizontal ? last.maxX - first.minX : last.maxY - first.minY;
  const sizes = sorted.map((s) => (horizontal ? s.b!.maxX - s.b!.minX : s.b!.maxY - s.b!.minY));
  const total = sizes.reduce((a, b2) => a + b2, 0);
  const gap = (span - total) / (sorted.length - 1);
  if (!Number.isFinite(gap) || gap < 0) return { elements: [...elements], moved: 0 };
  const next = [...elements];
  let cursor = horizontal ? first.minX : first.minY;
  let moved = 0;
  sorted.forEach((s, i) => {
    if (i > 0) {
      const want = cursor;
      const have = horizontal ? s.b!.minX : s.b!.minY;
      const delta = want - have;
      if (delta !== 0) {
        const el = next[s.index]!;
        next[s.index] = horizontal
          ? { ...el, x: (el.x as number) + delta }
          : { ...el, y: (el.y as number) + delta };
        moved += 1;
      }
    }
    cursor += sizes[i]! + gap;
  });
  return { elements: next, moved };
}

/** Put selected elements in one group. Returns the new group id (or null). */
export function groupElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
): { elements: BoardEl[]; grouped: number; groupId: string | null } {
  const targets = elements.filter((el) => ids.has(el.id));
  if (targets.length < 2) return { elements: [...elements], grouped: 0, groupId: null };
  const groupId = uid();
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    // Board files can contain malformed or legacy group metadata. Never let a
    // non-array value reach a spread here: this action is shared by the ribbon
    // and AI tool path, and a plain object throws "object is not iterable".
    const groupIds = Array.isArray(el.groupIds)
      ? el.groupIds.filter((value): value is string => typeof value === 'string')
      : [];
    return { ...el, groupIds: [...groupIds, groupId] };
  });
  return { elements: next, grouped: targets.length, groupId };
}

/** Remove all group memberships from selected elements. */
export function ungroupElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
): { elements: BoardEl[]; ungrouped: number } {
  let ungrouped = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id) || !el.groupIds?.length) return el;
    ungrouped += 1;
    return { ...el, groupIds: [] as string[] };
  });
  return { elements: next, ungrouped };
}

export function setLocked(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  locked: boolean,
): { elements: BoardEl[]; changed: number } {
  let changed = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id) || el.locked === locked) return el;
    changed += 1;
    return { ...el, locked };
  });
  return { elements: next, changed };
}

/** Mirror selected elements across the selection bbox. Point-based elements mirror too. */
export function flipElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  direction: 'horizontal' | 'vertical',
): { elements: BoardEl[]; flipped: number } {
  const box = selectionBounds(elements, ids);
  if (!box) return { elements: [...elements], flipped: 0 };
  let flipped = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    const b = getBounds(el);
    if (!b) return el;
    flipped += 1;
    if (direction === 'horizontal') {
      // Mirror the element's left edge across the box: newMinX = box.minX + (box.maxX - oldMaxX).
      const out: BoardEl = { ...el, x: box.minX + (box.maxX - b.maxX) };
      if (Array.isArray(el.points)) {
        const w = Math.max(1, b.maxX - b.minX);
        out.points = (el.points as Array<[number, number] | { x: number; y: number }>).map((point) =>
          Array.isArray(point) ? [w - point[0], point[1]] : [w - point.x, point.y],
        );
      }
      return out;
    }
    const out: BoardEl = { ...el, y: box.minY + (box.maxY - b.maxY) };
    if (Array.isArray(el.points)) {
      const h = Math.max(1, b.maxY - b.minY);
      out.points = (el.points as Array<[number, number] | { x: number; y: number }>).map((point) =>
        Array.isArray(point) ? [point[0], h - point[1]] : [point.x, h - point.y],
      );
    }
    return out;
  });
  return { elements: next, flipped };
}

/** Clone selected elements with fresh ids (bound labels follow their shapes). */
export function duplicateElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  dx = 24,
  dy = 24,
): { elements: BoardEl[]; clones: BoardEl[] } {
  const idMap = new Map<string, string>();
  for (const el of elements) {
    if (ids.has(el.id)) idMap.set(el.id, uid());
  }
  if (idMap.size === 0) return { elements: [...elements], clones: [] };
  const clones: BoardEl[] = [];
  for (const el of elements) {
    const fresh = idMap.get(el.id);
    if (!fresh) continue;
    const copy = JSON.parse(JSON.stringify(el)) as BoardEl;
    copy.id = fresh;
    if (typeof copy.containerId === 'string' && idMap.has(copy.containerId)) copy.containerId = idMap.get(copy.containerId)!;
    if (Array.isArray(copy.boundElements)) {
      copy.boundElements = copy.boundElements.map((b) => (idMap.has(b.id) ? { ...b, id: idMap.get(b.id)! } : b));
    }
    if (typeof copy.x === 'number') copy.x += dx;
    if (typeof copy.y === 'number') copy.y += dy;
    clones.push(copy);
  }
  return { elements: [...elements, ...clones], clones };
}

export function setStrokeWidth(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  width: number,
): { elements: BoardEl[]; applied: number } {
  let applied = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    applied += 1;
    return { ...el, strokeWidth: width };
  });
  return { elements: next, applied };
}

export function setOpacity(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  opacity: number,
): { elements: BoardEl[]; applied: number } {
  let applied = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    applied += 1;
    return { ...el, opacity };
  });
  return { elements: next, applied };
}

export function setTextSize(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  size: number,
): { elements: BoardEl[]; applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    if (el.type !== 'text') {
      skipped += 1;
      return el;
    }
    applied += 1;
    return { ...el, fontSize: size };
  });
  return { elements: next, applied, skipped };
}

export function setFontFamily(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
  family: number,
): { elements: BoardEl[]; applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  const next = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    if (el.type !== 'text') {
      skipped += 1;
      return el;
    }
    applied += 1;
    return { ...el, fontFamily: family };
  });
  return { elements: next, applied, skipped };
}

export function selectAllIds(elements: readonly BoardEl[]): string[] {
  return elements.map((el) => el.id);
}

/** Delete by ids, including labels bound to deleted shapes. Returns kept + removed count. */
export function deleteElements(
  elements: readonly BoardEl[],
  ids: ReadonlySet<string>,
): { elements: BoardEl[]; deleted: number } {
  const doomed = new Set(ids);
  for (const el of elements) {
    if (typeof el.containerId === 'string' && doomed.has(el.containerId)) doomed.add(el.id);
  }
  const before = elements.length;
  const kept = elements.filter((el) => !doomed.has(el.id));
  return { elements: kept, deleted: before - kept.length };
}
