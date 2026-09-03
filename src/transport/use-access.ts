import {useCallback, useEffect, useMemo, useState} from 'react'

import type {ResonancePluginOptions} from '../options'
import {createResonanceFetch, type ResonanceApiError, type ResonanceFetch} from './resonance-fetch'
import {useOrganizationId} from './use-organization-id'
import {type ResonanceAccount, useResonanceAccount} from './use-resonance-account'
import {useSanityToken} from './use-sanity-token'

export type AccessState =
  | {status: 'checking'}
  | {status: 'no-token'}
  | {status: 'unreachable'; error: ResonanceApiError}
  | {status: 'unauthorized'; error: ResonanceApiError}
  | {status: 'no-grant'}
  | {status: 'choose-account'; accounts: ResonanceAccount[]; choose: (uid: string) => void}
  | {status: 'error'; error: Error}
  | {status: 'ready'; accountUid: string; accountLabel?: string; fetch: ResonanceFetch}

interface Credentials {
  token: string | null
  organizationId: string | null
}

function createCredentialStore() {
  let current: Credentials = {token: null, organizationId: null}
  return {
    get: () => current,
    set: (next: Credentials) => {
      current = next
    },
  }
}

export interface UseAccessResult {
  access: AccessState
  /** Re-runs every lookup (token subscription, organization, account discovery). */
  retry: () => void
}

/**
 * Resolves access in order: Sanity token, organization id, then account discovery against
 * Resonance. The transport reads the token and organization id through refs so the same
 * instance stays valid across re-renders and picks up a refreshed token.
 */
export function useAccess(options: ResonancePluginOptions): UseAccessResult {
  const [retryKey, setRetryKey] = useState(0)
  const retry = useCallback(() => setRetryKey((key) => key + 1), [])

  const tokenState = useSanityToken(retryKey)
  const organizationState = useOrganizationId(options.organizationId, retryKey)

  // The transport reads credentials through a small store rather than closing over state, so one
  // instance survives re-renders and a refreshed token is used on the next request. The store is
  // synced in an effect declared before `useResonanceAccount`, so its request effect always sees
  // the current values.
  const [credentials] = useState(createCredentialStore)

  useEffect(() => {
    credentials.set({
      token: tokenState.status === 'ready' ? tokenState.token : null,
      organizationId:
        organizationState.status === 'ready' ? organizationState.organizationId : null,
    })
  }, [credentials, organizationState, tokenState])

  const fetch = useMemo(
    () =>
      createResonanceFetch({
        apiUrl: options.apiUrl,
        getToken: () => credentials.get().token,
        getOrganizationId: () => credentials.get().organizationId,
      }),
    [credentials, options.apiUrl],
  )

  const canCallResonance =
    tokenState.status === 'ready' &&
    tokenState.token !== null &&
    organizationState.status === 'ready'

  const accountState = useResonanceAccount({
    fetch: canCallResonance ? fetch : null,
    accountUid: options.accountUid,
    retryKey,
  })

  const access = useMemo<AccessState>(() => {
    if (tokenState.status === 'loading') return {status: 'checking'}
    if (tokenState.token === null) return {status: 'no-token'}
    if (organizationState.status === 'loading') return {status: 'checking'}
    if (organizationState.status === 'error') {
      return {status: 'error', error: organizationState.error}
    }

    switch (accountState.status) {
      case 'loading':
        return {status: 'checking'}
      case 'no-grant':
        return {status: 'no-grant'}
      case 'unauthorized':
        return {status: 'unauthorized', error: accountState.error}
      case 'unreachable':
        return {status: 'unreachable', error: accountState.error}
      case 'error':
        return {status: 'error', error: accountState.error}
      case 'choose':
        return {
          status: 'choose-account',
          accounts: accountState.accounts,
          choose: accountState.choose,
        }
      case 'ready':
        return {
          status: 'ready',
          accountUid: accountState.accountUid,
          accountLabel: accountState.accountLabel,
          fetch,
        }
      default:
        return {status: 'checking'}
    }
  }, [accountState, fetch, organizationState, tokenState])

  return {access, retry}
}
