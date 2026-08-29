// Polyfill DOMMatrix if not defined in jsdom test environment for pdfjs-dist
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    a = 1
    b = 0
    c = 0
    d = 1
    e = 0
    f = 0
    m11 = 1
    m12 = 0
    m21 = 0
    m22 = 1
    m41 = 0
    m42 = 0
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = this.m11 = init[0]
        this.b = this.m12 = init[1]
        this.c = this.m21 = init[2]
        this.d = this.m22 = init[3]
        this.e = this.m41 = init[4]
        this.f = this.m42 = init[5]
      }
    }
    multiply() {
      return this
    }
    translate() {
      return this
    }
    scale() {
      return this
    }
    rotate() {
      return this
    }
    inverse() {
      return this
    }
    transformPoint(p?: { x?: number; y?: number }) {
      return { x: p?.x || 0, y: p?.y || 0 }
    }
  } as any
}
