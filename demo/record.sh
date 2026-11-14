#!/usr/bin/env bash
# Records the demo clips to GIFs and MP4s in demo/, undoing their changes after each.
# Usage: demo/record.sh [cli] [repl] [claude] [kiro]   (default: cli and repl)
# The agent clips (claude, kiro) need that agent signed in, the skill installed (skill/install.sh)
# and pyte for demo/agent-chat.py (AGENT_CHAT_PYTHON may point at a venv's python that has it).
# Needs asciinema 3 and agg on PATH (single-file downloads from github.com/asciinema), ffmpeg, python3, and `uncola login` first.
# Seed the account first with demo/seed.sh. The demos write to it: they log entries, share one and
# change goals' progress. After each clip the new entries are deleted and every goal's progress is put back.
set -euo pipefail
cd "$(dirname "$0")/.."

# Record with a copy of the credentials whose email is a placeholder, so the shell banner
# doesn't show the real one. The copy also keeps demo commands out of your shell history.
real_dir=${UNCOLA_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/uncola}
demo_dir=$(mktemp -d)
node -e '
  const fs = require("fs");
  const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const s of Object.values(c.environments ?? {})) s.email = "you@example.com";
  fs.writeFileSync(process.argv[2], JSON.stringify(c), { mode: 0o600 });
' "$real_dir/credentials.json" "$demo_dir/credentials.json"
export UNCOLA_CONFIG_DIR=$demo_dir

# "<itemId> <progress>" for every goal, to put back after each clip.
goal_progress() {
  uncola goal list --json | node -p 'JSON.parse(require("fs").readFileSync(0)).map(g => `${g.itemId} ${g.progress ?? 0}`).join("\n")'
}
progress_before=$(goal_progress)
item_ids() { uncola list --limit 50 --json | node -p 'JSON.parse(require("fs").readFileSync(0)).map(i => i.itemId).join(" ")'; }
ids_before=" $(item_ids) "
undo_demo() {
  # An agent picks its own titles, so delete every entry the demo added (with its shared version).
  for id in $(item_ids); do
    [[ $ids_before == *" $id "* ]] || uncola rm "$id" --yes
  done
  while read -r id percent; do
    uncola goal progress "$id" "$percent" >/dev/null
  done <<<"$progress_before"
}
cleanup() {
  undo_demo
  rm -rf "$demo_dir"
}
trap cleanup EXIT
trap 'exit 1' INT TERM

# Each demo logs the same activity, so undo it between recordings.
names=("$@")
((${#names[@]})) || names=(cli repl)
for n in "${names[@]}"; do
  # The shell opens on the dashboard, which needs more rows.
  rows=32; [[ $n == repl ]] && rows=44
  script="demo/$n.sh"
  if [[ $n == claude || $n == kiro ]]; then rows=44; script="demo/agent.sh $n"; fi
  asciinema rec --overwrite --headless --window-size "112x$rows" --idle-time-limit 3 -q -c "$script" "demo/$n.cast"
  # agg's font has no non-breaking space (agents print them), so make them plain spaces.
  sed -i 's/\xc2\xa0/ /g; s/\\u00a0/ /g' "demo/$n.cast"
  agg -q --font-size 18 --theme monokai "demo/$n.cast" "demo/$n.gif"
  ffmpeg -v error -y -i "demo/$n.gif" -movflags faststart -pix_fmt yuv420p -vf 'scale=trunc(iw/2)*2:trunc(ih/2)*2' "demo/$n.mp4"
  echo "wrote demo/$n.gif"
  undo_demo
done
