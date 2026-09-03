# Development

Building the plugin, trying it in a Studio with hot reload, and the toolchain quirks worth
knowing before you hit them.

## Toolchain

The repo is a [@sanity/plugin-kit](https://github.com/sanity-io/plugins/tree/main/packages/@sanity/plugin-kit)
scaffold: `@sanity/pkg-utils` builds, oxlint lints, oxfmt formats, vitest tests. pnpm only.

```sh
pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm build
```

All five must be clean before a change is done. `pnpm build` runs `plugin-kit verify-package`
first and then `pkg-utils build --strict --check`, which is strict about exports: everything
exported from `src/index.ts` carries a TSDoc `@public` tag.

## Layout

```
src/
  plugin.ts                    definePlugin: registers the inspector for configured types
  options.ts                   public option types and validation
  define-document.ts           defineResonanceDocument (identity helper)
  resolve-documents.ts         per-type effective config (per-type > defaults > built-ins)
  serialize/default-serializer.ts   schema-driven document → markdown
  audience-tests/
    compose.ts                 pure: serialize, compare, framing, prompt, key parts
    use-audience-test.ts       submit + poll state machine
    audiences.ts               list the account's audiences
    idempotency.ts             SHA-256 key and content hash
    *-storage.ts               what is remembered in localStorage
  transport/
    resonance-fetch.ts         the only code that talks to Resonance
    use-access.ts              token → org → account, folded into one state
  inspector/
    ResonanceInspector.tsx     panel shell; access state or run view
    RunView.tsx                wires context, composition, running, restoring
    RunCard.tsx                the card, the options, the run button
    AccessState.tsx            every not-ready state
    AudienceTestResults.tsx    scores and audience cards
```

`compose.ts` and `default-serializer.ts` are pure and carry most of the tests. If you change what
is sent or how the prompt reads, change them and their tests together.

## Trying it in a Studio

`link-watch` rebuilds on save and pushes `dist/` into a Studio with
[yalc](https://github.com/wclr/yalc):

```sh
# in this repo
pnpm run link-watch

# in the Studio
npx yalc add --link @sanity-labs/sanity-plugin-resonance
pnpm install        # or npm/yarn; creates the node_modules symlink
```

Then configure the plugin in the Studio's `sanity.config.ts` and run `sanity dev`. Point
`apiUrl` at the Resonance you want to talk to (see [auth.md](auth.md)). Undo with
`npx yalc remove @sanity-labs/sanity-plugin-resonance` and a reinstall; never commit the
`link:` line yalc writes into the Studio's `package.json`.

Two things to know:

- **Use yalc, not a symlink to this repo.** The Studio dev server dedupes only `react`,
  `react-dom`, `sanity` and `styled-components`. A symlink to the source directory makes Vite
  resolve `@sanity/ui` from this repo's `node_modules`, and two copies of `@sanity/ui` break the
  theme context. yalc copies only `dist/` and `package.json`, so every import resolves from the
  Studio.
- **`link-watch` needs `yalc` on `PATH`.** pnpm does not expose plugin-kit's transitive binaries.
  If you see `sh: yalc: command not found`, put a shim on `PATH` that runs the `yalc/src/yalc.js`
  from the pnpm store, or `pnpm add -D yalc`.

## Quirks

- The scaffold ships `"jsx": "preserve"` in `tsconfig.settings.json` and `verify-package` insists
  on it, but with that setting pkg-utils writes raw JSX into `dist/`, which no consumer can load.
  This repo uses `"jsx": "react-jsx"` and disables that single check with
  `sanityPlugin.verifyPackage.tsconfig: false` in `package.json`. Published Sanity plugins
  compile JSX the same way.
- The lint config forbids `forwardRef` (React 19: `ref` is a prop) and flags `setState` inside
  effects; derive state during render keyed on an input, or use the existing patterns in
  `transport/`.
- `@portabletext/markdown` is a runtime dependency with the range `^1.5.0 || ^2.0.0`; the API the
  plugin uses is identical across both majors, and a wide range lets a Studio that already has
  1.x share one copy.
- The audience picker lists audiences from the same place the audience-test endpoint reads them
  (`audiences.ts`), so what the picker shows is always what a run can use.

## Releasing

Not yet. The package is pre-alpha and unpublished; the README says so at the top. When it is
time: `pnpm build` is run by `prepublishOnly`, `files` is `dist` only, and the peer range is
`sanity ^5.30.0 || ^6.0.0-0`.
