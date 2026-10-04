# Remaster: clone any app or website with Claude Code, then make it better

[![npm](https://img.shields.io/npm/v/@thenavidm%2Fremaster?color=orange&label=npm)](https://www.npmjs.com/package/@thenavidm/remaster)
[![Version](https://img.shields.io/badge/version-0.2.0-blue)](https://github.com/thenavidm/remaster/blob/main/CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue)](https://github.com/thenavidm/remaster/blob/main/LICENSE)
[![YouTube](https://img.shields.io/badge/YouTube-@thenavidm-red?logo=youtube&logoColor=white)](https://youtube.com/@thenavidm?sub_confirmation=1)
[![X](https://img.shields.io/badge/X-@thenavidm-black?logo=x)](https://x.com/thenavidm)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-thenavidm-0A66C2?logo=linkedin&logoColor=white)](https://linkedin.com/in/thenavidm)

App and website cloner for Claude Code and AI agents. Remaster rebuilds what any app or website does and how it feels to use, then makes it better and yours: it reads what the original's users hate, measures its design from the live page, rebuilds it clean-room with real taste, and proves the result with scored gates before you launch.

It works in four modes: a full app, a single site or page, one feature into an app you already have, or a site you own moved to a new stack. It ships one skill, two Claude Code agents, 21 commands in a dependency-free Node CLI, and 9 reference documents that carry the method. It runs in Claude Code, Codex, Gemini CLI, Cursor and any agent that reads Agent Skills.

Built by [Navid Moazzez](https://navid.me).

## Contents

| | Section | What it covers |
|---|---|---|
| 1 | [What it is](#1-what-it-is-) | The idea, and what it refuses to be |
| 2 | [What you can ask it](#2-what-you-can-ask-it-) | Real requests |
| 3 | [Real runs](#3-real-runs-) | Output from the scripts on real sites |
| 4 | [Install](#4-install-) | One command for every agent, or the Claude Code, Codex and Gemini CLI plugins |
| 5 | [Setup](#5-setup-) | Node, a browser, and your profile |
| 6 | [How it works](#6-how-it-works-) | Four stages, each ending at a gate |
| 7 | [Modes](#7-modes-) | App, site, feature and migrate, and the bar for each |
| 8 | [What you get](#8-what-you-get-) | Every file a project produces |
| 9 | [Scripts](#9-scripts-) | Every command and what it checks |
| 10 | [References](#10-references-) | Every reference document and when it is read |
| 11 | [Hard rules](#11-hard-rules-) | What it rebuilds, and what it never takes |
| 12 | [Repository layout](#12-repository-layout-) | Every folder |
| 13 | [Versions and updates](#13-versions-and-updates-) | How releases are cut |
| 14 | [Gotchas](#14-gotchas-%EF%B8%8F) | What was learned the hard way |
| 15 | [Troubleshooting](#15-troubleshooting-) | Symptom, cause, fix |
| 16 | [FAQ](#16-faq-) | The questions people ask |
| 17 | [Credits](#17-credits-) | The work this builds on |

## 1. What it is 🎬

Remaster is a skill for AI coding agents that clones apps and websites the way a careful team would. Research first: what do the original's users hate, and is a clone worth building at all? Then measure: the original's screens, flows, states and design system, from public sources and the live page. Then rebuild it clean-room, in your stack and your brand. Then prove it, with gates the scripts check before anything ships.

It refuses to be a pixel copier. It never copies the original's code, words, images, icons, logos, fonts or brand color, and it never reads its JavaScript or logs into anyone else's account. A straight copy has no reason to exist and invites a takedown; a clone that fixes what users hate, in a design of its own, is a product.

It also refuses to look generated. Agents hand back the same site every time: a centered gradient hero, one typeface at three sizes, three equal cards. Remaster gives the build what a designer has and an agent lacks: references (the original's measured system and a direction you pick), constraints (a checked DESIGN.md), and eyes (every screen screenshotted and reviewed by a critic that rejects generic work).

## 2. What you can ask it 💬

- "Clone cal.com's booking flow and make it better for small teams."
- "What do people hate about Calendly? Is a competitor worth building?"
- "Rebuild the structure and motion of linear.app's homepage for my product, in my brand."
- "Add Notion-style slash commands to my editor, in my app's design."
- "Move my Webflow site to Astro without losing a single URL or ranking."
- "Make my own version of this app," with an App Store link or a URL.

## 3. Real runs 🧪

Researching Calendly, the evidence check refuses a quote that isn't in the reviews:

```
$ remaster store reviews 1451094657 --countries us,gb
Added 200 rows to remaster/research/reviews.csv.
$ remaster hn "calendly" --max 120
Read 200 comments mentioning "calendly". Added 120 rows to remaster/research/reviews.csv.
$ remaster pains
Not checked out:
  Theme "easy-booking": the quote "This is a quote nobody wrote" is not word for word in row as-us-14593373655.
Nothing written to remaster/research/pains.md until every quote and row checks out.
```

Designing against Stripe's measured system, the lint refuses its brand color and its typeface:

```
$ remaster tokens
Colors: canvas #ffffff, surface #e5edf5, ink #0d1738, ink-soft #50617a, accent #533afd, border #e5edf5
$ remaster design
error    too-close   The accent #5a3ff5 is too close to the original's #533afd (distance 1.8, hue 2 degrees apart).
error    their-font  "sohne-var" is the original's typeface. Pick your own, and check the license of any font you ship.
```

On a test project with leftovers planted in it, the sweep finds every one, including one of Stripe's own SVG paths pasted into a component and reformatted:

```
$ remaster sweep
image   public/hero.png                    identical to research file remaster/research/measure/cal-com@1440.png
name    src/components/CalcomEmbed.tsx     the file name holds "Calcom"
domain  src/components/CalcomEmbed.tsx:5   cal.com: <a href="https://cal.com/signup">Sign up</a>
color   src/components/CalcomEmbed.tsx:6   #533afe is 0.2 from the original's #533afd
svg     src/components/Logo.tsx:2          an SVG path drawn exactly like one on the original's page (stripe-com@1440.json)
copy    src/components/CalcomEmbed.tsx:4   100% shared, 19 words in a row, with: "A fully customizable scheduling software..."
Not clean: 9 thing(s) of the original's are still in the project.
```

And the interaction sweep, which reads what a page does without clicking anything:

```
$ remaster interact https://linear.app
Header stays the same on scroll.
8 element(s) fade or slide in as they arrive (span "Right now we show a spinner fo", ...).
2 pinned element(s) while scrolling.
Hover: 23 of 30 controls respond, mostly by backgroundColor (22), color (11), borderTopColor (11), filter (1), usually in 100ms.
Keyboard: 30 Tab stops, 30 with a visible focus, 0 without, and the first stop skips to the content.
```

Real output from the bundled scripts, trimmed to fit. Nothing in a Remaster project rests on a guess.

## 4. Install ⚡

**Any agent, one command**

```bash
npx -y @thenavidm/remaster install
```

That puts the skill in `~/.claude/skills/clone` for Claude Code and in `~/.agents/skills/clone`, the shared folder Codex, Cursor and Gemini CLI all read. Add `--agent codex` (or `claude`, `cursor`, `gemini`) for one of them, `--project` to install into the current project instead, and `--remove` to take it out. Start a new session afterwards.

**Claude Code, as a plugin**

1. Add the marketplace: `/plugin marketplace add thenavidm/remaster`
2. Install the plugin: `/plugin install remaster@remaster`
3. Run `/reload-plugins`, or start a new session.
4. Type `/remaster:clone` and a URL, or just ask for a clone.

The plugin also adds two agents Claude Code runs in parallel: `remaster:design-critic` and `remaster:screen-builder`.

**Codex, as a plugin**

```bash
codex plugin marketplace add thenavidm/remaster
codex plugin add remaster@remaster
```

Start a new session, then call it with `$clone`, or just ask for a clone.

**Gemini CLI, as an extension**

```bash
gemini extensions install https://github.com/thenavidm/remaster
```

Gemini CLI offers to activate the skill when you ask for a clone.

**Cursor and any other agent that reads Agent Skills**

Use the one-command install above, or copy `skills/clone` into the agent's skills folder. In an agent that doesn't fill in the skill's folder for its scripts, the skill says to use its own folder, or the same CLI from npm: `npx -y @thenavidm/remaster@0.2.0 <command>`. Each agent's own docs: [Codex](https://learn.chatgpt.com/docs/build-skills), [Cursor](https://cursor.com/docs/skills), [Gemini CLI](https://geminicli.com/docs/cli/creating-skills/).

**claude.ai**

Zip the `skills/clone` folder and upload it under Settings, Capabilities, Skills. The method and the checks work there. Measuring live pages needs a browser, so the full flow is best in a coding agent.

**Tested on 2026-10-04:** Claude Code (plugin install from GitHub, skill and both agents registered), Codex (plugin install, and a full run of the skill from `.agents/skills`), and Gemini CLI (extension validated, skill discovered and enabled).

## 5. Setup 🪄

1. **Node 18 or later.** Check with `node --version`. The scripts need nothing else.
2. **A browser for measuring pages.** In the project where the clone will live:
   ```bash
   npm i -D playwright && npx playwright install chromium
   ```
   No Playwright? Your agent's own browser tool works too: `remaster measure --snippet` prints the script to run in it.
3. **ffmpeg, only for screen recordings.** macOS: `brew install ffmpeg`. Windows: `winget install ffmpeg`. Linux: your package manager.
4. **Your profile, optional.** Copy `skills/clone/templates/profile.md` to `~/.config/remaster/profile.md` and fill in your stack, brand and voice. Every clone starts from it instead of the defaults.
5. **Start.** Open your agent in the folder where the clone will live and ask for it. The agent agrees the target, the mode and the slice with you, then runs `remaster init`, which creates `remaster/` and adds `remaster/research/` to your `.gitignore`.

## 6. How it works 🧭

Four stages. Each ends at a gate the scripts check, and a stage isn't done while one check fails.

1. **Research.** Reviews from the App Store's official feed, Hacker News's search API, and review sites copied by hand, all with links. You group them into what users hate, ask for, can't do and love; the script checks every quote word for word before anything is written up. Then the help center, crawled politely, and the public pages, measured. Out come a go or no-go, the opening to build on, a map of screens and flows, and a feature matrix where every row has a source.
2. **Design.** The original's design system, measured from what the page renders: color roles, type scale, spacing base, corners, motion. You keep its rhythm and change its identity: three directions, you pick one, and it becomes a DESIGN.md that's checked for contrast, distance from the original's brand colors, and the usual AI defaults.
3. **Build and verify.** Screen by screen from the specs, never from the original's code. Each screen is measured and compared with the original's skeleton, reviewed by a design critic that hard-rejects generic and broken screens, and checked for copy that reads as AI-written or claims proof you don't have. A sweep finds anything of the original's left in the code.
4. **Launch.** A name with its domain and trademark checks run and dated, a landing page built on the opening, pricing from the public record, a store listing that passes the stores' limits and copycat rules, a launch video, a shareable teardown, and the deploy, only on your go.

`remaster status` always says where the project stands and what to do next.

## 7. Modes 🔀

| Mode | What you get | What may be copied | The bar |
|---|---|---|---|
| `app` | The product's jobs and flows, rebuilt in your stack, with fixes from its users' complaints | Nothing: features, flows and patterns only | Every must-have done, parity 80 or more, and better than the original before launch |
| `site` | A page's structure, rhythm and motion, with your words, images and brand | Nothing: structure and behavior only | Structure 80 or more, design critic 30 of 35 |
| `feature` | One feature inside an app you already have, in that app's design | Nothing | The feature's rows done, and your app's tests still pass |
| `migrate` | A site you own on a new stack: same pages, words, images and URLs | Everything, because it's yours | Pixels 95% alike, every old URL works, head tags kept |

## 8. What you get 📦

Everything lives in `remaster/` inside your project, plus a `DESIGN.md` at its root:

```
remaster/
  state.json        The mode, the stage, every gate result and decision
  features.csv      The feature matrix: priority, original, clone, source
  sources.csv       Every source read, with its link and date
  brand.json        The original's names, domains and colors to keep out; your name and its checks
  TEARDOWN.md       The shareable report, from verified research only
  research/         Reviews, pains.md, verdict.md, recon.md, crawled help pages, store data,
                    measurements, interaction sweeps, the logo and screenshots of the
                    original. Never committed
  design/           The original's measured system, your design.json, tokens.css,
                    shadcn.css (a shadcn/ui theme), tokens.json (W3C design tokens)
  verify/           Measurements of the clone, diffs and heatmaps, critic verdicts,
                    bugs, beat metrics, the URL check
  launch/           Landing copy, pricing, the store listing, proof for any claim
DESIGN.md           Your design system, in Google Labs' format, for any coding agent
```

## 9. Scripts 🔧

Plain Node, no dependencies. Your agent runs them; you can too, from the project folder:

```bash
npx -y @thenavidm/remaster <command>
```

| Job | Command | What it does |
|---|---|---|
| Project | `install` | Put the skill where Claude Code, Codex, Cursor and Gemini CLI look for it |
| | `init`, `status`, `gate` | Start a project, see where it stands, run and record a stage's checks |
| Research | `store lookup`, `store reviews` | App Store listing, screenshots and up to 500 reviews per country, from Apple's public endpoints |
| | `hn` | Hacker News comments mentioning the product, with links |
| | `crawl` | A help center or docs site into markdown, obeying robots.txt and following redirects |
| | `frames` | A frame at every scene change of a screen recording you made, with timestamps |
| | `pains` | Checks your theme analysis against the review rows, word for word, then ranks it |
| Design | `measure` | A page's design system, skeleton, visible text, hosts, breakpoints, logo and full screenshot, in a clean browser |
| | `interact` | What a page does on scroll, hover and keyboard focus, with a scroll journey of screenshots; `compare` sets original and clone side by side |
| | `tokens` | The original's color roles, type scale, spacing base, corners and motion |
| | `design` | Lints your design and writes DESIGN.md, tokens.css (with a Tailwind v4 theme), a shadcn/ui theme and W3C design tokens |
| Verify | `diff` | Structure score, what's missing or moved, and a layout or pixel comparison with a heatmap |
| | `copy` | AI tells, invented proof, placeholders, weak buttons, repeated calls to action |
| | `sweep` | The original's names (also inside identifiers), domains, near brand colors, copied sentences, images, its logo and SVG icons, runtime requests |
| | `parity` | Feature parity, fixes built, and "better than the original" from measured metrics |
| Launch | `domain` | Name availability from the registries themselves, with dates |
| | `listing` | App Store and Google Play limits, copycat names, ranking claims |
| | `urls` | Migration: every old URL on the new site, with its redirects and head tags |
| | `teardown` | The shareable report |

`remaster <command> --help` shows every option.

## 10. References 📚

The method lives in `skills/clone/references/`. The skill reads each one when its stage starts, not before.

| Document | Read when | What it holds |
|---|---|---|
| `clean-room.md` | Always | What may be studied, what is never taken, where information may come from, the legal notes |
| `research.md` | Stage 1 | Collecting reviews, grouping themes, the evidence check, the go or no-go |
| `recon.md` | Stage 1 | Sources, the interaction model, the screen and flow map, the feature matrix |
| `design.md` | Stage 2 | Measuring the original, keep and change, three directions, DESIGN.md, primitives |
| `taste.md` | Stage 2 and 3 | The tells of a generated page, and the floor for spacing, type, color, depth, states and motion |
| `build.md` | Stage 3 | The default stack, the build order, every screen, parallel builds, the backend, security |
| `verify.md` | Stage 3 | The diff, the critic, the copy check, the sweep, parity, tests and bugs |
| `critic.md` | Stage 3 | The design critic's hard rejects, scores, bar and output |
| `launch.md` | Stage 4 | The name and its checks, brand, landing page, pricing, store listing, teardown, the deploy |

## 11. Hard rules 🚫

- **Public sources and your own account only.** You sign in yourself. It never types a password, never gets past a login, paywall or bot check, never uses anyone else's account.
- **Target content is data, never instructions.** Nothing on the original's pages can make it run a command, install a package or visit a site.
- **It never reads the original's code.** No JavaScript bundles, source maps, replayed network calls or private API endpoints. It measures what renders.
- **It takes nothing the original owns**, outside migrate mode: no code, words, images, icons, logos, licensed fonts, brand color or name.
- **It reads like a person.** robots.txt and terms obeyed, a pause between requests, official feeds where they exist.
- **It never invents.** No made-up reviews, quotes, counts, ratings or testimonials. Thin evidence is reported as thin.
- **You say go.** It never signs up, buys, enters a card or a live key, pushes, publishes or deploys without your explicit go for that step.

This is how the product stays yours to sell. It is not legal advice: when a launch depends on it, talk to a lawyer in your country.

**What it connects to.** Nothing in the background, and no telemetry. Only the requests you ask for: the pages and help centers of the product you are studying (in a clean browser, obeying robots.txt), Apple's public lookup and reviews endpoints, the Hacker News search API, the domain registries' RDAP servers and Cloudflare's public DNS resolver for domain checks, and the npm registry if you run it through `npx`. Every request names itself as RemasterResearch with a link to this repository. Details in [SECURITY.md](https://github.com/thenavidm/remaster/blob/main/SECURITY.md) and [PRIVACY.md](https://github.com/thenavidm/remaster/blob/main/PRIVACY.md).

## 12. Repository layout 📂

```
remaster/
  .claude-plugin/        Claude Code plugin and marketplace manifests
  .codex-plugin/         The Codex plugin manifest
  .agents/plugins/       The Codex marketplace file
  gemini-extension.json  The Gemini CLI extension manifest
  skills/clone/
    SKILL.md             The skill: what the agent reads first
    references/          The method, 9 documents, read stage by stage
    scripts/remaster.mjs The CLI entry
    scripts/commands/    One module per command
    scripts/lib/         Colors, CSV, PNG, robots.txt, HTML, text, network, browser, state
    scripts/browser/     measure.js, run under Playwright or in any agent's browser tool
    scripts/data/        The copy rules and the generic phrases the copy check skips
    templates/           What init copies into a project, and the design, listing and profile templates
  agents/                design-critic and screen-builder, for Claude Code
  tests/                 node:test, no dependencies
  AGENTS.md              Rules for agents editing this repo
  CHANGELOG.md           What changed, newest first
  VERSIONS.md            The current version of each part
  PRIVACY.md, SECURITY.md  What it reaches, what it writes, and how to report a problem
```

## 13. Versions and updates 🔄

Semantic versions, tagged `vX.Y.Z` with a GitHub release whose notes come from [CHANGELOG.md](https://github.com/thenavidm/remaster/blob/main/CHANGELOG.md).

| Change | Bump |
|---|---|
| A fix to a script, a check or a reference | Patch |
| A new command, check, mode or reference | Minor |
| A renamed or removed command, flag, file or measurement field that projects depend on | Major |

Projects keep their files in `remaster/` by fixed names, and measurement JSON carries a format version (`v`), so an update never breaks a project halfway through. To update: `npx -y @thenavidm/remaster@latest install` again, `claude plugin update remaster@remaster`, `codex plugin marketplace upgrade`, or `gemini extensions update remaster`. The current version is in [VERSIONS.md](https://github.com/thenavidm/remaster/blob/main/VERSIONS.md).

## 14. Gotchas ⚠️

**A page that blocks headless browsers** (a bot check, a challenge page) measures as the challenge page. Measure it through your agent's own browser instead, with the script `remaster measure --snippet` prints.

**Moving content differs between any two captures** of the same page: carousels, clocks, randomized testimonials. Measure the original twice and pass `--calibrate` to `diff`, or mask the region with `--mask x,y,w,h`. Without a mask, cal.com scored 92.3% against a fresh capture of itself; with its testimonial wall masked, 98.9%.

**A section that grew shifts everything after it.** The visual diff aligns the two pages row by row first, so it reports the shift ("content shifts from y 2848 by +56px") instead of failing every cell below it.

**Stylesheets on another host can't be read by the page itself**, so their breakpoints would be missed. `measure` reads those public CSS files directly instead: Stripe's came back as 640, 940 and 1264.

**A fade is usually set on a wrapper**, so `interact` reads an element's opacity through its parents, and looks a few layers inside each control for its hover change. Hover driven by JavaScript animation can still read as no change; check those by eye.

**Site builders paint buttons on inner elements**, or with gradients and inner shadows instead of a fill. The measurement looks a few levels down and reads gradient stops, so those still count as buttons and their color as the accent.

**A help center that redirects** (help.example.com to example.com/help) is followed, and the crawl stays under the final section.

**Docs built in JavaScript** come back nearly empty from a plain fetch. `crawl --render` renders each page in a browser first.

**Apple's reviews feed stops at 10 pages of 50** per country. Add countries for more. Google Play has no public reviews API for other people's apps, so those are read and copied by hand, with links.

**Colors that only appear inside icons are someone else's logo**, like the four colors of a sign-in button. They are left out of the brand colors the sweep and the design lint hold you away from.

**A DESIGN.md you already have is never overwritten.** Feature mode uses your app's own design.

**Icons pasted as inline SVG are copying too.** The sweep fingerprints every SVG path on the original's pages and recognizes them in your code even after a formatter rewrote them.

**Fonts are the most common takedown on public repos.** Never commit a commercial font file.

## 15. Troubleshooting 🔍

| Symptom | Cause | Fix |
|---|---|---|
| "Playwright isn't installed where this project can find it" | `measure` borrows Playwright from your project or a global install | `npm i -D playwright && npx playwright install chromium`, or measure with your browser tool and `--snippet` |
| `measure` times out | The page never goes quiet, or it blocks headless browsers | Raise `--wait`, or measure through your agent's browser |
| Structure score is low on a page that looks right | The two measurements are of different states (logged in, a banner, another tab) | Measure both in the same state and at the same width |
| `pains` won't write pains.md | A quote isn't word for word in its row, or a row id doesn't exist | Fix each line it lists, then run it again |
| `design` refuses the accent | It's in the same color family as the original's brand color | Pick a different hue family, not a nearby shade |
| `sweep` flags a mention you need | An "Import from <original>" feature, say | Add the file or the exact string to `allow` in remaster/brand.json, or mark the line `remaster-allow` |
| `domain` says unknown | The registry has no RDAP server and DNS didn't answer | Check at a registrar |
| `/remaster:clone` doesn't appear | The plugin isn't installed or enabled | Open `/plugin` to check, then run `/reload-plugins` |
| Gemini CLI stops with `IneligibleTierError` | Google retired the free individual sign-in for Gemini CLI | Sign in with a Gemini API key or a paid plan, then run it again |
| `interact` finds no reveals on a page that clearly animates | The animation runs on a canvas, or in JavaScript after the sweep looked | Mask that region and judge it from the scroll screenshots |

## 16. FAQ ❓

<details>
<summary><strong>Is it legal to clone an app?</strong></summary>

Rebuilding what an app does is how most software competes: features, flows and interaction patterns aren't ownable the way code, words, images, logos and brands are. Remaster rebuilds the first and refuses the second, and its checks hold that line. It is not legal advice; when a launch depends on it, talk to a lawyer in your country.
</details>

<details>
<summary><strong>Does it only work with Claude Code?</strong></summary>

No. It installs natively as a Codex plugin and a Gemini CLI extension, and `npx -y @thenavidm/remaster install` puts it where Claude Code, Codex, Cursor and Gemini CLI all look. The method is markdown and the scripts are plain Node, so any agent that reads Agent Skills can run it. The two agents for parallel builds and design reviews are Claude Code's; elsewhere the skill does that work in one thread.
</details>

<details>
<summary><strong>Do I need API keys or paid services?</strong></summary>

No. Research uses public endpoints (Apple's lookup and reviews feed, the Hacker News search API, the domain registries), and measuring uses Playwright, which is free. Building the clone needs whatever its stack needs, such as a Stripe account for payments, and you create those yourself.
</details>

<details>
<summary><strong>Can it copy a site pixel for pixel?</strong></summary>

Only your own, in migrate mode, where copying is the point and the bar is 95% alike with every old URL still working. In every other mode it rebuilds structure and behavior and changes the identity.
</details>

<details>
<summary><strong>Will my clone look like the original?</strong></summary>

It will feel familiar, which is what makes switching easy: the same layout logic, rhythm and flows. It won't look like the original, because the palette, type, icons, images and words are yours, and the lint and the sweep hold them away from the original's. It won't look generated either: the critic rejects the generic page.
</details>

<details>
<summary><strong>What if the research says not to build it?</strong></summary>

Then you saved weeks. A no-go is a real outcome of the research stage, with the evidence for it. Run it on any app you're only thinking about cloning; the teardown alone is worth having.
</details>

<details>
<summary><strong>Can it look at the paid parts of the app?</strong></summary>

Only through your own account, with you signed in, in your own browser. If the app's terms forbid using your account to build a competitor, it tells you and sticks to public sources. It never gets past a login or a paywall.
</details>

<details>
<summary><strong>Does it work for mobile apps?</strong></summary>

Yes. It reads the App Store listing, screenshots and reviews, maps the app from those, its help center and your own recordings, and builds with Expo by default. Google Play reviews are read by hand, since there's no public API for them.
</details>

<details>
<summary><strong>Why one skill instead of one per step?</strong></summary>

Every installed skill's description loads into every session, and narrow skills trigger on each other's words ("deploy it", "test this"). One skill with four stages, a state file and a gate per stage is cheaper to carry and can't be called out of order.
</details>

## 17. Credits 🙏

| Dependency | Used for | License or terms |
|---|---|---|
| [Node.js](https://nodejs.org) | Runs every script | MIT |
| [Playwright](https://playwright.dev) | Measuring pages, borrowed from your project when present | Apache 2.0 |
| [FFmpeg](https://ffmpeg.org) | Frames from screen recordings, installed separately | LGPL / GPL |
| [DESIGN.md](https://github.com/google-labs-code/design.md), by Google Labs | The format `remaster design` writes | Apache 2.0 |
| Apple's iTunes Search API and customer reviews feed | App Store listings and reviews | Apple's terms |
| The [Hacker News Search API](https://hn.algolia.com/api), by Algolia | Hacker News comments | Algolia's terms |
| RDAP, through [IANA's bootstrap file](https://data.iana.org/rdap/dns.json) | Domain checks | The registries' terms |
| Cloudflare DNS over HTTPS | Domain checks for endings without RDAP | Cloudflare's terms |

## Questions

Run into a problem or have a question? [Open an issue](https://github.com/thenavidm/remaster/issues) and I will help.

## About the author 👋

Navid Moazzez is a leading AI business strategist, and the host of the AI Creator Summit, watched by 100,000+ creators. He helps creators and founders master AI and build their own AI Operating System (AI OS) to automate their business and life. Remaster is one of the free tools he creates for creators and founders to use in their own workflows.

**Links**

- Personal website: [navid.me](https://navid.me)
- Link in bio: [navid.bio](https://navid.bio)
- Navid Media: [navid.media](https://navid.media)
- YouTube: [@thenavidm](https://youtube.com/@thenavidm?sub_confirmation=1) and [@thenavidai](https://youtube.com/@thenavidai?sub_confirmation=1)
- X: [@thenavidm](https://x.com/thenavidm)
- Instagram: [@thenavidm](https://instagram.com/thenavidm)
- LinkedIn: [thenavidm](https://linkedin.com/in/thenavidm)

## License ⚖️

Apache 2.0, see [LICENSE](https://github.com/thenavidm/remaster/blob/main/LICENSE). Free to use, modify, and share.

Not affiliated with, endorsed by, or connected to Apple, Y Combinator, Algolia, or any product you study or clone with it.

---

© 2026 [Navid Media](https://navid.media?utm_source=github&utm_medium=referral&utm_campaign=remaster&utm_content=readme). Made with ❤️ by [Navid Moazzez](https://navid.me?utm_source=github&utm_medium=referral&utm_campaign=remaster&utm_content=readme).
