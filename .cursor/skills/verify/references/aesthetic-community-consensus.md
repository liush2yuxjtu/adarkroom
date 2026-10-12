# Surface `aesthetic-community-consensus`

Aesthetic judgments rest on external evidence, not personal taste. This surface is independent of `vercel-live-deploy`, `pr-telemetry-required`, and `behavior-timeline-vs-mechanics`.

## Triggers

Run this surface when the diff or claim touches visual style:

- file globs: `*.css`, `*.scss`, `*.less`, `*.ttf`, `*.otf`, `*.woff`, `*.woff2`, `*theme*`, `*font*`
- keywords: `font`, `css`, `theme`, `ui`, `color`, `palette`, `typography`, `typeface`

Skip when there is no visual-style claim.

## Communities to search

Search, then **open** the pages. A title in a SERP is not a source.

- V2EX
- Reddit game communities: `r/gamedev`, `r/PixelArt`, `r/indiegames`, `r/godot`
- Juejin
- Jike
- Bilibili
- Zhihu
- GitHub issues and font repos when the claim is a typeface

## Method

1. Name the exact current choice and the files that introduce it.
2. Search the communities above for the same class of choice.
3. Open at least 3 independent sources. Duplicate cross-posts count as one. Do not invent quotes.
4. Keep a coverage list, including communities that were searched and yielded nothing.
5. Fill the table only from pages you opened.

## Output

| community source | consensus points | link | supports current choice |
|---|---|---|---|
| (community or repo) | (short points from that page; no invented quotes) | (URL actually opened) | support / against / neutral |

Then:

- overall verdict
- alternatives, if the evidence is against the current choice
- coverage gaps (searched but empty)

## Pass / fail

- **PASS** — ≥3 independent sources were opened, the table is complete, and the current choice is not contradicted (or a source-named alternative was adopted).
- **INCONCLUSIVE** — fewer than 3 independent sources were opened. This is **not** a **PASS**.
- **FAIL** — opened sources contradict the current choice and no alternative is adopted or justified from those sources.
- **SKIP** — no UI / font / visual-style claim.

Personal taste, model preference, or a thread you did not open cannot produce **PASS**.

## Worked example: A Dark Room Chinese font

**Current choice.** JetBrains Mono + Noto Sans SC in this repo.

**What opened sources showed.** Community and font-repo threads did not support a sans/mono pairing for a literary survival UI. The original uses a serif Times New Roman body.

**Alternatives named by the sources.** Noto Serif SC, Fusion Pixel, Sarasa Mono.

**Coverage gaps.** Record any of V2EX / Reddit / Juejin / Jike / Bilibili / Zhihu / GitHub that were searched and returned nothing.

**Verdict.** Against the current choice; pick a source-named alternative before calling the font **PASS**.
