import {useEffect, useState} from 'react'
import {useWorkspace} from 'sanity'

export type SanityTokenState = {status: 'loading'} | {status: 'ready'; token: string | null}

interface Emission {
  key: number
  token: string | null
}

/**
 * Subscribes to the workspace auth store's token observable. `null` means the Studio has no
 * token it can hand to a third party (cookie-only session, or a Studio older than 5.30.0 in
 * `dual` login mode). `retryKey` forces a fresh subscription, which is what "Retry" does.
 */
export function useSanityToken(retryKey = 0): SanityTokenState {
  const {auth} = useWorkspace()
  const token$ = auth.token
  const [emission, setEmission] = useState<Emission | null>(null)

  useEffect(() => {
    if (!token$) return undefined
    const subscription = token$.subscribe({
      next: (token) => setEmission({key: retryKey, token: token || null}),
      error: () => setEmission({key: retryKey, token: null}),
    })
    return () => subscription.unsubscribe()
  }, [token$, retryKey])

  if (!token$) return {status: 'ready', token: null}
  if (emission === null || emission.key !== retryKey) return {status: 'loading'}
  return {status: 'ready', token: emission.token}
}
