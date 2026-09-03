import {useEffect, useState} from 'react'

import type {ResonanceFetch} from '../transport/resonance-fetch'
import {type Audience, listAudiences} from './audiences'

export type AudiencesState =
  | {status: 'loading'}
  | {status: 'ready'; audiences: Audience[]}
  | {status: 'error'; message: string}

/** Loads the account's audiences once per account; failures are non-fatal (the picker hides). */
export function useAudiences(fetch: ResonanceFetch, accountUid: string): AudiencesState {
  const [loaded, setLoaded] = useState<{accountUid: string; state: AudiencesState} | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const audiences = await listAudiences(fetch, accountUid, controller.signal)
        if (!controller.signal.aborted) {
          setLoaded({accountUid, state: {status: 'ready', audiences}})
        }
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : String(error)
        setLoaded({accountUid, state: {status: 'error', message}})
      }
    }
    void load()
    return () => {
      controller.abort()
    }
  }, [accountUid, fetch])

  return loaded && loaded.accountUid === accountUid ? loaded.state : {status: 'loading'}
}
