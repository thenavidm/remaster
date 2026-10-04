# Privacy

Remaster collects nothing about you. It has no account, no server, no
analytics and no telemetry. It runs on your machine, inside the AI agent you
use, and the files it writes stay in your project.

## What leaves your machine

Only the requests you ask for, each to the place it names:

- The pages and help centers of the product you are studying, read in a clean
  browser with no cookies or logins, and obeying robots.txt.
- Apple's public iTunes lookup, search and customer reviews endpoints.
- The Hacker News search API.
- IANA's RDAP bootstrap file, the domain registries' RDAP servers, and
  Cloudflare's public DNS-over-HTTPS resolver, for domain checks.
- The npm registry, if you run Remaster through `npx`.

Every request names itself as RemasterResearch in its user agent, with a link
to the repository. Nothing about you or your project is sent with it.

## Your agent

Remaster's instructions and outputs pass through the AI agent you run it in
(Claude Code, Codex, Gemini CLI, Cursor or another). What that agent's
provider does with your data is set by its own privacy policy.

## Questions

[Open an issue](https://github.com/thenavidm/remaster/issues).
