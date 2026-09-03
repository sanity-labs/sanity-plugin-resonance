import type {SVGProps} from 'react'

/**
 * The Resonance mark (the concentric rings from the app favicon), drawn to the
 * same conventions as `@sanity/icons` so it sits correctly in Studio buttons
 * and menus: 25×25 viewBox, 1em box, `currentColor` strokes.
 */
export function ResonanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      data-sanity-icon="resonance"
      fill="none"
      height="1em"
      viewBox="0 0 25 25"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="12.5" cy="12.5" opacity="0.45" r="9.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12.5" cy="12.5" r="5.75" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12.5" cy="12.5" fill="currentColor" r="1.75" />
    </svg>
  )
}
