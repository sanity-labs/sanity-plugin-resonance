import {useEffect, useState} from 'react'

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const elapsed = now - then
  if (elapsed < 60 * 1000) return 'just now'

  const formatter = new Intl.RelativeTimeFormat(undefined, {numeric: 'auto'})
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) {
      return formatter.format(-Math.round(elapsed / size), unit)
    }
  }
  return 'just now'
}

/** Re-renders once a minute so "Ran 3 minutes ago" keeps up. */
export function useNow(intervalMs = 60 * 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
