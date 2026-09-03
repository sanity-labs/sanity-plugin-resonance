import {readStorage, writeStorage} from '../storage'
import type {LastTestKeyParts} from './last-test-storage'

/** The "Compare with the published version" toggle is remembered per document, per Studio. */
export function compareStorageKey({
  host,
  projectId,
  dataset,
  publishedDocumentId,
}: LastTestKeyParts): string {
  return `sanity-plugin-resonance:compare:${host}:${projectId}:${dataset}:${publishedDocumentId}`
}

/** Defaults to on: comparing is the more informative run when an earlier version exists. */
export function readCompareEnabled(key: string): boolean {
  const value = readStorage(key)
  return typeof value === 'boolean' ? value : true
}

export function writeCompareEnabled(key: string, enabled: boolean): void {
  writeStorage(key, enabled)
}
