import {useCallback, useEffect, useRef, useState} from 'react'

import {MAX_TITLE_LENGTH} from '../options'
import {ResonanceApiError, type ResonanceFetch} from '../transport/resonance-fetch'
import {createAudienceTest, getAudienceTest} from './api'
import {idempotencyKey} from './idempotency'
import type {AudienceTestCreateInput, AudienceTestRead} from './types'

/** Give up polling after this long; the server fails a test with no runs after five minutes. */
export const POLL_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_POLL_MS = 3000
const MAX_CONSECUTIVE_POLL_FAILURES = 3

export type AudienceTestState =
  | {status: 'idle'}
  /** Restoring a previous run from storage. */
  | {status: 'loading'}
  | {status: 'submitting'}
  | {status: 'polling'; test: AudienceTestRead}
  | {status: 'done'; test: AudienceTestRead}
  /** Polling stopped at the 15-minute cap while the server still reported the test in flight. */
  | {status: 'still-running'; test: AudienceTestRead}
  | {status: 'error'; error: ResonanceApiError; test: AudienceTestRead | null}

/** What one run sends; the same fields as the request body. */
export interface RunInput {
  title?: string
  content: string
  compareTo?: string
  question?: string
  personas?: string[]
}

export type LoadResult = 'loaded' | 'not-found' | 'failed' | 'aborted'

export interface UseAudienceTestOptions {
  fetch: ResonanceFetch
  accountUid: string
  /** Stable id for the document, mixed into the idempotency key. */
  documentKey: string
}

export interface UseAudienceTestResult {
  state: AudienceTestState
  /** Submits a test and starts polling. Resolves with the accepted test, or `null` if it failed or was superseded. */
  run: (input: RunInput) => Promise<AudienceTestRead | null>
  /** Fetches an existing test and resumes polling if it is still in flight. */
  load: (testId: string) => Promise<LoadResult>
  reset: () => void
}

function toApiError(error: unknown): ResonanceApiError {
  if (error instanceof ResonanceApiError) return error
  return new ResonanceApiError(
    error instanceof Error && error.message ? error.message : 'The Resonance request failed',
    {status: null, kind: 'network', cause: error},
  )
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, {once: true})
  })
}

function settled(test: AudienceTestRead): AudienceTestState {
  return test.pollAfterMs === null ? {status: 'done', test} : {status: 'polling', test}
}

export function useAudienceTest({
  fetch,
  accountUid,
  documentKey,
}: UseAudienceTestOptions): UseAudienceTestResult {
  const [state, setState] = useState<AudienceTestState>({status: 'idle'})
  const controllerRef = useRef<AbortController | null>(null)

  // Every run/load owns one controller; starting another aborts whatever was in flight.
  const begin = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return controller
  }, [])

  useEffect(
    () => () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    },
    [fetch, accountUid, documentKey],
  )

  const poll = useCallback(
    async (initial: AudienceTestRead, controller: AbortController, startedAt: number) => {
      const step = async (test: AudienceTestRead, failures: number): Promise<void> => {
        if (test.pollAfterMs === null || controller.signal.aborted) return

        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setState({status: 'still-running', test})
          return
        }

        await wait(test.pollAfterMs > 0 ? test.pollAfterMs : DEFAULT_POLL_MS, controller.signal)
        if (controller.signal.aborted) return

        let next: AudienceTestRead
        try {
          next = await getAudienceTest(fetch, accountUid, test.id, controller.signal)
        } catch (error) {
          if (controller.signal.aborted) return
          // A single failed poll should not end a run that is still progressing server-side.
          if (failures + 1 >= MAX_CONSECUTIVE_POLL_FAILURES) {
            setState({status: 'error', error: toApiError(error), test})
            return
          }
          await step(test, failures + 1)
          return
        }

        setState(settled(next))
        await step(next, 0)
      }

      await step(initial, 0)
    },
    [accountUid, fetch],
  )

  const run = useCallback(
    async (input: RunInput): Promise<AudienceTestRead | null> => {
      const controller = begin()
      const startedAt = Date.now()
      setState({status: 'submitting'})

      try {
        const key = await idempotencyKey([
          accountUid,
          documentKey,
          input.content,
          input.compareTo ?? '',
          input.question ?? '',
          input.personas?.join(',') ?? '',
        ])
        if (controller.signal.aborted) return null

        const body: AudienceTestCreateInput = {content: input.content}
        if (input.title) body.title = input.title.slice(0, MAX_TITLE_LENGTH)
        if (input.compareTo) body.compareTo = input.compareTo
        if (input.question) body.question = input.question
        if (input.personas && input.personas.length > 0) body.personas = input.personas

        const test = await createAudienceTest(fetch, accountUid, body, key, controller.signal)
        if (controller.signal.aborted) return null

        setState(settled(test))
        if (test.pollAfterMs !== null) void poll(test, controller, startedAt)
        return test
      } catch (error) {
        if (controller.signal.aborted) return null
        setState({status: 'error', error: toApiError(error), test: null})
        return null
      }
    },
    [accountUid, begin, documentKey, fetch, poll],
  )

  const load = useCallback(
    async (testId: string): Promise<LoadResult> => {
      const controller = begin()
      setState({status: 'loading'})

      try {
        const test = await getAudienceTest(fetch, accountUid, testId, controller.signal)
        if (controller.signal.aborted) return 'aborted'
        setState(settled(test))
        if (test.pollAfterMs !== null) void poll(test, controller, Date.now())
        return 'loaded'
      } catch (error) {
        if (controller.signal.aborted) return 'aborted'
        const apiError = toApiError(error)
        if (apiError.status === 404) {
          setState({status: 'idle'})
          return 'not-found'
        }
        setState({status: 'error', error: apiError, test: null})
        return 'failed'
      }
    },
    [accountUid, begin, fetch, poll],
  )

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setState({status: 'idle'})
  }, [])

  return {state, run, load, reset}
}
