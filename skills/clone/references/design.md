# Stage 2: design

Rebuild the system, never the identity. The original's spacing rhythm, type steps, density and layout widths are what make a switcher feel at home, and they're measurements anyone may take. Its palette, typeface, brand color, icons and imagery are its identity, and they change.

## 1. Measure the original's system

```bash
remaster measure <url> --widths 1440,390      # each key page, if stage 1 didn't
remaster tokens
```

`tokens` reads the measurements and writes `remaster/design/measured.json` and a readable `measured.md`: color roles (canvas, surface, ink, ink-soft, accent, on-accent, border), the brand colors to stay away from, fonts and the type scale, the spacing base, corners, shadows, motion, layout widths, the breakpoints the stylesheets use, and the logo (saved as research so the sweep can recognize a copy).

It reads the colors as rendered, so oklch(), gradients and translucent text all come back as what the eye sees, and it ignores colors that only appear inside icons (usually someone else's logo on a sign-in button).

## 2. Keep, change, add

| Keep (the system) | Change (the identity) | Add (the taste) |
|---|---|---|
| Spacing base and rhythm | Palette and the brand hue | One signature detail someone would remember without the logo |
| Number of type steps, body size | Typefaces | States the original never designed |
| Density, content widths, layout grid | Icons, illustrations, imagery | Motion that explains instead of decorates |
| Interaction patterns | Corner and shadow character | The fixes from research, visible on the screen |

If the user has a brand already (their profile, their own DESIGN.md), it replaces the change column entirely. In feature mode, the host app's DESIGN.md is the design; skip to step 5.

## 3. Three directions, the user picks one

Write three directions in words, never as mockups first. Each one:

- **The idea** in one line, tied to the opening from research. "Calm and exact, for people who schedule other people's time."
- **Palette:** the hue family and why, warm or cool neutrals, one accent.
- **Type:** a display face and a text face, and why this pairing fits this product.
- **Shape:** the corner scale and the shadow character, flat or lifted.
- **Density:** tighter or airier than the original, and where.
- **Motion:** quick and functional, or soft and physical.
- **Signature:** the one detail that's theirs.

Make them genuinely different from each other, not three tints of one idea. Check [taste.md](taste.md) against each: no direction may lean on an AI default (violet gradient, cream and brass for every craft brand, Inter for everything).

Show the three to the user with your recommendation first. This is checkpoint 3.

## 4. Write the design

Copy `templates/design.json` to `remaster/design/design.json` and fill it with the chosen direction: colors by role (plus `dark` if the product has a dark theme), typography by role, the corner scale, the spacing scale, elevation, motion, components with token references like `{colors.accent}`, a note per token on what it's for, the prose for each section, and the do's and don'ts.

```bash
remaster design
```

It checks, and writes nothing until everything passes:

- every color parses;
- text meets WCAG AA (4.5:1 for body text, 3:1 for large text and for control edges like input borders), in light and dark;
- the accent is in a different color family from the original's brand colors, and no other color sits on top of one;
- not the original's typeface, unless it's a common open font;
- the type scale has a real hierarchy, two typefaces at most, body text 15 to 18px;
- one corner scale, one spacing base;
- every component token points at a token that exists;
- the AI-default traps: a violet accent, pure black, one typeface for everything.

Then it writes `DESIGN.md` at the project root (Google Labs' format: YAML tokens, then the eight sections), and in `remaster/design/`:

- `tokens.css`: CSS custom properties and a Tailwind v4 `@theme` block;
- `shadcn.css`: the same design as a shadcn/ui theme, ready to paste over the `:root` and `.dark` blocks in globals.css (shadcn's "primary" is your accent; its "accent" is the quiet hover background);
- `tokens.json`: W3C design tokens, for Style Dictionary, Tokens Studio or a design tool.

An existing DESIGN.md that Remaster didn't write is never overwritten.

Point the coding agent at it: in Claude Code, add `@DESIGN.md` to the project's CLAUDE.md; elsewhere, a line in AGENTS.md saying every screen follows DESIGN.md.

## 5. Component specs

For every component in the recon list, one block in `remaster/design/components.md`:

```
Button
  variants  primary, secondary, ghost, danger
  sizes     sm 32px, md 40px, lg 48px
  states    default, hover, active, focus-visible (2px ring, accent), disabled, loading
  tokens    bg accent, text on-accent, radius md, type label
  a11y      a real <button>, visible focus, the label stays for screen readers while loading
  used on   S02, S07, S09
```

Every state the recon saw, plus the ones it should have had: focus, disabled, loading, error, empty.

## 6. Build the primitives first

Build the components once, in isolation, before any screen: a `/design` route (or Storybook) showing every variant and state on the real tokens. Use an accessible base where the stack has one (shadcn/ui, Radix, React Aria). Then measure that page at 390 and 1440 and run the design critic on it ([critic.md](critic.md)). A weak primitive multiplies across every screen; this is the cheapest place to fix it.

## Gate

```bash
remaster gate design
```

It checks the measured system, a design that passes every lint, and a DESIGN.md. Feature mode passes on the host app's DESIGN.md; migrate mode skips this stage.
