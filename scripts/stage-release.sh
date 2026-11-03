#!/usr/bin/env sh
# Stage every package version that is not on npm yet. Staged versions go live only
# after a maintainer approves them with 2FA (`npm stage approve <stage-id>`).
# Extra arguments are passed to `npm stage publish` (e.g. --provenance, --dry-run).
set -eu

out="${RUNNER_TEMP:-$(mktemp -d)}/stage-release"

for dir in packages/*/; do
  if [ "$(node -p "require('./${dir}package.json').private === true")" = "true" ]; then
    echo "skipping private package in ${dir}"
    continue
  fi

  name=$(node -p "require('./${dir}package.json').name")
  version=$(node -p "require('./${dir}package.json').version")

  if npm view "${name}@${version}" version > /dev/null 2>&1; then
    echo "${name}@${version} is already published, skipping"
    continue
  fi

  dest="${out}/$(basename "$dir")"
  mkdir -p "$dest"
  # pnpm pack rewrites workspace:* dependencies to the real versions
  (cd "$dir" && pnpm pack --pack-destination "$dest" > /dev/null)
  npm stage publish "$dest"/*.tgz --access public "$@"
done
