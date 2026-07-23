---
name: quatt-release-notes
description: >
  Produce three-tier release notes for a Quatt ecosystem release (CiC + App + Cloud + Wireless Platform).
  Trigger when the user asks for "release notes", "customer changelog", "what shipped in CiC X.Y.Z",
  "draft release notes for the latest release", "write up the release for customers / ops / engineering",
  or similar. Anchors on a CiC release version, auto-discovers the paired App / Cloud / Wireless Platform
  versions by time-window match against the previous CiC release, queries Jira for every Fix Version's
  tickets, and writes three markdown files: `release-notes-public.md` (customer-facing, in-app),
  `release-notes-internal.md` (ops / installer support / management), `release-notes-engineering.md`
  (ticket index grouped by Jira parent epic, with Jira links). Distinct from the `release-auditor` skill — that
  one verifies traceability, this one writes the customer-, ops-, and engineering-facing changelogs.
  Distinct from `quatt-sprint-readout` — sprint readouts cover a sprint window across teams; release
  notes cover a release version across products.
---

# Quatt Release Notes Skill

Generates three audience-tiered changelogs for a Quatt ecosystem release. Anchors on a CiC version and joins App / Cloud / Wireless Platform releases that shipped in the same window.

## Environment note (read first)

This skill is **environment-agnostic**: it does not assume any local checkout of any repo. All version, tag, date, and commit data is pulled from **GitHub** (MCP preferred, REST as fallback), and all Jira/Slite/Slack data via their MCP integrations. It runs identically on a developer laptop and in an automated cloud routine.

- This skill lives **inside a checkout of `Quattio/dashboard-ecosystem-release-notes`** (under `.claude/skills/quatt-release-notes/`). The current working directory is the root of that repo — Step 8 writes the dashboard page and manifest relative to that root.
- **GitHub access:** prefer the **GitHub MCP** tools — in the cloud routine they cover `list_releases` / `list_tags` / `list_commits` / `get_commit` / compare across the connected product repos, and this is the reliable path. Use the REST API (`gh api <path>`, or `curl -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/<path>`) only as a fallback when the MCP is missing a repo or endpoint. **Do not assume `$GH_TOKEN` is set** — it is frequently empty/unset, and it is the MCP *connection* (not that env var) that grants cross-repo access. Verify reachability first; if `curl` returns 401, switch to the MCP rather than treating the repos as unreachable.
- **No local git clones of the product repos** (`cic-yocto-builder`, `Quatt-cloud`, etc.) are needed or assumed. Tags, dates, and commit ranges come from the API.

## When to invoke

- "Draft release notes for CiC 4.5.0"
- "Customer release notes for the latest release"
- "What shipped in this release, for ops?"
- "Write up the engineering changelog for X.Y.Z"

**Do NOT invoke for:**
- "Audit the release" / "verify Fix Versions" → use `release-auditor`
- "Sprint readout" / "what did the teams ship this sprint" → use `quatt-sprint-readout`
- Internal-only changelogs scoped to a single repo without crossing products → use `git log` directly

## 1 · Inputs

**Required:**
- **Target CiC version** — e.g. `CiC - V4.5.0`. Ask the user if not provided (or read it from the routine trigger payload in an automated run). CiC is the anchor product; App/Cloud/Wireless are joined to it.

**Optional (with defaults):**
- **Previous CiC version** — defaults to the most recent stable tag preceding the target (e.g. `4.4.1` or `4.4.0` for target `4.5.0`). Used to bound the time window.
- **Paired App / Cloud / Wireless Platform versions** — auto-discovered from the time window (see Step 2). User may override.
- **Scratch directory** — the three markdown tiers are intermediate artifacts; write them to `/tmp/release-notes-<sanitised-target>/`. The committed deliverables are the HTML page + manifest entry produced in Step 8, written into the dashboard repo working tree.

## 2 · Process

### Step 0 — Load the Quatt language glossary (mandatory, every run)

Before drafting any text, fetch the Quatt language / terminology glossary from Slite:

> **Glossary URL:** https://quatt.slite.com/app/docs/ai_xKOdL3NZkmW

Use the Slite MCP (`mcp__claude_ai_Slite__*`). If Slite auth is not active, surface a one-line instruction asking the user to `/mcp` authenticate `claude.ai Slite` and pause — do not fall back to a stale snapshot. The glossary defines official product names, capitalisation, brand voice, term-to-avoid pairs (e.g. preferred "ketel" over "boiler" in Dutch; preferred names for ODU / Chill / HeatBattery), and customer-facing vs internal terminology. Apply it to all three tiers:

- **Tier 1 (customer):** every term must match the glossary's customer-facing form. No internal product codenames.
- **Tier 2 (ops/installer support):** prefer glossary terms, but technical jargon (epic names, MQTT topic names, service names) stays as-is.
- **Tier 3 (engineering):** glossary applies to prose framing only; ticket summaries stay verbatim from Jira.

If the glossary contradicts a term you would otherwise have used (e.g. a casual name learned from Slack), the glossary wins. Note any glossary changes encountered in the post-run summary so the user can audit.

### Step 1 — Resolve the CiC release window

Resolve the target and previous CiC tag **creation dates** from GitHub (no local clone). CiC publishes GitHub Releases, so the Releases API is the cleanest source:

```bash
# All CiC releases, newest first, with tag name + dates
gh api 'repos/Quattio/cic-yocto-builder/releases?per_page=100' \
  --jq '.[] | "\(.tag_name)\t\(.created_at)\t\(.published_at)"'
```

Fallback if a tag has no GitHub Release (plain annotated tag): resolve the tag → commit → date:

```bash
gh api repos/Quattio/cic-yocto-builder/git/refs/tags/<tag>   # -> object.sha
gh api repos/Quattio/cic-yocto-builder/commits/<sha> --jq '.commit.committer.date'
```

The two dates bound the customer-facing time window. Note that hotfix tags (e.g. `4.4.1` cut hours before `4.5.0`) compress the window; the effective customer window is usually `<previous-minor> → <target>` (e.g. `4.4.0 → 4.5.0`).

### Step 2 — Discover paired App / Cloud / Wireless Platform versions

**Hierarchy of truth:**

1. **GitHub releases are the source of truth.** If a tag exists on GitHub, that version shipped. The tag commit is the authoritative content boundary; the release body / changelog is the authoritative description.
2. **Jira provides the cross-reference layer.** Tickets carry `fixVersion`, parent epic, components, priority — useful for building cross-product themes, attributing commits to features, and grouping. Jira *drifts out of sync* with GitHub: hotfix tags cut from release branches (e.g. `Cloud v2.36.1` cherry-picked from `Cloud v2.37.0`) often have no corresponding Jira fixVersion. Never start from Jira.
3. **Slack adds context.** Release-captain notes, rollout caveats, "we reverted X" discussions, and informal release-readiness signals. Useful for the Tier 2 narrative but not for version discovery.

#### 2a. Enumerate GitHub releases in the window (source of truth)

Per-product repositories:

| Product | GitHub repo | Tag format |
|---|---|---|
| CiC | `Quattio/cic-yocto-builder` | `4.5.0`, `4.6.0-alpha.0`, `4.6.0-beta.0`, `4.6.0` (no `v`-prefix) |
| Cloud (BE) | `Quattio/Quatt-cloud` | `v2.36.0`, `v2.36.1` (lowercase `v`) |
| App | `Quattio/quatt-mobile-app` | `v1.55.0`, `v1.56.1` (lowercase `v`) |
| Wireless Platform (Dongle / Thread FW) | `Quattio/quatt-dongle` | `2.8.0`, `2.9.0` (no `v`-prefix) |
| Heatcharger | `Quattio/quatt-heatcharger-firmware` | varies |

For **every** repo (CiC included — there is no special-cased local clone), enumerate tags and dates via the GitHub REST API:

```bash
# Releases (preferred — gives tag, dates, and release body in one call)
gh api 'repos/Quattio/<repo>/releases?per_page=100' \
  --jq '.[] | "\(.tag_name)\t\(.created_at)"'

# Plain tags without a GitHub Release (e.g. some firmware repos):
gh api 'repos/Quattio/<repo>/tags?per_page=100' --jq '.[].name'
# then resolve each tag's commit date:
gh api repos/Quattio/<repo>/commits/<tag> --jq '.commit.committer.date'
```

**Prefer the GitHub MCP** (`list_releases` / `list_tags` / `list_commits` / `get_commit` / compare) — in the cloud routine it spans all connected product repos and is the reliable path. The `gh api` / `curl` forms above are the REST fallback (and `$GH_TOKEN` is often empty, so don't rely on `curl` without verifying). To read a file (e.g. `CHANGELOG.md`): `mcp__github__get_file_contents owner=Quattio repo=Quatt-cloud path=CHANGELOG.md`.

For each repo, capture every tag created between `<previous-cic-tag-date>` and `<target-cic-tag-date + 7d>` (the +7d tail accounts for App/Cloud releases that ship a few days after the CiC tag during the alpha→beta gap). For each tag, also read the release body (notable changes, breaking changes) and the commit list since the previous tag of that product — this gives you the QPD keys to feed Jira in step 2b.

To get the commit list (and QPD keys) between two tags of a product in one call, use the compare endpoint:

```bash
gh api repos/Quattio/<repo>/compare/<prev-tag>...<this-tag> \
  --jq '.commits[].commit.message' | grep -oiE 'QPD-[0-9]+' | sort -u
```

(`mcp__github__list_commits` is an MCP fallback for the same commit walk.)

> **Hotfix tags are first-class.** A tag like `v2.36.1` cut from a release branch IS a real shipped release even if Jira has no `Cloud v2.36.1` fixVersion. Treat it as a paired product version, attribute its commits to whichever QPD tickets they reference, and list it explicitly in Tier 2 / Tier 3 alongside the regular versions.

#### 2b. Jira cross-reference (ticket details + epic grouping)

Once the GitHub tag list is built, walk the commit messages of each tag's range to extract `QPD-NNNNN` keys, then query Jira for each key in bulk to get ticket details:

```jql
project = QPD AND issuekey in (QPD-13680, QPD-13740, ...) ORDER BY issuetype, key
```

For each ticket, capture `summary`, `status`, `issuetype`, `priority`, `parent` (epic name), `labels`, `components`. The **epic** is the key cross-product grouping signal — e.g. `CHILL | SW Improvements` ties together commissioning work that lands across App + Cloud + CiC in the same release wave.

If the GitHub commit log is incomplete (e.g. for a repo you can't fully traverse via the API), fall back to a Jira fixVersion query as a *secondary* source:

```jql
project = QPD AND fixVersion = "<exact-name>" ORDER BY issuetype, key
```

> ⚠️ **Always paginate Jira queries.** The Atlassian MCP `searchJiraIssuesUsingJql` caps at `maxResults=100`. Many windows have `totalCount > 100` (especially when `N/A` sentinel tickets eat slots). On the first call capture `totalCount`; if it exceeds 100 (or you get a spill-to-file warning), iterate with `nextPageToken` until exhausted. Request **minimal fields** (`["summary", "fixVersions", "resolutiondate"]`) — pulling `description` blows up the response.

Expected divergences between GitHub tags and Jira fixVersions:
- **Hotfix tags missing in Jira.** GitHub has `v2.36.1`; Jira does not. The cherry-picked ticket's fixVersion stayed on the next planned release (e.g. `Cloud v2.37.0`). Trust GitHub; attribute the ticket to the hotfix tag in the release notes.
- **Jira fixVersion set on tickets not yet shipped.** Jira may show `Cloud v2.37.0 ` with 15 tickets — but only 1 of those commits actually made it into a shipped GitHub tag. The 14 others are still on `develop`. Use GitHub commit lists, not Jira fixVersions, to decide what ships.
- **`fixVersion = N/A`.** Quatt sentinel — ignore for release-notes purposes, but flag tickets that touch production code paths (mirror the `release-auditor` heuristic).

#### 2c. Slack release-channel context

After GitHub + Jira give you the structural picture, search Slack for context: release-captain rollout notes, last-minute reverts, customer-facing caveats. Slack is invaluable for Tier 2 (operational reportage) but should never be used to discover versions that GitHub doesn't already confirm.

| Channel | Used for | Pattern |
|---|---|---|
| `#cloud-qa-and-deployment` | Cloud release-captain announcements + rollout notes | "Release v X.Y.Z" + GitHub release link + notable changes |
| `#cloud-development` | Cloud deeper discussion / blockers / why-this-hotfix | Less structured |
| `#app_quatt` | **App release-related posts (primary)** | Search by version string `v1.X.Y`; the canonical Quatt App channel — release announcements + customer-impact discussion land here |
| `#app_quatt_development` | App dev coordination | More technical / PR-level chatter; secondary to `#app_quatt` |
| `#app_quatt_product` | App PO/QA/dev coordination | Sometimes release-readiness notes |
| `#app_quatt_feedback_beta` | App beta releases | Beta tracks |
| `#embedded-alpha-releases` | **CiC + Wireless Platform alpha releases (primary)** — private channel | "Issues encountered during the embedded product releases"; current scope is CiC alpha. Search for release-tag references + rollout/QA notes |
| `#embedded-releases` | CiC + Wireless Platform stable releases | Companion to alpha channel; non-alpha announcements |
| `#cic-cloud` | Cross-team CiC ↔ backend context | Useful when a CiC release pairs tightly with a Cloud change |

Slack query templates (via `slack_search_public_and_private`):

```text
in:#cloud-qa-and-deployment "Release v" after:<previous-cic-date> before:<target-cic-date + 7d>
in:#app_quatt "v1." after:<previous-cic-date> before:<target-cic-date + 7d>
in:#embedded-alpha-releases <cic-tag-name> after:<previous-cic-date> before:<target-cic-date + 7d>
```

#### 2d. Final pairing decision

Pick **every** GitHub tag of each product whose creation date falls inside the window. If multiple App versions shipped (e.g. `v1.54.1` hotfix + `v1.55.0` + `v1.56.1`), include all — customers receive all updates in the window. In the Tier 2 header, list every paired version explicitly so ops can see the full shipped surface.

**Tag-format gotchas:**
- CiC + Wireless Platform tags have no `v` prefix; App + Cloud tags do.
- Jira fixVersions are inverted: `CiC - V<x.y.z>` and `Wireless Platform - V<x.y.z>` use capital `V`, while `App v<x.y.z>` and `Cloud v<x.y.z>` use lowercase `v`. Read carefully.

### Step 3 — Pull tickets per Fix Version

For each Fix Version (CiC target, paired App, paired Cloud, paired Wireless Platform):

```jql
project = QPD AND fixVersion = "<exact-name>" ORDER BY issuetype, key
```

Fields: `summary`, `status`, `issuetype`, `priority`, `parent` (for epic name), `labels`, `components`.

**Watch for response-size truncation** — even without descriptions, a single fixVersion query can exceed the MCP token cap (the parent-epic field is verbose). The tool will auto-spill to a file; parse with `jq` (see `references/jira-queries.md`). Do **not** pull `description` for the bulk listing — too large. Pull descriptions selectively for ambiguous tickets via per-ticket lookups.

**Cross-fixVersion duplicates** are normal: a ticket touching both app and backend (e.g. ODU revision mapping) appears in both `App v...` and `Cloud v...`. Don't de-duplicate — list under each product in the engineering tier. In Tier 1/2 narrative, mention once.

### Step 4 — Classify each ticket into the three tiers

> **Guiding principle — the whole point of these release notes (Tier 1 above all): tell end customers what is _truly enabled, cross-product, and experienceable today_ — NOT what code merged.** A feature whose code shipped but whose runtime path is gated off (feature flag, config default, backend toggle not enabled in production) is **not** a customer feature. Tier 1 must reflect the *enabled* surface of the ecosystem, never the *merged* surface. This is the single most important rule for the customer tier — when in doubt, leave it out of Tier 1.

Classification is **AI inference from summary + parent epic** (no Jira label drives it). Rules:

**Tier 1 (public, customer-facing) — INCLUDE only:**
- Runtime in-app behaviour the customer interacts with (e.g. earnings screen default change, dashboard display fixes the customer sees).
- New runtime capabilities the customer directly uses (e.g. operating multiple Chills at runtime) — **only after the enablement check below confirms the feature is actually on in production**.
- Bug fixes whose effect the customer perceives in system behaviour (e.g. anti-legionella reliability, heating control accuracy, comfort-affecting fixes).

**Tier 1 — EXCLUDE (route to Tier 2 instead):**
- **Flag-gated / shipped-but-disabled features.** If the runtime path is gated off (feature flag, config default `false`, backend toggle not enabled in production), the customer cannot experience it → Tier 2 as "shipped but disabled", **never** Tier 1. Run the mandatory enablement check below before any runtime feature enters Tier 1.
- **Commissioning UX changes.** Commissioning mode is gated to installers — customers cannot reach it. `COMMISSIONING |` prefix in summary, or parent epic `CHILL | SW Improvements` / `Hybrid commissioning ...` → Tier 2.
- **Automatic / over-the-air firmware updates.** OTA is invisible to customers; they never trigger or see it. Parent epics `ODUv2 | Heatpump OTA Update`, `CHILL | Control Board OTA Update`, dongle FW% reporting → Tier 2.
- **Admin / CS-only features.** Anything that exposes data only to the Customer Success dashboard or admin API → Tier 2 (e.g. ADR0041 admin endpoints, multi-Chill Grafana link, faulty-flow-sensor support override).
- **Tech debt, dependency upgrades, CI, internal tooling** → Tier 2 "internal" rollup or omitted entirely.

**Feature-flag / enablement check (MANDATORY before any feature enters Tier 1):**

GitHub tags prove code *merged*; they do **not** prove a feature is *on*. For every Tier-1 candidate that is a **runtime / control behaviour** (anything other than a pure, unconditional UI change), verify the enablement path end-to-end before including it. The Quatt enablement chain is **cloud feature flag / config → MQTT config-or-settings payload → Redis key → controller gate**. Concretely:

- **Cloud:** grep the capability name across `Quatt-cloud/config/*.json`. A flag `false` in `default.json` and **not overridden to `true` in `production.json`** is OFF in the field. Also check whether it is per-installation writable or a **fleet-wide read-only** flag (schemas under `src/spec/schemas/`); a fleet-wide flag still `false` = nobody has it. Trace where it is sent (e.g. `settingsUpdate.ts`).
- **Controller:** grep the capability in `quatt_controller/src` for the gating `if` and the Redis read (e.g. `redis_reader.cpp` → a Redis enable key defaulting to `false`). Double-gates are common (e.g. `has_heatcharger && charge_cool_enabled`).
- **App:** flags named `*_feature_flag` / `*_mode` (e.g. `all_e_boost_mode`) and "scaffold … behind flag" commit messages mean the screen is flagged off.

If the path is gated off → it is **shipped but disabled** → route to Tier 2 with a "do not communicate externally" callout, keep it in Tier 3 (annotated), and **exclude it from Tier 1**. Only if you can trace an *enabled* path (flag `true` in production, reachable by customers) does a runtime feature belong in Tier 1. **Watch for in-wave patterns:** if one All-E / Chill feature in a wave is flagged off, treat sibling features in the same wave with the same suspicion (Boost Mode and the All-E "charge-cool" path shipped flagged-off in the same 4.8.0 wave — see failure mode 7c).

**Tier 2 (internal / operations / management) — INCLUDE:**
- All commissioning UX, with installer-impact callouts.
- All OTA flows (ODU, Chill control board, dongle, Thread firmware).
- Networking and connectivity work that affects field reliability.
- Admin API additions, support dashboard improvements, ops runbook-relevant items.
- Customer-impacting bug fixes with sufficient technical context (heating control, anti-legionella, flow sensors).
- Resilience features (ADR-tracked work like ADR0041 flowmeter mitigation).
- **Shipped-but-disabled (flag-gated) features.** Any capability whose code shipped this wave but is gated off in production (caught by the Step 4 enablement check). Call it out explicitly so installer-support / CS know it exists in the build but is **not active for customers** — use a `> **Shipped but DISABLED — do not communicate to customers/installers until the flag is enabled:** ...` callout that names the flag and its default. This is the counterpart to excluding it from Tier 1: the feature is recorded for ops, with a clear "do not promise this yet" warning, so CS never tells a customer about a feature they don't have.
- A separate "Internal / tech-debt highlights" rollup at the bottom for SDK upgrades, controller release management, and similar.

**Tier 3 (engineering) — INCLUDE everything:**
- Ticket index **grouped by Jira parent Epic** (not by product), rendered as a filterable/sortable table. Each epic is a coloured header row (linking to the Jira epic) showing its ticket count, followed by that epic's rows; assign each epic group a rotating colour class `epic-c0`..`epic-c4` (cycle for a 6th+ epic).
- **Keep the Product column and the Product filter** — product is shown per row and still filterable; only the *grouping* changed from product to epic.
- Tickets with **no parent epic** collect under a trailing "No parent Epic" group.
- Each row: QPD key (linked), Product chip, Type badge, Priority, Summary.
- **A column-header sort flattens the table** (clears the epic grouping) — this is expected behaviour, not a bug.
- **Product naming:** the wireless/dongle group is labelled **Thread** (`quatt-dongle` / Thread FW); **HeatCharger firmware** (`quatt-heatcharger-firmware`) rows are folded into the **CiC** product.
- **No "new since last revision" highlight** — the whole release is shown as new; the old `isNew`/`new-row`/`new-tag` mechanism is removed.
- Note cross-product duplicates in the footer (e.g. "QPD-XXXXX appears in both App and Cloud").
- **Annotate flag-gated tickets.** Engineering detail can be richer than the other tiers, but where a shipped ticket's runtime path is gated off, mark it explicitly — e.g. `(shipped, gated off behind \`<flag>\`)` on the row or in the footer — so a gated feature is never mistaken for a live one when read at the engineering level.
- Mention the `release-auditor` skill for traceability audits.

### Step 5 — Group Tier 2 by Jira parent Epic

Tier 2 is grouped by each ticket's **Jira parent Epic** (not by feature theme, not by product). One card per epic, ordered by ticket count descending (largest first), with a trailing **"No parent Epic"** fallback card for tickets Jira leaves unparented.

Each epic card contains:
- **Clickable title** — the *whole* epic title is the link to the Jira epic (no `QPD-XXX ·` prefix in front of it), followed by a ticket-count chip.
- **Short description** — 1–3 sentences synthesised from the **epic's own Jira description (high weight)** plus its **child tickets shipped in this wave (medium weight)**. Fetch the epic description via a per-epic Jira lookup (the epic key is each ticket's `parent`).
- **Bullets** citing the epic's tickets. After each QPD key, show the ticket's **owning Team** as a colour-coded pill. **Do not** add a priority (High/Urgent) tag next to the pill — it clutters; priority lives in Tier 3.
- **Impact callout** — `> **Impact for <ops|CS|installers>:** ...` per epic.
- **Shipped-but-disabled callout** inside the owning epic when a flag-gated feature lives there (see Step 4) — the "do not communicate" warning sits in the epic that owns the work, not in a separate section.

**Team field.** The owning team is the Jira **Team** field `customfield_10001` (use `.name`). Map to a colour class: `App`→`team-app`, `Cloud / Backend`→`team-cloud`, `Embedded Systems`→`team-embedded`, `Systems Control`→`team-control`, `SW&I`→`team-swi`, unset→`team-none` (label "no team set"). Note `SW&amp;I` renders as textContent `SW&I`.

**Merge technical-debt epics.** Epics that are generic technical-debt buckets (e.g. `SW&I Technical Debt`, `26.Q1 Embedded Technical Debt`, `Technical Debt and Continuous Improvement`) are combined into a single **"Technical Debt"** parent card (`.tech-debt-group`) with one `.subcard` sub-panel per epic — each sub-panel keeps its own clickable title, count chip, description, bullets and impact box. Place the merged card where the largest of the merged epics would otherwise sit.

**Scope banner.** Above the cards, a `.scope-banner` gives the version list, wave phase, and an "Enablement sweep" bullet list of what actually goes live. Space it for readability (labelled `.lead` paragraphs + a bulleted sweep), not one dense block.

### Step 6 — Write three markdown files

Scratch directory: `/tmp/release-notes-<sanitised-target>/` (sanitise spaces and slashes: `CiC - V4.5.0` → `CiC-V4.5.0`). These markdown files are intermediate artifacts that feed Step 8; the committed deliverable is the dashboard HTML page. Three files:

| File | Audience | Length budget | Style |
|---|---|---|---|
| `release-notes-public.md` | Mobile-app customers | ~200–400 words | Neutral English changelog; no marketing copy; no jargon; no Jira keys; bullet `## What's new` + `## Heating performance and reliability` + `## Bug fixes and maintenance` (single line rollup). |
| `release-notes-internal.md` | Ops / Installer Support / CS / management | ~1500–3000 words | **Epic-grouped** (one section per Jira parent epic, ordered by ticket count, + a "No parent Epic" fallback). QPD keys followed by colour-coded owning-Team pills (no priority tag). `> **Impact for X:**` callout per epic. Technical-debt epics merged into one "Technical Debt" section. Scope banner with version list + enablement sweep. |
| `release-notes-engineering.md` | Engineers | ~1000–2000 words | Ticket index **grouped by Jira parent epic** (Product column + filter retained per row). Cross-product duplicate notes at bottom. |

**Title convention (all three files + Slack parent posts):** the H1 title is **`Quatt Ecosystem Release DD.MM.YYYY`**, where the date is the target CiC tag's creation date (e.g. `Quatt Ecosystem Release 04.06.2026`). Do NOT title documents "Release notes — CiC X.Y.Z ecosystem release" — the date, not the CiC version, is the headline. Append the tier qualifier after an em-dash where needed: `Quatt Ecosystem Release 04.06.2026 — Internal notes` / `— Engineering changelog`. The full version list (CiC, Cloud, App, bundled firmware) stays in the header banner below the title, where it already lives. The scratch directory naming (`/tmp/release-notes-<sanitised-target>/`) keeps using the CiC version, not the date.

### Step 7 — Surface remaining questions

After the drafts are written, list any classification calls you weren't sure about back to the user. Common ones:
- Did a feature actually graduate to GA, or just the implementation? (E.g. HYBRID_BETA → GA — confirm it's user-visible.)
- Are there fixes in the bug-rollup the user wants named specifically rather than generalised?
- Are there App/Cloud versions in the window that arguably belong to the *previous* CiC release? (E.g. 1.54.0 vs 1.55.0 when 4.5.0 ships.)

In an unattended (cloud-routine) run, record these as a "Open follow-ups" section in the PR description (Step 8) instead of pausing for the user.

### Step 8 — Web dashboard artifacts (release-notes site)

This skill runs **inside a checkout of `github.com/Quattio/dashboard-ecosystem-release-notes`** — the current working directory is the repo root. There is **no separate local clone path**; write directly into the working tree. Pushing to `main` auto-deploys via Cloudflare Pages. After the three markdown tiers are approved, generate:

1. **`releases/YYYY-MM-DD.html`** — one self-contained page per release wave (date = CiC tag creation date). **Filename and branch use `YYYY-MM-DD`** to match the repo's existing `releases/` pages and the `releases.js` page paths; the human-facing H1 title still uses `DD.MM.YYYY` (dots) per Step 6. **Copy the structure of the current-format template `releases/2026-07-16-epic-grouping-test.html`** (relative paths are one level deep: `../styles.css`, `../index.html`). Structure:
   - **topbar + page-head + three tab panels** (Customer / Internal / Engineering).
   - **Customer tab** — bilingual: two `.lang-pane` divs (`#tier1-en`, `#tier1-nl`) behind an English/Nederlands pill toggle (persisted in `localStorage` as `qrn-tier1-lang`, default `en`). Dutch translation per the glossary + locked terminology (ketel niet boiler; Chill/HeatBattery/HomeBattery/All-Electric blijven Engels; "buitenunit" for outdoor unit). Only Tier 1 is translated — Internal and Engineering tabs stay English.
   - **Internal tab** — a `.scope-banner` at top, then one `.theme-card` per Jira parent epic (Step 5): clickable epic title + count chip, short description, ticket bullets with colour-coded Team pills, per-epic Impact callout; technical-debt epics merged into a `.tech-debt-group` card with `.subcard` sub-panels; trailing "No parent Epic" card.
   - **Engineering tab** — a filterable/sortable `table.tickets` (Product / Type / Priority filters + search) whose `render()` **groups rows by Jira parent epic**: a coloured `tr.epic-row` header (epic link + count) then that epic's `tr.tk` rows, each group cycling `epic-c0`..`epic-c4`; a column-header sort flattens the list. Ticket data is embedded as a JS array in which **each row carries its parent-epic key** (plus a small epic-key→title/URL map). Product is `CiC | Cloud | App | Thread` with HeatCharger firmware folded into CiC. **No `isNew`/`new-row` highlight.**
   - Two small JS passes run at the end of the inline `<script>`: one makes the whole Internal-tab epic title the link (dropping the `QPD-XXX ·` prefix), one adds the `team-*` colour class to each Team pill from its text.
2. **`releases.js`** — prepend a new entry to `window.RELEASES` (date, title per the Step 6 title convention, badge `alpha|stable|hotfix`, `page` path, product chips with classes `cic|cloud|app|fw`, stats line) and refresh `window.SUMMARY` (releases in window, ticket count, product count, open follow-ups). `index.html` renders this manifest at load — it must NOT be edited per release.
3. **Styling is locked to the `quatt-visual-branding` skill** (light default, Plus Jakarta Sans, category chip colours, pill buttons, green selected states). `styles.css` and `index.html` only change on intentional redesigns, not per release. The epic-grouped format's classes already live in shared `styles.css` — `.scope-banner`, `.epic-desc`, `.team` + `.team-*`, `.tech-debt-group`/`.subcard`, and `.epic-row`/`.epic-cN`/`tr.tk` rail — so **reuse them; do not inline per-page CSS**.

**Publish (after user confirms, or automatically in a cloud routine): open a PR, do not push straight to `main`.** The output is customer-facing and a maintainer should review before it deploys. Create a branch, commit the new page + manifest, and open a PR; merging to `main` triggers the Cloudflare Pages deploy. Use the GitHub MCP (works without a local git remote):

- `mcp__github__create_branch` — branch `release-notes/YYYY-MM-DD` from `main`
- `mcp__github__push_files` — commit `releases/YYYY-MM-DD.html` + `releases.js` in one commit, message `Add Quatt Ecosystem Release DD.MM.YYYY` (filename uses `YYYY-MM-DD`; the commit-message title keeps the `DD.MM.YYYY` dotted form)
- `mcp__github__create_pull_request` — title `docs: Quatt Ecosystem Release DD.MM.YYYY`, body = the three tiers summary + open follow-ups (Step 7)

**Link-formatting rule for every URL in the PR body and Slack post (PR link AND preview link).** Put **each** URL on **its own line as an angle-bracket autolink**, keep its label on the *previous* line, and separate consecutive link entries with a **blank line**:

```
PR:
<https://github.com/Quattio/dashboard-ecosystem-release-notes/pull/NN>

Rendered preview (sign in with your @quatt.io Google account):
<https://release-notes-staging.dashboard-ecosystem-release-notes.pages.dev>
```

Never stack two URLs on back-to-back lines and never put a label word immediately in front of a URL on the same line. GitHub/Slack renderers fold an adjacent word (or the next line's leading word, e.g. the `Rendered` that follows the PR link) into the preceding href — producing a dead link whose target ends in `…/pull/NNRendered` or starts with `rendered…`. Angle brackets, a line break per URL, and a blank line between entries guarantee clean, clickable links.

If a maintainer is running interactively and explicitly wants to skip review, they may instead commit the same files directly to `main` with local git.

The production origin auto-deploys **Cloudflare Pages**: https://dashboard-ecosystem-release-notes.pages.dev — public URL gated by Google OAuth (quatt.io accounts only; enforced server-side in `functions/api/create-session.ts`, OAuth client `ecosystem-dashboard` in Google Cloud). The CF build runs `cf-pages-build.sh` (npm install for the `jose` dep + copy static files to `dist/`) — keep that script, `package.json`, and `functions/` intact when generating new release pages. CF Pages preview deployments (branch/commit subdomains) fail Google sign-in by design — only the production origin is registered. The repo's pre-dashboard history is the Quatt internal-tool React template — preserved in history, do not resurrect its files.

## 3 · Voice rules

- **Glossary first.** Apply the Quatt language glossary (Step 0) before any voice rule below — product names, capitalisation, brand-voice terms, and avoid-list always win over generic-changelog instincts.
- **Locked terminology — applies to ALL tiers including Tier 1:**
  - **CiC** is the canonical name. **Never** use "Quatt Controller" — that's an invented Anglicisation. Customer-facing copy still says CiC.
  - Chill, HomeBattery, HeatBattery, HeatCharger — keep in English in every translation; never localise to Koeling, thuisbatterij, etc.
  - In Dutch: "ketel", never "boiler".
  - ODU is the official internal name; customer-facing copy avoids the acronym and uses "outdoor unit" where context demands.
  - **Never refer to a generic "device" in Tier 1 — always name the specific Quatt product** (e.g. "the Quatt dongle", "your Chill", "the CiC"). Customer copy must point at a concrete product, not "a device".
  - If unsure, consult the live glossary at https://quatt.slite.com/app/docs/ai_xKOdL3NZkmW — never invent a friendly synonym.
- **Tier 1 — neutral English changelog.** No "we", no "We're thrilled to announce", no emojis, no marketing copy. Plain bullet points or short paragraphs. Aim for the tone of Apple's "About this update" — informative, brief, no hype.
- **Tier 2 — operational reportage.** Direct sentences, technical detail OK, action-oriented callouts (`> **Impact for ops:** ...`).
- **Tier 3 — telegraphic.** Just ticket key + summary; no editorial commentary.

## 4 · What NOT to do

- **Don't put commissioning items in Tier 1.** Commissioning is installer-only — customers cannot access it. (See `feedback_release_notes_tier1.md` memory.)
- **Don't put automatic OTA in Tier 1.** Customers never see OTA happening. (Same memory.)
- **Don't put flag-gated / shipped-but-disabled features in Tier 1.** A merged commit is not an enabled feature. Verify the enablement path (Step 4 "Feature-flag / enablement check"); if the flag is off in production, route to Tier 2 as "shipped but disabled" (with a do-not-communicate callout for CS/installers), never Tier 1. (See failure mode 7c.)
- **Don't name specific QPD keys in Tier 1.** It's a customer document; Jira links break the abstraction.
- **Don't group Tier 2 by feature theme or by product.** Group by **Jira parent epic** (Step 5), ordered by ticket count; merge technical-debt epics into one "Technical Debt" panel; unparented tickets go to a "No parent Epic" card.
- **Don't add a priority (High/Urgent) tag next to the Team pill in Tier 2.** It clutters the bullets — priority stays in Tier 3.
- **Don't group Tier 3 by product.** Group by Jira parent epic (colour-coded header rows), keeping the Product column + filter per row.
- **Don't reintroduce a "new since last revision" highlight** (`isNew` / `new-row` / `new-tag`). The whole release is presented as new.
- **Don't pull descriptions for the bulk fixVersion query** — the MCP response will exceed token limits. Pull descriptions selectively for ambiguous tickets only.
- **Don't auto-detect target version from git tags.** Ask the user (or read the routine trigger payload); CiC `4.5.0-alpha.0` and `4.5.0-beta.0` are not release-notes targets *unless the user explicitly says "treat the alpha as a general release"*. In that case widen the tail window to +7 days (alpha→beta gap).
- **Don't de-duplicate cross-fixVersion tickets in Tier 3.** They legitimately belong to both products' releases (e.g. ODU revision mapping in App + Cloud). Note duplicates at the bottom of the engineering file instead.
- **Don't start version discovery from Jira.** Jira is a PM-layer cross-reference, not a source of truth. It drifts: hotfix tags cut from release branches (e.g. `Cloud v2.36.1`, `App v1.54.1`) carry cherry-picks whose Jira fixVersion was *never moved*. Always start from GitHub tags / releases and walk commits to QPD keys, then look those keys up in Jira for context.
- **Don't trust a one-shot `maxResults=100` windowed Jira query.** It will silently miss tickets. Page with `nextPageToken` until `totalCount` is exhausted, or query by explicit issuekey list (built from GitHub commit walk).
- **Don't use Slack to discover versions** — only to add context to versions GitHub already confirmed. Slack-only "the team said we shipped X" claims have been wrong before.
- **Don't push the dashboard page straight to `main`.** Customer-facing output goes through a PR for maintainer review (Step 8).

## 5 · Outputs

| File | Location | Distribution |
|---|---|---|
| `release-notes-public.md` | `/tmp/release-notes-<sanitised-target>/` (scratch) | Marketing / loc team → mobile-app content CMS |
| `release-notes-internal.md` | same | Slack thread for ops / CS / installer-support / management |
| `release-notes-engineering.md` | same | Slack thread or PR description for engineering visibility |
| `releases/YYYY-MM-DD.html` + `releases.js` | dashboard repo working tree | committed via PR → Cloudflare Pages (Step 8) |

Slack-posting the markdown tiers is a user-triggered follow-up (use the `slack_send_message` MCP), not automatic.

## 6 · Open improvements (not yet implemented)

These were identified during dry runs and are worth addressing in future iterations:

1. **Deterministic customer-vs-internal classification.** Right now Tier 1/2 split is heuristic from summary + parent epic. A dedicated Jira label (`customer-facing` or similar) would make this deterministic — worth proposing to the team.
2. **Automatic paired-version discovery.** Step 2 currently combines Slack searches + paginated Jira queries + GitHub release reads. A scripted helper that takes a CiC version and emits the paired App/Cloud/Wireless Platform versions (with hotfix-tag awareness) would be more robust.
3. **Tier 1 voice refinement.** The dry-run voice is "neutral changelog". If Quatt marketing has an established customer voice, encode it here.
4. **Multi-Chill caveat.** Capabilities that customers technically *have* but can't reach without an installer visit are ambiguous — currently kept in Tier 1 as runtime experiences, but worth a clearer rule.

## 7 · Known failure modes (from past runs) — read before running

Real bugs that have happened — read these before running the skill.

### 7a. Started from Jira instead of GitHub (CiC 4.6.0-alpha.0, 2026-05-13)

**Symptom:** Three releases missed entirely (`App v1.56.1`, `Cloud v2.35.1`, `Cloud v2.36.1`). Tier 2 / Tier 3 omitted ~25 tickets. `Cloud v2.36.1` (shipped 2026-05-12 12:00 with QPD-14079 cherry-picked) had no Jira fixVersion at all — Jira-only discovery was structurally blind to it.

**Root cause:** Started version discovery from a windowed Jira fixVersion query. Jira's `fixVersion` field reflects *planned* releases (PM intent); GitHub tags reflect *actual* shipped releases. They diverge for hotfix tags cut from release branches. Compounding bug: the windowed Jira query was also capped at `maxResults=100` with no pagination, so even versions Jira *did* know about were missed when `N/A`-sentinel tickets ate slots.

**Fix:** Step 2a (GitHub tags first, source of truth) + Step 2b (Jira used only as cross-reference for ticket details, with pagination) + Step 2c (Slack for context, never for discovery).

### 7b. Alpha treated as "internal only" when user wanted it shipped (CiC 4.6.0-alpha.0, 2026-05-13)

**Symptom:** Skill defaulted to "alpha doesn't ship to customers, so don't pair App/Cloud." User then corrected: "treat this alpha as a general release, include APP and BE."

**Fix:** Always ask whether to treat alpha/beta as a paired release. If yes, apply the +7d tail window (alpha→beta gap at Quatt) so the App/Cloud/Wireless releases that land in that gap are correctly attributed. In an unattended run, default to the trigger payload's intent (a stable tag → ship; an alpha/beta tag → notes only if the payload says so).

### 7c. Flag-gated feature published to Tier 1 as if live (CiC 4.8.0-beta.0, 2026-06-23)

**Symptom:** Tier 1 (customer, EN + NL) announced *"heat extracted by the Chill is automatically used to charge the HeatBattery"* as a new customer feature. The capability (All-E "charge-cool", QPD-13343 / QPD-14186) had merged, but was gated off fleet-wide and unreachable by any customer.

**Root cause:** Classification inferred "customer-visible" from the CiC changelog line ("Integrate All-E cooling capacity model") — i.e. from *code merged*, not *feature enabled*. The enablement path was never checked: cloud `chillAllEChargeCoolEnabled` is `false` in `config/default.json` and not overridden in `production.json` (fleet-wide, read-only, not API-writable), and the controller double-gates on a Redis enable key (1387, default `false`) + `has_heatcharger`. The same wave had Boost Mode *correctly* flagged as a flagged-off prototype, so the off-by-flag pattern was visible in-wave and should have been applied to the sibling All-E feature.

**Fix:** Step 4 "Guiding principle" (Tier 1 = the *enabled* cross-product surface, never the *merged* surface) + the mandatory "Feature-flag / enablement check" (cloud config → Redis → controller gate, with the in-wave-pattern heuristic); Tier 2 "shipped but disabled" callout for CS/installers; Tier 3 gated-state annotation; new "What NOT to do" bullet.

## 8 · References

- **Quatt language glossary (live, mandatory):** https://quatt.slite.com/app/docs/ai_xKOdL3NZkmW — fetched via Slite MCP at the start of every run (Step 0)
- `references/jira-queries.md` — JQL templates, fixVersion patterns, response-size handling, pagination pattern
- `references/classification-examples.md` — Worked examples from the CiC 4.5.0 dry run for each tier
- `release-auditor` skill — Use for commit-vs-ticket traceability audits (different output, same data source)
- `quatt-sprint-readout` skill — Use for sprint-window reporting across teams (different time slice)
- Memory `feedback_release_notes_tier1.md` — Authoritative scope rule for Tier 1
- Jira cloudId: `e00d2e3c-9946-4be6-b81a-0bb231fc50c7`
- Quatt Jira browse URL pattern: `https://quatt-team.atlassian.net/browse/QPD-NNNNN`
- Jira Fix Version filter URL: `https://quatt-team.atlassian.net/issues?jql=project%20%3D%20QPD%20AND%20fixVersion%20%3D%20%22<urlencoded-name>%22`

### Quick reference

- GitHub repos: `Quattio/cic-yocto-builder`, `Quattio/Quatt-cloud`, `Quattio/quatt-mobile-app`, `Quattio/quatt-dongle`, `Quattio/quatt-heatcharger-firmware`
- GitHub access: prefer the GitHub MCP (`list_releases` / `list_tags` / `list_commits` / `get_commit` / compare) which spans the connected product repos; `gh api` / `curl -H "Authorization: Bearer $GH_TOKEN"` are REST fallbacks. No local clones. `$GH_TOKEN` is often empty — the MCP connection grants access, not that env var.
- Slack release-context channels (full table in Step 2c): `#cloud-qa-and-deployment`, `#cloud-development`, `#app_quatt` (primary App channel), `#app_quatt_development`, `#app_quatt_product`, `#app_quatt_feedback_beta`, `#embedded-alpha-releases` (primary CiC alpha channel, private), `#embedded-releases`, `#cic-cloud`
