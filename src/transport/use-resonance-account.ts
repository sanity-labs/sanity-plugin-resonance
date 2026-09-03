import {useEffect, useState} from 'react'

import {ResonanceApiError, type ResonanceFetch} from './resonance-fetch'

/**
 * A Resonance account the signed-in Sanity user has access to. Only the fields the plugin uses;
 * the server may return more.
 *
 * @public
 */
export interface ResonanceAccount {
  uid: string
  label: string
  createdAt: string
}

interface AccountsResponse {
  rows: ResonanceAccount[]
}

export type ResonanceAccountState =
  | {status: 'loading'}
  | {status: 'ready'; accountUid: string; accountLabel?: string}
  | {status: 'no-grant'}
  | {status: 'unauthorized'; error: ResonanceApiError}
  | {status: 'unreachable'; error: ResonanceApiError}
  | {status: 'error'; error: Error}

export interface UseResonanceAccountOptions {
  /** `null` until the token and organization id are known. */
  fetch: ResonanceFetch | null
  /** The account the Studio is configured for. */
  accountUid: string
  retryKey?: number
}

interface Outcome {
  key: string
  state: ResonanceAccountState
}

function fromError(error: unknown): ResonanceAccountState {
  if (error instanceof ResonanceApiError) {
    if (error.kind === 'network') return {status: 'unreachable', error}
    if (error.status === 401) return {status: 'unauthorized', error}
    return {status: 'error', error}
  }
  return {
    status: 'error',
    error: error instanceof Error ? error : new Error('Account lookup failed'),
  }
}

/**
 * Checks that the signed-in editor is granted the configured Resonance account. The account is
 * fixed by the Studio owner; this hook only confirms access and picks up the account's label.
 * An editor whose grants do not include it sees the same "not in Resonance yet" state as one
 * with no grants at all, instead of a 403 on the first run.
 */
export function useResonanceAccount({
  fetch,
  accountUid,
  retryKey = 0,
}: UseResonanceAccountOptions): ResonanceAccountState {
  const key = `${accountUid}|${retryKey}|${fetch?.apiUrl ?? ''}`
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    if (!fetch) return undefined

    const controller = new AbortController()
    const settle = (state: ResonanceAccountState) => {
      if (!controller.signal.aborted) setOutcome({key, state})
    }

    const verify = async () => {
      let rows: ResonanceAccount[]
      try {
        const response = await fetch.json<AccountsResponse>('/v1/auth/sanity/accounts', {
          signal: controller.signal,
        })
        rows = Array.isArray(response.rows) ? response.rows : []
      } catch (error) {
        settle(fromError(error))
        return
      }

      const granted = rows.find((row) => row.uid === accountUid)
      if (!granted) {
        settle({status: 'no-grant'})
        return
      }

      settle({status: 'ready', accountUid: granted.uid, accountLabel: granted.label})
    }
    void verify()

    return () => controller.abort()
  }, [accountUid, fetch, key])

  if (!fetch) return {status: 'loading'}
  if (outcome && outcome.key === key) return outcome.state
  return {status: 'loading'}
}
