# Stage 3a: build

Build from the map and the specs, never from memory of the original, and never from its code.

## The stack

The user's profile wins. Without one, use this default: every part is managed, documented, cheap at zero users, and runs on one platform.

| Layer | Default | Common swaps |
|---|---|---|
| Web app | Next.js (App Router) with TypeScript | Remix, SvelteKit, Rails |
| Website or marketing site | Astro | Next.js |
| Styling and components | Tailwind v4 with tokens.css, shadcn/ui on Radix themed with shadcn.css | CSS modules, React Aria |
| Mobile | Expo (React Native) | SwiftUI, Kotlin |
| Database | SQLite on Cloudflare D1, or Postgres, through Drizzle | Prisma |
| Auth | Better Auth | Auth.js, the host's own |
| Payments | Stripe Checkout and the Customer Portal | Paddle, Lemon Squeezy |
| Email | The user's provider (Amazon SES, Resend, Postmark) | |
| Files | Cloudflare R2 | S3 |
| Hosting | Cloudflare Workers (Next.js through OpenNext) | The user's host |

Write each choice with one line of why. One database, no microservices: the clone needs the original's features, not its architecture.

In feature mode the stack is the host app's, full stop. In migrate mode the target stack is whatever the user is moving to.

## The order

1. **Shell.** Routes for every screen in the map (stubs are fine), the layout, tokens.css wired in, the primitives from the design stage, and seed data so screens have something real to show. Commit.
2. **Vertical slice.** The core loop end to end before anything else, ugly is fine. For a booking app: create an event type, open the public page, book a slot, see it on the dashboard. If the backend isn't there yet, use a fake data layer with the same function signatures, so swapping in the real one changes no screen code.
3. **Must-haves**, by area, in the order the parity report lists them.
4. **The fixes from research** (the X rows). They are why anyone switches; they come before the could-haves.
5. **Should-haves, then could-haves.**

## Every screen

1. Read its row in recon.md: purpose, components, states, interaction model, the flows through it.
2. Look at the reference screenshot for layout and hierarchy, never for pixels or words.
3. Build it from the primitives and the tokens. No raw hex or pixel values; a missing value goes into design.json, then `remaster design`.
4. **Every state:** empty, loading, filled, error, no permission, long content, 390 and 1440 wide.
5. **The basics:** semantic HTML, a label on every input, reachable by keyboard, a visible focus, alt text on images.
6. **Fresh words.** Write every label, empty state and error in the user's voice. Matching what a button does is parity; matching its sentence is copying.
7. Mark its rows in features.csv: yes, or partial with a note.
8. Measure it with the same name as the original's page so the diff can pair them:

   ```bash
   remaster measure http://localhost:3000/<route> --as clone --name <same name as the original> --widths 1440,390
   ```

9. One commit: `build: S07 booking page`. The build passes after every commit.

When a feature turns out bigger than it looked, say so in the chat and in features.csv. Never quietly ship half of it as yes.

## Parallel builds in Claude Code

After the shell and the vertical slice, independent screens can be built at once. Dispatch the `remaster:screen-builder` agent once per screen and give it, inline in the prompt:

- the screen's recon row and its spec, in full (never "go read the spec");
- the reference screenshot path;
- the components and tokens it may use, and the file it owns;
- the instruction to typecheck before it finishes.

Give each builder one screen, or one section of a complex screen. When a prompt grows past about 150 lines of spec, split the work. Merge each result, check the build passes, then dispatch the next. Two builders never touch the same file. Other agents build screens one at a time with the same rules.

## The backend

- **Official, public APIs with the user's own keys.** Never the original's private endpoints, OAuth client or proxy.
- **The user creates the accounts and the keys.** Write `.env.example` with every variable name and no values; the user fills `.env.local`.
- **Auth:** email sign up with verification, password reset, OAuth through the user's own developer apps, sign out everywhere, account deletion that actually deletes (Apple requires it for apps with sign up). Roles and teams if the map has them, with one function that answers "can this user do this to this record".
- **Data:** migrations checked in and run by a script; access rules on every table, tested with a second user who must get nothing back; a seed script with realistic fake data (no real people).
- **Payments:** Stripe Checkout and the Customer Portal, test mode until launch. Webhooks verify the signature, store the event id and are idempotent. Subscription state lives in your database, written by webhooks. Cancelling is one click.
- **Jobs:** reminders, sync and cleanup run as scheduled jobs with retries and a dead-letter log. Times are stored in UTC and shown in the viewer's time zone.
- **Integrations:** per integration, the official API, the fewest scopes that work, the provider's review process. Google's verification for sensitive scopes like Calendar takes weeks before a public launch: start it early.

## Security, every time

- Secrets only in environment variables; `.env*` in .gitignore; nothing secret in client bundles.
- Input validated on the server on every route (zod or similar).
- Authorization checked on every read and write, tested with a second user.
- Rate limits on sign in, sign up, and anything that sends email or SMS.
- Uploads: size and type limits, served from a separate domain or bucket.
- No user data in URLs or logs. `npm audit` before launch.

## Pages built on canvas, WebGL or heavy motion

Some originals draw their hero in a `<canvas>`, a 3D scene or a scroll-scrubbed video (`tech.canvas`, `tech.three`, `tech.gsap` and `tech.video` in the measurement say so). Clean-room still holds:

- **Rebuild the effect, never the scene.** Study what it does (a product that turns as you scroll, a field of particles that follows the cursor) and build your own with your own models, textures, shaders and footage. Never download or adapt the original's models, shaders or video files.
- **Pick the lightest tool that gives the effect:** CSS and a scroll timeline first, then a small canvas, then Three.js or React Three Fiber only for genuinely 3D work.
- **Give it a still fallback** for reduced motion and for devices that can't run it, and keep the page usable before the scene loads.
- **Compare it by behavior, not pixels.** Mask the canvas region in `remaster diff --mask` and check what `remaster interact` reports instead: what reveals, what pins, how the page responds.

## Feature mode

Read the host app before writing a line: its routes, components, data layer, auth, conventions and DESIGN.md. The feature uses the host's components and tokens, matches its code style, and changes nothing else. Its tests are added to the host's suite, and the host's existing tests still pass.

## Migrate mode

Copy the user's own content and assets exactly, page by page from the measurements and the URL list. Keep every URL; where one must change, add a 301 from the old one. Carry over every page's title, description, canonical, Open Graph tags and structured data, the forms and where they post, the embeds, the analytics, and the redirects the old site already had. Then `remaster diff ... --pixel` and `remaster urls`, as [verify.md](verify.md) explains.
