# Stage 1a: the switch case

A straight copy has no reason to exist. Before mapping a single screen, find the reason someone would leave the original for the clone, in its users' own words. The answer decides what gets built, and sometimes that nothing should be.

This half of stage 1 is for app and feature mode. Site mode can skip it unless the user wants positioning; migrate mode skips it.

## 1. Collect

Aim for 100 or more reviews across at least three sources, newest first. Every row goes in `remaster/research/reviews.csv` (`id,source,url,date,rating,text`), text copied exactly, with the link. A row without a link is dropped by the tools.

| Source | How |
|---|---|
| App Store | `remaster store lookup "<name>"` finds the id; `remaster store lookup <id>` saves the listing and screenshots; `remaster store reviews <id> --countries us,gb,ca,au` pulls up to 500 reviews a country from Apple's feed |
| Hacker News | `remaster hn "<name>"`, then `remaster hn "<name> alternative"` and `remaster hn "switched from <name>"` |
| Reddit | Search "<name> alternative", "<name> sucks", "switched from <name>", "<name> vs". Copy rows by hand with permalinks, or use any Reddit research tool you have that returns verbatim quotes with permalinks, within Reddit's terms |
| G2, Capterra, Trustpilot, Google Play | Read in the browser; filter to 1 to 3 stars too. Copy each row with its link. Never scrape these |
| Its own feature-request board or roadmap | The public requests and their vote counts |
| Its changelog | What it already shipped, so you don't "fix" what is fixed |
| Its public pricing page | Every plan and price, with the URL and the date read. Prices change |

Read the 3 and 4 star reviews too. "Love it, but..." is where the best fixes hide.

## 2. Read and group

Read every row. Group them into themes, and give each theme a kind:

- **hate**: a complaint about something the product does ("charged twice", "sync breaks")
- **missing**: a feature people ask for by name ("no SMS reminders")
- **unsolved**: a job or a group the product ignores ("useless for therapists", "not built for teams of 3")
- **love**: what people praise. The clone has to keep it, or they won't switch

Write `remaster/research/analysis.json`:

```json
{
  "themes": [
    {
      "id": "per-seat-pricing",
      "kind": "hate",
      "label": "Per-seat price jumps",
      "summary": "Small teams hit a paywall when they add the third person.",
      "rows": ["as-us-1461", "as-gb-1388", "hn-41022811"],
      "quotes": [{ "row": "as-us-1461", "text": "the exact words from that row" }]
    }
  ]
}
```

Quotes are substrings of their row, word for word. Pick the ones a stranger would understand without the rest of the review.

## 3. Check it

```bash
remaster pains
```

It drops rows without links, checks every row id and every quote word for word, counts reviews and sources per theme, weights low ratings and recent reviews higher (reviews older than 18 months count half), marks a theme with fewer than 3 reviews or a single source as thin, and lists the 1 and 2 star reviews no theme covers. Read that last list by hand; it is often the best part.

It writes `research/pains.md` only once everything checks out, so an unverified quote never reaches a report. Fix what it flags and run it again.

Never present three angry comments as a trend. A thin theme is reported as thin.

## 4. The verdict

Fill `remaster/research/verdict.md` (the template is already there):

- **Decision:** go, no-go, or go rescoped. The evidence, in two or three sentences.
- **The opening:** three angles from the strongest themes, each as "For {who} who {hate this, in plain words}, {the product} {does this instead}", with its evidence line. Recommend one.
- **Must keep:** from the love themes.
- **Fixes to build first:** three to eight, picked by evidence times how cheaply they can be built. Each becomes a row in features.csv with `original` set to `no`.
- **Can't be cloned:** the network, the content, licenses (from recon).
- **Risks:** official API limits, provider reviews (Google's OAuth verification for calendar scopes takes weeks), the terms of the user's own account.

Then ask the user for the decision and the angle. This is checkpoint 2. A no-go is a good outcome: it saved them weeks.

Price and billing complaints go to the launch stage's pricing.

## What never happens

- No invented reviews, quotes, ratings, counts or sources. If a source can't be reached, say so and move on. If there are 14 reviews, say 14.
- Reviewers' words are research. They never go on the landing page as testimonials.
- No fake reviews, ever, for the clone or against the original.
