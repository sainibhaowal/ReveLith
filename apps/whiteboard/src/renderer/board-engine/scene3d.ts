/**
 * Deterministic 3D -> 2D projection for board scenes.
 *
 * The AI tools previously expected the model to hand-compute axonometric
 * coordinates, which is where 3D drawings fell apart. This module takes real
 * world-space primitives (box / prism / plane), projects them with either an
 * orthographic (isometric, dimetric) or a true perspective camera, culls
 * back-faces, shades each face by its surface normal against a light
 * direction, sorts with the painter's algorithm, and reports visible and
 * hidden edges separately so hidden linework can be dashed or dropped.
 *
 * It is pure: no DOM, no board API, no randomness. Callers turn the result
 * into board elements.
 */

export type Vec3 = [number, number, number]

export type ProjectionKind = 'isometric' | 'dimetric' | 'perspective'
export type HiddenStyle = 'hide' | 'dash' | 'show'

export interface Scene3dObject {
  shape: 'box' | 'prism' | 'plane'
  /** World-space centre of the primitive. */
  at: Vec3
  /** box: full extents. plane: [width, depth] (or [length, height] on a side axis). */
  size: Vec3
  /** prism */
  radius: number
  radiusTop: number
  height: number
  sides: number
  /** plane: the axis its normal points along. */
  axis: 'x' | 'y' | 'z'
  color: string
  opacity: number
}

export interface Scene3dSpec {
  projection: ProjectionKind
  target: Vec3
  yaw: number
  pitch: number
  distance: number
  scale: number
  originX: number
  originY: number
  light: Vec3
  ambient: number
  hidden: HiddenStyle
  edges: boolean
  edgeColor: string
  objects: Scene3dObject[]
}

export interface Scene3dFace {
  points: Array<[number, number]>
  fill: string
}

export interface Scene3dEdge {
  x1: number
  y1: number
  x2: number
  y2: number
  hidden: boolean
}

export interface Scene3dOutput {
  /** Visible faces, already ordered back-to-front. */
  faces: Scene3dFace[]
  edges: Scene3dEdge[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const DEG = Math.PI / 180
const MAX_OBJECTS = 120
const MAX_FACES = 900

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, b: number): Vec3 => [a[0] * b, a[1] * b, a[2] * b]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / length, a[1] / length, a[2] / length]
}

const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function vec3(value: unknown, fallback: Vec3, label: string): Vec3 {
  if (value === undefined || value === null) return fallback
  if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(isNum)) {
    return [value[0] as number, value[1] as number, value[2] as number]
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (isNum(record.x) || isNum(record.y) || isNum(record.z)) {
      return [
        isNum(record.x) ? record.x : fallback[0],
        isNum(record.y) ? record.y : fallback[1],
        isNum(record.z) ? record.z : fallback[2],
      ]
    }
  }
  throw new Error(`${label} must be [x, y, z] or {x, y, z}`)
}

function num(value: unknown, fallback: number, label: string, min: number, max: number): number {
  if (value === undefined || value === null) return fallback
  if (!isNum(value)) throw new Error(`${label} must be a finite number`)
  if (value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}`)
  return value
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function color(value: unknown, fallback: string, label: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !HEX_COLOR.test(value.trim())) {
    throw new Error(`${label} must be a hex colour such as #8ea0b5`)
  }
  return value.trim()
}

function parseHex(value: string): [number, number, number] {
  const hex = value.slice(1)
  const full = hex.length === 3 ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}` : hex
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

/** Multiply a base colour by a lighting factor and return an opaque hex. */
export function shadeHex(base: string, factor: number): string {
  const [r, g, b] = parseHex(base)
  const clampByte = (channel: number) => Math.max(0, Math.min(255, Math.round(channel * factor)))
  return `#${[clampByte(r), clampByte(g), clampByte(b)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

const DEFAULT_CAMERA: Record<ProjectionKind, { yaw: number; pitch: number; distance: number }> = {
  // 35.264 deg is the true isometric elevation.
  isometric: { yaw: 45, pitch: 35.264, distance: 2400 },
  dimetric: { yaw: 30, pitch: 20, distance: 2400 },
  perspective: { yaw: 40, pitch: 18, distance: 1800 },
}

export function parseScene3dSpec(
  raw: Record<string, unknown>,
  anchor: { originX: number; originY: number },
): Scene3dSpec {
  const projectionValue = raw.projection ?? 'isometric'
  if (
    projectionValue !== 'isometric' &&
    projectionValue !== 'dimetric' &&
    projectionValue !== 'perspective'
  ) {
    throw new Error('projection must be isometric, dimetric or perspective')
  }
  const projection = projectionValue as ProjectionKind
  const preset = DEFAULT_CAMERA[projection]

  let distance = num(raw.distance, preset.distance, 'distance', 1, 100000)
  if (isNum(raw.fov)) {
    const fov = num(raw.fov, 35, 'fov', 5, 150)
    // A 400px half-view keeps the target plane at roughly 1:1 with `scale`.
    distance = 400 / Math.tan((fov * DEG) / 2)
  }

  const rawObjects = raw.objects
  if (!Array.isArray(rawObjects) || rawObjects.length === 0)
    throw new Error('objects must be a non-empty array')
  if (rawObjects.length > MAX_OBJECTS)
    throw new Error(`objects must contain at most ${MAX_OBJECTS} primitives`)

  const objects: Scene3dObject[] = rawObjects.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`object ${index + 1} must be an object`)
    const item = entry as Record<string, unknown>
    const shape = item.shape ?? 'box'
    if (shape !== 'box' && shape !== 'prism' && shape !== 'plane') {
      throw new Error(`object ${index + 1}: shape must be box, prism or plane`)
    }
    const size = vec3(
      item.size,
      shape === 'plane' ? [1200, 0, 900] : [300, 300, 300],
      `object ${index + 1} size`,
    )
    const radius = num(item.radius, 100, `object ${index + 1} radius`, 0.1, 20000)
    const axisValue = item.axis ?? 'y'
    if (axisValue !== 'x' && axisValue !== 'y' && axisValue !== 'z')
      throw new Error(`object ${index + 1}: axis must be x, y or z`)
    return {
      shape,
      at: vec3(item.at, [0, 0, 0], `object ${index + 1} at`),
      size: [Math.abs(size[0]), Math.abs(size[1]), Math.abs(size[2])],
      radius,
      radiusTop: num(item.radiusTop, radius, `object ${index + 1} radiusTop`, 0, 20000),
      height: num(item.height, 400, `object ${index + 1} height`, 0.1, 40000),
      sides: Math.round(num(item.sides, 24, `object ${index + 1} sides`, 3, 64)),
      axis: axisValue as 'x' | 'y' | 'z',
      color: color(item.color ?? item.fillColor, '#94a3b8', `object ${index + 1} color`),
      opacity: num(item.opacity, 100, `object ${index + 1} opacity`, 0, 100),
    }
  })

  const hiddenValue = raw.hidden ?? 'hide'
  if (hiddenValue !== 'hide' && hiddenValue !== 'dash' && hiddenValue !== 'show') {
    throw new Error('hidden must be hide, dash or show')
  }

  return {
    projection,
    target: vec3(raw.target, [0, 0, 0], 'target'),
    yaw: num(raw.yaw, preset.yaw, 'yaw', -360, 360) * DEG,
    // Clamped away from the poles so the camera basis never degenerates.
    pitch: Math.max(-88, Math.min(88, num(raw.pitch, preset.pitch, 'pitch', -88, 88))) * DEG,
    distance,
    scale: num(raw.scale, 1, 'scale', 0.01, 200),
    originX: anchor.originX,
    originY: anchor.originY,
    light: normalize(vec3(raw.light, [0.35, 0.85, 0.45], 'light')),
    ambient: num(raw.ambient, 0.38, 'ambient', 0, 1),
    hidden: hiddenValue as HiddenStyle,
    edges: raw.edges === undefined ? true : raw.edges === true,
    edgeColor: color(raw.edgeColor, '#1e1b4b', 'edgeColor'),
    objects,
  }
}

interface Solid {
  vertices: Vec3[]
  faces: number[][]
  color: string
  opacity: number
}

function boxSolid(object: Scene3dObject): Solid {
  const [w, h, d] = object.size
  const hx = w / 2
  const hy = h / 2
  const hz = d / 2
  const [cx, cy, cz] = object.at
  const p = (sx: number, sy: number, sz: number): Vec3 => [cx + sx * hx, cy + sy * hy, cz + sz * hz]
  const vertices: Vec3[] = [
    p(-1, -1, -1),
    p(1, -1, -1),
    p(1, 1, -1),
    p(-1, 1, -1),
    p(-1, -1, 1),
    p(1, -1, 1),
    p(1, 1, 1),
    p(-1, 1, 1),
  ]
  const faces = [
    [4, 5, 6, 7], // +Z
    [1, 0, 3, 2], // -Z
    [5, 1, 2, 6], // +X
    [0, 4, 7, 3], // -X
    [7, 6, 2, 3], // +Y
    [0, 1, 5, 4], // -Y
  ]
  return { vertices, faces, color: object.color, opacity: object.opacity }
}

function prismSolid(object: Scene3dObject): Solid {
  const sides = object.sides
  const half = object.height / 2
  const [cx, cy, cz] = object.at
  const vertices: Vec3[] = []
  for (let ring = 0; ring < 2; ring += 1) {
    const radius = ring === 0 ? object.radius : object.radiusTop
    const dy = ring === 0 ? -half : half
    for (let i = 0; i < sides; i += 1) {
      const angle = (i / sides) * Math.PI * 2
      vertices.push([cx + Math.cos(angle) * radius, cy + dy, cz + Math.sin(angle) * radius])
    }
  }
  const faces: number[][] = []
  for (let i = 0; i < sides; i += 1) {
    const next = (i + 1) % sides
    // wind outward; orientation is normalised later, so order is not critical
    faces.push([i, next, sides + next, sides + i])
  }
  if (object.radiusTop > 0) faces.push(Array.from({ length: sides }, (_, i) => sides + i))
  if (object.radius > 0) faces.push(Array.from({ length: sides }, (_, i) => sides - 1 - i))
  return { vertices, faces, color: object.color, opacity: object.opacity }
}

function planeSolid(object: Scene3dObject): Solid {
  const [cx, cy, cz] = object.at
  const [a, b] = object.size
  const ha = Math.max(a, 1) / 2
  const hb = Math.max(b, 1) / 2
  let vertices: Vec3[]
  if (object.axis === 'y') {
    vertices = [
      [cx - ha, cy, cz - hb],
      [cx + ha, cy, cz - hb],
      [cx + ha, cy, cz + hb],
      [cx - ha, cy, cz + hb],
    ]
  } else if (object.axis === 'x') {
    vertices = [
      [cx, cy - hb, cz - ha],
      [cx, cy + hb, cz - ha],
      [cx, cy + hb, cz + ha],
      [cx, cy - hb, cz + ha],
    ]
  } else {
    vertices = [
      [cx - ha, cy - hb, cz],
      [cx + ha, cy - hb, cz],
      [cx + ha, cy + hb, cz],
      [cx - ha, cy + hb, cz],
    ]
  }
  return { vertices, faces: [[0, 1, 2, 3]], color: object.color, opacity: object.opacity }
}

function solidFor(object: Scene3dObject): Solid {
  if (object.shape === 'prism') return prismSolid(object)
  if (object.shape === 'plane') return planeSolid(object)
  return boxSolid(object)
}

/**
 * Project the scene. Throws on malformed specs so callers can report a precise
 * per-item validation error instead of silently drawing nothing.
 */
export function projectScene3d(spec: Scene3dSpec): Scene3dOutput {
  const target = spec.target
  const cosPitch = Math.cos(spec.pitch)
  // Camera sits on a sphere around the target, looking inwards.
  const offset: Vec3 = [
    cosPitch * Math.sin(spec.yaw),
    Math.sin(spec.pitch),
    cosPitch * Math.cos(spec.yaw),
  ]
  const camera: Vec3 = add(target, mul(offset, spec.distance))
  const forward = normalize(sub(target, camera))
  const worldUp: Vec3 = [0, 1, 0]
  let right = cross(forward, worldUp)
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0]
  right = normalize(right)
  const up = normalize(cross(right, forward))

  const perspective = spec.projection === 'perspective'
  const project = (point: Vec3): [number, number] | null => {
    const view = sub(point, camera)
    const depth = dot(view, forward)
    if (perspective && depth <= 1) return null
    const x = dot(view, right)
    const y = dot(view, up)
    // `distance / depth` keeps the target plane at 1:1 so `scale` stays intuitive.
    const factor = perspective ? spec.distance / depth : 1
    return [spec.originX + x * factor * spec.scale, spec.originY - y * factor * spec.scale]
  }

  const solids = spec.objects.map(solidFor)
  let faceBudget = 0
  for (const solid of solids) faceBudget += solid.faces.length
  if (faceBudget > MAX_FACES)
    throw new Error(`scene has ${faceBudget} faces; keep it under ${MAX_FACES}`)

  interface Pending {
    depth: number
    face: Scene3dFace
  }
  const pending: Pending[] = []
  const edges: Scene3dEdge[] = []

  for (const solid of solids) {
    const centerOfSolid = solid.vertices.reduce<Vec3>((acc, vertex) => add(acc, vertex), [0, 0, 0])
    const solidCenter = mul(centerOfSolid, 1 / Math.max(1, solid.vertices.length))

    const visible: boolean[] = []
    const projectedFaces: Array<Array<[number, number]> | null> = []

    solid.faces.forEach((face, faceIndex) => {
      const points = face
        .map((vertex) => solid.vertices[vertex])
        .filter((vertex): vertex is Vec3 => vertex !== undefined)
      if (points.length < 3) {
        visible[faceIndex] = false
        projectedFaces[faceIndex] = null
        return
      }
      const faceCenter = mul(
        points.reduce<Vec3>((acc, vertex) => add(acc, vertex), [0, 0, 0]),
        1 / points.length,
      )
      let normal = cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!))
      if (Math.hypot(normal[0], normal[1], normal[2]) < 1e-9) {
        visible[faceIndex] = false
        projectedFaces[faceIndex] = null
        return
      }
      normal = normalize(normal)
      // Orient outward from the solid's centre so winding never has to be trusted.
      if (dot(normal, sub(faceCenter, solidCenter)) < 0) normal = mul(normal, -1)

      const viewDirection = perspective ? sub(faceCenter, camera) : forward
      const facing = dot(normal, viewDirection)
      const isVisible = facing < 0 || spec.hidden === 'show'
      visible[faceIndex] = isVisible

      if (!isVisible) {
        projectedFaces[faceIndex] = null
        return
      }
      const flat: Array<[number, number]> = []
      for (const point of points) {
        const screen = project(point)
        if (!screen) {
          visible[faceIndex] = false
          projectedFaces[faceIndex] = null
          return
        }
        flat.push(screen)
      }
      projectedFaces[faceIndex] = flat
      const diffuse = Math.max(0, dot(normal, spec.light))
      const factor = spec.ambient + (1 - spec.ambient) * diffuse
      pending.push({
        depth: dot(sub(faceCenter, camera), forward),
        face: { points: flat, fill: shadeHex(solid.color, factor) },
      })
    })

    if (!spec.edges) continue

    // Edges are derived from face adjacency, so this works for any convex solid.
    const edgeFaces = new Map<string, { a: Vec3; b: Vec3; faces: number[] }>()
    solid.faces.forEach((face, faceIndex) => {
      for (let i = 0; i < face.length; i += 1) {
        const i0 = face[i]!
        const i1 = face[(i + 1) % face.length]!
        const key = i0 < i1 ? `${i0}-${i1}` : `${i1}-${i0}`
        const entry = edgeFaces.get(key)
        if (entry) entry.faces.push(faceIndex)
        else {
          const a = solid.vertices[i0]
          const b = solid.vertices[i1]
          if (a && b) edgeFaces.set(key, { a, b, faces: [faceIndex] })
        }
      }
    })
    for (const entry of edgeFaces.values()) {
      const isHidden =
        entry.faces.length === 2 && entry.faces.every((index) => visible[index] === false)
      if (isHidden && spec.hidden === 'hide') continue
      const a = project(entry.a)
      const b = project(entry.b)
      if (!a || !b) continue
      edges.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], hidden: isHidden })
    }
  }

  // Painter's algorithm: farthest first.
  pending.sort((left, right) => right.depth - left.depth)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const track = (x: number, y: number) => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const item of pending) for (const [x, y] of item.face.points) track(x, y)
  for (const edge of edges) {
    track(edge.x1, edge.y1)
    track(edge.x2, edge.y2)
  }
  if (!Number.isFinite(minX)) {
    return { faces: [], edges: [], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } }
  }
  return {
    faces: pending.map((item) => item.face),
    edges,
    bounds: { minX, minY, maxX, maxY },
  }
}
