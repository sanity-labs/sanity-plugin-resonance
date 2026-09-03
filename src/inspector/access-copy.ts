export const accessCopy = {
  checking: {
    heading: 'Connecting to Resonance…',
  },
  noToken: {
    heading: 'Sign out and back in to link Resonance to your Sanity account.',
    body: "This Studio signed in with a cookie, so there is no session token to hand to Resonance. Signing out and back in from the user menu stores one. If this keeps happening, the Studio owner can set auth.loginMethod: 'token'.",
    retry: 'Retry',
  },
  unreachable: {
    heading: "Couldn't reach Resonance.",
    body: 'The request never got a response. Resonance may be down, the apiUrl may be wrong, or the network may be blocking it. Try again.',
    retry: 'Retry',
  },
  unauthorized: {
    heading: "Resonance couldn't verify your Sanity session.",
    body: 'Resonance rejected the session. Sign out and back in from the user menu; if it persists, ask your Resonance admin.',
    retry: 'Retry',
  },
  noGrant: {
    heading: "You're not in Resonance yet.",
    body: (email: string | null) =>
      `Ask your Resonance admin for access${email ? ` for ${email}` : ''}, then check again.`,
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
} as const
