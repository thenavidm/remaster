---
private: true
---

# Remaster profile

Your defaults, so every clone starts from your stack and your brand instead of
the skill's. Keep it in your project as `remaster/profile.md`, or for every
project at `~/.config/remaster/profile.md`. It is read at the start of each
stage. Leave out anything you don't have an opinion on.

## Stack

- **Web app:** {{e.g. Next.js App Router, TypeScript, Tailwind v4, shadcn/ui}}
- **Website:** {{e.g. Astro}}
- **Mobile:** {{e.g. Expo}}
- **Database and auth:** {{e.g. Postgres with Drizzle and Better Auth}}
- **Payments:** {{e.g. Stripe Checkout and the Customer Portal}}
- **Email:** {{your provider}}
- **Files:** {{your storage}}
- **Hosting and deploy:** {{your host, and the command or skill that deploys}}

## Brand

- **Design system:** {{path to your DESIGN.md or brand tokens, if you have one}}
- **Voice:** {{three words, or a path to writing samples}}
- **Never:** {{things your brand never does}}

## Accounts you already have

{{Stripe, a domain registrar, an email provider, app store developer accounts. The skill asks you to create anything that's missing; it never signs up for you.}}

## How you work

{{Anything the agent should know: deploy only on your word, commit style, where outputs go.}}
