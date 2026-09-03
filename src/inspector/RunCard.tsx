import {CogIcon} from '@sanity/icons/Cog'
import {PlayIcon} from '@sanity/icons/Play'
import {Box, Button, Card, Checkbox, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {useId, useState} from 'react'

import type {Audience} from '../audience-tests/audiences'
import type {AudiencesState} from '../audience-tests/use-audiences'

export interface CompareOption {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export interface AudiencesOption {
  state: AudiencesState
  /** `null` = the host's default (configured audiences, or all). */
  selected: string[] | null
  onChange: (selected: string[] | null) => void
  /** Real titles learned from a run, keyed by slug. */
  titles: ReadonlyMap<string, string>
}

export interface RunCardProps {
  /** Why the button is disabled, when it is. */
  blockedReason: string | null
  busy: boolean
  onRun: () => void
  /** Present only when an earlier version exists to compare against. */
  compare: CompareOption | null
  audiences: AudiencesOption
}

function isSelected(audience: Audience, selected: string[] | null): boolean {
  return selected === null || selected.includes(audience.slug)
}

function AudiencesPicker({state, selected, onChange, titles}: AudiencesOption) {
  if (state.status === 'loading') {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text muted size={1}>
          Loading audiences…
        </Text>
      </Flex>
    )
  }
  if (state.status === 'error') {
    return (
      <Text muted size={1}>
        Audiences could not be loaded; all of them will be used.
      </Text>
    )
  }
  if (state.audiences.length === 0) {
    return (
      <Text muted size={1}>
        This account has no audiences yet.
      </Text>
    )
  }

  const toggle = (audience: Audience, checked: boolean) => {
    const current = state.audiences
      .filter((candidate) => isSelected(candidate, selected))
      .map((candidate) => candidate.slug)
    const next = checked
      ? [...new Set([...current, audience.slug])]
      : current.filter((slug) => slug !== audience.slug)
    // Everyone chosen is the same as no choice; store it that way so new audiences are included.
    onChange(next.length === state.audiences.length ? null : next)
  }

  return (
    <Stack gap={2}>
      {state.audiences.map((audience) => (
        <Flex align="center" as="label" gap={2} key={audience.slug}>
          <Checkbox
            checked={isSelected(audience, selected)}
            onChange={(event) => toggle(audience, event.currentTarget.checked)}
          />
          <Text size={1}>{titles.get(audience.slug) ?? audience.title}</Text>
        </Flex>
      ))}
    </Stack>
  )
}

function Options({compare, audiences, busy}: Pick<RunCardProps, 'compare' | 'audiences' | 'busy'>) {
  return (
    <Stack gap={4} paddingTop={2}>
      {compare && (
        <Stack gap={2}>
          <Text size={1} weight="medium">
            Comparison
          </Text>
          <Flex align="center" as="label" gap={2}>
            <Checkbox
              checked={compare.enabled}
              disabled={busy}
              onChange={(event) => compare.onChange(event.currentTarget.checked)}
            />
            <Text size={1}>Compare with the published version</Text>
          </Flex>
        </Stack>
      )}

      <Stack gap={2}>
        <Text size={1} weight="medium">
          Audiences
        </Text>
        <AudiencesPicker {...audiences} />
      </Stack>
    </Stack>
  )
}

export function RunCard({blockedReason, busy, onRun, compare, audiences}: RunCardProps) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsId = useId()

  return (
    <Card border padding={3} radius={2}>
      <Stack gap={3}>
        <Flex align="flex-start" gap={3}>
          <Box flex={1}>
            <Stack gap={2}>
              <Text size={1} weight="medium">
                Audience test
              </Text>
              <Text muted size={1}>
                Send this content to your simulated audiences
              </Text>
            </Stack>
          </Box>
          <Button
            aria-controls={optionsId}
            aria-expanded={optionsOpen}
            aria-label="Options"
            icon={CogIcon}
            mode="bleed"
            onClick={() => setOptionsOpen((open) => !open)}
            padding={2}
            selected={optionsOpen}
          />
        </Flex>

        <Button
          disabled={blockedReason !== null || busy}
          icon={PlayIcon}
          loading={busy}
          onClick={onRun}
          text="Run audience test"
          tone="primary"
        />

        {blockedReason && (
          <Text muted size={1}>
            {blockedReason}
          </Text>
        )}

        {optionsOpen && (
          <Box id={optionsId}>
            <Options audiences={audiences} busy={busy} compare={compare} />
          </Box>
        )}
      </Stack>
    </Card>
  )
}
