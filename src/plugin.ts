import {definePlugin} from 'sanity'

import {defineResonanceInspector} from './inspector/define-inspector'
import {type ResonancePluginOptions, validateOptions} from './options'
import {resolveDocuments} from './resolve-documents'

/**
 * Adds a "Resonance" document inspector to the configured document types. Editors run an
 * audience test on the displayed document and read each audience's score and reasoning in the
 * side panel.
 *
 * @example
 * ```ts
 * import {defineConfig} from 'sanity'
 * import {resonance} from '@sanity-labs/sanity-plugin-resonance'
 *
 * export default defineConfig({
 *   // ...
 *   plugins: [
 *     resonance({
 *       apiUrl: 'https://resonance.cx',
 *       documents: ['post', 'article'],
 *     }),
 *   ],
 * })
 * ```
 *
 * @public
 */
export const resonance = definePlugin<ResonancePluginOptions>((options) => {
  validateOptions(options)
  const documents = resolveDocuments(options)
  const inspector = defineResonanceInspector(options, documents)

  return {
    name: 'resonance',
    document: {
      inspectors: (prev, context) => {
        if (!documents.has(context.documentType)) return prev
        if (prev.some((existing) => existing.name === inspector.name)) return prev
        return [...prev, inspector]
      },
    },
  }
})
