#!/bin/sh
# The copy hosted at https://uncola.ai/install.sh. It downloads the real installer (install.sh on the
# default branch of github.com/UncolaLabs/Uncola-CLI) and runs it with the same options, so this file only needs
# uploading once: installer changes ship with a push to the repository.
#   curl -fsSL https://uncola.ai/install.sh | bash
#   curl -fsSL https://uncola.ai/install.sh | bash -s -- --help
#
#   UNCOLA_SOURCE  for testing: take the installer and the package from this raw address instead,
#                  for example https://raw.githubusercontent.com/OWNER/REPO/BRANCH
#   GITHUB_TOKEN   sent to GitHub (and only GitHub), while the repository is private
#
# Everything runs inside main(), which is called on the last line, so a download cut short runs nothing.
# It sticks to plain POSIX sh (no set -u), so the bash 3.2 that ships with macOS runs it as-is.

main() {
  set -e
  base=${UNCOLA_SOURCE:-https://raw.githubusercontent.com/UncolaLabs/Uncola-CLI/HEAD}
  base=${base%/}
  url=$base/install.sh
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT

  if ! fetch "$url" "$tmp"; then
    echo "Couldn't download the uncola installer from $url" >&2
    case $url in
      https://raw.githubusercontent.com/*)
        echo "Check your internet connection. While the GitHub repository is private, also set GITHUB_TOKEN" >&2
        echo "to a token that can read it, for example: export GITHUB_TOKEN=\$(gh auth token)" >&2
        ;;
    esac
    exit 1
  fi

  # The installer has always run under bash (curl ... | bash), so keep it that way when bash exists.
  if command -v bash >/dev/null 2>&1; then
    UNCOLA_INSTALL_BASE=$base bash "$tmp" "$@"
  else
    UNCOLA_INSTALL_BASE=$base sh "$tmp" "$@"
  fi
}

# fetch URL FILE: sends GITHUB_TOKEN to GitHub only, through curl's config on stdin so it never shows
# in the process list. A wrong or expired token makes GitHub refuse even a public file, so it then
# tries again without one.
fetch() {
  case $1 in
    https://raw.githubusercontent.com/* | https://github.com/*)
      if [ -n "${GITHUB_TOKEN:-}" ]; then
        printf 'header = "Authorization: Bearer %s"\n' "$GITHUB_TOKEN" |
          curl -fsSL --retry 3 --connect-timeout 20 -K - -o "$2" "$1" 2>/dev/null && return 0
      fi
      ;;
  esac
  curl -fsSL --retry 3 --connect-timeout 20 -o "$2" "$1"
}

main "$@"
