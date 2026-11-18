---
name: uncola
description: The user's career journal in Uncola (app.uncola.ai) — goals, activities, achievements (wins) and 1:1 notes. Use whenever the user wants to brag, show off, share or post about a win, race, launch or anything they did (even without saying "Uncola"), and when they ask to log, record or save something they did, a win, progress on a goal or a 1:1; to see their goals, recent entries or a recap; or to update a goal's progress, or to change or correct an entry.
---

# Uncola

Uncola is the user's career journal. This skill drives the `uncola` command-line tool, which is bundled in this folder.

## Running the CLI

Use `uncola` if it is on PATH (`command -v uncola`). Otherwise run the bundled copy with Node 22.12 or newer:

```sh
node <this skill's folder>/scripts/uncola/dist/cli.js <command>
```

Below, `uncola` means whichever of these works.

**Always add `--json`.** Results are JSON on stdout; errors are `{"error": {"code", "message"}}`. Never run bare `uncola` (it starts an interactive shell) and never run a type word alone such as `uncola goal` (it opens an interactive form).

If no command can run at all (a sandbox or permission error, or the command can't start), tell the user exactly that, with the error, and that their agent's sandbox or permission settings need to allow it. Don't say Uncola "isn't connected": it isn't an MCP server or a plugin, and nothing needs connecting. Don't look elsewhere for the user's data either: no `env`, no searching their home folder.

## Sign-in

The user signs in once, themselves, in a terminal: `uncola login`. Never run `login` yourself; it opens a browser and waits. If any command exits with code **4**, tell the user to run `uncola login` and stop.

## Commands

| Task | Command |
|---|---|
| See goals (with IDs) | `uncola goal list --json` |
| Recent entries | `uncola feed --json`, or `uncola feed <type> --json --limit 10` |
| One entry in full | `uncola show <id> --json` |
| Log an activity | `uncola log activity "<title>" --desc "<what was done>" --goal <goal id> --time 2h --skills "A,B" --json` |
| Log an achievement (win) | `uncola log achievement "<title>" --desc "<impact>" --skills "A,B" --json` |
| Log a goal | `uncola log goal "<title>" --desc "<why>" --due YYYY-MM-DD --json` |
| Log a 1:1 | `uncola log 1on1 "<title>" --with "Name" --notes "<notes>" --action "Do X:YYYY-MM-DD" --json` |
| Set goal progress (100 marks it completed) | `uncola goal progress <goal id> <0-100> --json` |
| Change an entry (only the options given change) | `uncola edit <id> --title "<new title>" --desc "<text>" --json`; also `--due`/`--progress` (goal), `--time`/`--skills`/`--goal <id or none>` (activity), `--skills` (win), `--notes`/`--action "Do X:YYYY-MM-DD"` (1:1), `--visibility` |
| Highlights for a period | `uncola recap --since 90d --json` |
| Preview a public share (brag) | `uncola brag <id> --dry-run --json` |
| Share publicly — **only after the user approves the previewed text** (with `--yes`, use the ID, not a title) | `uncola brag <id> --title "<approved title>" --message "<approved message>" --yes --json` |
| Delete | `uncola delete <id> --yes --json` — **only after the user confirms** the exact entry |

Sharing (`brag`) saves a public version of the entry that others can open from its link. **Never write brag text from memory or imagination**: find the entry in `uncola feed achievement --json` (or `feed --json`), and always preview with `uncola brag <id> --dry-run --json` first. Describe only what the entry says; don't add places, times or rankings it doesn't have. If no entry matches, say so and offer to log it. It uses the entry's own text; add `--ai` only when the user asks for Uncola AI to write it. Show the user `card` as is in a code block (it is the share card the app draws, with their name), then `body.publicVersion` and any `redactions`, and get a yes. Then share by passing the approved title and message back with `--title` and `--message`; don't repeat `--ai`, because it writes new text each time. Give the user `url` and `postText` from the result. The link is on the Uncola web app the user signed in to: app.uncola.ai, or app.styloc.com for Uncola's test server.

Types: `goal`, `activity`, `achievement` (also `win`), `1on1` (also `meeting`).

Shared options for `log`: `--date today|yesterday|YYYY-MM-DD` (never in the future), `--visibility private|team|company|public` (default private), `--company "<name>"`, and `--dry-run` to preview without saving.

For long text, pass JSON on stdin instead of flags: `echo '{"title":"…","description":"…"}' | uncola log activity --input - --json`.

## How to log well

1. **Linking to a goal:** run `uncola goal list --json` first and pass the goal's full `itemId` to `--goal`. Don't use row numbers (`1`, `2`) — they refer to the user's last printed list, not yours.
2. Write a short, specific title (what was done) and put detail and impact in `--desc`. Keep the user's own words, and add nothing they didn't say: no invented scores, steps, vendors or product names, and no added adjectives ("easy", "great", "successful"), in the text or in `--skills`. "I did a 20-minute recovery jog" is `--desc "20-minute recovery jog"`, not "Easy 20-minute recovery jog".
3. Entries are private unless the user asks otherwise. A public entry (`--public`) needs `--yes`; pass it only when the user asked for a public entry.
4. After a goal-related activity, offer to update the goal's progress; don't change it unprompted.
5. Confirm back what was saved: the type, title and linked goal from the JSON result.
6. **Editing:** only when the user asks to change or correct an entry. Find it with `uncola feed --json` and pass its full `itemId`, never a row number. Change only what they asked for, and preview with `--dry-run` when the request is ambiguous. Never make an entry public with an edit unless the user asked for that (`--visibility public` needs `--yes`). An entry's date, and a 1:1's participants and discussion points, can't be edited: offer to delete and re-log instead, and delete only after the user confirms.

## Exit codes

`0` ok · `1` error · `2` bad usage or an ambiguous match (be more specific, or use the ID) · `3` not found · `4` not signed in (ask the user to run `uncola login`).
