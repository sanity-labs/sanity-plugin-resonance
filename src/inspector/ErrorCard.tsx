import {Card, Stack, Text} from '@sanity/ui'

interface ErrorCardProps {
  message: string
  detail?: string
}

/** The only way an error reaches the panel: a message in a card, never a stack. */
export function ErrorCard({message, detail}: ErrorCardProps) {
  return (
    <Card padding={3} radius={2} tone="critical">
      <Stack gap={2}>
        <Text size={1}>{message}</Text>
        {detail && (
          <Text muted size={1}>
            {detail}
          </Text>
        )}
      </Stack>
    </Card>
  )
}
