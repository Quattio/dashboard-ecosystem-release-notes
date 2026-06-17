# Sprint Readout — Cloud Automation Runbook

Weekly, fully-headless Quatt sprint readout. Pulls the current open sprint from
Jira, builds a 2-slide Quatt-branded PowerPoint, uploads it to a fixed Confluence
page (append-only index table), and DMs Gustavo on Slack with the link.

This runs as a **scheduled cloud routine** (Mondays 08:00 Europe/Amsterdam). The
routine clones this repo; do everything from `automation/sprint-readout/`.
The cloud agent has **no access to any local machine** — it is fully self-contained here.

> Mirror of the local `quatt-sprint-readout` skill, adapted for headless cloud
> execution. Keep this file and `build_slides.py` in sync with that skill.

## Environment

- `pip install python-pptx` (sandbox has no preinstalled deps).
- Files here: `build_slides.py` (deck template), `slim_pptx.py` (size optimizer),
  `references/` (JQL templates, team/repo mapping).
- **Required env secrets** (set on the cloud environment): `CONFLUENCE_USER`
  (Atlassian account email) and `CONFLUENCE_PAT` (API token). Confluence delivery
  is done via REST with these — see step 6. If either is missing, STOP at step 6
  and report it; do not silently skip delivery.

## Connectors available to the routine

- **Atlassian** — Jira ONLY. Verified 2026-06-17: this connector has **no Confluence
  scope** (Confluence REST via the connector returns `401 scope does not match`, and
  it exposes no Confluence page/attachment tools). Use it for Jira reads only.
- **Slack** — the DM to Gustavo.
- **No GitHub connector** — use Jira `fixVersions` for release names; do NOT attempt GitHub PR queries.
- **Confluence is NOT reachable via any connector** — it is done via REST + PAT (step 6).

## Constants

- Confluence page ID: `8126465` ("Quatt Ecosystem Sprint Report"), space `~712020a597455b77564d70a1f7a9221a62c95f`
- Confluence base: `https://quatt-team.atlassian.net/wiki`
- Page URL: https://quatt-team.atlassian.net/wiki/spaces/~712020a597455b77564d70a1f7a9221a62c95f/pages/8126465
- Jira cloudId: `e00d2e3c-9946-4be6-b81a-0bb231fc50c7`, project `QPD`
- Slack: Gustavo Casado, user `U06LT8JB78A` (English; standard-markdown links `[label](url)`, NOT `<url|label>`)
- Five report teams: Embedded Systems, Cloud / Backend, APP, Systems Control, SW&I. **energyOS is out of scope.**

## Steps

1. **Sprint window** — JQL `project = QPD AND sprint in openSprints()`, read `customfield_10020` → the active `CW<NN>` sprints (EMB / SW&I / Control), with `startDate` / `endDate`. Ignore `energyOS - …` and `CHILL - …` sprints.
2. **Done tickets** — `project = QPD AND sprint in (<ids>) AND statusCategory = Done`; fields `summary, issuetype, parent, fixVersions, customfield_10001`. Split the SW&I umbrella by `customfield_10001.name` into Cloud / Backend, APP, SW&I, UX/QA. Per-team done counts feed the slide-1 stat cards (biggest contributor gets the Neon pill). Filter out `energyOS`.
3. **Epics** — collect unique `parent` keys; look up titles + status; compute per-epic done/total for the completion table. Large epics need deep child pagination (`parent in (...)`, page via `nextPageToken`) — treat big-epic %s as best-effort and EXCLUDE perpetual buckets (QPD-152 Production Incidents, Bug Fixing & Fleet Diagnostics, Tech Debt) from the table, listing them in the buckets footer.
4. **Releases** — derive from Jira `fixVersions` (CiC / Cloud / App / Controller / Wireless Platform).
5. **Build the deck** — copy `build_slides.py` → `/tmp/build_this.py`, replace the data-constants block (TITLE_LINE, SUMMARY_LINE, TEAM_STATS, DELIVERIES [3 product tints: Copper=Heating/All-E, Blue=Chill, Green=Energy/HomeBattery], RELEASES, FOOTER, TABLE_DATA, SCOREBOARD, RISKS, BUCKETS_FOOTER, OUT_PATH) with the sprint's figures. Content in **English**. Run it, then `python3 slim_pptx.py <in> /tmp/sprint-<YY>Q<N>-cw<NN>-slides.pptx`. Verify it reopens with exactly 2 slides.

6. **Deliver to Confluence — via REST API + PAT** (the connector has no Confluence scope). Auth with Basic `-u "$CONFLUENCE_USER:$CONFLUENCE_PAT"`. If a call returns `401`/`403` with Basic, retry the same call with header `-H "Authorization: Bearer $CONFLUENCE_PAT"` (some tokens are bearer PATs). Base URL `https://quatt-team.atlassian.net/wiki/rest/api`.

   - **6a. Upload the deck** (sprint-unique filename — Confluence versions same-named files, so the name MUST be unique per sprint):
     ```bash
     curl -s -u "$CONFLUENCE_USER:$CONFLUENCE_PAT" -X POST \
       -H "X-Atlassian-Token: nocheck" \
       -F "file=@/tmp/sprint-<YY>Q<N>-cw<NN>-slides.pptx" \
       "https://quatt-team.atlassian.net/wiki/rest/api/content/8126465/child/attachment"
     ```
   - **6b. Read current body + version**:
     ```bash
     curl -s -u "$CONFLUENCE_USER:$CONFLUENCE_PAT" \
       "https://quatt-team.atlassian.net/wiki/rest/api/content/8126465?expand=body.storage,version"
     ```
     Take `body.storage.value` (storage XHTML) and `version.number` (= N).
   - **6c. Splice ONE new `<tr>`** immediately after the header row (newest-on-top). Row format:
     ```html
     <tr><td><p>CW<NN> (<YYQN>)</p></td><td><p><DD–DD MMM YYYY></p></td><td><p><a href="/wiki/download/attachments/8126465/<filename>"><filename></a></p></td></tr>
     ```
     **NEVER** wrap the XHTML in `<![CDATA[ ]]>`. Build the PUT JSON with a real JSON serializer (e.g. `python3 -c 'import json,sys; ...'`) so the storage XHTML is escaped correctly — do not hand-concatenate.
     ```bash
     curl -s -u "$CONFLUENCE_USER:$CONFLUENCE_PAT" -X PUT \
       -H "Content-Type: application/json" \
       "https://quatt-team.atlassian.net/wiki/rest/api/content/8126465" \
       -d @/tmp/page_update.json
     ```
     where `/tmp/page_update.json` = `{"version":{"number":<N+1>},"title":"Quatt Ecosystem Sprint Report","type":"page","body":{"storage":{"value":"<NEW_XHTML>","representation":"storage"}}}`.
   - **6d. Verify** — GET the page again (6b) and confirm the new row is present as a real `<a …>` link, not escaped `&lt;` text.

7. **Slack DM** Gustavo (`U06LT8JB78A`), English, standard markdown:
   ```
   Hi Gustavo — sprint CW<NN> deck is ready (<DD MMM> → <DD MMM YYYY>, all five SW management teams).

   [Sprint CW<NN> deck on Confluence](https://quatt-team.atlassian.net/wiki/spaces/~712020a597455b77564d70a1f7a9221a62c95f/pages/8126465)

   **Quick-take:** Cloud / Backend <N> · APP <N> · Embedded <N> · Systems Control <N> · SW&I <N> → **<total> tickets done across <N> epics**. Highlights: <punchline>. <one risk to watch>.
   ```

## Notes

- Confluence write was proven against the local mcp-atlassian server (which uses the
  same `CONFLUENCE_PAT`); the cloud routine reproduces it via direct REST. Validated
  cloud-side once the env secrets are present.
- The data + deck-build half (steps 1–5) was validated cloud-side on 2026-06-17
  (Opus): CW25 detected, 63 tickets / 22 epics, 2-slide deck built & verified.
