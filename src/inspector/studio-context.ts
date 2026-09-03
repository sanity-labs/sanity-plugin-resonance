import {useCurrentUser, useDataset, useProjectId} from 'sanity'

export interface StudioContext {
  email: string | null
  origin: string
  projectId: string
  dataset: string
}

export function currentOrigin(): string {
  return typeof window === 'undefined' ? 'this Studio' : window.location.origin
}

/** The bits of Studio identity that show up in access copy and the access-request message. */
export function useStudioContext(): StudioContext {
  const user = useCurrentUser()
  const projectId = useProjectId()
  const dataset = useDataset()
  return {email: user?.email ?? null, origin: currentOrigin(), projectId, dataset}
}

/** `drafts.x` and `versions.<release>.x` both belong to the same published document `x`. */
export function toPublishedId(documentId: string): string {
  if (documentId.startsWith('drafts.')) return documentId.slice('drafts.'.length)
  const version = /^versions\.[^.]+\.(.+)$/.exec(documentId)
  return version ? version[1] : documentId
}
