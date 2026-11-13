#!/usr/bin/env bash
# Regenerate vendor/typesugar/*.tgz from a typesugar checkout.
#
#   vendor/typesugar/pack.sh /path/to/typesugar
#
# Checks out nothing itself: pass a clean checkout (or worktree) at the commit
# you want. Builds the packages dinero needs, packs them with `pnpm pack` (which
# rewrites workspace:* to real versions, as `npm publish` would), records the
# commit in vendor/typesugar/COMMIT and points the root package.json at the new
# tarballs. Then run `npm install` here.
set -euo pipefail

TS_REPO="${1:?usage: pack.sh /path/to/typesugar}"
OUT="$(cd "$(dirname "$0")" && pwd)"
DINERO="$(cd "$OUT/../.." && pwd)"

# typesugar and unplugin-typesugar, plus their workspace dependencies.
PACKAGES=(
  typesugar unplugin-typesugar core macros transformer transformer-core
  lsp-common reflect derive typeclass type-system std fp contracts
)

cd "$TS_REPO"
if [ -n "$(git status --porcelain)" ]; then
  echo "error: $TS_REPO has uncommitted changes; pack from a clean commit" >&2
  exit 1
fi
COMMIT="$(git rev-parse HEAD)"

pnpm install --frozen-lockfile
filters=()
for p in "${PACKAGES[@]}"; do filters+=(--filter "./packages/$p"); done
# Two builds at a time by default: one transformer dts build peaks around
# 1.8 GB RSS. PACK_CONCURRENCY=1 keeps the whole build under ~2 GB.
pnpm -r --workspace-concurrency="${PACK_CONCURRENCY:-2}" "${filters[@]}" build

# Tarball names carry the commit (typesugar-core-0.1.1-<sha>.tgz), so a repack
# never reuses a name whose integrity hash is already in package-lock.json.
SHORT="${COMMIT:0:8}"
rm -f "$OUT"/*.tgz
for p in "${PACKAGES[@]}"; do
  tgz="$(cd "packages/$p" && pnpm pack --pack-destination "$OUT" | tail -1)"
  mv "$tgz" "${tgz%.tgz}-$SHORT.tgz"
done

{
  echo "commit: $COMMIT"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  # Strip any credentials in the URL (https://user:token@host/...).
  echo "remote: $(git remote get-url origin | sed -E 's#^git@[^:]+:#https://github.com/#; s#://[^/@]*@#://#; s#\.git$##')"
  echo "packed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "node:   $(node --version)"
  echo "files:"
  (cd "$OUT" && shasum -a 256 *.tgz | sed 's/^/  /')
} > "$OUT/COMMIT"

# Point the root devDependencies and overrides at the new names.
node "$OUT/wire.mjs" "$DINERO/package.json" "$OUT"

echo "packed ${#PACKAGES[@]} packages from $COMMIT into $OUT"
echo "now run: npm install --ignore-scripts"
