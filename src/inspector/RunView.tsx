import {Box, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useSchema} from 'sanity'
import {useDocumentPane} from 'sanity/structure'

import {
  audiencesStorageKey,
  readSelectedAudiences,
  writeSelectedAudiences,
} from '../audience-tests/audiences-storage'
import {
  compareStorageKey,
  readCompareEnabled,
  writeCompareEnabled,
} from '../audience-tests/compare-storage'
import {type Composition, composeRequest} from '../audience-tests/compose'
import {contentHash} from '../audience-tests/idempotency'
import {
  clearLastTest,
  type LastTestRecord,
  lastTestStorageKey,
  readLastTest,
  writeLastTest,
} from '../audience-tests/last-test-storage'
import {useAudienceTest} from '../audience-tests/use-audience-test'
import {useAudiences} from '../audience-tests/use-audiences'
import {
  MAX_CONTENT_BYTES,
  type ResonanceDocumentContext,
  type ResonanceDocumentVariant,
  type ResonancePluginOptions,
} from '../options'
import type {ResolvedDocumentConfig} from '../resolve-documents'
import type {ResonanceApiError, ResonanceFetch} from '../transport/resonance-fetch'
import {AccessState} from './AccessState'
import {AudienceTestResults} from './AudienceTestResults'
import {ErrorCard} from './ErrorCard'
import {RunCard} from './RunCard'
import {currentOrigin, useStudioContext} from './studio-context'

export interface RunViewProps {
  options: ResonancePluginOptions
  config: ResolvedDocumentConfig
  documentType: string
  fetch: ResonanceFetch
  accountUid: string
  accountLabel?: string
  publishedDocumentId: string
}

function formatKilobytes(bytes: number): string {
  return `${Math.round(bytes / 100) / 10} KB`
}

function isNoPersonasError(error: ResonanceApiError): boolean {
  return error.status === 400 && /no personas/i.test(error.message)
}

export function RunView({
  options,
  config,
  documentType,
  fetch,
  accountUid,
  accountLabel,
  publishedDocumentId,
}: RunViewProps) {
  const {displayed, editState} = useDocumentPane()
  const schema = useSchema()
  const {projectId, dataset} = useStudioContext()
  const {state, run, load} = useAudienceTest({fetch, accountUid, documentKey: publishedDocumentId})

  const storageKey = lastTestStorageKey({projectId, dataset, publishedDocumentId})
  const [record, setRecord] = useState<LastTestRecord | null>(() => readLastTest(storageKey))

  const compareKey = compareStorageKey({projectId, dataset, publishedDocumentId})
  const [compareEnabled, setCompareEnabled] = useState(() => readCompareEnabled(compareKey))
  const handleCompareChange = useCallback(
    (enabled: boolean) => {
      setCompareEnabled(enabled)
      writeCompareEnabled(compareKey, enabled)
    },
    [compareKey],
  )

  const audiencesKey = audiencesStorageKey({projectId, documentType})
  const [selectedAudiences, setSelectedAudiences] = useState<string[] | null>(() =>
    readSelectedAudiences(audiencesKey),
  )
  const handleAudiencesChange = useCallback(
    (selected: string[] | null) => {
      setSelectedAudiences(selected)
      writeSelectedAudiences(audiencesKey, selected)
    },
    [audiencesKey],
  )
  const audiences = useAudiences(fetch, accountUid)

  const variant: ResonanceDocumentVariant = editState?.version
    ? 'version'
    : editState?.draft
      ? 'draft'
      : 'published'
  const published = editState?.published ?? null

  const schemaType = useMemo(() => {
    const type = schema.get(documentType)
    return type && type.jsonType === 'object' ? type : null
  }, [documentType, schema])

  const ctx = useMemo<ResonanceDocumentContext | null>(
    () =>
      displayed && schemaType
        ? {schemaType, document: displayed, published, variant, projectId, dataset}
        : null,
    [dataset, displayed, projectId, published, schemaType, variant],
  )

  const composition = useMemo<Composition>(
    () =>
      ctx
        ? composeRequest({config, ctx, compareEnabled, audiences: selectedAudiences})
        : {status: 'empty'},
    [compareEnabled, config, ctx, selectedAudiences],
  )
  const request = composition.status === 'ready' ? composition.request : null

  const hashParts = request?.keyParts ?? null
  const hashInput = hashParts ? hashParts.join('\0') : null

  // The digest is async, so it is stored next to the input it was computed from and only
  // trusted while that input is still what is displayed.
  const [hashed, setHashed] = useState<{input: string; hash: string} | null>(null)
  useEffect(() => {
    if (!hashParts || hashInput === null) return undefined
    let cancelled = false
    const digest = async () => {
      const hash = await contentHash(hashParts)
      if (!cancelled) setHashed({input: hashInput, hash})
    }
    void digest()
    return () => {
      cancelled = true
    }
  }, [hashInput, hashParts])
  const currentHash = hashed && hashed.input === hashInput ? hashed.hash : null

  // Restore the last run when the panel opens. Storage is read here rather than from `record`
  // so a run we just finished does not re-trigger a load. A 404 means the test is gone; forget it.
  useEffect(() => {
    const stored = readLastTest(storageKey)
    if (!stored || stored.accountUid !== accountUid) return
    const restore = async () => {
      const result = await load(stored.testId)
      if (result === 'not-found') {
        clearLastTest(storageKey)
        setRecord(null)
      }
    }
    void restore()
  }, [accountUid, load, storageKey])

  const handleRun = useCallback(() => {
    if (!request) return
    const {title, content, compareTo, question, personas, keyParts} = request
    void (async () => {
      const hash = await contentHash(keyParts)
      const test = await run({title, content, compareTo, question, personas})
      if (!test) return
      const next: LastTestRecord = {
        testId: test.id,
        accountUid,
        contentHash: hash,
        createdAt: test.createdAt,
      }
      writeLastTest(storageKey, next)
      setRecord(next)
    })()
  }, [accountUid, request, run, storageKey])

  const busy = state.status === 'submitting' || state.status === 'polling'

  let blockedReason: string | null = null
  let problem: string | null = null
  if (!schemaType) {
    blockedReason = 'This document could not be prepared for review.'
    problem = `The schema has no object type named "${documentType}", so there is nothing to serialize.`
  } else if (composition.status === 'failed') {
    blockedReason = 'This document could not be prepared for review.'
    problem = composition.message
  } else if (!request) {
    blockedReason = 'This document has nothing to review yet.'
  } else if (request.bytes > MAX_CONTENT_BYTES) {
    blockedReason = `Content is ${formatKilobytes(request.bytes)}; Resonance accepts up to ${formatKilobytes(
      MAX_CONTENT_BYTES,
    )}.`
  } else if (selectedAudiences !== null && selectedAudiences.length === 0) {
    blockedReason = 'Choose at least one audience in the options.'
  }

  const shownTest =
    state.status === 'polling' ||
    state.status === 'done' ||
    state.status === 'still-running' ||
    (state.status === 'error' && state.test)
      ? state.test
      : null

  const contentChanged =
    shownTest !== null &&
    record !== null &&
    record.testId === shownTest.id &&
    currentHash !== null &&
    currentHash !== record.contentHash

  // Real audience names arrive with results; until then the picker shows humanised slugs.
  const audienceTitles = useMemo(() => {
    const titles = new Map<string, string>()
    for (const result of shownTest?.results ?? []) {
      if (result.personaTitle) titles.set(result.personaSlug, result.personaTitle)
    }
    return titles
  }, [shownTest])

  if (state.status === 'error' && isNoPersonasError(state.error)) {
    return (
      <AccessState
        accountLabel={accountLabel}
        accountUid={accountUid}
        onRetry={handleRun}
        options={options}
        state={{status: 'no-personas'}}
      />
    )
  }

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <RunCard
          audiences={{
            state: audiences,
            selected: selectedAudiences,
            onChange: handleAudiencesChange,
            titles: audienceTitles,
          }}
          blockedReason={blockedReason}
          busy={busy}
          compare={
            request?.canCompare ? {enabled: compareEnabled, onChange: handleCompareChange} : null
          }
          onRun={handleRun}
        />
        {contentChanged && (
          <Box paddingX={1}>
            <Text muted size={1}>
              Content has changed since the audiences last tested it.
            </Text>
          </Box>
        )}
      </Stack>

      {problem && <ErrorCard message={problem} />}

      {state.status === 'error' && (
        <ErrorCard
          message={state.error.message}
          detail={
            state.error.kind === 'network'
              ? `Requests from ${currentOrigin()} may be blocked, or Resonance is unreachable.`
              : state.error.status
                ? `HTTP ${state.error.status}`
                : undefined
          }
        />
      )}

      {state.status === 'loading' && (
        <Flex align="center" gap={3}>
          <Spinner muted />
          <Text muted size={1}>
            Loading the last run…
          </Text>
        </Flex>
      )}

      {shownTest && (
        <AudienceTestResults
          inFlight={state.status === 'polling'}
          test={shownTest}
          timedOut={state.status === 'still-running'}
        />
      )}
    </Stack>
  )
}
