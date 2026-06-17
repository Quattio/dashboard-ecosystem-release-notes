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

## Connectors available to the routine

- **Atlassian** (Jira + Confluence) — sprint data + the Confluence page.
- **Slack** — the DM to Gustavo.
- **No GitHub connector** — use Jira `fixVersions` for release names; do NOT attempt GitHub PR queries.

## Constants

- Confluence page ID: `8126465` ("Quatt Ecosystem Sprint Report"), space `~712020a597455b77564d70a1f7a9221a62c95f`
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
6. **Deliver to Confluence** (page `8126465`):
   - **6a. Upload** the `.pptx` as an attachment with a **sprint-unique filename** (e.g. `sprint-26Q2-cw25-slides.pptx`). Confluence versions same-named files, so a repeated name would point every table row at the latest file — the name MUST be unique per sprint.
   - **6b. Append one row** — read the current page body in **storage** format, splice ONE new `<tr>` immediately after the header row (newest-on-top), then write it back in storage format:
     ```html
     <tr><td><p>CW<NN> (<YYQN>)</p></td><td><p><DD–DD MMM YYYY></p></td><td><p><a href="/wiki/download/attachments/8126465/<filename>"><filename></a></p></td></tr>
     ```
     **NEVER** wrap the storage XHTML in `<![CDATA[ ]]>` — it gets HTML-escaped to literal text. Send it plain; verify after write that the body contains real `<a>`/`<tr>` tags, not `&lt;`.
   - **6c. Binary fallback** — if the Atlassian connector cannot upload a binary attachment, use the Confluence REST API with a token: `PUT https://quatt-team.atlassian.net/wiki/rest/api/content/8126465/child/attachment` (multipart, header `X-Atlassian-Token: no-check`), authenticating with `CONFLUENCE_USER` + `CONFLUENCE_PAT` from the routine env. (See "Open item" below.)
7. **Slack DM** Gustavo (`U06LT8JB78A`), English, standard markdown:
   ```
   Hi Gustavo — sprint CW<NN> deck is ready (<DD MMM> → <DD MMM YYYY>, all five SW management teams).

   [Sprint CW<NN> deck on Confluence](https://quatt-team.atlassian.net/wiki/spaces/~712020a597455b77564d70a1f7a9221a62c95f/pages/8126465)

   **Quick-take:** Cloud / Backend <N> · APP <N> · Embedded <N> · Systems Control <N> · SW&I <N> → **<total> tickets done across <N> epics**. Highlights: <punchline>. <one risk to watch>.
   ```

## Open item — Confluence binary upload

The claude.ai Atlassian connector may not expose a Confluence **attachment-upload**
tool (it is Jira-focused; page text update is expected to work). The binary `.pptx`
upload is the one step proven against the **local** mcp-atlassian server, not yet
against the cloud connector. The first routine run is a probe: if 6a fails, wire up
the REST fallback (6c) with a `CONFLUENCE_PAT` provided to the routine env, then
update this runbook.
