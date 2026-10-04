# Changelog

What changed in Remaster, newest first. The current version of each part is in [VERSIONS.md](VERSIONS.md).

## 0.1.0, 2026-10-04: the first release

- **One skill, four modes.** `/remaster:clone` clones a full app, a site or page, one feature into an app you already have, or a site you own onto a new stack. The mode sets what may be copied and which bars apply.
- **Four stages with gates.** Research, design, build and verify, launch. `remaster gate` runs a stage's checks for the project's mode, records the result, and won't call a stage done while one fails. `remaster status` names the next step.
- **Research that can't make things up.** Reviews from the App Store's public feed and Hacker News's search API land with links. `remaster pains` checks every quote word for word against its row, marks thin themes, and writes nothing shareable until it all checks out.
- **Design measured, not guessed.** `remaster measure` reads what a page renders in a clean browser: colors by use, type, spacing, corners, motion, the skeleton of landmarks and controls, the visible text and the hosts it loads. Tested on cal.com, linear.app, stripe.com, notion.com and calendly.com.
- **Taste as a gate.** `remaster design` refuses an accent in the original's color family, its typeface, failing contrast and the AI-default traps, then writes DESIGN.md. The design critic hard-rejects generic and broken screens. `remaster copy` refuses invented proof and placeholders and flags AI-written phrasing.
- **Comparison that survives a taller section.** `remaster diff` scores structure from page skeletons, and aligns two screenshots row by row before comparing layout or pixels, so one section that grew doesn't fail the rest of the page. A page against a fresh capture of itself scored 98.9% with its live testimonials masked.
- **The clean-room sweep.** Names inside identifiers, domains, near brand colors, copied sentences, research images and runtime requests to the original's servers, with an allow list for honest mentions like an importer.
- **The interaction sweep.** `remaster interact` scrolls, hovers and tabs through a page without clicking anything, and reports the header's change on scroll, what fades in, what stays pinned, every control's hover change and speed, and which controls show a visible focus, with a scroll journey of screenshots. `compare` sets the original and the clone side by side, and a clone with fewer visible focus states than the original fails it.
- **More from every measurement.** Breakpoints (reading stylesheets from other hosts directly when the page can't), the logo, saved as research, and a fingerprint of every SVG path on the page.
- **Pasted icons are caught.** The sweep recognizes the original's SVG icons, logos and illustrations in your code, even after a formatter rewrote them, and its logo file by its bytes.
- **Your design, in the formats tools read.** Besides DESIGN.md and tokens.css, `remaster design` writes a shadcn/ui theme and W3C design tokens.
- **Canvas, WebGL and heavy motion**, rebuilt clean-room: a section in the build reference.
- **Better is measured.** `remaster parity` scores the feature matrix and only says "better than the original" with the fixes built and measured wins against the original.
