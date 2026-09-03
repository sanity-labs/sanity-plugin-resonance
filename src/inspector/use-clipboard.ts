import {useCallback, useEffect, useRef, useState} from 'react'

const FEEDBACK_MS = 2000

export type ClipboardStatus = 'idle' | 'copied' | 'failed'

/** Copies text and reports the outcome for a moment so a button can flip its label. */
export function useClipboard(): {status: ClipboardStatus; copy: (text: string) => Promise<void>} {
  const [status, setStatus] = useState<ClipboardStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(async (text: string) => {
    let next: ClipboardStatus = 'copied'
    try {
      if (!globalThis.navigator?.clipboard) throw new Error('Clipboard is unavailable')
      await globalThis.navigator.clipboard.writeText(text)
    } catch {
      next = 'failed'
    }
    setStatus(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), FEEDBACK_MS)
  }, [])

  return {status, copy}
}
