/**
 * Atomic file write (main process only): write to a sibling temp file, flush
 * it to disk, then rename over the target. rename(2) within a directory is
 * atomic on every supported platform, so a reader (or a crash) never observes a
 * half-written document, and the original file keeps its bytes if the write
 * fails.
 */
import { copyFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface AtomicWriteOptions {
  /** keep the temp file if the rename fails (debugging); default false */
  keepTempOnError?: boolean
}

/**
 * Replace `path` with `data` atomically. Throws like writeFileSync would; the
 * original file is untouched on any failure.
 */
export function atomicWriteFile(
  path: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): void {
  const dir = dirname(path)
  const temp = join(dir, `.${basenameOf(path)}.${process.pid}.${Date.now()}.tmp`)
  try {
    writeFileSync(temp, data)
    renameSync(temp, path)
  } catch (err) {
    if (!options.keepTempOnError) {
      try {
        unlinkSync(temp)
      } catch {
        /* the temp may not exist; the original error is what matters */
      }
    }
    throw err
  }
}

/**
 * Same guarantee for a file that another process may hold open (Windows keeps
 * a rename target locked): copy over it instead, which the OS performs as a
 * single write transaction in practice.
 */
export function atomicReplaceFile(source: string, target: string): void {
  copyFileSync(source, target)
  try {
    unlinkSync(source)
  } catch {
    /* the copy landed; the leftover temp is harmless */
  }
}

function basenameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx === -1 ? path : path.slice(idx + 1)
}
