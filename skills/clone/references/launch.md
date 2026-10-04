# Stage 4: launch

Nothing launches under the original's identity, nothing launches as a straight copy, and nothing goes live without the user's go.

## 1. The name

Skip this in feature and migrate mode; the brand is the host's or the user's own.

Read the opening in verdict.md. Generate 20 candidates across styles: descriptive (Booklink), compound (Slotwise), invented (Calvo), metaphor (Harbor), verb (Book). Cut to five:

- **Not confusingly similar to the original** in sound, look or meaning, or to any other product in the category. That is the test trademark offices use. No puns on its name, no "-ly" twin.
- Short, spellable after hearing it once, no awkward meaning in the big languages.
- It says something about the opening, or at least doesn't fight it.

Run the checks for real, and record each one in `remaster/brand.json` `checks` with the date and result:

| Check | How |
|---|---|
| Domains | `remaster domain <name1,name2,...> --tlds com,app,io,co` reads the registries |
| App Store and Google Play | Search the exact name in both |
| Handles | X, Instagram, TikTok, LinkedIn, GitHub |
| US trademark | tmsearch.uspto.gov, classes 9 and 42 for software |
| EU and others | TMview (tmdn.org), the WIPO Global Brand Database |
| The web | "<name> + <category>" |

```json
{
  "name": "Booklink",
  "avoid": ["Calendly", "Calendly LLC"],
  "domains": ["calendly.com"],
  "colors": ["#006bff"],
  "allow": ["src/import/from-calendly.ts"],
  "checks": [
    { "check": "booklink.com", "result": "taken, registered 1998", "date": "2026-10-04" },
    { "check": "USPTO classes 9 and 42", "result": "no live marks for BOOKLINK", "date": "2026-10-04" }
  ]
}
```

Never write "available" for a check nobody ran. These are screening checks, not legal clearance: before spending money on the name, a trademark lawyer runs a proper search. Show the five with their checks and your pick first. This is checkpoint 4.

## 2. The brand around it

- **Palette and type** are already in DESIGN.md from the design stage; the sweep and the design lint keep them away from the original's.
- **Logo brief** for whoever makes it (the user, a designer, an image model): the idea in one line tied to the name and the opening; wordmark, symbol plus wordmark, or monogram; works at 16px as a favicon and at 1024px as an app icon (no transparency for iOS); deliverables: SVG, the app icon, a favicon set, a 1200x630 share image. Put the original's mark next to the drafts: no shared shape, color pair or letterform trick.
- **Voice:** three words, each with what it doesn't mean ("direct, not blunt"), five do and don't pairs, then the ten most-seen strings rewritten in it (sign up, the main button, empty states, the confirmation, the main error).

## 3. The landing page

Build it in the project, section by section:

1. **Hero:** the opening as the headline (what it does, for whom), one line under it, one button, a real screenshot of the clone.
2. **The problem:** the top two hate themes, in plain words. Paraphrase; reviewers' words are research, never testimonials.
3. **How it works:** three steps from the core flow.
4. **Features:** lead with the fixes. Parity is the price of entry, not the pitch.
5. **Pricing:** from step 4.
6. **FAQ:** the real objections, including importing from other tools if the clone has an importer.
7. **The last call to action.**

If the user has a skill for scroll-driven or immersive pages, use it here; this is the one page where a designed moment pays off. Save the copy as `remaster/launch/landing.md` and check it:

```bash
remaster copy remaster/launch/landing.md
```

Then measure the built page and run the critic on it at 390 and 1440, with the site-mode bar of 30.

Proof is real or absent. An empty proof section beats a fake one. Real beta users, with permission, go in `remaster/launch/proof.json` with their source.

## 4. Pricing

`remaster/launch/pricing.md`:

- The original's public pricing and two or three alternatives in one table, each with the URL and the date read.
- What reviewers said about price and billing, from pains.md, with counts.
- The model: a free plan or a trial, flat or per seat, monthly and yearly. Three plans at most, named for who they're for.
- Fix the billing complaints in the product itself: one-click cancel, clear renewal emails, no surprise per-seat jumps.
- The Stripe products and prices to create. The user creates them.

## 5. The store listing

Fill `remaster/launch/listing.json` (template in `templates/listing.json`) and check it:

```bash
remaster listing
```

It checks App Store limits (name 30, subtitle 30, promotional text 170, keywords 100, description 4,000) and Google Play's (title 30, short description 80, full description 4,000), counting the way the stores do, and flags the original's name anywhere, ranking and price claims in short fields, emoji in the name, and wasted keyword characters. The limits change; check App Store Connect and the Play Console when uploading.

Apple's guideline 4.1 rejects copycats. The fixes and the new brand are what get through review: show them in the first screenshots and the first lines of the description. Also prepare the screenshots at the sizes the consoles ask for, privacy labels and Google's data safety form, the privacy policy and support URLs, the age rating, and review notes with a demo account.

## 6. The launch video and the teardown

- **Video:** a 30 to 60 second screen recording of the core flow on the clone, with the fix as the moment that matters. If the user has a tool that turns a website into a video, point it at the deployed clone.
- **Teardown:** `remaster teardown` writes `remaster/TEARDOWN.md` from the verified research only: what users say with linked quotes, the verdict, how the original is built, its design system as measured, and every source. It is content the user can share or publish as is.

## 7. Ship

**Preflight.** Every one must pass, and the results go in `remaster/launch/deploy.md`:

```bash
remaster gate build
remaster gate launch
npx playwright test
npm run build
```

Plus by hand: no open S1 or S2 bugs, the privacy policy and terms live (listing every processor), a cookie banner if non-essential cookies are used in the EU or UK, account deletion working, and the favicon, page titles and share image are the user's.

**Production.** A separate production database, never the dev one, with backups on and migrations run by the deploy. Environment variables set on the host from `.env.example`; live keys only there. Stripe in live mode: products and prices recreated, the production webhook and its secret added, one real purchase made and refunded. OAuth redirect URLs and origins updated at every provider. The email sending domain verified, with SPF, DKIM and a DMARC record starting at `p=none`.

**Host and domain.** Deploy the way the user's profile says. Without one: Cloudflare Workers, with the repo connected so `main` deploys and pull requests get previews. The user buys the domain; write the exact DNS records for them, pick apex or www as canonical and redirect the other.

**Watch it.** Error tracking, an uptime check on the home page and the core flow, privacy-friendly analytics, and an alert to the user. Then walk the core flow on the live site, and ask the user to do it on their phone.

**Mobile.** Expo: `eas build`, then `eas submit` to TestFlight and Play internal testing. The user owns the developer accounts. Beta first, then review with the listing.

**The go.** Show the preflight results and ask. This is checkpoint 5. Nothing deploys, publishes or charges a card without the user's explicit go for that step.

## Gate

```bash
remaster gate launch
```

It checks a name with recorded checks, better than the original (app mode), clean launch copy, a passing store listing if there is one, and a clean sweep.
