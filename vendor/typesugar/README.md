# Vendored typesugar

The case study consumes typesugar as packed tarballs, the same files
`npm publish` would upload, so a stage can be reproduced without a local
typesugar checkout or `npm link`.

- Which commit: see [`COMMIT`](./COMMIT) (commit, branch, pack date, Node version
  and the SHA-256 of every tarball).
- Wiring: the root `package.json` lists `typesugar` and `unplugin-typesugar` as
  devDependencies (`file:vendor/typesugar/*.tgz`), and its `overrides` point
  every packed `@typesugar/*` package at its tarball, so transitive
  dependencies resolve to these files and never to the npm registry. Unlike
  pnpm in the Turf study (its finding F3), npm 11 kept every existing
  resolution when the root manifest changed: the lockfile diff against v2.0.2
  only adds packages (57 entries; none removed or changed).
- `packages/dinero.js/tsdown.config.ts` and `vitest.config.ts` import the plugin
  (`unplugin-typesugar/rolldown` and `/vite`).

## Regenerate

From a clean typesugar checkout (or worktree) at the commit you want:

```sh
vendor/typesugar/pack.sh /path/to/typesugar
npx -y npm@11.11.0 install --ignore-scripts
```

`pack.sh` runs `pnpm install --frozen-lockfile` in the typesugar checkout,
builds the packages listed in it (two at a time), runs `pnpm pack` for each
into this directory, rewrites `COMMIT`, and runs `wire.mjs`, which points the
root `package.json` at the new tarballs. Tarball names carry the first 8
characters of the commit (`typesugar-core-0.1.1-2da17ee3.tgz`), so a repack
never reuses a name whose integrity hash is already in `package-lock.json`
(the Turf study's finding F4).

Packed set: `typesugar`, `unplugin-typesugar` and `@typesugar/{core, macros,
transformer, transformer-core, lsp-common, reflect, derive, typeclass,
type-system, std, fp, contracts}`: the two direct dependencies and their
workspace dependencies.
