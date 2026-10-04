# Recon map: {{original}}

Every row names its source: a URL from sources.csv, a measurement file, a store screenshot, a frame with its timestamp, or "own account, {{date}}". A guess is marked as a guess.

## Scope

- **Target:** {{app or site, platform}}
- **Mode:** {{app | site | feature | migrate}}
- **Slice:** {{the part being cloned; "all of it" is not a slice}}
- **For:** {{who the clone is for}}
- **Core loop:** {{the one flow people pay for, in one line}}

## Screens

IDs are stable. Every other file refers to them.

| ID | Screen | Route or how you get there | Purpose | Key components | States seen | Interaction model | Source |
|---|---|---|---|---|---|---|---|
| S01 | | | | | empty, loading, filled, error | static / click / scroll / time | |

## Flows

```
F01 {{goal}}
    S01 -> S02 -> S03
    clicks on the happy path: {{n}} (the number to beat)
    edge cases: {{no results, time zone differs, double submit, slot taken mid-flow}}
    source: {{url or frame}}
```

## Components

| Component | Variants | States | Used on | Source |
|---|---|---|---|---|

## Data model, inferred

```
{{Entity}}  {{fields}}
            evidence: {{screens, help articles, API docs}}
            confidence: high | medium | guess
```

## Integrations

| Integration | Official API | Scopes | Review process | Source |
|---|---|---|---|---|

## What can't be cloned

Licensed content, the network and its users, data the original owns, partner deals, hardware, regulated licenses. Each is a `skip` row in features.csv with this reason.

## Size

Screens {{n}}, flows {{n}}, entities {{n}}. Hard parts: {{realtime, sync, payments, calendar or email integrations, offline}}.
Size: {{S a weekend | M a few weeks | L a quarter | XL rescope it}}.
