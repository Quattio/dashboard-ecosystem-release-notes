# Lessons learned — release-notes generation

Rules learned from reviewer feedback (`@claude <change>` comments) on release-notes PRs.
Every lesson below is **binding** for future release-notes generation, layered on top of
`SKILL.md` — when a lesson conflicts with the skill's defaults, the lesson wins.

Maintained automatically by the release-notes cloud routine: in FEEDBACK MODE it appends or
merges an entry whenever a reviewer comment reveals a *generalizable* mistake (one-off edits
such as typos are fixed but not recorded). This file is the only file the routine may commit
directly to `main`. Humans may edit freely — delete an entry to revoke a lesson.

Housekeeping: keep entries deduplicated (strengthen an existing lesson rather than adding a
near-duplicate); above ~15 lessons, consolidate overlapping ones. Stable, long-standing
lessons should eventually be folded into `SKILL.md` via a reviewed PR and pruned here.

## Entry template

```
### YYYY-MM-DD — <short generalized rule>
- **Category**: tier-placement | terminology | versioning | scope | formatting | other
- **Trigger**: PR #<n> — "<quoted reviewer comment>"
- **Root cause**: <why generation got this wrong>
- **Rule**: <the generalized, forward-looking rule to apply on every future release>
```

## Lessons

### 2026-07-06 — Include production enablements, not just code in the tag diff
- **Category**: scope
- **Trigger**: PR #14 — "in this release the zipped mqtt stats feature will be released to production, why is not in your release notes?" (kj-q)
- **Root cause**: Notes were anchored strictly on the CiC tag-to-tag commit diff. The ZipStats firmware code shipped in an earlier (4.8.x) wave, so its production enablement (prod `cicZipStats` IoT rule / Kafka action, QPD-13788 + QPD-14293) produced no diff in this wave and was omitted.
- **Rule**: Release notes must also cover what *goes live* with the release — feature-flag flips, fleet/config rollouts, backend rule enablements — even when the underlying code shipped in an earlier wave. Sweep the wave's Jira Fix Version tickets across all paired products for enablement/rollout tickets that have no commit in the current diff, and cover them in Tier 2 (and Tier 1 if customer-visible).

### 2026-07-06 — Never infer a customer benefit from a parameter change
- **Category**: tier-placement
- **Trigger**: PR #14 — "Is this the case? In control we changed the fan speed, but not neccesarily more quiet … new low (mute) fan speed of 550 rpm in cooling mode (previously 400 rpm)" (Bouke-Stoelinga, re QPD-14491)
- **Root cause**: A control-tuning change (minimum cooling fan speed *raised* 400 → 550 rpm for device protection) was presented as a "quieter cooling" customer bullet — the benefit was invented and directionally wrong.
- **Rule**: Never derive a customer-facing benefit claim from a parameter/control change. Verify the direction AND the intent in the ticket first. Control-tuning and device-protection changes are described neutrally in Tier 2 and kept out of Tier 1 unless the ticket explicitly states a customer-perceivable improvement.

### 2026-07-06 — Hold cross-product features until the counterpart ships
- **Category**: scope
- **Trigger**: PR #14 — "Do not mention the following, it's not relevant until the Heatcharger firmware is also updated: add a three-way-valve error to the HeatCharger system-error flags (QPD-13979)" (ramacassis)
- **Root cause**: The CiC-side code for a cross-product feature landed in this wave, so it was listed — but the feature does nothing until the paired HeatCharger firmware ships, making the mention premature.
- **Rule**: When a change only becomes functional together with a paired-product release (HeatCharger / dongle / Controller firmware, App, Cloud), check whether that counterpart is part of this wave's paired versions. If it is not, omit the item from the notes (all tiers) and cover it in the release where it becomes functional end-to-end.

### 2026-07-06 — Tier 2 stays at operational altitude
- **Category**: tier-placement
- **Trigger**: PR #14 — "The following section is too low level" → requested plain wording for the QPD-14287 overlay-cleanup impact-for-ops line (ramacassis)
- **Root cause**: Ops-facing text carried engineering internals (`/data` overlay paths, a repo CLAUDE.md whitelisting rule) — depth that belongs in Tier 3 / Jira, not in ops guidance.
- **Rule**: Tier 2 "impact for ops" text describes the operational effect in plain language: what ops/CS will observe and what (if anything) to do. No internal file paths, repo-doc references, or developer-workflow details — cite the ticket for depth.

### 2026-07-06 — Tier 1 section headings are fixed (EN + NL)
- **Category**: formatting
- **Trigger**: PR #14 — "previous releases' sections were named differently. Keep consistency in the two sections and always name them …" (alex-aristotelous)
- **Root cause**: The Customer tab used bespoke per-release section titles ("What this update is preparing") instead of the canonical heading set used by previous releases.
- **Rule**: The Customer (Tier 1) tab always uses exactly two content sections with these exact headings — EN: "Heating performance and reliability" and "Bug fixes and maintenance"; NL: "Verwarmingsprestaties en betrouwbaarheid" and "Foutoplossingen en onderhoud" — regardless of release content. Phase disclaimers/callouts (e.g. a beta notice) may precede them, but never replace them.
