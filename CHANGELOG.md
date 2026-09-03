# @sanity-labs/sanity-plugin-resonance

## 0.2.0

### Minor Changes

- 3eab5f7: Tightens the configuration surface before anyone depends on it.

  - `accountUid` is required and the account picker is gone. The Studio owner fixes the account; the panel confirms the editor is granted it and shows "You're not in Resonance yet" otherwise.
  - `apiUrl` is optional and defaults to `https://resonance.cx`.
  - `serialize` and `url` can be set in `defaults` for every type; per-type values still override.
  - `compare` is `'published' | 'none'` and `question` is a string. The function forms and `defaults.audiences` are gone.
  - `requestAccess` is gone; the not-granted state tells editors to ask their admin.
  - The panel no longer offers Sign out buttons (they logged the whole Studio out, cookie session included). The no-token state explains the cookie case and points Studio owners at `auth.loginMethod: 'token'`.
  - The default serializer reads the words out of custom blocks (labels, text, nested cards and tabs), renders nested code as fences and rows of cells as tables, accepts `href` or `url` on links, and skips links, ids and presentation fields. Most hosts should no longer need a custom serializer.
  - `localStorage` keys are namespaced by Resonance host so two deployments never share results.
  - Public exports are down to the plugin, `defineResonanceDocument`, `defaultSerialize` and the option types.

  Hosts on 0.1 must add `accountUid` and drop `requestAccess`, function-valued `compare`/`question`, and `defaults.audiences`; the plugin throws at Studio startup for each.
