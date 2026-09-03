import {CloseIcon} from '@sanity/icons/Close'
import {Box, Button, Card, Flex, Text} from '@sanity/ui'
import type {DocumentInspectorProps} from 'sanity'

import type {ResonancePluginOptions} from '../options'
import type {ResolvedDocumentConfig} from '../resolve-documents'
import {useAccess} from '../transport/use-access'
import {AccessState} from './AccessState'
import {ResonanceIcon} from './ResonanceIcon'
import {RunView} from './RunView'
import {toPublishedId} from './studio-context'

export interface ResonanceInspectorProps extends DocumentInspectorProps {
  options: ResonancePluginOptions
  /** The resolved settings for this document's type. */
  config: ResolvedDocumentConfig
}

export function ResonanceInspector({
  documentId,
  documentType,
  onClose,
  options,
  config,
}: ResonanceInspectorProps) {
  const title = options.title ?? 'Resonance'
  const {access, retry} = useAccess(options)
  const publishedDocumentId = toPublishedId(documentId)
  const accountLabel = access.status === 'ready' ? access.accountLabel : undefined

  return (
    <Flex direction="column" height="fill" overflow="hidden">
      <Card padding={3} shadow={1}>
        <Flex align="center" gap={3}>
          <Box flex={1}>
            <Flex align="center" gap={2}>
              <Text size={1}>
                <ResonanceIcon />
              </Text>
              <Text size={1} weight="semibold">
                {title}
              </Text>
              {accountLabel && (
                <Text muted size={1}>
                  {accountLabel}
                </Text>
              )}
            </Flex>
          </Box>
          <Button aria-label="Close" icon={CloseIcon} mode="bleed" onClick={onClose} padding={2} />
        </Flex>
      </Card>

      <Card flex={1} overflow="auto" padding={4}>
        {access.status === 'ready' ? (
          <RunView
            accountLabel={access.accountLabel}
            accountUid={access.accountUid}
            config={config}
            documentType={documentType}
            fetch={access.fetch}
            key={`${access.accountUid}:${publishedDocumentId}`}
            options={options}
            publishedDocumentId={publishedDocumentId}
          />
        ) : (
          <AccessState onRetry={retry} options={options} state={access} />
        )}
      </Card>
    </Flex>
  )
}
