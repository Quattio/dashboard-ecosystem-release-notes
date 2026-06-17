# Classification examples (CiC 4.5.0 dry run)

Worked examples from the first dry run on `CiC - V4.5.0` + `App v1.55.0` + `Cloud v2.36.0` + `Wireless Platform - V2.8.0`. Use as pattern reference when classifying future releases.

## Tier 1 — customer-facing (mobile-app surface)

| Ticket | Why Tier 1 |
|---|---|
| QPD-13417 Multi-Chill feature branch review and merge | Customer **runtime experience** — household with >1 Chill now operates as coordinated system. Visible in app at runtime, not gated to commissioning. |
| QPD-13531 Earnings screen should default to yesterday | Customer-visible in-app behaviour. Direct interaction surface. |
| QPD-13424 Fix - Anti-legionella criteria not respected | System reliability the customer perceives. Anti-legionella reliability matters to comfort + safety. |
| QPD-13624 Anti-legionella cycle requested but not completed in fallback charging mode | Same. |
| QPD-12935 Fix inaccurate flowRateFiltered calculation with a faulty flow sensor | System control accuracy → comfort. Customer feels it. |
| QPD-13354 Pre-pump after anti-freeze circulation | Heating control reliability — customer doesn't see the code path but feels the result. |
| QPD-13604 Fix hysteresis in power orchestrator | Affects hybrid heat-pump-vs-boiler decisions → comfort. |

**Tier 1 narrative** keeps the granular fixes generalised: "More accurate heating control through improvements to flow-rate measurement, anti-freeze handling, and the power management between your heat pump and boiler." Customer doesn't need ticket-level granularity.

## Tier 1 — REJECTED (routed to Tier 2 instead)

| Ticket | Why NOT Tier 1 |
|---|---|
| QPD-13687 COMMISSIONING \| Access Quatt Network from any screen | `COMMISSIONING |` prefix = installer-only. Commissioning is gated. |
| QPD-13740 COMMISSIONING \| Cancel a commissioning during a firmware update | Same — commissioning-gated. |
| QPD-10347 CHILL \| Include control board firmware(s) in CiC images | Automatic OTA infrastructure — invisible to customers. |
| QPD-13643 Speed up Thread device OTA | OTA behaviour — invisible. |
| QPD-13440 DONGLE \| Report FW Update % | OTA-related; only visible to installer during commissioning. |
| QPD-13677 Add ODU revision mapping for AMH6-2 | OTA infrastructure (heat-pump firmware). Invisible to customer. |
| QPD-13114 Make New Redis To Turn Off Faulty ODU Flow Sensors From The Support Dashboard | Admin/CS-only tool. |
| QPD-13563 Add Multi-Chill Grafana link to the CS dashboard | CS dashboard = ops surface, not customer surface. |
| QPD-13446 / QPD-13447 / QPD-13448 / QPD-13450 ADR0041 flow-sensor override | Admin API + DB migration. Operations lever, not customer-feeling change. |
| QPD-13682 / QPD-13683 Admin commissioning endpoints | Admin-only surface. |
| QPD-13900 Graduate HYBRID_BETA commissioning flow to GA | Commissioning-gated → Tier 2 flagship. |

**Why these get filtered:** see memory `feedback_release_notes_tier1.md` for the authoritative rule. Two main filters: commissioning-gated (installer-only) and silent-background (automatic OTA).

## Tier 2 — flagship items (lead the document)

Group `Major releases for installers and operations` near the top. Examples from CiC 4.5.0:

1. **Hybrid commissioning GA** (QPD-13900) — biggest installer-flow change of the release. Always lead with a feature graduation.
2. **Multi-Chill support shipped** — gather all multi-Chill-epic tickets, plus the bugs found during multi-Chill testing.
3. **Heat pump (ODU) firmware update flow** — gather ODUv2 epic tickets across App + Cloud.
4. **Chill control board OTA** — CHILL OTA epic tickets across CiC + App + Cloud.

Each flagship gets a 1-paragraph description + bullet sub-points + a `> **Impact for <X>:**` callout.

## Tier 2 — bug fixes with operational impact

Customer-impacting bugs that operations should know about (so CS can recognise the symptom in support tickets). Don't generalise — name them:

- Anti-legionella (QPD-13424 urgent, QPD-13624)
- Flow sensor accuracy (QPD-12935)
- Anti-freeze pre-pump (QPD-13354)
- Watchdog tuning (QPD-13528)
- HB thermal counter (QPD-13525)
- Power orchestrator hysteresis (QPD-13604)
- Insights pipeline drop-row (QPD-13734 urgent)
- Faulty ODU flow-sensor override (QPD-13114)

These also fed into the Tier 1 generalised heating-performance bullet, but Tier 2 names them.

## Tier 2 — internal tech-debt rollup at bottom

A short section for items that don't drive any customer or installer behaviour change but are worth flagging for context:

- `cic-dashboard v2.0` shipped (QPD-11810)
- Controller release V6.6.0 management (QPD-13423)
- Flow struct cleanup, controller-manager Redis fix, cic-cloud-metrics dedup, settings frame builder fix
- ESLint and tooling upgrades (App)

## Tier 3 — engineering tier mechanics

- Group **by product** (CiC, App, Cloud, Wireless Platform).
- Within product, two sub-sections: **Tasks** then **Bugs**. Sort by issuetype, then key ascending.
- Each item: `[QPD-XXXXX](https://quatt-team.atlassian.net/browse/QPD-XXXXX) — <summary>`.
- Annotate priority for `High` and `Urgent` only: ` _(Urgent)_` or ` _(High)_`. Skip Medium/Low (default).
- Cross-product duplicates (e.g. QPD-13677 in App + Cloud, QPD-13638 in CiC + Wireless Platform) appear under each — call them out in a "Source-of-truth notes" section at the bottom.
- Lead with a table: product → version → Jira Fix Version filter URL.
- Mention `release-auditor` for traceability audits at the top so engineers know where to dig if they want commit-level granularity.

## Voice samples

**Tier 1 — neutral changelog:**
> "If your home has more than one Chill, you can now operate them together as part of one Quatt system."

**Tier 2 — operational reportage with callout:**
> "The new architecture commissioning flow has been graduated from `HYBRID_BETA` to GA in production. All new Hybrid installations now use the rebuilt flow. _(QPD-13900, Cloud)_
> 
> > **Impact for ops:** Installer Support should expect the GA flow on every new Hybrid commissioning from this release onward."

**Tier 3 — telegraphic:**
> - [QPD-13424](https://quatt-team.atlassian.net/browse/QPD-13424) — Fix - Anti-legionella criteria not respected _(Urgent)_

## Edge cases noted during dry run

- **Hotfix windows compress** — `4.4.1` was cut 4h before `4.5.0`. Use the previous *minor* release (`4.4.0`) as the effective customer window when the immediate predecessor is a same-day hotfix.
- **App/Cloud versions user names may be wrong era** — if the user names a version, sanity-check against the CiC release date. The user proposed `App v1.57.0` / `Cloud v2.37.0` when the actual era pair for CiC 4.5.0 was `App v1.55.0` / `Cloud v2.36.0` (those were the upcoming-CiC-4.6.0 versions).
- **Wireless Platform shares epics with CiC** — Wireless Platform tickets typically parent under `CHILL | Field Test Stability Improvement`, same as CiC connectivity bugs. For Tier 1/2, mention once under CiC narrative; in Tier 3, list under Wireless Platform product with a note about the cross-tag.
- **Cross-fixVersion tickets are expected** — App + Cloud changes that need to ship together (e.g. ODU revision mapping QPD-13677) are tagged with both fixVersions. Don't treat as data error.
- **`Heatcharger` is its own product** seen in Jira fixVersions but did not appear in the CiC 4.5.0 window. If present in a future window, treat as a CiC sub-component for Tier 1/2 (like Wireless Platform).
