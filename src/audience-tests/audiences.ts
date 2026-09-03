import type {ResonanceFetch} from '../transport/resonance-fetch'

/** One audience the account can test against. */
export interface Audience {
  slug: string
  /** Display name; the slug humanised until a run returns the real title. */
  title: string
}

interface VfsListResponse {
  entries?: Array<{name?: string; kind?: string}>
}

const PERSONAS_PATH = '/strategy/personas'

/** `content-operator` → `Content operator`. */
export function humaniseSlug(slug: string): string {
  const words = slug.replace(/[-_.]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug
}

/** The audiences an account has, read from where the audience-test endpoint resolves them. */
export async function listAudiences(
  fetch: ResonanceFetch,
  accountUid: string,
  signal?: AbortSignal,
): Promise<Audience[]> {
  const response = await fetch.json<VfsListResponse>(
    `/v1/orgs/${encodeURIComponent(accountUid)}/vfs/list?path=${encodeURIComponent(PERSONAS_PATH)}`,
    {method: 'GET', signal},
  )
  const slugs: string[] = []
  for (const entry of response.entries ?? []) {
    if (entry.kind !== 'file' || typeof entry.name !== 'string') continue
    const slug = entry.name.replace(/\.md$/, '')
    if (slug !== '') slugs.push(slug)
  }
  return slugs
    .sort((left, right) => left.localeCompare(right))
    .map((slug) => ({slug, title: humaniseSlug(slug)}))
}
