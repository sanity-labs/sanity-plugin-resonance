import {readStorage, removeStorage, writeStorage} from '../storage'

/** What the panel remembers about the most recent run of one document, per Studio. */
export interface LastTestRecord {
  testId: string
  accountUid: string
  contentHash: string
  createdAt: string
}

export interface LastTestKeyParts {
  /** The Resonance host, so two deployments that share an account uid do not share results. */
  host: string
  projectId: string
  dataset: string
  publishedDocumentId: string
}

/** `new URL(apiUrl).host`, for storage keys. */
export function storageHost(apiUrl: string): string {
  try {
    return new URL(apiUrl).host
  } catch {
    return apiUrl
  }
}

export function lastTestStorageKey({
  host,
  projectId,
  dataset,
  publishedDocumentId,
}: LastTestKeyParts): string {
  return `sanity-plugin-resonance:last:${host}:${projectId}:${dataset}:${publishedDocumentId}`
}

function isLastTestRecord(value: unknown): value is LastTestRecord {
  if (!value || typeof value !== 'object') return false
  return (
    'testId' in value &&
    typeof value.testId === 'string' &&
    'accountUid' in value &&
    typeof value.accountUid === 'string' &&
    'contentHash' in value &&
    typeof value.contentHash === 'string' &&
    'createdAt' in value &&
    typeof value.createdAt === 'string'
  )
}

export function readLastTest(key: string): LastTestRecord | null {
  const value = readStorage(key)
  return isLastTestRecord(value) ? value : null
}

export function writeLastTest(key: string, record: LastTestRecord): void {
  writeStorage(key, record)
}

export function clearLastTest(key: string): void {
  removeStorage(key)
}
