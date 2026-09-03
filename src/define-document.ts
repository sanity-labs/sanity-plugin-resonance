import type {ResonanceDocumentConfig} from './options'

/**
 * Identity helper that gives a document entry type inference and autocomplete outside the
 * `resonance()` call, in the spirit of `defineField`.
 *
 * @example
 * ```ts
 * const post = defineResonanceDocument({
 *   type: 'post',
 *   channel: 'the Sanity blog',
 *   url: ({document}) => (document.slug?.current ? `https://www.sanity.io/blog/${document.slug.current}` : null),
 * })
 *
 * resonance({apiUrl: 'https://resonance.cx', documents: [post, 'article']})
 * ```
 *
 * @public
 */
export function defineResonanceDocument<T extends ResonanceDocumentConfig>(config: T): T {
  return config
}
