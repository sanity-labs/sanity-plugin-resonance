import {useEffect, useState} from 'react'
import {useClient, useProjectId} from 'sanity'

export type OrganizationIdState =
  | {status: 'loading'}
  | {status: 'ready'; organizationId: string}
  | {status: 'error'; error: Error}

interface ProjectResponse {
  organizationId?: string | null
}

interface Outcome {
  key: string
  state: OrganizationIdState
}

// One lookup per project per page load; the inspector is opened and closed often.
const cache = new Map<string, string>()
const inFlight = new Map<string, Promise<string>>()

function lookupOrganizationId(
  projectId: string,
  request: (url: string) => Promise<ProjectResponse>,
): Promise<string> {
  const cached = cache.get(projectId)
  if (cached) return Promise.resolve(cached)

  const pending = inFlight.get(projectId)
  if (pending) return pending

  const promise = request(`/projects/${projectId}`)
    .then((project) => {
      const organizationId = project.organizationId
      if (!organizationId) {
        throw new Error(
          `Project ${projectId} does not belong to a Sanity organization, which Resonance needs to validate the session. Pass \`organizationId\` to the plugin if you know it.`,
        )
      }
      cache.set(projectId, organizationId)
      return organizationId
    })
    .finally(() => {
      inFlight.delete(projectId)
    })

  inFlight.set(projectId, promise)
  return promise
}

/**
 * Resolves the Sanity organization id from the plugin option or, failing that, from the
 * project's metadata using the Studio's own client.
 */
export function useOrganizationId(option: string | undefined, retryKey = 0): OrganizationIdState {
  const projectId = useProjectId()
  const client = useClient({apiVersion: '2025-02-19'})
  const key = `${projectId}|${retryKey}`
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    if (option || cache.has(projectId)) return undefined

    let cancelled = false
    const settle = (state: OrganizationIdState) => {
      if (!cancelled) setOutcome({key, state})
    }

    const lookup = async () => {
      try {
        const organizationId = await lookupOrganizationId(projectId, (url) =>
          client.request<ProjectResponse>({url}),
        )
        settle({status: 'ready', organizationId})
      } catch (error) {
        settle({
          status: 'error',
          error:
            error instanceof Error
              ? error
              : new Error('Could not look up the Sanity organization for this project.'),
        })
      }
    }
    void lookup()

    return () => {
      cancelled = true
    }
  }, [client, key, option, projectId])

  if (option) return {status: 'ready', organizationId: option}

  const cached = cache.get(projectId)
  if (cached) return {status: 'ready', organizationId: cached}

  if (outcome && outcome.key === key) return outcome.state
  return {status: 'loading'}
}
