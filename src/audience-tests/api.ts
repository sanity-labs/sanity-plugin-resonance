import type {ResonanceFetch} from '../transport/resonance-fetch'
import type {AudienceTestCreateInput, AudienceTestRead} from './types'

function testsPath(accountUid: string): string {
  return `/v1/orgs/${encodeURIComponent(accountUid)}/audience-tests`
}

export function createAudienceTest(
  fetch: ResonanceFetch,
  accountUid: string,
  input: AudienceTestCreateInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<AudienceTestRead> {
  return fetch.json<AudienceTestRead>(testsPath(accountUid), {
    method: 'POST',
    headers: {'Idempotency-Key': idempotencyKey},
    body: JSON.stringify(input),
    signal,
  })
}

export function getAudienceTest(
  fetch: ResonanceFetch,
  accountUid: string,
  testId: string,
  signal?: AbortSignal,
): Promise<AudienceTestRead> {
  return fetch.json<AudienceTestRead>(`${testsPath(accountUid)}/${encodeURIComponent(testId)}`, {
    method: 'GET',
    signal,
  })
}
