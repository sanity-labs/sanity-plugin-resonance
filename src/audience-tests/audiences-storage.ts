import {readStorage, removeStorage, writeStorage} from '../storage'

/** Which audiences to send a document type to is remembered per Resonance host, project and type. */
export function audiencesStorageKey({
  host,
  projectId,
  documentType,
}: {
  host: string
  projectId: string
  documentType: string
}): string {
  return `sanity-plugin-resonance:audiences:${host}:${projectId}:${documentType}`
}

/** `null` means "no choice made": the host's configured audiences, or all of them. */
export function readSelectedAudiences(key: string): string[] | null {
  const value = readStorage(key)
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null
}

export function writeSelectedAudiences(key: string, selected: string[] | null): void {
  if (selected === null) removeStorage(key)
  else writeStorage(key, selected)
}
