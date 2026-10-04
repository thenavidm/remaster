# Working on Remaster

This repo is a Claude Code plugin and a portable Agent Skill in one. These are
the rules for agents editing it, not for people installing it (that's the
README).

## What's here

| Path | What it is |
|---|---|
| `skills/clone/SKILL.md` | The skill. Every word loads each time it runs, so it stays under 500 lines and the details live in `references/` |
| `skills/clone/references/` | One document per stage, plus the clean-room line, the taste floor and the critic's rubric. Read when a stage starts |
| `skills/clone/scripts/remaster.mjs` | The CLI entry. Each command is a module in `scripts/commands/` that exports `help` and `run` |
| `skills/clone/scripts/lib/` | Shared pieces: args, CSV, colors, text, PNG, robots.txt, HTML, network, browser, state, YAML |
| `skills/clone/scripts/browser/measure.js` | The page measurement. One file, run under Playwright by `measure` and by hand in any agent's browser tool |
| `skills/clone/scripts/data/` | The copy rules and the generic phrases the copy check skips |
| `skills/clone/templates/` | What `init` copies into a project, and the design, listing and profile templates |
| `agents/` | The two Claude Code agents. Their rules live in the skill's references, so the agents point there |
| `.claude-plugin/` | The plugin and marketplace manifests |
| `tests/` | `node:test`, no dependencies |

## Commands

| Command | What it does |
|---|---|
| `npm test` | Every test |
| `npm run check` | Syntax check of the CLI and every command module |
| `claude plugin validate . --strict` | The marketplace manifest |
| `claude plugin validate .claude-plugin/plugin.json --strict` | The plugin manifest |
| `node skills/clone/scripts/remaster.mjs <command> --help` | Any command's options |

## Decisions already made, do not re-litigate

- **Zero runtime dependencies, Node 18 or later.** The skill runs wherever an agent runs, with nothing to install. Playwright is borrowed from the user's project or a global install when a command needs a browser, never bundled.
- **Plain JavaScript modules with `// @ts-check` and JSDoc.** No build step, so the files in the repo are the files that run.
- **One skill, four stages, one CLI.** Not one skill per step: every description loads into every session, and narrow skills collide with the user's own (a "deploy it" trigger, say).
- **Portable frontmatter only** in SKILL.md: `name`, `description`, `license`, `compatibility`, `metadata`. claude.ai uploads reject anything else.
- **One measurement script for every browser.** `browser/measure.js` is the single source; never fork a Playwright-only copy.
- **Scripts check, the agent judges.** The model reads reviews and groups themes; code verifies every quote and count. The model looks at screenshots; code measures structure and contrast. Never hand a judgment to a regex or a measurement to the model.
- **Research stays private.** `init` adds `remaster/research/` to the user's .gitignore, and the sweep skips that folder.
- **The clean-room line is not a setting.** No flag reads the original's code, logs into another account or gets past a login. Migrate mode is the only place copying is allowed, and only with `--owner`.
- **CLAUDE.md lives in `.claude/`.** Claude Code's plugin validator warns about a CLAUDE.md at the plugin root, which is this repo's root.

## Adding a command

1. Write `skills/clone/scripts/commands/<name>.mjs` exporting `help` (its full usage text, starting `remaster <name>`) and `async run({ flags, positionals })` returning an exit code.
2. Add it to `COMMANDS` in `remaster.mjs`, and any boolean flag to `BOOLEANS`.
3. Put pure logic in exported functions and test them in `tests/`. A command that touches the network gets a pure function for the parsing and a test for that.
4. Add it to the scripts table in SKILL.md, the stage reference that uses it, and the README.

## Before you commit

1. `npm run check && npm test`
2. Both `claude plugin validate` commands above, with `--strict`.
3. A real run of anything you changed: a real page for `measure`, `tokens` and `diff`; a real help center for `crawl`; real reviews for `store`, `hn` and `pains`.
4. The version in step with every place it appears: `.claude-plugin/plugin.json`, the skill's `metadata.version`, `package.json`, `VERSIONS.md`, the README badge, and a CHANGELOG entry.

## Rules

- Commits are authored `Navid Moazzez <n@navid.me>` by the machine's git config. Never pass `-c user.email`, and never add AI attribution to a commit.
- Never name another project in this repo: not in docs, code comments or commit messages. Credit a real dependency in the README's Credits table; that is required, and it is different.
- No em dashes. American English. Short paragraphs. Explain why, not what.
- Every URL in the docs is checked before it is written.
