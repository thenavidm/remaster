# Stage 3b: verify

Verification is a loop, not a pass at the end: measure, compare, review, fix the highest-impact problem, measure again. A screen is done when its checks pass, not when it compiles.

## The loop for each key screen

```bash
remaster measure http://localhost:3000/<route> --as clone --name <original's name> --widths 1440,390
remaster diff remaster/research/measure/<name>@1440.json remaster/verify/measure/<name>@1440.json
remaster diff remaster/research/measure/<name>@390.json remaster/verify/measure/<name>@390.json
```

Then look at both screenshots, run the critic, and fix what they say, biggest first.

## Structure: the diff

`remaster diff` matches landmarks, headings, buttons, inputs, media, lists and tables between the two pages by role, position and size, in page order. It reports:

- **the structure score**: how much of the original's skeleton the clone has, weighted toward what users look for (header, navigation, the main heading, inputs, primary buttons);
- **missing**: each element of the original the clone lacks, most important first, with where it was ("top bar, right", "first screen, left");
- **moved across the first screen**: something that was above the fold and isn't, or the reverse;
- **section order**, and what the clone added (fine when those are your fixes).

The bars, by mode: app 60, site 80, migrate 90. App mode's bar is lower on purpose: a familiar skeleton helps switchers, but the clone is meant to improve on the original's layout. Feature mode skips it, since a feature follows the host app's layout.

## Layout and pixels

When both screenshots sit next to the JSON files, `diff` also compares them, after aligning the pages row by row so a section that grew shifts what follows instead of failing it.

- **Layout** (the default) compares where edges are and ignores color, so the rebrand doesn't count against you. Use it in site mode to see where the structure drifted.
- **Pixels** (`--pixel`) compare exact colors. Use it in migrate mode: the bar is 95%.
- **Moving content** (carousels, clocks, live counters, randomized testimonials) differs between any two captures, even of the same page. Measure the original twice and pass `--calibrate <second screenshot>`: the original's own score against itself sets the bar. Or mask the region with `--mask x,y,w,h`.

The heatmap in `remaster/verify/diff/` shows the original with every differing cell in red. Open it; it is faster than reading coordinates.

## The design critic

Every key screen, at 390 and 1440, gets a verdict. In Claude Code, dispatch the `remaster:design-critic` agent with the screenshot paths, the screen's purpose from recon.md, and DESIGN.md. Elsewhere, follow [critic.md](critic.md) yourself, looking at each screenshot. Save every verdict to `remaster/verify/critic.json`:

```json
{
  "screens": [
    {
      "screen": "S07 booking page",
      "viewport": 1440,
      "file": "remaster/verify/measure/booking@1440.png",
      "hardRejects": [],
      "scores": { "hierarchy": 4, "rhythm": 4, "type": 4, "color": 5, "fit": 4, "craft": 4, "character": 4 },
      "total": 29,
      "pass": true,
      "fixes": [{ "issue": "Slot buttons float with no grouping", "fix": "Group by morning and afternoon with a label", "where": "slot grid" }]
    }
  ]
}
```

A screen passes with no hard rejects, no single score under 3, and a total of 28 (app and feature) or 30 (site) out of 35. Apply the fixes and review again until it passes.

## Behavior: the interaction sweep

Run the same sweep on the clone and set it beside the original's:

```bash
remaster interact http://localhost:3000/<route> --as clone --name <original's name>
remaster interact compare remaster/research/measure/<name>@1440.interact.json remaster/verify/measure/<name>@1440.interact.json
```

The header should behave the same on scroll, sections should arrive the same way, and controls should answer hover. Keyboard focus is where a clone can win outright: every Tab stop with a visible focus is measured, and a clone that shows fewer than the original fails `compare`'s check. Put the counts in beat.json as a metric ("Tab stops without a visible focus", lower is better).

## Words

```bash
remaster copy remaster/verify/measure/*.json
```

It reads the text each page rendered and flags placeholder text, the original's name, proof without a source (user counts, ratings, "trusted by", "#1"), the words and moves that read as AI-written, em dashes, emoji and exclamation marks on controls, buttons that say "Submit", the same call to action repeated, and errors that don't say what to do next. The bar: no errors, three warnings or fewer a page.

Real proof goes in `remaster/launch/proof.json` with its source:

```json
{ "claims": [{ "text": "1,200 teams", "source": "the user's Stripe dashboard, 2026-10-01" }] }
```

## The clean-room sweep

```bash
remaster sweep
```

It reads `remaster/brand.json` (the original's names, domains and colors; `init` fills in the first two) plus the brand colors measured from the original, and searches the project for its names (also inside identifiers), its domains, colors within a hair of its brand colors, sentences too close to its public words, images identical to the research captures (its logo included), SVG icons, logos and illustrations drawn with the original's own paths (even after reformatting), and any request the running clone makes to the original's servers. Exit 1 means something is left. A mention that must stay goes in brand.json `allow`.

## Parity and better-than-original

```bash
remaster parity
```

Must 3, should 2, could 1; partial counts half; skips and fixes aren't parity. It prints the verdict, the weakest areas and what's missing in build order.

"Better" is measured, not claimed. Record each comparison in `remaster/verify/beat.json`, measured the same way on both:

```json
{
  "metrics": [
    { "name": "Clicks to book a meeting", "original": 7, "clone": 4, "better": "lower", "source": "F01 happy path, both walked 2026-10-04" },
    { "name": "Largest contentful paint, booking page (ms)", "original": 2400, "clone": 1100, "better": "lower", "source": "Lighthouse mobile, 3 runs median" },
    { "name": "Accessibility issues on the booking page", "original": 9, "clone": 0, "better": "lower", "source": "axe scan" }
  ]
}
```

Good metrics: clicks on the core flow (from the flows in recon.md), load speed (Lighthouse or WebPageTest, same settings on both), accessibility issues (axe, or the `a11y` block in each measurement), page weight, steps to cancel. The verdict "better than the original" needs: shippable, the planned fixes built (3, or all of them when fewer are planned), at least one measured win, and no measured loss.

## Tests and bugs

- **Plan:** for every flow F01, F02, the happy path, then the edge cases that apply: empty input, very long input, emoji and accents, double submit, back and refresh mid-flow, two tabs, expired session, a second user's data (must be invisible), time zones and daylight saving, slow network, offline, keyboard only, 390px. Then the negative cases: wrong password, declined card (Stripe's test card `4000 0000 0000 0002`), no permission, a deleted record.
- **Automate** with Playwright, one spec per flow, against the local server with seed data. Select by role and label (`getByRole('button', { name: 'Book' })`), never by class. Fail on console errors and 5xx responses, and run an axe scan on each screen.
- **By hand**, what can't be automated: emails arriving, OAuth with real providers, payments end to end. Drive it with a browser tool and screenshot each step, or give the user the checklist.
- **Bugs** go in `remaster/verify/bugs.csv` (`id,severity,status,title,steps,expected,actual,evidence,fixed_in`). S1: data loss, a security hole, payments wrong, the core flow blocked. S2: a feature broken with no workaround. S3: broken with a workaround, or visibly wrong. S4: cosmetic. Only reproduced bugs; a hunch goes in a separate to-check list.
- **Fix** S1 and S2 first: a failing test, the fix, the test passing. Never test against the original's servers.

## Migrate mode

- `remaster diff <old>.json <new>.json --pixel` for every page, with `--calibrate` where something moves. The bar is 95%.
- `remaster urls <old sitemap or URL list> --new <new site>`: every old URL must end in 200 within one redirect, never go noindex, and keep its title, description and canonical. `--strict` fails on any head tag change.

## Gate

```bash
remaster gate build
```

It checks the clone measurements, the structure scores, the critic verdicts, the copy check, a clean sweep, parity, no open S1 or S2 bugs, and in migrate mode the pixels and the URLs.
