# Event Tracking Protocol

Use this for Quant Career Pipeline dashboard events.

## Method

1. Run discovery in rings before adding or declaring complete.
   - Korea/Singapore/Hong Kong/Taiwan/Malaysia official event pages.
   - Regulator and institution surfaces: MAS/GFTN, SGX, HKMA, ASIFMA, AIMA, KOFIA/KRX-adjacent, NUS/CQF, Risk.net, FIA, FIX Trading Community.
   - Domain searches for: `quant finance`, `AI finance`, `fintech festival`, `derivatives`, `cleared markets`, `electronic trading`, `FX trading`, `market structure`, `liquidity`, `investment operations`, `energy risk`, `commodity trading`, `crypto institutional`, `digital assets`.
   - Search snippets are discovery leads only. Every included item still needs official source and link verification.

2. Official source first.
   - Prefer the event organizer page, official ticket page, CFP page, or official schedule page.
   - Aggregators are only hints. Do not promote them to trusted source unless the organizer page also confirms the same date, venue, and access mode.
   - Store `verification.checkedAt`, `verification.sourceType`, and `verification.summary` for every event.

3. Separate events from watch pages.
   - A dated conference/meetup must have `startDate`, `endDate`, venue, access mode, source URL, and action.
   - A company program or recruiting page is a `watch page`, not an event.
   - Do not use synthetic dates such as `2026-12-31` for watch pages.
   - Store fund program pages in `watchSources`, with `type`, `cadence`, and `eligibility`.

4. Record practical eligibility.
   - If a page targets undergraduates, current PhD students, postdocs, new grads, or invite-only senior allocators, state that explicitly.
   - If the user is unlikely to qualify or get value, mark the page low priority even if the institution is prestigious.

5. Do not infer virtual access.
   - `Hybrid`, `online access`, or aggregator metadata is not enough.
   - If official livestream or online attendee access is not confirmed, say `content watch`, `recording watch`, or `virtual presenter only`.

6. Prioritize by user fit, not event prestige.
   - Top priorities should map to concrete next action: paper submission, register now, request invite, pre-book meetings, or content watch.
   - Travel-heavy events need a meeting/speaking/recruiting reason.

## Current Priority Logic

1. Global AI Finance Research Conference: Helix paper submission candidate.
2. CQF AI/ML in Quant Finance: direct AI-native quant content, online.
3. KBW + Upbit Institutional Summit: company-name institutional access.
4. Korea Global Investment Forum: only via warm intro.
5. Singapore FinTech Festival: Singapore fintech, policy, institutional, AI, and digital-assets network.
6. FIA Asia Derivatives Conference: Singapore derivatives, clearing, exchange, vendor, and market-structure network.

## Build Gate

`dashboard-site/scripts/validate-dashboard-data.mjs` must pass before deployment. It blocks:

- ResearchFora-style generic listings as trusted events.
- synthetic `2026-12-31` dates for watch pages.
- Bitcoin Korea being marked hybrid/online without official confirmation.
- missing Upbit Institutional Summit split for KBW.
- missing Singapore FinTech Festival.
- missing Singapore/Hong Kong market-structure layer: InvestOps Asia, ASIFMA Future of Liquidity, FIX Southeast Asia Multi-Asset Trading, FX Markets Asia, FIA Asia Derivatives when future dates are still valid.
- missing Global AI Finance paper deadline.
- missing event or watch-page verification metadata.
- fund pages represented as dated events.
