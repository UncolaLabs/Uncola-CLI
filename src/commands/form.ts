import { createInterface, type Interface } from 'node:readline/promises';
import type { Environment } from '../config.ts';
import { CliError } from '../errors.ts';
import { typeLabel, type ItemType } from '../feed.ts';
import { dim, bold } from '../term.ts';
import { fetchGoals, goalAdd } from './goal.ts';
import { logAchievement, logActivity, logOneOnOne } from './log.ts';
import type { WriteOptions } from '../entries.ts';

/**
 * `uncola achievement` (or goal, activity, 1on1) on its own: asks for each field like the
 * Slack and Teams forms, then saves. Without a terminal it explains the one-line form instead.
 */
export async function form(env: Environment, type: ItemType, opts: WriteOptions): Promise<void> {
  if (!process.stdin.isTTY || opts.json) {
    throw new CliError(
      `To add ${type === 'achievement' || type === 'activity' ? 'an' : 'a'} ${typeLabel(type).toLowerCase()} without prompts: uncola log ${type} <text> [options]. See: uncola log ${type} --help`,
      'usage',
      2,
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl-C cancels the form (and only the form, inside the shell).
  const abort = new AbortController();
  rl.on('SIGINT', () => abort.abort());
  rl.on('close', () => abort.abort());
  const ask = (label: string, required = false) => askField(rl, abort.signal, label, required);
  try {
    process.stdout.write(`${bold(`New ${typeLabel(type).toLowerCase()}`)} ${dim('(Enter skips optional fields, Ctrl-C cancels)')}\n`);
    const flags: Record<string, unknown> = { ...opts };
    let words: string;
    switch (type) {
      case 'goal': {
        words = await ask('Title', true);
        flags.desc = await ask(`Description ${dim('(Enter to reuse the title)')}`);
        flags.due = await ask(`Due date ${dim('(YYYY-MM-DD)')}`);
        flags.progress = await ask(`Progress ${dim('(0–100, Enter for 0)')}`);
        break;
      }
      case 'activity': {
        words = await ask('Title', true);
        flags.desc = await ask(`What did you do? ${dim('(Enter to reuse the title)')}`);
        flags.goal = await pickGoal(env, ask);
        flags.time = await ask(`Time spent ${dim('(e.g. 2h, 90m)')}`);
        break;
      }
      case 'achievement': {
        words = await ask('Title', true);
        flags.desc = await ask(`Description ${dim('(Enter to reuse the title)')}`);
        flags.skills = await ask(`Skills ${dim('(comma-separated)')}`);
        break;
      }
      case '1on1': {
        words = await ask('Title', true);
        flags.with = (await ask(`Participants ${dim('(comma-separated)')}`, true)).split(',').map((p) => p.trim()).filter(Boolean);
        flags.notes = await ask('Notes', true);
        const actions: string[] = [];
        for (;;) {
          const a = await ask(`Action item ${actions.length + 1} ${dim('(text or text:YYYY-MM-DD, Enter when done)')}`);
          if (!a) break;
          actions.push(a);
        }
        flags.action = actions;
        break;
      }
    }
    flags.date = await ask(`Date ${dim('(YYYY-MM-DD, today or yesterday; Enter for now)')}`);
    flags.visibility = await ask(`Visibility ${dim('(private, team, company or public; Enter for private)')}`);
    rl.close();
    for (const [k, v] of Object.entries(flags)) if (v === '') delete flags[k];

    const save = { goal: goalAdd, activity: logActivity, achievement: logAchievement, '1on1': logOneOnOne }[type];
    await save(env, words, flags);
  } catch (err) {
    if (abort.signal.aborted) {
      process.stdout.write('\n');
      throw new CliError('Cancelled; nothing was saved.', 'cancelled');
    }
    throw err;
  } finally {
    rl.close();
  }
}

async function askField(rl: Interface, signal: AbortSignal, label: string, required: boolean): Promise<string> {
  for (;;) {
    const answer = (await rl.question(`  ${label}: `, { signal })).trim();
    if (answer || !required) return answer;
    process.stdout.write(dim('  This one is required.\n'));
  }
}

/** Lists the goals by number; returns the chosen goal's ID, or '' for none. */
async function pickGoal(env: Environment, ask: (label: string) => Promise<string>): Promise<string> {
  const { goals } = await fetchGoals(env);
  if (!goals.length) return '';
  process.stdout.write(`  Related goal ${dim('(number, or Enter for none)')}\n`);
  goals.forEach((g, n) => process.stdout.write(`    ${String(n + 1).padStart(2)}. ${g.title}\n`));
  for (;;) {
    const answer = await ask('Goal #');
    if (!answer) return '';
    const goal = goals[Number(answer) - 1];
    if (goal) return goal.itemId;
    process.stdout.write(dim(`  Pick a number from 1 to ${goals.length}.\n`));
  }
}
