---
"@sanity-labs/sanity-plugin-resonance": minor
---

`accountUid` is now required and the account picker is gone. The Studio owner fixes the Resonance account in config; the panel confirms the signed-in editor is granted it and shows "You're not in Resonance yet" when not, instead of a 403 on the first run. Editors granted several accounts are no longer asked to choose, and nothing about the account is remembered in the browser. Hosts on 0.1 that relied on discovery must add `accountUid`; the plugin throws at Studio startup without it.
