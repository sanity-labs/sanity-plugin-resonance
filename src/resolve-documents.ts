import type {SanityDocument} from 'sanity'

import type {
  ResonanceCompareMode,
  ResonanceDocumentConfig,
  ResonanceDocumentContext,
  ResonancePluginOptions,
  ResonanceQuestion,
  SerializedContent,
} from './options'
import {defaultSerialize} from './serialize/default-serializer'

/**
 * One document type's settings after per-type values, plugin defaults, and built-ins have been
 * merged. Everything the request composer needs, with nothing left optional except the
 * genuinely absent framing values.
 */
export interface ResolvedDocumentConfig {
  type: string
  channel: string | null
  url: ((ctx: ResonanceDocumentContext) => string | null) | null
  source: string | null
  serialize: (
    document: Partial<SanityDocument>,
    ctx: ResonanceDocumentContext,
  ) => SerializedContent | null
  compare: ResonanceCompareMode | ((ctx: ResonanceDocumentContext) => string | null)
  question: ResonanceQuestion | null
  audiences: string[] | null
}

function normalize(entry: string | ResonanceDocumentConfig): ResonanceDocumentConfig {
  return typeof entry === 'string' ? {type: entry} : entry
}

/**
 * Merges each `documents` entry with `defaults` and the built-ins. Called once when the plugin is
 * defined; the inspector looks its type up in the result.
 */
export function resolveDocuments(
  options: Pick<ResonancePluginOptions, 'documents' | 'defaults'>,
): ReadonlyMap<string, ResolvedDocumentConfig> {
  const defaults = options.defaults ?? {}
  const resolved = new Map<string, ResolvedDocumentConfig>()

  for (const entry of options.documents) {
    const config = normalize(entry)
    resolved.set(config.type, {
      type: config.type,
      channel: config.channel ?? null,
      url: config.url ?? null,
      source: config.source ?? defaults.source ?? null,
      serialize: config.serialize ?? defaultSerialize,
      compare: config.compare ?? defaults.compare ?? 'published',
      question: config.question ?? defaults.question ?? null,
      audiences: config.audiences ?? defaults.audiences ?? null,
    })
  }

  return resolved
}
