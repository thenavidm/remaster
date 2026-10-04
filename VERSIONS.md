# Versions

| Component | Version | Date |
|---|---|---|
| Remaster (plugin `remaster`, skill `clone`) | 0.1.0 | 2026-10-04 |
| CLI (`skills/clone/scripts/remaster.mjs`, 20 commands) | 0.1.0 | 2026-10-04 |
| Measurement format (`browser/measure.js`, field `v`) | 1 | 2026-10-04 |
| Agents (`design-critic`, `screen-builder`) | 0.1.0 | 2026-10-04 |
| Node | 18 or later | |

## 0.1.0

The first release.

**In**

- One skill, `/remaster:clone`, in four modes: app, site, feature and migrate.
- Four stages, each ending at a gate the scripts check: research, design, build and verify, launch.
- Research: App Store lookup and reviews from Apple's public endpoints, Hacker News comments from the official search API, a help-center crawler that obeys robots.txt and follows redirects, frames from screen recordings, and a word-for-word evidence check on review themes.
- Design: page measurement in a clean browser (colors by use, type, spacing, corners, motion, breakpoints, logo, SVG fingerprints, skeleton, text, hosts, screenshot), the interaction sweep (scroll, hover, keyboard focus), the original's design system summarized, and a design lint that writes DESIGN.md in Google Labs' format plus tokens.css with a Tailwind v4 theme, a shadcn/ui theme and W3C design tokens.
- Verify: structure diff on page skeletons, layout and pixel diff with row alignment, variance calibration, masks and heatmaps, interaction compare, the copy check, the clean-room sweep (with SVG and logo fingerprints), parity and better-than-original.
- Launch: registry domain checks, the store listing lint, the migration URL check, and the shareable teardown.
- The design critic and screen builder agents for Claude Code.
- 36 tests.

**Not in yet**

- Google Play reviews, which have no public API for other people's apps; they are copied by hand with links.
- A ready-made benchmark of clones built with the skill.
