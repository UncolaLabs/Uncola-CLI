# Shared by the demo scripts: `say` types a command at a human pace, `run` also runs it.
say() {
  printf '\033[1;32m$\033[0m '
  local s=$1 i
  for ((i = 0; i < ${#s}; i++)); do printf '%s' "${s:i:1}"; sleep 0.035; done
  sleep 0.5
  printf '\n'
}
run() { say "$1"; eval "$1"; sleep "${2:-2.5}"; printf '\n'; }
