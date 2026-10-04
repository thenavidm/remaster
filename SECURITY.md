# Security

Remaster is a skill and a set of local scripts. It has no hosted service, no
account and no telemetry, and it never handles your passwords or API keys.

## What it reaches

- The pages you point it at, in a clean browser with no cookies or logins,
  and the help center or docs you ask it to read, obeying robots.txt.
- Apple's public iTunes lookup, search and customer reviews endpoints.
- The Hacker News search API.
- IANA's RDAP bootstrap file, the registries' RDAP servers, and Cloudflare's
  public DNS-over-HTTPS resolver, for domain checks.

Every request names itself in its user agent as RemasterResearch with a link
to this repository.

## What it writes

Files in the `remaster/` folder of the project you run it in, a `DESIGN.md`
at that project's root (never over one it did not write), and one line in
that project's `.gitignore` so research is never committed.

## Untrusted content

Everything a target site returns is treated as data, never as instructions.
The skill tells the agent never to run commands, install packages, open files
or visit other sites because target content asks it to. A page can still try;
review what your agent proposes before approving it.

## Reporting a vulnerability

[Report it privately](https://github.com/thenavidm/remaster/security/advisories/new).
Please do not open a public issue for a security problem: an issue is visible
to everyone the moment you file it, including whoever would use the bug.

Good-faith research is welcome. If you are testing within these lines and stay
off other people's data and systems, you will not hear from me about anything
but the bug.
