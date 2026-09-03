const SEPARATOR = '\0'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Base64Url(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return toBase64Url(new Uint8Array(digest))
}

// FNV-1a over UTF-16 code units. Only used when SubtleCrypto is missing (insecure contexts), and
// only for change detection, never for anything security-relevant.
function weakHash(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `weak-${hash.toString(16).padStart(8, '0')}-${text.length}`
}

/**
 * Stable digest of the inputs that define a run, used both as the `Idempotency-Key` and to
 * detect "content has changed since". SHA-256 as base64url is 43 characters, well under the
 * server's 200-character limit.
 */
export async function contentHash(parts: string[]): Promise<string> {
  const joined = parts.join(SEPARATOR)
  return (await sha256Base64Url(joined)) ?? weakHash(joined)
}

/**
 * `Idempotency-Key` for `POST /audience-tests`. Without SubtleCrypto there is no safe stable
 * key, so a random one is used and a repeat click simply runs a fresh test.
 */
export async function idempotencyKey(parts: string[]): Promise<string> {
  const digest = await sha256Base64Url(parts.join(SEPARATOR))
  if (digest) return digest
  const random = globalThis.crypto?.randomUUID?.()
  return random ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
