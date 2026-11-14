#!/usr/bin/env bash
# The interactive shell demo: starts `uncola` and types the same story into it.
# Record it with demo/record.sh rather than running this directly.
set -u
. "$(dirname "$0")/typing.sh"

clear
say 'uncola'
python3 "$(dirname "$0")/type-into.py" 'uncola> ' \
  'log act Published draft: data analytics pipeline blog post --goal blog --time 3h' \
  'goal progress blog 60' \
  'log win Earned the Professional Cloud Architect certification --desc "Passed the professional-level exam" --skills "Cloud architecture"' \
  'goal progress certification 100' \
  'clear' \
  'goal list' \
  'clear' \
  'recap' \
  -- uncola
sleep 1
