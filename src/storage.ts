/**
 * `localStorage` wrappers that never throw: private mode, disabled storage and quota errors all
 * degrade to "nothing remembered". Values are stored as JSON.
 */
export function readStorage(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw === null || raw === undefined ? null : (JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is best-effort.
  }
}

export function removeStorage(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // Storage is best-effort.
  }
}
