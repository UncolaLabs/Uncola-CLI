#!/bin/sh
# Installs the uncola CLI and adds the Uncola skill to your agents.
#   curl -fsSL https://uncola.ai/install.sh | bash
#   curl -fsSL https://uncola.ai/install.sh | bash -s -- --agent claude    the skill for this agent, without asking
#   curl -fsSL https://uncola.ai/install.sh | bash -s -- --no-skill     only the CLI
#   curl -fsSL https://uncola.ai/install.sh | bash -s -- --uninstall    remove the CLI, the skill, the PATH line and your sign-in
# Run it with --help for every option.
#
# The package comes from the default branch of github.com/UncolaLabs/Uncola-CLI (releases/uncola.tgz), so a new
# release doesn't need a new copy of this script.
#   UNCOLA_INSTALL_BASE  download releases/uncola.tgz from here instead (set by the bootstrap from UNCOLA_SOURCE)
#   GITHUB_TOKEN         sent to GitHub (and only GitHub) with the download, while the repository is private
#
# Everything runs inside main(), which is called on the last line, so a download cut short runs nothing.
# Works with sh, dash, bash and zsh. If the global npm folder isn't writable, it installs into ~/.local,
# so it never needs sudo.

installer_version=2026-11-07.2

main() {
  set -eu

  default_base=https://raw.githubusercontent.com/UncolaLabs/Uncola-CLI/HEAD
  base=${UNCOLA_INSTALL_BASE:-$default_base}
  marker="# Added by the uncola installer"
  all_agents="claude codex cursor kiro antigravity"
  action=install
  skill=yes
  login=ask
  agents=""
  package=""
  work=""
  reported=no
  installed=no

  while [ $# -gt 0 ]; do
    case $1 in
      --uninstall) action=uninstall ;;
      --no-skill) skill=no ;;
      --skill) skill=yes ;;
      --no-login) login=no ;;
      --package) [ $# -ge 2 ] || usage_error "--package needs a file"; package=$2; shift ;;
      --package=*) package=${1#--package=} ;;
      -h | --help) usage; exit 0 ;;
      --agent) [ $# -ge 2 ] || usage_error "--agent needs an agent name"; add_agent "$2"; shift ;;
      --agent=*) add_agent "${1#--agent=}" ;;
      claude | codex | cursor | kiro | antigravity) agents="$agents $1" ;; # the older way, still accepted
      *) usage_error "Unknown option: $1" ;;
    esac
    shift
  done

  trap on_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  [ -n "${HOME:-}" ] && [ -d "$HOME" ] || fail "HOME isn't set to your home folder, so there's nowhere to install."
  case $(uname -s) in
    Darwin | Linux) ;;
    MINGW* | MSYS* | CYGWIN*) fail "Windows isn't supported yet. Install WSL (https://aka.ms/wsl) and run this in its terminal." ;;
    *) say "This system ($(uname -s)) hasn't been tested with uncola; trying anyway." ;;
  esac
  if [ "$(id -u)" = 0 ] && [ -n "${SUDO_USER:-}" ]; then
    fail "Run the installer without sudo. It installs for your own user and never needs admin rights."
  fi

  if [ "$action" = install ] && [ -z "$package" ] && [ "$base" != "$default_base" ]; then confirm_source; fi

  work=$(mktemp -d 2>/dev/null || mktemp -d -t uncola)
  [ -d "$work" ] || fail "Couldn't create a temporary folder."

  if [ "$action" = uninstall ]; then
    uninstall
  else
    install
  fi
}

usage() {
  cat <<'EOF'
Installs the uncola CLI and adds the Uncola skill to your agents.

  curl -fsSL https://uncola.ai/install.sh | bash -s -- [options]

  --agent NAME      add the skill to this agent without asking; repeat it for more agents.
                    NAME is claude, codex, cursor, kiro or antigravity.
                    Without --agent, it asks about each agent it finds.
  --no-skill        install only the uncola command
  --no-login        don't offer to sign in
  --uninstall       remove the command, the skill, the PATH line this installer added and your sign-in
  --package FILE    install this uncola .tgz instead of downloading one
  -h, --help        show this help
EOF
}

# add_agent NAME: one agent name per --agent.
add_agent() {
  case $1 in
    claude | codex | cursor | kiro | antigravity) agents="$agents $1" ;;
    *) usage_error "Unknown agent: $1 (use one of: claude, codex, cursor, kiro, antigravity; repeat --agent for more)" ;;
  esac
}

usage_error() {
  printf '%s\n' "$1" "Usage: install.sh [--agent claude|codex|cursor|kiro|antigravity]... [--no-skill] [--no-login] [--uninstall] [--package FILE]" >&2
  exit 2
}

say() { printf '%s\n' "$*"; }

# Prints the reason, and exits without the generic message on_exit adds for unexpected failures.
fail() {
  printf '✗ %s\n' "$1" >&2
  shift
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  reported=yes
  exit 1
}

on_exit() {
  status=$?
  if [ -n "$work" ] && [ -d "$work" ]; then rm -rf -- "$work"; fi
  [ "$status" -eq 0 ] && return 0
  if [ "$status" -eq 130 ] || [ "$status" -eq 143 ]; then
    printf '\nCancelled.' >&2
  elif [ "$reported" = no ]; then
    printf '\n✗ The installer stopped unexpectedly (uncola installer %s).' "$installer_version" >&2
  else
    return 0
  fi
  if [ "$installed" = yes ]; then
    printf ' uncola is installed; run the installer again to finish setting it up.\n' >&2
  else
    printf ' Nothing was changed; you can run it again.\n' >&2
  fi
}

have() { command -v "$1" >/dev/null 2>&1; }

# A path for messages, with the home folder as ~.
tilde() {
  case $1 in
    "$HOME"/*) printf '%s/%s\n' '~' "${1#"$HOME"/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# The Antigravity desktop app reads ~/.gemini/antigravity/skills; its CLI (agy) reads the shared
# ~/.agents/skills, as Codex does.
antigravity_app() { [ -d "$HOME/.gemini/antigravity" ]; }
antigravity_cli() { [ -d "$HOME/.gemini/antigravity-cli" ] || have agy; }

# The skill folders for an agent, one per line.
skills_dirs() {
  case $1 in
    claude) printf '%s\n' "$HOME/.claude/skills" ;;
    codex) printf '%s\n' "$HOME/.agents/skills" ;;
    cursor) printf '%s\n' "$HOME/.cursor/skills" ;;
    kiro) printf '%s\n' "$HOME/.kiro/skills" ;;
    antigravity)
      if antigravity_app || ! antigravity_cli; then printf '%s\n' "$HOME/.gemini/antigravity/skills"; fi
      if antigravity_cli; then printf '%s\n' "$HOME/.agents/skills"; fi
      ;;
  esac
}

agent_name() {
  case $1 in
    claude) echo "Claude Code" ;;
    codex) echo "Codex" ;;
    cursor) echo "Cursor" ;;
    kiro) echo "Kiro" ;;
    antigravity) echo "Antigravity" ;;
  esac
}

found_on_this_computer() {
  case $1 in
    claude) [ -d "$HOME/.claude" ] ;;
    codex) [ -d "$HOME/.codex" ] || [ -d "$HOME/.agents" ] ;;
    cursor) [ -d "$HOME/.cursor" ] ;;
    kiro) [ -d "$HOME/.kiro" ] ;;
    antigravity) antigravity_app || antigravity_cli ;;
  esac
}

# The startup file new terminals of the user's shell read. For bash on macOS, an existing login file
# wins, because creating ~/.bash_profile would stop bash from reading ~/.profile.
shell_rc() {
  case ${SHELL:-} in
    */zsh) printf '%s\n' "${ZDOTDIR:-$HOME}/.zshrc" ;;
    */fish) printf '%s\n' "$HOME/.config/fish/conf.d/uncola.fish" ;;
    */bash)
      if [ "$(uname -s)" = Darwin ]; then
        for f in .bash_profile .bash_login .profile; do
          if [ -f "$HOME/$f" ]; then printf '%s\n' "$HOME/$f"; return; fi
        done
        printf '%s\n' "$HOME/.bash_profile"
      else
        printf '%s\n' "$HOME/.bashrc"
      fi
      ;;
    *) printf '%s\n' "$HOME/.profile" ;;
  esac
}

# Every startup file an earlier run may have changed.
all_rcs() {
  printf '%s\n' "${ZDOTDIR:-$HOME}/.zshrc" "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" \
    "$HOME/.bash_login" "$HOME/.profile" | awk '!seen[$0]++'
}

# get URL FILE [token]: one download, with retries, by curl or wget. The token never goes on a
# command line, where other users could see it with ps: curl reads it from stdin (printf is built
# into the shell), and wget from a config file only this user can read.
get() {
  if have curl; then
    if [ $# -ge 3 ]; then
      printf 'header = "Authorization: Bearer %s"\n' "$GITHUB_TOKEN" |
        curl -fsSL --retry 3 --connect-timeout 20 -K - -o "$2" "$1"
    else
      curl -fsSL --retry 3 --connect-timeout 20 -o "$2" "$1"
    fi
  else
    if [ $# -ge 3 ]; then
      (umask 077 && printf 'header = Authorization: Bearer %s\n' "$GITHUB_TOKEN" >"$work/wgetrc")
      ok=yes
      WGETRC="$work/wgetrc" wget -q --tries=3 --timeout=20 -O "$2" "$1" || ok=no
      rm -f -- "$work/wgetrc"
      [ "$ok" = yes ]
    else
      wget -q --tries=3 --timeout=20 -O "$2" "$1"
    fi
  fi
}

# download URL FILE: sends GITHUB_TOKEN to GitHub only. A wrong or expired token makes GitHub refuse
# even a public file, so it tries again without one.
download() {
  case $1 in
    https://raw.githubusercontent.com/* | https://github.com/*)
      if [ -n "${GITHUB_TOKEN:-}" ]; then
        get "$1" "$2" token 2>/dev/null && return 0
      fi
      ;;
  esac
  get "$1" "$2"
}

check_node() {
  if ! have node || ! have npm; then
    fail "uncola needs Node.js 22.12 or newer, and it isn't installed." \
      "Install the LTS version from https://nodejs.org, open a new terminal and run this again."
  fi
  if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=12)?0:1)' </dev/null >/dev/null 2>&1; then
    if [ -d "$HOME/.nvm" ]; then
      hint="With nvm: run nvm install 22, then run this again."
    elif [ "$(uname -s)" = Linux ]; then
      hint="Install the LTS version from https://nodejs.org (on Ubuntu and Debian, the nodejs package from apt is too old) and run this again."
    else
      hint="Install the LTS version from https://nodejs.org and run this again."
    fi
    fail "uncola needs Node.js 22.12 or newer; this computer has $(node -v 2>/dev/null || echo 'an older version')." "$hint"
  fi
}

# Sets tgz to the package to install: --package, an uncola.tgz next to this script (an unzipped
# release), or a download.
find_package() {
  if [ -n "$package" ]; then
    [ -f "$package" ] || fail "There's no file at $package."
    tgz=$package
    from=$package
  else
    tgz=""
    case $0 in
      install.sh | */install.sh)
        if [ -f "$0" ] && [ -f "$(dirname "$0")/uncola.tgz" ]; then
          tgz="$(dirname "$0")/uncola.tgz"
          from=$tgz
        fi
        ;;
    esac
  fi
  if [ -z "$tgz" ]; then
    have curl || have wget || fail "Neither curl nor wget is installed, so uncola can't be downloaded."
    tgz="$work/uncola.tgz"
    url="$base/releases/uncola.tgz"
    from=$url
    say "Downloading uncola…"
    if ! download "$url" "$tgz"; then
      case $url in
        https://raw.githubusercontent.com/*)
          if [ -z "${GITHUB_TOKEN:-}" ]; then
            fail "Couldn't download $url" \
              "Check your internet connection. While the GitHub repository is private, also set GITHUB_TOKEN" \
              "to a token that can read it, for example: export GITHUB_TOKEN=\$(gh auth token)"
          fi
          fail "Couldn't download $url" \
            "Check your internet connection, and that your GITHUB_TOKEN can read the UncolaLabs/Uncola-CLI repository."
          ;;
      esac
      fail "Couldn't download $url" "Check your internet connection and try again."
    fi
  fi

  # npm reads a relative path like dir/uncola.tgz as a GitHub user/repo, so give it an absolute one.
  case $tgz in
    /*) ;;
    *) tgz="$(cd "$(dirname "$tgz")" && pwd)/$(basename "$tgz")" ;;
  esac

  # A proxy or a wrong address can answer with a web page instead of the package.
  if ! tar -tzf "$tgz" 2>/dev/null | grep -qx 'package/package.json'; then
    fail "$from isn't an uncola package (the download may have been a web page or cut short)." "Try again in a minute."
  fi
  version=$(tar -xzOf "$tgz" package/package.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const p=JSON.parse(s);process.stdout.write(p.name==="uncola"?String(p.version):"")}catch{}})')
  [ -n "$version" ] || fail "$from isn't an uncola package."
}

install() {
  check_node
  find_package
  # Braces: macOS's bash 3.2 would read the "…" as part of the variable's name.
  say "Installing uncola ${version}…"

  # npm settings that would add noise or slow it down; the package has no dependencies to fetch.
  # The package ships built, so it never needs to run install scripts: --ignore-scripts means a
  # tampered download can't run code while it installs.
  export NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
  log="$work/npm.log"
  if npm install -g --ignore-scripts "$tgz" </dev/null >"$log" 2>&1; then
    bin="$(npm prefix -g </dev/null)/bin"
    pkg="$(npm root -g </dev/null)/uncola"
  elif grep -qE 'EACCES|EPERM' "$log"; then
    say "The global npm folder needs admin rights, so installing into ~/.local instead."
    if ! npm install -g --ignore-scripts --prefix "$HOME/.local" "$tgz" </dev/null >"$log" 2>&1; then
      tail -n 20 "$log" >&2
      fail "npm couldn't install uncola (its output is above)."
    fi
    bin="$HOME/.local/bin"
    pkg="$HOME/.local/lib/node_modules/uncola"
  else
    tail -n 20 "$log" >&2
    fail "npm couldn't install uncola (its output is above)."
  fi
  if [ ! -x "$bin/uncola" ] || ! now=$("$bin/uncola" --version </dev/null 2>/dev/null); then
    tail -n 20 "$log" >&2
    fail "npm finished, but $bin/uncola doesn't run."
  fi
  installed=yes
  say "✓ Installed uncola $now in $(tilde "$bin")"

  add_to_path

  if [ "$skill" = yes ]; then add_skills; fi

  sign_in

  echo
  if [ -n "$path_note" ]; then
    say "$path_note"
  fi
  if [ -n "$shadow" ]; then
    say "! Another uncola comes first on your PATH: $(tilde "$shadow")"
    say "  Remove it, or this one won't be the one that runs."
  fi
  if [ "$on_path" = no ]; then
    # This script can't change the terminal it runs in; the person can, with one line.
    case $bin in
      "$HOME"/*) shown="\$HOME/${bin#"$HOME"/}" ;;
      *) shown=$bin ;;
    esac
    say "To use uncola in this terminal, run:"
    case ${SHELL:-} in
      */fish) say "  set -gx PATH \"$shown\" \$PATH" ;;
      *) say "  export PATH=\"$shown:\$PATH\"" ;;
    esac
    say "or open a new terminal window. Then run: uncola --version"
  else
    say "Run: uncola --version"
  fi
  if [ "$signed_in" = yes ]; then
    say "You're signed in. Try: uncola"
  else
    say "Then sign in with: uncola login"
  fi
}

# A script can't change the PATH of the terminal that ran it, so it adds the folder to the shell's
# startup file, for new terminals.
add_to_path() {
  on_path=no
  path_note=""
  shadow=""
  case ":$PATH:" in *":$bin:"*) on_path=yes ;; esac
  if [ "$on_path" = yes ]; then
    found=$(command -v uncola 2>/dev/null || true)
    if [ -n "$found" ] && [ "$found" != "$bin/uncola" ]; then shadow=$found; fi
    return 0
  fi

  rc=$(shell_rc)
  case $rc in
    *.fish)
      line="contains -- \"$bin\" \$PATH; or set -gx PATH \"$bin\" \$PATH"
      if [ -f "$rc" ] && grep -qF "$line" "$rc"; then return 0; fi
      if mkdir -p "$(dirname "$rc")" 2>/dev/null && printf '%s\n%s\n' "$marker" "$line" 2>/dev/null >"$rc"; then
        say "✓ Added $(tilde "$bin") to your PATH in $(tilde "$rc")"
        return 0
      fi
      ;;
    *)
      line="export PATH=\"$bin:\$PATH\""
      if [ -f "$rc" ] && grep -qF "$line" "$rc"; then return 0; fi
      if printf '\n%s\n%s\n' "$marker" "$line" 2>/dev/null >>"$rc"; then
        say "✓ Added $(tilde "$bin") to your PATH in $(tilde "$rc")"
        return 0
      fi
      ;;
  esac
  path_note="! Couldn't change $(tilde "$rc"). To run uncola by name, add this line to your shell's startup file:
  $line"
}

# The skill, with its own copy of the CLI so agents can run it even where PATH lacks uncola. Each
# copy is built next to its final folder and then swapped in, so a failure never leaves half a skill.
# Agents named on the command line get the skill without a question; otherwise it asks about each
# agent it finds, and adds nothing when there's no keyboard to ask.
add_skills() {
  if [ -z "$agents" ]; then
    found=""
    for agent in $all_agents; do
      if found_on_this_computer "$agent"; then found="$found $agent"; fi
    done
    if [ -z "$found" ]; then
      say "No agents found (Claude Code, Codex, Cursor, Kiro, Antigravity), so no skill was added."
      say "  After you install one, run this again."
      return 0
    fi
    if ! has_keyboard; then
      say "Found$(agent_list "$found"). No skill was added, because there's no keyboard to ask you."
      flags=""
      for agent in $found; do flags="$flags --agent $agent"; done
      say "  To add it, name the agents: curl -fsSL https://uncola.ai/install.sh | bash -s --$flags"
      return 0
    fi
    say ""
    say "The Uncola skill lets an agent (Claude, OpenAI, etc.) run uncola for you when you ask in plain words."
    say "Press Enter for yes, or type n to skip."
    for agent in $found; do
      if ask_yes "Add the Uncola skill to $(agent_name "$agent")?"; then agents="$agents $agent"; fi
    done
    if [ -z "$agents" ]; then
      say "No skill was added. To add it later, run this again."
      return 0
    fi
  fi
  [ -f "$pkg/skill/uncola/SKILL.md" ] || fail "The package has no skill in it (uncola $version)."
  # Codex and the Antigravity CLI share a folder; it's copied once. Paths go one per line, so a home
  # folder with spaces in its name still works.
  : >"$work/done"
  for agent in $agents; do
    skills_dirs "$agent" >"$work/dirs"
    ok=yes
    while IFS= read -r dir; do
      if grep -qxF "$dir" "$work/done"; then continue; fi
      if copy_skill "$dir"; then
        printf '%s\n' "$dir" >>"$work/done"
      else
        ok=no
        say "! Couldn't add the Uncola skill to $(agent_name "$agent") in $(tilde "$dir/uncola"); check that you can write there."
      fi
    done <"$work/dirs"
    if [ "$ok" = yes ]; then say "✓ Added the Uncola skill to $(agent_name "$agent")"; fi
  done
  codex_sandbox_note
}

copy_skill() {
  new="$1/.uncola-new"
  if mkdir -p "$1" 2>/dev/null && rm -rf -- "$new" && mkdir -p "$new/scripts" &&
    cp -R "$pkg/skill/uncola/." "$new/" && cp -R "$pkg" "$new/scripts/uncola" &&
    rm -rf -- "$1/uncola" && mv "$new" "$1/uncola"; then
    return 0
  fi
  rm -rf -- "$new" 2>/dev/null || true
  return 1
}

# Ubuntu 24.04 blocks the user namespaces Codex's sandbox needs, so in Codex every command fails,
# and Codex tends to blame the tool.
codex_sandbox_note() {
  case " $agents " in *" codex "*) ;; *) return 0 ;; esac
  [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ] || return 0
  say "! Codex's sandbox can't run commands on this computer, because it blocks the user namespaces"
  say "  the sandbox needs. If Codex says it can't run uncola, start it with: codex --sandbox danger-full-access"
}

# True when there's a keyboard to ask, even if this script itself arrived through a pipe.
has_keyboard() {
  [ -z "${CI:-}" ] && (exec </dev/tty) 2>/dev/null
}

# Enter means yes. A typo asks again, so it can't count as an answer either way.
ask_yes() {
  while :; do
    printf '%s [Y/n] ' "$1"
    read -r answer </dev/tty || return 1
    case $answer in
      "" | [Yy] | [Yy][Ee][Ss]) return 0 ;;
      [Nn] | [Nn][Oo]) return 1 ;;
      *) say "Please type y or n." ;;
    esac
  done
}

# Installing from anywhere but the official repository is for testing: say so, and where there's a keyboard
# stop unless the answer is y. Without one (CI, scripts) setting the source was deliberate, so it goes on.
confirm_source() {
  say "WARNING: Installing from $base"
  say "WARNING: This is not the official Uncola release and may be unfinished or unstable."
  has_keyboard || return 0
  printf 'Continue? [y/N] '
  read -r answer </dev/tty || answer=n
  case $answer in
    [Yy] | [Yy][Ee][Ss]) ;;
    *) reported=yes; say "Cancelled. Nothing was installed."; exit 1 ;;
  esac
}

can_ask() {
  [ "$login" != no ] && has_keyboard
}

# " claude kiro" → ": Claude Code, Kiro"
agent_list() {
  sep=":"
  out=""
  for a in $1; do out="$out$sep $(agent_name "$a")"; sep=","; done
  printf '%s' "$out"
}

# Signs in with the full path, so this terminal doesn't need the new PATH first.
sign_in() {
  signed_in=no
  if "$bin/uncola" status --json </dev/null >/dev/null 2>&1; then
    signed_in=yes
  elif can_ask; then
    say ""
    if ask_yes "Sign in to Uncola now?"; then
      if "$bin/uncola" login </dev/tty; then signed_in=yes; fi
    fi
  fi
}

# Ends the session on the server while the command is still here, so the sign-in stops working
# everywhere, not only on this computer. Offline or not, remove_sign_in then deletes it locally.
sign_out() {
  cli=$(command -v uncola 2>/dev/null || true)
  [ -n "$cli" ] || cli="$HOME/.local/bin/uncola"
  [ -x "$cli" ] || return 0
  for env in prod dev; do
    "$cli" logout --env "$env" </dev/null >/dev/null 2>&1 || true
  done
}

# Deletes only the files uncola writes, because UNCOLA_CONFIG_DIR can point at a folder shared with
# other things. Uses the same folder as the CLI's configDir().
remove_sign_in() {
  config=${UNCOLA_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/uncola}
  [ -d "$config" ] || return 0
  rm -f -- "$config"/credentials.json "$config"/credentials.json.*.tmp "$config"/history "$config"/last-list-*.json
  rmdir -- "$config" 2>/dev/null || true
  if [ -e "$config/credentials.json" ]; then
    say "! Couldn't delete your sign-in; remove $(tilde "$config/credentials.json") yourself."
  else
    say "✓ Removed your sign-in and history from $(tilde "$config")"
  fi
}

uninstall() {
  sign_out

  if have npm; then
    export NPM_CONFIG_UPDATE_NOTIFIER=false
    if npm ls -g --depth=0 uncola </dev/null >/dev/null 2>&1; then
      if npm uninstall -g uncola </dev/null >/dev/null 2>&1; then
        say "✓ Removed the uncola command"
      else
        say "! npm couldn't remove uncola from $(npm prefix -g </dev/null); try: npm uninstall -g uncola"
      fi
    fi
    if [ -d "$HOME/.local/lib/node_modules/uncola" ]; then
      if npm uninstall -g --prefix "$HOME/.local" uncola </dev/null >/dev/null 2>&1; then
        say "✓ Removed the uncola command from ~/.local"
      else
        say "! npm couldn't remove uncola from ~/.local"
      fi
    fi
  elif [ -d "$HOME/.local/lib/node_modules/uncola" ]; then
    rm -rf -- "$HOME/.local/lib/node_modules/uncola" "$HOME/.local/bin/uncola"
    say "✓ Removed the uncola command from ~/.local"
  fi

  for pair in ".claude/skills:Claude Code" ".agents/skills:Codex and Antigravity CLI" ".cursor/skills:Cursor" ".kiro/skills:Kiro" \
    ".gemini/antigravity/skills:Antigravity"; do
    dir="$HOME/${pair%%:*}"
    if [ -d "$dir/uncola" ] || [ -d "$dir/.uncola-new" ]; then
      rm -rf -- "$dir/uncola" "$dir/.uncola-new" && say "✓ Removed the ${pair#*:} skill"
    fi
  done

  fish="$HOME/.config/fish/conf.d/uncola.fish"
  if [ -f "$fish" ] && grep -qF "$marker" "$fish"; then
    rm -f -- "$fish" && say "✓ Removed the PATH line from $(tilde "$fish")"
  fi
  all_rcs | while IFS= read -r rc; do
    if [ ! -f "$rc" ] || ! grep -qF "$marker" "$rc"; then continue; fi
    # Drops the marker, the PATH line after it and the blank line before it. Writing through cat
    # keeps the file's owner, mode and any symlink.
    awk -v m="$marker" '
      $0 == m { blank = 0; skip = 1; next }
      skip { skip = 0; if (index($0, "export PATH=") == 1) next }
      blank { print ""; blank = 0 }
      $0 == "" { blank = 1; next }
      { print }
      END { if (blank) print "" }
    ' "$rc" >"$work/rc"
    if cat "$work/rc" 2>/dev/null >"$rc"; then
      say "✓ Removed the PATH line from $(tilde "$rc")"
    else
      say "! Couldn't change $(tilde "$rc"); remove the lines after \"$marker\" yourself."
    fi
  done

  remove_sign_in
}

main "$@"
