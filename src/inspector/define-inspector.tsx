import {defineDocumentInspector, type DocumentInspector, type DocumentInspectorProps} from 'sanity'

import type {ResolvedPluginOptions} from '../options'
import type {ResolvedDocumentConfig} from '../resolve-documents'
import {ResonanceIcon} from './ResonanceIcon'
import {ResonanceInspector} from './ResonanceInspector'

export const RESONANCE_INSPECTOR_NAME = 'resonance'

/** Binds the host's options to the inspector component; the Studio only passes document props. */
export function defineResonanceInspector(
  options: ResolvedPluginOptions,
  documents: ReadonlyMap<string, ResolvedDocumentConfig>,
): DocumentInspector {
  const title = options.title ?? 'Resonance'

  function ConfiguredResonanceInspector(props: DocumentInspectorProps) {
    const config = documents.get(props.documentType)
    if (!config) return null
    return <ResonanceInspector {...props} config={config} options={options} />
  }

  return defineDocumentInspector({
    name: RESONANCE_INSPECTOR_NAME,
    component: ConfiguredResonanceInspector,
    useMenuItem: () => ({title, icon: ResonanceIcon, showAsAction: true}),
  })
}
