# Sprint Readout — Cloud Automation Runbook

Weekly, fully-headless Quatt sprint readout. Pulls the current open sprint from
Jira, builds a 2-slide Quatt-branded PowerPoint, uploads it to a fixed Confluence
page (append-only index table), and DMs Gustavo on Slack with the link.

This runs as a **scheduled cloud routine** (Mondays 08:00 Europe/Amsterdam). The
routine clones this repo; do everything from `automation/sprint-readout/`.
The cloud agent has **no access to any local machine** — it is fully self-contained here.

> Mirror of the local `quatt-sprint-readout` skill, adapted for headless cloud
> execution. **Keep this file and `build_slides.py` in sync with that skill**
> (`~/.claude/skills/quatt-sprint-readout/`) — the skill is the source of truth for
> content/branding; this runbook is canonical for the cloud delivery path.

## Environment

- `pip install python-pptx` (sandbox has no preinstalled deps).
- Files here: `build_slides.py` (deck template), `slim_pptx.py` (size optimizer),
  `references/` (JQL templates, team/repo mapping).
- **Required env secrets** (set on the cloud environment): `CONFLUENCE_USER`
  (Atlassian account email) and `CONFLUENCE_PAT` (API token). Confluence delivery
  is done via REST with these — see step 6. If either is missing, STOP at step 6
  and report it; do not silently skip delivery.

## Connectors available to the routine

- **Atlassian** — Jira ONLY. Verified 2026-06-17: this connector's Confluence surface
  is **read-only** — only `search` (Rovo) and `fetch` (read-by-ARI); it exposes **no**
  `create/updateConfluencePage` and **no attachment tool**. Use it for Jira reads only.
- **Slack** — the DM to Gustavo.
- **No GitHub connector** — use Jira `fixVersions` for release names; do NOT attempt GitHub PR queries.
- **Confluence writes are NOT reachable via any connector** — done via REST + PAT (step 6).

## Constants

- Confluence page ID: `8126465` ("Quatt Ecosystem Sprint Report"), space `~712020a597455b77564d70a1f7a9221a62c95f`
- Confluence base: `https://quatt-team.atlassian.net/wiki`
- Page URL: https://quatt-team.atlassian.net/wiki/spaces/~712020a597455b77564d70a1f7a9221a62c95f/pages/8126465
- Jira cloudId: `e00d2e3c-9946-4be6-b81a-0bb231fc50c7`, project `QPD`
- Slack: Gustavo Casado, user `U06LT8JB78A` (English; standard-markdown links `[label](url)`)
- Five report teams: Embedded Systems, Cloud / Backend, APP, Systems Control, SW&I. **energyOS is out of scope.**

## Steps

1. **Sprint window** — JQL `project = QPD AND sprint in openSprints()`, read `customfield_10020` → the active `CW<NN>` sprints (EMB / SW&I / Control), with `startDate` / `endDate`. Ignore `energyOS - …` and `CHILL - …` sprints.
2. **Done tickets** — `project = QPD AND sprint in (<ids>) AND statusCategory = Done`; fields `summary, issuetype, parent, fixVersions, customfield_10001`. Split the SW&I umbrella by `customfield_10001.name` into Cloud / Backend, APP, SW&I, UX/QA. Per-team done counts feed the slide-1 stat cards (biggest contributor gets the Neon pill). Filter out `energyOS`. The per-sprint Delta (tickets closed against each epic this sprint), incl. the perpetual-bucket footer Deltas, comes from THIS query — not the children query in step 3.
3. **Epic completion** — collect unique `parent` keys from the done tickets; look up titles + status. For completion %, query children `parent in (...)` (fields `status, parent`):
   - **EXCLUDE the perpetual buckets from the children query entirely** — do NOT fetch children of QPD-152 (Production Incidents/Maintenance), the Bug Fixing & Fleet Diagnostics epic, or the Tech Debt epic. They never reach 100%, are never shown in the table, and their children are the bulk of the volume (the 2026-06-17 run paginated 1,169 children — ~600 of them were these buckets). Their sprint Deltas still come from step 2 and go in the buckets footer.
   - For every REMAINING (feature) epic, **paginate to completion** (`nextPageToken` until `hasNextPage` is false) before computing done/total — do NOT stop early, or %s come out wrong (an early run undercounted Dongle SW Improvements at 62% vs the true 32%). With the perpetual buckets removed the volumes are small enough to fully paginate reliably.
4. **Releases** — derive from Jira `fixVersions` (CiC / Cloud / App / Controller / Wireless Platform).
5. **Build the deck** — copy `build_slides.py` → `/tmp/build_this.py`, replace the data-constants block (TITLE_LINE, SUMMARY_LINE, TEAM_STATS, DELIVERIES [3 product tints: Copper=Heating/All-E, Blue=Chill, Green=Energy/HomeBattery], RELEASES, FOOTER, TABLE_DATA, SCOREBOARD, RISKS, BUCKETS_FOOTER, OUT_PATH) with the sprint's figures. Content in **English**. Run it, then `python3 slim_pptx.py <in> /tmp/sprint-<YY>Q<N>-cw<NN>-slides-<YYYY-MM-DD>.pptx` (the `<YYYY-MM-DD>` is **today's generation date**, the date the routine runs). Verify it reopens with exactly 2 slides.

6. **Deliver to Confluence — via REST API + PAT** (the connector can't write Confluence). Auth with Basic `-u "$CONFLUENCE_USER:$CONFLUENCE_PAT"`; on `401`/`403` retry the same call with `-H "Authorization: Bearer $CONFLUENCE_PAT"`. Base URL `https://quatt-team.atlassian.net/wiki/rest/api`. Filenames carry the **generation date** (`sprint-<YY>Q<N>-cw<NN>-slides-<YYYY-MM-DD>.pptx`), so **every run produces a unique attachment and a brand-new table row** — even when the same sprint is reported on multiple Mondays. There is **no upsert**: each run = a new deck + a new row (newest-on-top). This guarantees the upload always lands as a distinct file and the page version always bumps.

   - **6a. Upload the deck (always a NEW attachment).** Because the filename is unique per run (it embeds the generation date), a plain POST to `…/child/attachment` never collides — no check-first/version dance is needed:
     ```bash
     curl -s -u "$CONFLUENCE_USER:$CONFLUENCE_PAT" -X POST -H "X-Atlassian-Token: nocheck" \
       -F "file=@/tmp/sprint-<YY>Q<N>-cw<NN>-slides-<YYYY-MM-DD>.pptx" \
       "https://quatt-team.atlassian.net/wiki/rest/api/content/8126465/child/attachment"
     ```
     (If a run is ever repeated on the *same* calendar day, the filename would collide and POST returns **400 “same file name as an existing attachment”** — in that case POST the bytes to `…/child/attachment/<id>/data` to add a new version instead.)
   - **6b. Read current body + version**:
     ```bash
     curl -s -u "$CONFLUENCE_USER:$CONFLUENCE_PAT" \
       "https://quatt-team.atlassian.net/wiki/rest/api/content/8126465?expand=body.storage,version"
     ```
     Take `body.storage.value` (storage XHTML) and `version.number` (= N).
   - **6c. PREPEND a new row** (one per run — do NOT upsert/replace). Parse the table rows and insert a new row immediately after the header row (newest-on-top). Every run adds its own row; previous rows for the same sprint stay as the run history.
     Row format — the **Dates** cell is the **generation date** (the date this routine ran), NOT the sprint's data window:
     ```html
     <tr><td><p>CW<NN> (<YYQN>)</p></td><td><p><DD MMM YYYY (generation date)></p></td><td><p><a href="/wiki/download/attachments/8126465/<filename>"><filename></a></p></td></tr>
     ```
     (Weekly cadence vs biweekly sprints means the same sprint is reported on multiple Mondays — the dated filename + always-new row gives one row per generation, so the table doubles as a run log.) **NEVER** wrap the XHTML in `<![CDATA[ ]]>`. Build the PUT JSON with a real JSON serializer (`python3 -c 'import json,...'`), never hand-concatenate. Because the filename and date change every run, the body always differs and the version always bumps — a 200 with a bumped version is the expected result.
     ```bash
     curl -s -u "$CONFLUENCE_USER:$CONFLUENCE_PAT" -X PUT -H "Content-Type: application/json" \
       "https://quatt-team.atlassian.net/wiki/rest/api/content/8126465" -d @/tmp/page_update.json
     ```
     `/tmp/page_update.json` = `{"version":{"number":<N+1>},"title":"Quatt Ecosystem Sprint Report","type":"page","body":{"storage":{"value":"<NEW_XHTML>","representation":"storage"}}}`.
   - **6d. Verify** — GET the page again (6b) and confirm this sprint's row is present as a real `<a …>` link, not escaped `&lt;` text.

7. **Slack DM** Gustavo (`U06LT8JB78A`), English, standard markdown:
   ```
   Hi Gustavo — sprint CW<NN> deck is ready (<DD MMM> → <DD MMM YYYY>, all five SW management teams).

   [Sprint CW<NN> deck on Confluence](https://quatt-team.atlassian.net/wiki/spaces/~712020a597455b77564d70a1f7a9221a62c95f/pages/8126465)

   **Quick-take:** Cloud / Backend <N> · APP <N> · Embedded <N> · Systems Control <N> · SW&I <N> → **<total> tickets done across <N> epics**. Highlights: <punchline>. <one risk to watch>.
   ```

## Status report (end every run with this)

Sprint + window; per-team counts; total tickets/epics; deck built (2 slides) y/n;
attachment uploaded y/n (always a new, date-stamped file); **new row added** (one per run)
& rendered as a real `<a>` link y/n, with the page version bump; Slack DM result with link.
If any Confluence REST call fails, report the exact call + HTTP status — never fail silently.

## Validated cloud-side

- **2026-06-22 (Opus):** Convention changed — filenames now embed the **generation date**
  (`sprint-<YY>Q<N>-cw<NN>-slides-<YYYY-MM-DD>.pptx`) and the **Dates** column holds the
  generation date, not the sprint window. Each run is a plain POST of a unique attachment
  plus a **new prepended row** (no upsert), so the page version bumps every run.
- **2026-06-17 (Opus):** CW25 detected; 63 tickets / 22 epics; 2-slide deck built; both REST
  ops returned 200. The Atlassian connector has no Confluence write tools — REST + PAT is the
  only delivery path.
