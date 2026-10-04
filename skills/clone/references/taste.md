# The taste floor

Read this before writing markup, not after. Every rule here is a check on the rendered result, not on intention: "I used a spacing scale" is not evidence; a measured value is.

## Why agent output looks generated

Ask any coding agent for a site and you get the same one: a centered hero with a gradient headline, one typeface at three sizes, a three-column grid of rounded feature cards, a pricing table with the middle tier highlighted, a logo strip of companies that never used it. Rewording the prompt doesn't fix it, because it isn't a prompting problem. A designer has three things the agent lacks:

1. **References.** Thousands of real interfaces absorbed. Here: the original's measured system, the direction the user picked, and the screens from recon.
2. **Constraints.** Decisions made once and inherited everywhere. Here: DESIGN.md.
3. **Eyes.** Looking at what was built. Here: every screen measured at 390 and 1440 and reviewed by the critic before it counts as done.

## The tells to design out

The critic rejects a screen that leans on three or more of these:

- A centered hero with a gradient or gradient-filled headline.
- Violet-to-blue gradients, glowing buttons, neon outlines.
- One typeface at three sizes for everything.
- Three equal columns of icon, heading and two lines of text in rounded cards.
- Cards inside cards. Every section in a card.
- Emoji as icons, or a different icon style per section.
- Everything centered, everything the same width, every gap the same.
- Glassmorphism on everything, a blurred blob in the background.
- Stock 3D shapes, isometric illustrations of nobody doing nothing.
- A row of logos or "trusted by" numbers nobody can verify.
- Buttons that say "Get started" five times.

## Spacing

Rhythm comes from contrast between tight and generous, never from one value repeated until everything weighs the same.

- Use the spacing base from DESIGN.md. A 4px base gives the useful middle steps an 8-only scale misses.
- **More space above a heading than below it.** The gap belongs to the boundary between sections, not to the heading and its body. Getting this backwards makes a page read as a list.
- Group by proximity before reaching for a container. If you added a border to show two things belong together, the spacing was wrong first.
- Section padding shrinks on a phone. Desktop air on a 390px screen is a scroll tax.
- Correct against the render, not the number: equal padding around uneven shapes looks wrong.

## Type

- **Two families at most.** Display carries the voice, text carries the reading. A third is a costume.
- Tracking tightens as size grows. Display type at default tracking reads loose.
- Body measure 45 to 75 characters. Line height falls as size rises: display around 1.0 to 1.1, body around 1.5 to 1.6.
- Light text on dark needs a little more line height, a touch more tracking and one step more weight.
- `text-wrap: balance` on headings, `pretty` on body text.
- Step the hero down below about 700px wide. A desktop display size wraps a normal headline to six lines on a phone.
- Inter for everything reads as a non-decision. Give display text its own face. Serif is not a synonym for premium; use one when the product is genuinely editorial and you can say why.

## Color

- **Roles, one accent.** Canvas, surface, ink, ink-soft, accent, on-accent, border. The accent owns the one action that matters on each screen; scattered accents are confetti.
- Secondary text is tinted from the ink or the canvas, never a flat gray. `#888` on a warm ground looks dirty.
- No pure black. Off-black has air in it.
- Contrast, measured: body text 4.5:1, large text 3:1, control edges and focus rings 3:1. `remaster design` checks the tokens; the critic checks the screens.
- The traps: violet gradients unless the brand asks for them; cream, brass and espresso for every craft or wellness brand.

## Depth

- Shadows have an offset and a blur and are tinted to the canvas. A zero-offset colored halo is decoration, not depth.
- A 1px top highlight sells a raised surface better than more blur.
- Overlap establishes depth for free.
- Three elevation steps at most. If everything is raised, nothing is.

## Components and cards

- A card has to earn its border. Ask what it does that space or a hairline couldn't.
- Never nest cards. Never three equal feature cards as a page's structure; use an asymmetric grid, a zigzag of two, a rail, or plain type on space.
- One corner scale across the product. Pill buttons on a square-card page is broken, not eclectic.
- A grid with an empty last cell was planned wrong. Reshape it.

## Product screens are not landing pages

App screens are dense, quiet and fast. They earn trust by getting out of the way.

- Density matches the task: tables, lists and forms carry data, not air.
- One primary action per screen, in the accent. Secondary actions are quieter.
- Keyboard first where power users live: shortcuts, a command menu, focus that moves where they expect.
- Tables: aligned numbers, sticky headers, real empty and loading states, sensible column widths at 1440 and a real layout at 390 (not a squashed table).

## States are designed

- **Empty:** says what goes here and gives the one action that fills it. "No bookings yet. Share your link to get the first one."
- **Loading:** skeletons shaped like the content when the original uses them; never a spinner on a blank page for more than a moment.
- **Error:** what happened and what to do next, in plain words. "That card was declined. Try another card or contact your bank." Never "Oops, something went wrong."
- **Long content:** a 60-character name, a 400-word description, 2,000 rows. The layout holds.
- **No permission, offline, slow network:** each has a screen.

## Motion

- Motion explains: where something came from, what changed, what is loading.
- 150 to 250ms for small changes, ease-out in, ease-in out. Things you drag follow the pointer and settle with a spring; things you flick keep their speed.
- Interruptible: a second click mid-animation goes from where it is now.
- `prefers-reduced-motion` turns movement into fades, never into nothing.

## Words

The words are part of the design.

- Every label written fresh, in the user's voice. Buttons say the action and its object: "Send invoice", not "Submit".
- Specific beats grand: "Syncs in about 2 seconds" beats "Seamless sync".
- No invented proof: no user counts, ratings, logos or testimonials without a source in `remaster/launch/proof.json`.
- `remaster copy` checks rendered pages and launch copy for AI tells, invented proof, placeholders, weak buttons and repeated calls to action.

## Imagery

- Real product screenshots of the clone beat any illustration.
- An open icon set with one stroke weight everywhere.
- Generated or commissioned images in the brand's direction, never traced from the original's.
- `width` and `height` on every image so nothing jumps while it loads.

## The loop

Build a screen, measure it at 390 and 1440, look at both screenshots, run the critic, fix the highest-impact problem, measure again. A screen is done when the critic passes it, not when the code compiles.
