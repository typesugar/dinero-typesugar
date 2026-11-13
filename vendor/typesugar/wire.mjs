// Point package.json at the tarballs in vendor/typesugar: `typesugar` and
// `unplugin-typesugar` as devDependencies, and an npm override for every
// packed package, so transitive @typesugar/* dependencies resolve to these
// files and never to the npm registry.
//
//   node vendor/typesugar/wire.mjs package.json vendor/typesugar
import fs from 'node:fs';
import path from 'node:path';

const [manifest, dir] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
const rel = path.relative(path.dirname(manifest), dir);

const tarballs = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.tgz'))) {
  // typesugar-core-0.1.1-02479fc3.tgz -> @typesugar/core
  const base = f.replace(/-\d+\.\d+\.\d+[^-]*-[0-9a-f]{8}\.tgz$/, '');
  const name =
    base === 'typesugar' || base === 'unplugin-typesugar'
      ? base
      : `@typesugar/${base.replace(/^typesugar-/, '')}`;
  tarballs[name] = `file:${rel}/${f}`;
}

pkg.devDependencies = { ...pkg.devDependencies };
for (const name of ['typesugar', 'unplugin-typesugar']) {
  if (!tarballs[name]) throw new Error(`no tarball for ${name} in ${dir}`);
  pkg.devDependencies[name] = tarballs[name];
}
pkg.devDependencies = Object.fromEntries(
  Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b))
);
// npm requires an override for a direct dependency to match its spec exactly,
// so the override for those two is "$name" (use the root's own spec).
pkg.overrides = {
  ...pkg.overrides,
  ...Object.fromEntries(
    Object.entries(tarballs).map(([n, spec]) => [
      n,
      n in pkg.devDependencies ? `$${n}` : spec,
    ])
  ),
};
fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2) + '\n');
console.error(
  `wired ${Object.keys(tarballs).length} tarballs into ${manifest}`
);
