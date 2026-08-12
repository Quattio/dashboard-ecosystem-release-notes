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
- **Rule**: Release notes must also cover what *goes live* with the release — feature-flag flips, fleet/config rollouts, backend rule enablements — even when the underlying code shipped in an earlier wave. Sweep the wave's Jira Fix Version tickets across all paired products for enablement/rollout tickets that have no commit in the current diff, and cover them in Tier 2 (and Tier 1 if customer-visible). This sweep is mandatory on **every** run for a wave — including alpha→beta/GA promotions and any fresh regeneration of an already-documented wave. Never rely on the tag-to-tag commit diff alone, and when re-generating a wave that already has a reviewed entry (e.g. a prior staging PR), carry forward every enablement/rollout callout it already contained so the regeneration cannot silently drop it (ZipStats QPD-13788 + QPD-14293 was dropped exactly this way when the 4.9.0 wave was regenerated from scratch).

### 2026-07-06 — Never infer a customer benefit from a parameter change
- **Category**: tier-placement
- **Trigger**: PR #14 — "Is this the case? In control we changed the fan speed, but not neccesarily more quiet … new low (mute) fan speed of 550 rpm in cooling mode (previously 400 rpm)" (Bouke-Stoelinga, re QPD-14491)
- **Root cause**: A control-tuning change (minimum cooling fan speed *raised* 400 → 550 rpm for device protection) was presented as a "quieter cooling" customer bullet — the benefit was invented and directionally wrong.
- **Rule**: Never derive a customer-facing benefit claim from a parameter/control change. Verify the direction AND the intent in the ticket first. Control-tuning and device-protection changes are described neutrally in Tier 2 and kept out of Tier 1 unless the ticket explicitly states a customer-perceivable improvement.

### 2026-07-06 — Hold cross-product features until the counterpart ships
- **Category**: scope
- **Trigger**: PR #14 — "Do not mention the following, it's not relevant until the Heatcharger firmware is also updated: add a three-way-valve error to the HeatCharger system-error flags (QPD-13979)" (ramacassis)
- **Root cause**: The CiC-side code for a cross-product feature landed in this wave, so it was listed — but the feature does nothing until the paired HeatCharger firmware ships, making the mention premature.
- **Rule**: When a change only becomes functional together with a paired-product release (HeatCharger / dongle / Controller firmware, App, Cloud), check whether that counterpart is part of this wave's paired versions. If it is not, omit the item from the notes (all tiers) and cover it in the release where it becomes functional end-to-end. **Carve-out for partially-live features:** this "omit entirely" rule applies only when the feature does *nothing* customer-perceivable this wave. If a feature has a live portion AND a dormant/gated portion (e.g. the HeatBattery screen showing charging reasons, where the anti-legionella reason is live but the Chill/Charge-Cool reason is gated off), it is customer-facing for its live part — include it in Tier 1 describing what the homeowner can actually see now, and either drop the dormant sub-part or name it neutrally without implying it is active. Do not suppress a whole homeowner-visible feature because one of its sub-sources is still gated.

### 2026-07-06 — Tier 2 stays at operational altitude
- **Category**: tier-placement
- **Trigger**: PR #14 — "The following section is too low level" → requested plain wording for the QPD-14287 overlay-cleanup impact-for-ops line (ramacassis)
- **Root cause**: Ops-facing text carried engineering internals (`/data` overlay paths, a repo CLAUDE.md whitelisting rule) — depth that belongs in Tier 3 / Jira, not in ops guidance.
- **Rule**: Tier 2 "impact for ops" text describes the operational effect in plain language: what ops/CS will observe and what (if anything) to do. No internal file paths, repo-doc references, or developer-workflow details — cite the ticket for depth.

### 2026-07-06 — Tier 1 section headings are fixed, in a fixed order (EN + NL)
- **Category**: formatting
- **Trigger**: PR #14 — "previous releases' sections were named differently. Keep consistency in the two sections and always name them …" (alex-aristotelous); PR #28 — "for tier1, for both EN and NL, let's introduce a \"New Features\" section, to complement \"Heating performance and reliability\" and \"Bug fixes and maintenance\". This \"New Features\" section should come first. … It's ok for this new section to also exist with an empty body." (alex-aristotelous); PR #28 — "rename section \"New Functions\" to \"New functions\"" (alex-aristotelous)
- **Root cause**: (PR #14) The Customer tab used bespoke per-release section titles ("What this update is preparing") instead of a canonical heading set. (PR #28, first) There was no dedicated new-features section, so genuinely new customer-facing features (the SoundSlider redesign, custom night hours, the richer HeatBattery screen) were misfiled under "Bug fixes and maintenance" — the wrong altitude for a new feature. (PR #28, later) The EN heading was set to "New Features" (title-cased, "Features"), diverging from the NL "Nieuwe functies" ("functions") — the reviewer wants the EN heading to mirror the NL wording and casing: "New functions".
- **Rule**: The Customer (Tier 1) tab always uses exactly **three** content sections, in this exact order, with these exact headings — regardless of release content:
  1. EN "New functions" / NL "Nieuwe functies" (**first**) — note EN is "New functions" (lowercase "functions", mirroring the Dutch), NOT "New Features"
  2. EN "Heating performance and reliability" / NL "Verwarmingsprestaties en betrouwbaarheid"
  3. EN "Bug fixes and maintenance" / NL "Foutoplossingen en onderhoud"
  All three sections must always be present even when a section has no items — render the "New functions" section with an empty body (no `<li>`s) rather than dropping it. New customer-facing capabilities go under "New functions", never under "Bug fixes and maintenance" (which is for fixes, visual polish and general maintenance). Phase disclaimers/callouts (e.g. a beta notice) may precede the three sections, but never replace or reorder them.

### 2026-07-21 — App changes in the installer/commissioning surface are not customer-facing
- **Category**: tier-placement
- **Trigger**: PR #20 — "from the customer facing release notes, remove this part 'Fixed the Wi-Fi signal-strength label showing the wrong word for "Fair" in Dutch, German and Slovak.'. It's related to the installer app and not customer facing." (alex-aristotelous)
- **Root cause**: An app bug fix (Wi-Fi signal-strength "Fair" label mistranslation, QPD-14778) was placed in Tier 1 because it was an app-facing string fix with a customer-looking label. Generation treated "in the mobile app" as equivalent to "customer-facing" and did not check *where in the app* the change surfaces — the signal-strength label is shown in the installer/commissioning flow, not the homeowner surface.
- **Rule**: A change shipping in the mobile app is not automatically customer-facing. Tier 1 is only for changes a **homeowner** sees in normal app use. Before placing any App (or CiC/Cloud) change in Tier 1, confirm the affected screen/label/flow is reachable by a homeowner — not only during installer/commissioning/setup or in installer-only diagnostics (e.g. Wi-Fi signal strength shown while installing). Installer-/commissioning-only changes stay out of Tier 1 (EN + NL) and are covered in Tier 2/Tier 3; when Tier 2 references such a fix, do not describe it as customer-visible.

### 2026-07-27 — A suffix-less target tag is GA; never gate stable on rollout/Release publication
- **Category**: versioning
- **Trigger**: PR #26 — "when the target tag does not have `beta` or `alpha`, then it's our general release that's good to go to the fleet. you don't need to know if it has gone to the fleet yet — that should be irrelevant to this. a release without a suffix, is production-ready and can go out at any moment" (alex-aristotelous)
- **Root cause**: On the 4.10.0 stable promotion the tag alone already settled the phase, but generation treated two orthogonal facts — no published GitHub Release yet, and unconfirmed fleet rollout — as casting doubt on the GA call, and raised a spurious "confirm this is GA" open-follow-up.
- **Rule**: The pre-release suffix on the target CiC tag is the sole determinant of phase: no `-alpha`/`-beta` suffix on a new minor ⇒ **stable (GA)**, full stop. A suffix-less tag is production-ready by definition and may deploy at any time. Never gate the stable badge, the GA framing, the headline date choice, or a follow-up flag on whether a GitHub Release has been published or whether fleet rollout has started — those are downstream of the tag and irrelevant to classification. (A missing GitHub Release still legitimately means the headline date falls back to the tag commit's committer date, per the DATE rule; that fallback is not itself a reason to doubt GA.)

### 2026-07-30 — Use the canonical product/feature name, not a generic paraphrase; keep it verbatim across locales
- **Category**: terminology
- **Trigger**: PR #28 — "change both the EN and NL customer releasenotes: \"sound settings screen\" becomes \"SoundSlider\", and for NL: \"Het geluidscherm\" becomes \"De SoundSlider\"" (alex-aristotelous)
- **Root cause**: The QPD-15101 ticket titled the feature by its canonical name ("SoundSlider") and the engineering table used it verbatim, but the customer tiers (EN + NL) paraphrased it descriptively ("the sound settings screen" / "het scherm met geluidsinstellingen"). Generation treated a named Quatt product/feature as a generic UI surface to describe rather than a brand term to name.
- **Rule**: When a change concerns a named Quatt product or feature (e.g. SoundSlider, Chill, HeatBattery), refer to it in ALL tiers by that canonical name — take the name from the ticket title / engineering references rather than inventing a descriptive paraphrase ("the … screen/settings"). Named features are brand terms: keep them verbatim and untranslated in every locale (EN/NL/DE/SK); in non-English locales adjust only the surrounding grammar (e.g. the Dutch article → "De SoundSlider"), never the term itself. If the engineering/internal text already uses the canonical name while the customer text paraphrases it, that mismatch is the tell — align the customer copy to the canonical name.

### 2026-07-30 — Tier 1 must cover every homeowner-visible App feature; cross-check it against Tier 2
- **Category**: scope
- **Trigger**: PR #28 — "two customer-facing App v1.60.0 changes are missing from the customer tier … Custom night hours: set your own night-time window. HeatBattery: more info at a glance, including Anti-legionella cycles and Charging with Chill." (alex-aristotelous)
- **Root cause**: Two homeowner-visible App features documented in Tier 2 were dropped from Tier 1. The night-window/"night hours" capability (part of the QPD-15101 SoundSlider redesign) was collapsed into a generic "day/night controls" bullet, losing the distinct new capability; the HeatBattery charging-reason screen (QPD-14553 / QPD-15330) was suppressed entirely because one of its reasons (Charge Cool) is gated — even though its anti-legionella reason is live and homeowner-visible. Tier 1 was drafted more conservatively than Tier 2 and no cross-check caught the gap.
- **Rule**: Tier 1 (EN + NL) must include a bullet for **every** change a homeowner can see in normal app use — not a subset. Before finalising, cross-check Tier 1 against Tier 2: every Tier 2 item whose ops/CS impact line calls it customer-visible ("see the Customer tab") or that is otherwise homeowner-reachable must have a matching Tier 1 bullet in both languages. Do not fold two distinct customer-visible capabilities into one bullet (a screen *redesign* and a new *"set your own night-time window"* capability are separate homeowner-facing items). A partially-gated feature counts as customer-visible when its live portion is homeowner-visible (see the "Hold cross-product features" carve-out). This is the completeness counterpart to the 2026-07-21 rule (which keeps installer/commissioning-only changes *out* of Tier 1): apply both — include all homeowner-visible changes, exclude non-homeowner ones.

### 2026-08-12 — Release timeline shows ONLY version-tagged calendar milestones; no date-window fallback
- **Category**: formatting
- **Trigger**: PR #31 — "the calendar for 4.11.1 still shows: [10 Aug – 27 Sept generic 'Roll out new installations' / '[prod] Full roll out' / '[pre-release] Package and deploy beta' / '[pre] Fix issues spotted in beta' cadence] … When these are the dates seen on the calendar: [screenshot of the 4.11.1-tagged '[prod] Full roll out | CiC 4.11.1 (Day 1/5–5/5)' milestone, 12–16 Aug 2026]" (alex-aristotelous)
- **Root cause**: The generated release-timeline widget filters the shared Google calendar to events whose title contains the release version ("… | CiC X.Y.Z"), but on an empty match it fell back to a ±6-week date window around the headline date. That fallback pulled in **other** releases' recurring cadence milestones (which carry different `| CiC` version tags, stripped from the displayed title), presenting a generic multi-release train as this release's timeline. Any release whose version-tagged milestones aren't in the fetched feed (e.g. added after the 15-min edge cache, or simply not yet tagged) silently rendered the wrong, unrelated dates.
- **Rule**: The per-release "Release timeline" widget must display **only** milestones explicitly tagged with the current release version (title contains `CiC X.Y.Z`). Never add a proximity/date-window fallback that selects calendar events by date alone — a shared calendar interleaves many releases' milestones, so date proximity cannot distinguish them. When no event is tagged for this release, keep the timeline section hidden (its default) rather than surfacing another release's cadence. This applies to every generated release page.
