import {ChevronDownIcon} from '@sanity/icons/ChevronDown'
import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {Badge, type BadgeTone, Box, Button, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {useState} from 'react'

import type {AudienceTestPersonaResult, ResonanceScore} from '../audience-tests/types'

export interface PersonaResultCardProps {
  personaSlug: string
  /** `undefined` until the server has created the run for this persona. */
  result: AudienceTestPersonaResult | undefined
}

export function scoreTone(score: ResonanceScore): BadgeTone {
  if (score <= 2) return 'critical'
  if (score === 3) return 'caution'
  return 'positive'
}

/**
 * A review-style word for each score, anchored to what the scale means to the audience:
 * 1 is "not for me, would not look twice", 3 is "might skim", 5 is "would read, save or share".
 */
export const SCORE_LABEL: Record<ResonanceScore, string> = {
  1: 'Not for me',
  2: 'Weak',
  3: 'Mixed',
  4: 'Great',
  5: 'Excellent',
}

/** "Great — 4/5": the word gives the axis, the number gives the position on it. */
export function formatScore(score: ResonanceScore): string {
  return `${SCORE_LABEL[score]} — ${score}/5`
}

const STATUS_LABEL: Record<AudienceTestPersonaResult['status'], string> = {
  queued: 'Queued',
  running: 'Reading…',
  done: 'Done',
  failed: 'Failed',
  rejected: 'Declined to review',
  needs_context: 'Needed more context',
}

/** Suggestions are free text and can repeat, so keys carry an occurrence count. */
function keyed(items: string[]): Array<{key: string; text: string}> {
  const seen = new Map<string, number>()
  return items.map((text) => {
    const count = seen.get(text) ?? 0
    seen.set(text, count + 1)
    return {key: count === 0 ? text : `${text}#${count}`, text}
  })
}

function Recommendations({items}: {items: string[]}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <Stack gap={2}>
      <Box>
        <Button
          aria-expanded={open}
          fontSize={1}
          icon={open ? ChevronDownIcon : ChevronRightIcon}
          mode="bleed"
          onClick={() => setOpen((value) => !value)}
          padding={2}
          text={`Recommendations (${items.length})`}
        />
      </Box>
      {open && (
        <Box paddingLeft={2}>
          <Text size={1}>
            <ul style={{margin: 0, paddingLeft: '1.25em'}}>
              {keyed(items).map((item) => (
                <li key={item.key} style={{marginBottom: '0.5em'}}>
                  {item.text}
                </li>
              ))}
            </ul>
          </Text>
        </Box>
      )}
    </Stack>
  )
}

export function PersonaResultCard({personaSlug, result}: PersonaResultCardProps) {
  const title = result?.personaTitle ?? personaSlug
  const pending = !result || result.status === 'queued' || result.status === 'running'
  const resonance = result?.status === 'done' ? result.response?.resonance : undefined
  const failed = !pending && result.status !== 'done'

  return (
    <Card border padding={3} radius={2} tone={failed ? 'transparent' : 'default'}>
      <Stack gap={3}>
        <Flex align="center" gap={3}>
          <Box flex={1}>
            <Text size={1} weight="semibold">
              {title}
            </Text>
          </Box>
          {resonance && (
            <Badge fontSize={1} tone={scoreTone(resonance.score)}>
              {formatScore(resonance.score)}
            </Badge>
          )}
          {pending && <Spinner muted />}
        </Flex>

        {pending && (
          <Text muted size={1}>
            {result ? STATUS_LABEL[result.status] : STATUS_LABEL.queued}
          </Text>
        )}

        {failed && (
          <Text muted size={1}>
            {STATUS_LABEL[result.status]}
            {result.failureReason ? ` — ${result.failureReason}` : ''}
          </Text>
        )}

        {result?.status === 'done' && resonance && (
          <>
            <Text size={1} style={{whiteSpace: 'pre-wrap'}}>
              {resonance.why}
            </Text>
            <Recommendations items={resonance.whatWouldChange} />
          </>
        )}

        {result?.status === 'done' && !resonance && (
          <Text muted size={1}>
            {result.response?.verdict.experience || 'This audience finished without a score.'}
          </Text>
        )}
      </Stack>
    </Card>
  )
}
