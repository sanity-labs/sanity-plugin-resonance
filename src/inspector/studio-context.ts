import {useCurrentUser, useDataset, useProjectId} from 'sanity'

export interface StudioContext {
  email: string | null
  projectId: string
  dataset: string
}

/** The bits of Studio identity the panel copy and storage keys use. */
export function useStudioContext(): StudioContext {
  const user = useCurrentUser()
  const projectId = useProjectId()
  const dataset = useDataset()
  return {email: user?.email ?? null, projectId, dataset}
}

/** `drafts.x` and `versions.<release>.x` both belong to the same published document `x`. */
export function toPublishedId(documentId: string): string {
  if (documentId.startsWith('drafts.')) return documentId.slice('drafts.'.length)
  const version = /^versions\.[^.]+\.(.+)$/.exec(documentId)
  return version ? version[1] : documentId
}
