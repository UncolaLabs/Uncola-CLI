// Builds the command tree. The REPL builds a fresh one per line, because
// commander keeps parsed option values on the Command objects.
import { readFileSync } from 'node:fs';
import { Command, Option } from 'commander';
import { brag } from './commands/brag.ts';
import { edit } from './commands/edit.ts';
import { feed } from './commands/feed.ts';
import { form } from './commands/form.ts';
import { goalAdd, goalList, goalProgress } from './commands/goal.ts';
import { home, shortHelp } from './commands/home.ts';
import { logAchievement, logActivity, logOneOnOne } from './commands/log.ts';
import { login } from './commands/login.ts';
import { logout } from './commands/logout.ts';
import { recap } from './commands/recap.ts';
import { rm } from './commands/rm.ts';
import { show } from './commands/show.ts';
import { whoami } from './commands/whoami.ts';
import { resolveEnv, type Environment } from './config.ts';
import { TYPE_WORDS, typeLabel, type ItemType } from './feed.ts';
import { emitError } from './output.ts';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

interface GlobalOptions {
  json?: boolean;
  env?: string;
}

/**
 * Wraps a command handler: resolves the environment, passes positional args
 * through, and turns errors into exit codes (and JSON errors with --json).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run(fn: (env: Environment, ...args: any[]) => Promise<void>) {
  return async (...args: unknown[]) => {
    const cmd = args.at(-1) as Command;
    const opts = cmd.optsWithGlobals<GlobalOptions>();
    try {
      await fn(resolveEnv(opts.env), ...args.slice(0, -2), opts);
    } catch (err) {
      process.exitCode = emitError(opts, err);
    }
  };
}

const collect = (value: string, previous: string[] = []) => [...previous, value];

/**
 * Adds an Examples section to a command's help. An example given as an array is a long command,
 * shown one flag per line with backslashes; the REPL can't continue lines, so there it stays on one.
 */
function examples(cmd: Command, inRepl: boolean, ...list: (string | string[])[]): Command {
  const prefix = inRepl ? '  ' : '  uncola ';
  const lines = list.map((e) => prefix + (Array.isArray(e) ? e.join(inRepl ? ' ' : ' \\\n      ') : e));
  return cmd.addHelpText('after', `\nExamples:\n${lines.join('\n')}`);
}

/** Examples for log <type>, also shown for <type> add. */
const LOG_EXAMPLES: Record<ItemType, (string | string[])[]> = {
  goal: [
    'log goal Earn the Professional Cloud Architect certification --due 2026-12-15',
    ['log goal "Present at the Chelsea NYC AI meetup"', '--due 2027-01-21', '--progress 10', '--desc "A 20-minute talk with a live demo"'],
  ],
  activity: [
    'log activity Published the blog post draft --goal blog --time 3h',
    ['log activity "Published draft: data analytics pipeline blog post"', '--goal blog', '--time 3h', '--skills "Writing,Data engineering"'],
  ],
  achievement: [
    'log win Spoke at the customer summit',
    ['log win "Earned the Professional Cloud Architect certification"', '--desc "Passed the professional-level exam"', '--skills "Cloud architecture"'],
  ],
  '1on1': [
    'log 1on1 with Sarah: growth plan and Q1 priorities',
    ['log 1on1 "Weekly with my manager"', '--with Alex', '--point "Certification exam date"', '--action "Book the exam:2026-11-06"', '--notes "Aim to finish before the 5K"'],
  ],
};

/** Options shared by every command that creates an entry. */
function entryOptions(cmd: Command, what: string): Command {
  return cmd
    .option('--desc <text>', `${what} description (default: the title)`)
    .option('--date <when>', 'when it happened: YYYY-MM-DD, today, yesterday or ISO date-time (default: now)')
    .option('--company <name>', 'one of the companies in your Uncola profile')
    .addOption(new Option('--visibility <level>', 'who can see it (default: private)').choices(['private', 'team', 'company', 'public']))
    .option('--public', 'shorthand for --visibility public')
    .option('-y, --yes', "save a public entry without asking")
    .option('--input <file>', 'read options as a JSON object from a file, or - for stdin (flags win)')
    .option('--dry-run', 'print the API request instead of sending it');
}

/**
 * The bots accept "sign in", "log in", "sign out" and "log out" as two words, and any case.
 * Rewrites those so commander sees one command name.
 */
export function normalizeArgs(args: string[]): string[] {
  const [first, second, ...rest] = args;
  if (first === undefined) return args;
  const a = first.toLowerCase();
  const b = second?.toLowerCase();
  if ((a === 'sign' || a === 'log') && (b === 'in' || b === 'out')) return [b === 'in' ? 'login' : 'logout', ...rest];
  if (first.startsWith('-')) return args;
  return a === 'log' && second !== undefined && !second.startsWith('-') ? [a, b!, ...rest] : [a, ...args.slice(1)];
}

const LOGGERS = { goal: goalAdd, activity: logActivity, achievement: logAchievement, '1on1': logOneOnOne };

/** The bots' words for a type, minus the canonical one: ach, win, act, 1:1, meeting… */
const aliasesOf = (type: ItemType) => TYPE_WORDS[type].filter((w) => w !== type);

/** `log <type> [text...]` options for each type. */
function logCommand(parent: Command, type: ItemType, inRepl: boolean, name: string = type): Command {
  const cmd = parent.command(name).argument('[text...]', 'the entry, e.g. Shipped the CLI (becomes the title)');
  switch (type) {
    case 'goal':
      cmd.option('--due <date>', 'due date, YYYY-MM-DD').option('--progress <percent>', 'starting progress, 0–100');
      break;
    case 'activity':
      cmd
        .option('--goal <goal>', 'link to a goal: its # from goal list, or part of its title')
        .option('--time <duration>', 'time spent, e.g. 6h, 90m, 2h30m')
        .option('--skills <list>', 'comma-separated skills');
      break;
    case 'achievement':
      cmd.option('--skills <list>', 'comma-separated skills');
      break;
    case '1on1':
      cmd
        .option('--with <name>', 'participant (repeatable); or write "with Sarah: notes" as the text', collect)
        .option('--point <text>', 'discussion point (repeatable)', collect)
        .option('--action <text[:YYYY-MM-DD]>', 'action item with optional due date (repeatable)', collect)
        .option('--notes <text>', 'meeting notes');
      break;
  }
  examples(entryOptions(cmd, typeLabel(type).toLowerCase()), inRepl, ...LOG_EXAMPLES[type]);
  return cmd.action(run(LOGGERS[type]));
}

export function buildProgram(inRepl = false): Command {
  const program = new Command()
    .name('uncola')
    .description('Log goals, activities, achievements and 1:1s to Uncola from the terminal.')
    .version(version)
    .option('--json', 'print machine-readable JSON')
    .option('--env <name>', 'environment: dev or prod (default: $UNCOLA_ENV or prod)')
    .helpCommand(false)
    .showHelpAfterError();

  program
    .command('home')
    .description('Dashboard: goal progress, latest entries and the main commands')
    .action(run((env, opts) => home(env, version, { ...opts, inRepl })));

  program
    .command('help')
    .description('Every command; help <command> for its options and examples')
    .argument('[command...]', 'a command, e.g. log win')
    .action((words: string[]) => {
      if (words.length) {
        let cmd: Command | undefined = program;
        for (const w of normalizeArgs(words)) cmd = cmd?.commands.find((c) => c.name() === w || c.aliases().includes(w));
        if (cmd) return void cmd.outputHelp();
        process.stdout.write(`No command "${words.join(' ')}".\n\n`);
      }
      program.outputHelp();
    });
  program.addHelpText(
    'after',
    `\nTypes  goal · activity (act) · achievement (ach, win) · 1on1 (1:1, meeting)\nRun "${inRepl ? '' : 'uncola '}help <command>" for a command's options and examples, e.g. ${inRepl ? '' : 'uncola '}help log.`,
  );

  // Logging, in the bots' words: log <type> <text>.
  const log = program.command('log').description('Save an entry in one line: log <type> <text>, e.g. log win Shipped the CLI');
  examples(log, inRepl, 'log win Spoke at the customer summit', 'log activity Published the blog post draft --goal blog --time 3h', 'log goal Run a 5K --due 2026-11-15');
  for (const type of ['goal', 'activity', 'achievement', '1on1'] as const) {
    logCommand(log, type, inRepl)
      .aliases(aliasesOf(type))
      .description(`Save ${type === 'goal' ? 'a goal' : type === '1on1' ? 'a 1:1 note' : `an ${type}`}${type === '1on1' ? ', e.g. log 1on1 with Sarah: growth plan' : ''}`);
  }

  program
    .command('feed')
    .aliases(['list', 'ls'])
    .description('Your recent entries, newest first: feed [type], e.g. feed goal')
    .argument('[type]', 'only one type: goal, activity (act), achievement (ach, win) or 1on1 (meeting)')
    .option('--type <type>', 'same as the [type] argument')
    .option('--since <when>', 'only entries since e.g. 7d, 24h, 2w or YYYY-MM-DD')
    .option('--limit <n>', 'maximum entries to show', '20')
    .option('--ids', 'show each entry\'s ID')
    .option('--no-body', "don't preview descriptions")
    .action(run(feed));
  examples(program.commands.at(-1)!, inRepl, 'feed', 'feed win --since 30d', 'feed activity --limit 5 --no-body');

  program
    .command('show')
    .aliases(['get', 'describe'])
    .description('Show one entry in full: show <# from the last list, or part of the title>')
    .argument('<entry>', '# from the last list, part of the title, or an ID')
    .action(run(show));
  examples(program.commands.at(-1)!, inRepl, 'show 2', 'show "weekly with my manager"');

  program
    .command('edit')
    .aliases(['update'])
    .description('Change an entry: edit <#> --title ... (only the options you give change)')
    .argument('<entry>', '# from the last list, part of the title, or an ID')
    .option('--title <text>', 'new title')
    .option('--desc <text>', 'new description')
    .option('--due <date>', 'goal: new due date YYYY-MM-DD, or none')
    .option('--progress <percent>', 'goal: 0–100 (100 completes it)')
    .option('--goal <goal>', 'activity: link to a goal (its # or part of its title), or none')
    .option('--time <duration>', 'activity: time spent, e.g. 6h, 90m; or none')
    .option('--skills <list>', 'activity or win: comma-separated skills (replaces the list)')
    .addOption(new Option('--with <name>').argParser(collect).hideHelp())
    .addOption(new Option('--point <text>').argParser(collect).hideHelp())
    .option('--action <text[:YYYY-MM-DD]>', '1:1: action item (repeatable; replaces the list)', collect)
    .option('--notes <text>', '1:1: new meeting notes')
    .option('--company <name>', 'one of the companies in your Uncola profile')
    .addOption(new Option('--visibility <level>', 'who can see it').choices(['private', 'team', 'company', 'public']))
    .option('--public', 'shorthand for --visibility public')
    .option('-y, --yes', 'make an entry public without asking')
    .option('--input <file>', 'read options as a JSON object from a file, or - for stdin (flags win)')
    .option('--dry-run', 'print the API request instead of sending it')
    .addHelpText('after', "\nNot editable after saving: an entry's date, and a 1:1's participants and discussion points. Delete the entry and log it again with --date, --with and --point.")
    .action(run(edit));
  examples(
    program.commands.at(-1)!,
    inRepl,
    'edit 2 --title "Earned the Professional Cloud Architect certification"',
    'edit 3 --progress 60 --due 2027-01-31',
    'edit "weekly with my manager" --notes "Agreed the Q1 plan" --dry-run',
  );

  // Each type on its own opens a form, like the bots; `<type> list` and `<type> add` also work.
  for (const type of ['goal', 'activity', 'achievement', '1on1'] as const) {
    const label = typeLabel(type).toLowerCase();
    const group = program
      .command(type)
      .aliases(aliasesOf(type))
      .description(`Add ${type === 'goal' ? 'a goal' : type === '1on1' ? 'a 1:1 note' : `an ${type}`} step by step${type === 'goal' ? '; goal list, goal progress' : `; ${type} list`}`)
      .option('--dry-run', 'print the API request instead of sending it')
      .action(run((env, opts) => form(env, type, opts)));
    examples(group, inRepl, type, `${type} list`, (LOG_EXAMPLES[type][0] as string).replace(/^log \S+/, `${type} add`));
    const list = group
      .command('list')
      .alias('ls')
      .description(type === 'goal' ? 'Your goals with progress and due date' : `Your ${label} entries (same as feed ${type})`)
      .option('--ids', 'show each entry\'s ID')
      .option('--no-body', "don't preview descriptions");
    if (type === 'goal') examples(list.action(run(goalList)), inRepl, 'goal list', 'goal list --ids');
    else {
      list
        .option('--since <when>', 'only entries since e.g. 7d or YYYY-MM-DD')
        .option('--limit <n>', 'maximum entries to show', '20')
        .action(run((env, opts) => feed(env, type, opts)));
      examples(list, inRepl, `${type} list`, `${type} list --since 30d --limit 5`);
    }
    logCommand(group, type, inRepl, 'add').alias('log').description(`Save ${label === '1:1' ? 'a 1:1 note' : `a ${label}`} in one line (same as log ${type})`);
    if (type === 'goal') {
      group
        .command('progress')
        .description("Set a goal's progress")
        .argument('<goal>', '# from goal list, or part of its title')
        .argument('<percent>', '0–100')
        .option('--dry-run', 'print the API request instead of sending it')
        .action(run(goalProgress));
      examples(group.commands.at(-1)!, inRepl, 'goal progress certification 60', 'goal progress 2 100');
    }
  }

  program
    .command('brag')
    .alias('share')
    .description('Share an entry publicly, like the megaphone in the app: brag <#>')
    .argument('[entry]', '# from the last list, part of the title, or an ID (default: pick from your latest)')
    .option('--ai', 'let Uncola AI write the public version (as "Create with AI")')
    .option('--title <text>', 'public title (default: the entry\'s, or its earlier public version)')
    .option('--message <text>', 'public message (default: the entry\'s description)')
    .option('--impact <text>', "an achievement's impact line")
    .option('--email <addresses>', 'also email the link (comma-separated; repeatable)', collect)
    .option('-y, --yes', "share without asking")
    .option('--dry-run', 'show the card and the request without saving')
    .addHelpText('after', '\nLinks, emails, ticket ids, exact amounts and similar details are redacted, as in the app.')
    .action(run(brag));
  examples(
    program.commands.at(-1)!,
    inRepl,
    'brag 2 --dry-run',
    'brag "customer summit"',
    ['brag 2', '--title "Earned my Professional Cloud Architect certification"', '--email sam@example.com', '--yes'],
  );

  program
    .command('recap')
    .alias('highlights')
    .description('Your highlights for a period as a card: wins, goals, hours and skills')
    .option('--since <when>', 'period to cover, e.g. 30d, 12w or YYYY-MM-DD', '90d')
    .action(run(recap));
  examples(program.commands.at(-1)!, inRepl, 'recap', 'recap --since 12w');

  program
    .command('delete')
    .aliases(['rm', 'del'])
    .description('Delete entries: delete <#> (also: rm)')
    .argument('<entries...>', '# from the last list, or entry IDs')
    .option('-y, --yes', "don't ask for confirmation")
    .option('--dry-run', 'show what would be deleted')
    .action(run(rm));
  examples(program.commands.at(-1)!, inRepl, 'delete 3', 'delete 3 4 --yes');

  program
    .command('login')
    .aliases(['connect', 'signin'])
    .description('Sign in through your browser (also: connect, sign in)')
    .option('--provider <name>', 'skip the chooser: google, linkedin, apple, github or email')
    .option('--no-browser', "don't open a browser; paste the redirected URL instead (SSH, headless)")
    .addHelpText('after', '\nSet BROWSER to choose the browser, e.g. BROWSER="Google Chrome" uncola login (macOS).')
    .action(run(login));
  examples(program.commands.at(-1)!, inRepl, 'login', 'login --provider google', 'login --no-browser');

  program
    .command('logout')
    .aliases(['disconnect', 'unlink', 'signout'])
    .description('Sign out and delete the stored tokens (also: disconnect, sign out)')
    .action(run(logout));
  examples(program.commands.at(-1)!, inRepl, 'logout');

  program
    .command('status')
    .alias('whoami')
    .description('Which account is signed in, and whether the API accepts it (also: whoami)')
    .action(run(whoami));
  examples(program.commands.at(-1)!, inRepl, 'status', 'status --json');

  if (inRepl) {
    // Throw instead of exiting so a typo or --help doesn't end the session.
    // Full help after every typo is noisy in a session; point at `help` instead.
    for (const cmd of allCommands(program)) cmd.exitOverride().showHelpAfterError('(type help, or <command> --help)');
  }
  return program;
}

function allCommands(cmd: Command): Command[] {
  return [cmd, ...cmd.commands.flatMap(allCommands)];
}
