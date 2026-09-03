import {useCallback, useEffect, useState} from 'react'
import {useProjectId} from 'sanity'

import {readStorage, writeStorage} from '../storage'
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
  | {status: 'choose'; accounts: ResonanceAccount[]; choose: (uid: string) => void}
  | {status: 'no-grant'}
  | {status: 'unauthorized'; error: ResonanceApiError}
  | {status: 'unreachable'; error: ResonanceApiError}
  | {status: 'error'; error: Error}

export interface UseResonanceAccountOptions {
  /** `null` until the token and organization id are known. */
  fetch: ResonanceFetch | null
  /** Skips discovery entirely. */
  accountUid?: string
  retryKey?: number
}

interface Outcome {
  key: string
  state: ResonanceAccountState
}

function accountStorageKey(projectId: string): string {
  return `sanity-plugin-resonance:account:${projectId}`
}

function isUid(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
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
 * Resolves which Resonance account to run tests against: the configured `accountUid`, or the
 * accounts the server says this email is granted. With several grants the editor picks one and
 * the choice is remembered per project in `localStorage`.
 */
export function useResonanceAccount({
  fetch,
  accountUid,
  retryKey = 0,
}: UseResonanceAccountOptions): ResonanceAccountState {
  const projectId = useProjectId()
  const key = `${projectId}|${retryKey}|${fetch?.apiUrl ?? ''}`
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const choose = useCallback(
    (accounts: ResonanceAccount[], uid: string) => {
      const account = accounts.find((row) => row.uid === uid)
      if (!account) return
      writeStorage(accountStorageKey(projectId), uid)
      setOutcome({
        key,
        state: {status: 'ready', accountUid: account.uid, accountLabel: account.label},
      })
    },
    [key, projectId],
  )

  useEffect(() => {
    if (accountUid || !fetch) return undefined

    const controller = new AbortController()
    const settle = (state: ResonanceAccountState) => {
      if (!controller.signal.aborted) setOutcome({key, state})
    }

    const discover = async () => {
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

      if (rows.length === 0) {
        settle({status: 'no-grant'})
        return
      }

      if (rows.length === 1) {
        const [only] = rows
        settle({status: 'ready', accountUid: only.uid, accountLabel: only.label})
        return
      }

      const remembered = readStorage(accountStorageKey(projectId))
      const match = isUid(remembered) ? rows.find((row) => row.uid === remembered) : undefined
      if (match) {
        settle({status: 'ready', accountUid: match.uid, accountLabel: match.label})
        return
      }

      settle({status: 'choose', accounts: rows, choose: (uid) => choose(rows, uid)})
    }
    void discover()

    return () => controller.abort()
  }, [accountUid, choose, fetch, key, projectId])

  if (accountUid) return {status: 'ready', accountUid}
  if (!fetch) return {status: 'loading'}
  if (outcome && outcome.key === key) return outcome.state
  return {status: 'loading'}
}
