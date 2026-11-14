#!/usr/bin/env bash
# The CLI demo: types each command at a human pace, then runs it for real.
# Record it with demo/record.sh rather than running this directly.
set -u
. "$(dirname "$0")/typing.sh"

clear
run 'uncola goal list' 4
run 'uncola log act "Published draft: data analytics pipeline blog post" --goal blog --time 3h' 3
run 'uncola goal progress blog 60' 2.5
clear
run 'uncola log win "Earned the Professional Cloud Architect certification" --desc "Passed the professional-level exam" --skills "Cloud architecture"' 3
run 'uncola goal progress certification 100' 2.5
clear
run 'uncola recap' 5
clear
run 'uncola brag "Earned the Professional Cloud Architect" --yes' 7
