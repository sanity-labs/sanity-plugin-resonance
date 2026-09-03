/**
 * Lifecycle of a whole audience test. `partial` means some personas finished and others failed.
 *
 * @public
 */
export type AudienceTestStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed'

/**
 * Lifecycle of one persona's simulation run inside a test.
 *
 * @public
 */
export type AudienceTestRunStatus =
  | 'queued'
  | 'running'
  | 'rejected'
  | 'needs_context'
  | 'done'
  | 'failed'

/**
 * A persona's 1 (did not land) to 5 (would share it) score.
 *
 * @public
 */
export type ResonanceScore = 1 | 2 | 3 | 4 | 5

/**
 * The scored part of a persona's response.
 *
 * @public
 */
export interface RunResonance {
  score: ResonanceScore
  why: string
  whatWouldChange: string[]
}

/**
 * The persona's full reaction, present once the run is `done`.
 *
 * @public
 */
export interface AudienceTestPersonaResponse {
  answer: string | null
  verdict: {
    confidence: 'high' | 'medium' | 'low' | 'none'
    experience: string
    obstacles: string[]
  }
  resonance?: RunResonance
}

/**
 * One persona's row in an audience test.
 *
 * @public
 */
export interface AudienceTestPersonaResult {
  personaSlug: string
  personaTitle: string | null
  runId: string
  status: AudienceTestRunStatus
  response: AudienceTestPersonaResponse | null
  failureReason: string | null
  updatedAt: string
}

/**
 * Aggregate score across the personas that have finished.
 *
 * @public
 */
export interface AudienceTestResonance {
  mean: number | null
  scored: number
  expected: number
  scores: Array<{personaSlug: string; score: ResonanceScore}>
}

/**
 * The response of `POST`/`GET /v1/orgs/{accountUid}/audience-tests[/{id}]`.
 *
 * @public
 */
export interface AudienceTestRead {
  id: string
  title: string | null
  question: string
  content: string
  compareTo: string | null
  personas: string[]
  status: AudienceTestStatus
  batchId: string
  createdAt: string
  results: AudienceTestPersonaResult[]
  resonance: AudienceTestResonance
  /** Milliseconds until the next poll while in flight; `null` once the test is terminal. */
  pollAfterMs: number | null
}

/**
 * Body of `POST /v1/orgs/{accountUid}/audience-tests`.
 *
 * @public
 */
export interface AudienceTestCreateInput {
  title?: string
  question?: string
  content: string
  compareTo?: string
  personas?: string[]
}
