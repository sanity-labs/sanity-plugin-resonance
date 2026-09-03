export interface RequestAccessMessageInput {
  email: string | null
  origin: string
  projectId: string
  dataset: string
  accountUid?: string
}

export function requestAccessMessage({
  email,
  origin,
  projectId,
  dataset,
  accountUid,
}: RequestAccessMessageInput): string {
  return `Hi — could you add me to Resonance so I can run audience tests from the Studio? Sanity user: ${
    email ?? 'unknown'
  }. Studio: ${origin}. Project: ${projectId} (${dataset}). Account: ${
    accountUid ?? 'whichever account this Studio maps to'
  }.`
}

export const accessCopy = {
  checking: {
    heading: 'Connecting to Resonance…',
  },
  noToken: {
    heading: 'Sign in again to use Resonance.',
    body: "Your Studio session doesn't have a token Resonance can use. Sign out and back in, then reopen this panel.",
    footnote: "Studios below sanity 5.30.0 need `auth.loginMethod: 'token'`.",
    signOut: 'Sign out',
    retry: 'Retry',
  },
  unreachable: {
    heading: "Couldn't reach Resonance.",
    body: 'The request never got a response. Resonance may be down, the apiUrl may be wrong, or the network may be blocking it. Try again.',
    retry: 'Retry',
  },
  unauthorized: {
    heading: "Resonance couldn't verify your Sanity session.",
    body: "This usually means Resonance's Sanity login is off for this environment or your session has expired. Try signing out and in; if it persists, tell a Resonance admin.",
    signOut: 'Sign out',
    retry: 'Retry',
  },
  noGrant: {
    heading: "You're not in Resonance yet.",
    bodyBefore: 'Ask a Resonance admin to add ',
    bodyAfter: (accountLabel: string | undefined) =>
      ` to the ${accountLabel ?? 'Resonance'} account and you'll get audience feedback here.`,
    askForAccess: 'Ask for access',
    copied: 'Copied',
    checkAgain: 'Check again',
  },
  noPersonas: {
    heading: 'This account has no audiences yet.',
    body: 'Resonance needs at least one audience defined before it can review content.',
    openResonance: 'Open Resonance',
    checkAgain: 'Check again',
  },
  error: {
    heading: 'Resonance is not available right now.',
    retry: 'Retry',
  },
  copyFailed: "Couldn't copy",
} as const
