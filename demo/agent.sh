#!/usr/bin/env bash
# The agent demo: opens Claude Code or Kiro with the uncola skill installed and chats with it.
# Usage: demo/agent.sh claude|kiro   (record it with demo/record.sh claude|kiro)
# Runs in ~/demo so the agent's header shows a plain folder, and pre-approves the commands the skill
# runs, so the clip isn't mostly permission prompts.
set -u
here=$(cd "$(dirname "$0")" && pwd)
python=${AGENT_CHAT_PYTHON:-python3}
# When recorded from inside another agent session, don't let its variables leak into this one.
unset $(compgen -e | grep -E '^(CLAUDE|AI_AGENT)') 2>/dev/null
mkdir -p "$HOME/demo"
cd "$HOME/demo"

case $1 in
  claude)
    busy='esc to interrupt'
    ready='❯'
    # No suggested next prompt: it draws on the recording user's own history.
    export CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false
    cmd=(claude --allowedTools 'Bash(uncola:*)' 'Bash(command -v uncola)' 'Bash(node:*)' 'Skill(uncola)')
    ;;
  kiro)
    busy='Kiro is working'
    ready='ask a question'
    # Kiro can't trust one command, only the whole shell tool; the clip's messages are fixed.
    cmd=(kiro-cli chat --trust-tools=read,shell)
    ;;
  *) echo "Usage: demo/agent.sh claude|kiro" >&2; exit 2 ;;
esac

# Each message: type it, wait for the agent to start, then for it to finish, then leave time to read.
steps=("wait:$ready" sleep:2)
for msg in \
  'How am I doing against my goals?' \
  'I published the draft of my data analytics pipeline blog post today, about 3 hours. Log it and move that goal to 60%.' \
  'Big news: I earned my Professional Cloud Architect certification. Log it as a cloud architecture win and mark that goal done.' \
  'Brag about the certification.' \
  'Looks good, share it.'; do
  steps+=("type:$msg" "wait:$busy" "idle:$busy" sleep:4)
done

clear
"$python" "$here/agent-chat.py" "${steps[@]}" -- "${cmd[@]}"
