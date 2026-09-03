import {Card, Flex, Inline, Spinner, Stack, Text} from '@sanity/ui'

import type {AudienceTestPersonaResult, AudienceTestRead} from '../audience-tests/types'
import {PersonaResultCard} from './PersonaResultCard'
import {formatRelativeTime, useNow} from './relative-time'

export interface AudienceTestResultsProps {
  test: AudienceTestRead
  /** True while the hook is still polling this test. */
  inFlight: boolean
  /** Polling stopped at the cap while the server still reported the test as running. */
  timedOut: boolean
}

const RESPONDED: ReadonlySet<AudienceTestPersonaResult['status']> = new Set([
  'done',
  'failed',
  'rejected',
  'needs_context',
])

function formatMean(mean: number): string {
  return `${(Math.round(mean * 10) / 10).toFixed(1)} / 5`
}

function ScoreLine({test, inFlight}: {test: AudienceTestRead; inFlight: boolean}) {
  const {resonance, results, personas} = test
  const expected = resonance.expected || personas.length
  const responded = results.filter((result) => RESPONDED.has(result.status)).length
  const provisional = resonance.scored < expected

  if (inFlight) {
    return (
      <Flex align="center" gap={3}>
        <Spinner muted />
        <Stack gap={2}>
          <Text size={1}>
            {responded} of {expected} audiences have responded
          </Text>
          {resonance.mean !== null && (
            <Text muted size={1}>
              Provisional score {formatMean(resonance.mean)}
            </Text>
          )}
        </Stack>
      </Flex>
    )
  }

  if (resonance.mean === null) {
    return (
      <Text muted size={1}>
        No audience returned a score.
      </Text>
    )
  }

  return (
    <Inline gap={2}>
      <Text size={2} weight="semibold">
        {formatMean(resonance.mean)}
      </Text>
      <Text muted size={1}>
        {provisional
          ? `score from ${resonance.scored} of ${expected} audiences`
          : `score across ${resonance.scored} audiences`}
      </Text>
    </Inline>
  )
}

export function AudienceTestResults({test, inFlight, timedOut}: AudienceTestResultsProps) {
  const now = useNow()
  const resultsBySlug = new Map(test.results.map((result) => [result.personaSlug, result]))
  const order = test.personas.length > 0 ? test.personas : test.results.map((r) => r.personaSlug)

  return (
    <Stack gap={4}>
      <ScoreLine inFlight={inFlight} test={test} />

      {timedOut && (
        <Card padding={3} radius={2} tone="caution">
          <Text size={1}>
            This test is still running after 15 minutes. Reopen the panel later to see the rest.
          </Text>
        </Card>
      )}

      <Stack gap={3}>
        {order.map((slug) => (
          <PersonaResultCard key={slug} personaSlug={slug} result={resultsBySlug.get(slug)} />
        ))}
      </Stack>

      <Text muted size={0}>
        Test {test.id} · Ran {formatRelativeTime(test.createdAt, now)}
      </Text>
    </Stack>
  )
}
