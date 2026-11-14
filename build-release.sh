#!/bin/sh
# Builds release/uncola-<version>.zip:
#   uncola/README.md              how to install and use
#   uncola/install.sh             installs the package and adds the skill to your coding agents
#   uncola/uncola.tgz             the npm package (commander bundled, so no registry needed)
#   uncola/demo/                  the clips from the README
#   uncola/source/                the source, tests and demo scripts
# and releases/uncola.tgz, the package `curl … install.sh | bash` downloads (commit it with the release).
set -eu
cd "$(dirname "$0")"

version=$(node -p "require('./package.json').version")
npm run typecheck >/dev/null
npm test >/dev/null
# The end-to-end test against dev, with your login. UNCOLA_SKIP_LIVE=1 skips it (e.g. offline).
if [ -z "${UNCOLA_SKIP_LIVE:-}" ]; then
  npm run test:live >/dev/null 2>&1 || { echo "✗ The live test failed; run npm run test:live to see why. Not releasing." >&2; exit 1; }
fi

build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
out="$build/uncola"
mkdir -p "$out/demo" "$out/source/demo"

npm pack --silent --pack-destination "$out" >/dev/null
# Named without the version, so install.sh never picks up an older package left next to it.
mv "$out/uncola-$version.tgz" "$out/uncola.tgz"
tgz="$out/uncola.tgz"

# The package carries the skill; install.sh copies it, with the CLI inside, into each agent.
if ! tar -tzf "$tgz" | grep -q '^package/skill/uncola/SKILL.md$'; then
  echo "✗ The package is missing skill/uncola/SKILL.md." >&2
  exit 1
fi

cp README.md install.sh "$out/"
cp demo/*.gif demo/*.mp4 "$out/demo/"
cp -R src test skill install.sh vitest.live.config.ts package.json package-lock.json tsconfig.json tsconfig.build.json .gitignore README.md build-release.sh "$out/source/"
cp demo/*.sh demo/*.py "$out/source/demo/"

# Nothing that looks like a token may ship.
if grep -rIlE 'eyJ[A-Za-z0-9_-]{20,}\.|"(id|access|refresh)Token" *: *"[^"]{20,}' "$out"; then
  echo "✗ Possible token in the files above; not releasing." >&2
  exit 1
fi

mkdir -p release releases
cp "$tgz" releases/uncola.tgz
rm -f "release/uncola-$version.zip"
(cd "$build" && zip -qr - uncola) > "release/uncola-$version.zip"
echo "✓ release/uncola-$version.zip ($(du -k "release/uncola-$version.zip" | cut -f1) KB)"
