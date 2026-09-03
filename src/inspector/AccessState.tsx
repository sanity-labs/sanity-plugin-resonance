import {AccessDeniedIcon} from '@sanity/icons/AccessDenied'
import {ErrorOutlineIcon} from '@sanity/icons/ErrorOutline'
import {LockIcon} from '@sanity/icons/Lock'
import {PlugIcon} from '@sanity/icons/Plug'
import {UserIcon} from '@sanity/icons/User'
import {UsersIcon} from '@sanity/icons/Users'
import {Button, Card, Flex, Heading, Inline, Spinner, Stack, Text} from '@sanity/ui'
import {type ComponentType, type ReactNode, useCallback} from 'react'
import {useWorkspace} from 'sanity'

import type {ResonancePluginOptions} from '../options'
import type {AccessState as ResolvedAccess} from '../transport/use-access'
import {accessCopy, requestAccessMessage} from './access-copy'
import {useStudioContext} from './studio-context'
import {useClipboard} from './use-clipboard'

/**
 * Everything the panel can show instead of the run view. `no-personas` is raised by a run, not by
 * access resolution, but it is the same kind of full-panel message.
 */
export type AccessView = Exclude<ResolvedAccess, {status: 'ready'}> | {status: 'no-personas'}

export interface AccessStateProps {
  state: AccessView
  options: ResonancePluginOptions
  /** Re-runs whatever lookup produced this state. */
  onRetry: () => void
  /** Known when the state is raised after access was resolved (e.g. `no-personas`). */
  accountUid?: string
  accountLabel?: string
}

interface FrameProps {
  icon?: ComponentType
  heading: string
  body?: ReactNode
  footnote?: ReactNode
  actions?: ReactNode
  busy?: boolean
}

function Frame({icon: Icon, heading, body, footnote, actions, busy}: FrameProps) {
  return (
    <Card padding={4} radius={2} tone="transparent">
      <Stack gap={4}>
        <Flex align="center" gap={3}>
          {busy ? (
            <Spinner muted />
          ) : (
            Icon && (
              <Text muted size={3}>
                <Icon />
              </Text>
            )
          )}
          <Heading as="h2" size={1}>
            {heading}
          </Heading>
        </Flex>
        {body && (
          <Text muted size={1}>
            {body}
          </Text>
        )}
        {actions && <Inline gap={2}>{actions}</Inline>}
        {footnote && (
          <Text muted size={0}>
            {footnote}
          </Text>
        )}
      </Stack>
    </Card>
  )
}

export function AccessState({state, options, onRetry, accountUid, accountLabel}: AccessStateProps) {
  const {auth} = useWorkspace()
  const studio = useStudioContext()
  const {status: clipboard, copy} = useClipboard()

  const copyLabel = (idle: string, copied: string) => {
    if (clipboard === 'copied') return copied
    if (clipboard === 'failed') return accessCopy.copyFailed
    return idle
  }

  const signOut = useCallback(() => {
    void auth.logout?.()
  }, [auth])

  const copyAccessRequest = useCallback(() => {
    void copy(
      requestAccessMessage({
        email: studio.email,
        origin: studio.origin,
        projectId: studio.projectId,
        dataset: studio.dataset,
        accountUid: accountUid ?? options.accountUid,
      }),
    )
  }, [accountUid, copy, options.accountUid, studio])

  switch (state.status) {
    case 'checking':
      return <Frame busy heading={accessCopy.checking.heading} />

    case 'no-token':
      return (
        <Frame
          icon={LockIcon}
          heading={accessCopy.noToken.heading}
          body={accessCopy.noToken.body}
          footnote={
            <>
              Studios below sanity 5.30.0 need <code>auth.loginMethod: &apos;token&apos;</code>.
            </>
          }
          actions={
            <>
              {auth.logout && (
                <Button mode="ghost" onClick={signOut} text={accessCopy.noToken.signOut} />
              )}
              <Button mode="ghost" onClick={onRetry} text={accessCopy.noToken.retry} />
            </>
          }
        />
      )

    case 'unreachable':
      return (
        <Frame
          icon={PlugIcon}
          heading={accessCopy.unreachable.heading}
          body={accessCopy.unreachable.body}
          footnote={state.error.message}
          actions={<Button mode="ghost" onClick={onRetry} text={accessCopy.unreachable.retry} />}
        />
      )

    case 'unauthorized':
      return (
        <Frame
          icon={AccessDeniedIcon}
          heading={accessCopy.unauthorized.heading}
          body={accessCopy.unauthorized.body}
          actions={
            <>
              {auth.logout && (
                <Button mode="ghost" onClick={signOut} text={accessCopy.unauthorized.signOut} />
              )}
              <Button mode="ghost" onClick={onRetry} text={accessCopy.unauthorized.retry} />
            </>
          }
        />
      )

    case 'no-grant':
      return (
        <Frame
          icon={UsersIcon}
          heading={accessCopy.noGrant.heading}
          body={
            <>
              {accessCopy.noGrant.bodyBefore}
              <strong>{studio.email ?? 'your Sanity user'}</strong>
              {accessCopy.noGrant.bodyAfter(accountLabel)}
            </>
          }
          actions={
            <>
              {options.requestAccess ? (
                <Button
                  as="a"
                  href={options.requestAccess.href}
                  rel="noopener noreferrer"
                  target="_blank"
                  text={options.requestAccess.label || accessCopy.noGrant.askForAccess}
                  tone="primary"
                />
              ) : (
                <Button
                  onClick={copyAccessRequest}
                  text={copyLabel(accessCopy.noGrant.askForAccess, accessCopy.noGrant.copied)}
                  tone="primary"
                />
              )}
              <Button mode="ghost" onClick={onRetry} text={accessCopy.noGrant.checkAgain} />
            </>
          }
        />
      )

    case 'no-personas':
      return (
        <Frame
          icon={UserIcon}
          heading={accessCopy.noPersonas.heading}
          body={accessCopy.noPersonas.body}
          actions={
            <>
              <Button
                as="a"
                href={options.apiUrl}
                mode="ghost"
                rel="noopener noreferrer"
                target="_blank"
                text={accessCopy.noPersonas.openResonance}
              />
              <Button mode="ghost" onClick={onRetry} text={accessCopy.noPersonas.checkAgain} />
            </>
          }
        />
      )

    case 'error':
      return (
        <Frame
          icon={ErrorOutlineIcon}
          heading={accessCopy.error.heading}
          body={state.error.message}
          actions={<Button mode="ghost" onClick={onRetry} text={accessCopy.error.retry} />}
        />
      )

    default:
      return null
  }
}
