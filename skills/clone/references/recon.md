# Stage 1b: the map

Everything else builds from this map. A missed state is a state nobody builds; a misread interaction is a rewrite. Take the time here.

## 1. Sources first

Log every source in `remaster/sources.csv` (`id,kind,url,title,read_at,notes`). The scripts log their own. In order of value:

| Source | What it gives | How |
|---|---|---|
| Help center and docs | The most complete feature list there is: every setting, limit and edge case its own team wrote down | `remaster crawl <help url> --max 150`; add `--sitemap` for big ones, `--render` for docs built in JavaScript |
| Public API reference | The data model, almost for free | Read it; note entities, fields and limits |
| Pricing page | Which features matter: they gate them | Read it; note plan limits with the date |
| Store listing | Screenshots of key screens, the pitch | `remaster store lookup <id>` |
| Public pages | The design system, the skeleton, the words, the hosts it loads | `remaster measure <url>` for each key page |
| Walkthrough videos | Real flows, click by click | Watch and take notes with timestamps; `remaster frames` on recordings the user made |
| The user's own account | Every real state, with the user driving | Their browser tool, them signed in; run the measure snippet on each screen |
| Changelog | What is new and what the team thinks matters | Read it |

Before mapping, search GitHub for an open-source project that already does this ("open source alternative to <name>"). Check its license. A permissive one may be worth building on, and any of them is a data model to learn from. Use what its license allows and credit it as its license says.

## 2. Find the interaction model first

For every screen and section, decide what drives it before anything else: static, click, hover, scroll, time, drag or keyboard. Scroll the page slowly before clicking anything. Building click tabs for what is really a scroll-driven section is the single most expensive mistake in a clone: it is a rewrite, not a fix.

Then sweep each screen. Most of it runs on its own:

```bash
remaster interact <url>
```

It scrolls, hovers and tabs through a public page in a clean browser, without clicking anything, and reports whether the header changes once the page scrolls, which elements fade or slide in as they arrive, what stays pinned, what every control does on hover and how fast, and which controls show a visible focus. It also saves a screenshot at 0, 25, 50, 75 and 100% down the page. Clicks are left to you and the user, by hand: a click can submit or change something on the original.

What the sweep covers, and what to finish by hand:

- **Scroll:** does the header change, do sections reveal, is anything pinned or snapped, is there a smooth-scroll layer (`tech.smoothScroll` in the measurement)?
- **Click:** every button, tab, pill, menu and card. Record what changes, and the content of every tab, not just the first.
- **Hover and focus:** what changes, and how long it takes.
- **Widths:** 1440, 768 and 390. What stacks, hides or moves, and roughly where it breaks.
- **States:** empty, loading, filled, error, no permission, very long content, offline.

## 3. Write the map

Fill `remaster/research/recon.md` (the template is there). Each row names its source.

- **Screens** S01, S02...: route, purpose, key components, states seen, interaction model.
- **Flows** F01, F02...: the goal, the screens it passes through, the clicks on the happy path (the number to beat), the edge cases.
- **Components:** every repeated part, its variants, states and where it's used. This is the design stage's list.
- **Data model, inferred:** entities, fields and relations, each with its evidence and a confidence of high, medium or guess.
- **Integrations:** each with its official API, the scopes needed, the provider's review process and limits.
- **What can't be cloned:** the network, licensed content, data it owns, partner deals, hardware, regulated licenses.
- **Size:** S a weekend, M a few weeks, L a quarter, XL rescope it. No promises of a perfect clone.

## 4. The feature matrix

Write `remaster/features.csv`:

```csv
id,feature,area,priority,original,clone,source,notes
F01,Public booking page,booking,must,yes,no,https://help.example.com/booking-pages,
F02,Round robin for teams,teams,should,yes,no,https://help.example.com/round-robin,
F09,Partner marketplace,platform,could,yes,skip,https://example.com/partners,their network; can't be cloned
X01,Flat team pricing,billing,must,no,no,pains.md per-seat-pricing,the opening
```

- **priority:** must (the core loop and what the love themes protect), should, could.
- **original:** yes for what the original has; no for the fixes from research (X ids).
- **clone:** starts at no; becomes yes, partial (with a note) or skip (with the reason) as you build.
- **source:** where you saw it. A row with no source fails the gate.

## By mode

- **site:** map sections instead of screens: order, purpose, layout, motion, and the interaction model of each. Measure every page in scope at 1440 and 390.
- **feature:** map only the feature's screens and flows, then read the user's own codebase: where the feature will live, its components, its data layer, its DESIGN.md. The feature fits the host, never the other way round.
- **migrate:** measure every page (`remaster measure` for each URL), save the list of URLs (the sitemap is fine), and note forms, embeds, redirects, analytics and anything server-side that has to move.

## Gate

```bash
remaster gate research
```

It checks the sources, the reviews and verified pains (app and feature), the verdict, the measurements, the filled recon map, and a feature matrix with sources and must-haves.
