# Jira Queries — Quatt Sprint Readout

- Instance: `quatt-team.atlassian.net` · Cloud ID `e00d2e3c-9946-4be6-b81a-0bb231fc50c7` · Project **QPD**
- Sprint custom field: `customfield_10020` (objects with `id`, `name`, `state`, `startDate`, `endDate`)
- Team custom field: `customfield_10001` (`.name` = team)

## Team enum values (`customfield_10001.name`)

In scope (five first-class report teams): `Embedded Systems`, `Systems Control`, `Cloud / Backend`, `APP`, `SW&I` (UX / QA SW&I fold into SW&I as context).
Out of scope: `energyOS` (own sprint + report track — filter out).

## Sprint naming

`<TEAM_PREFIX> - <YEAR>Q<QUARTER> - CW<WEEK>` — e.g. `EMB - 26Q2 - CW25`, `SW&I - 26Q2 - CW25`, `Control- 26Q2 - CW25` (note: no space after `Control`). EMB / SW&I / Control share one date window. Ignore `energyOS - …` and `CHILL - …`.

## JQL templates

- Open sprint window: `project = QPD AND sprint in openSprints()` (fields `[customfield_10020]`).
- Done per sprint: `project = QPD AND sprint in (<ids>) AND statusCategory = Done` (fields `[summary, issuetype, parent, fixVersions, customfield_10001]`).
- Epic titles: `key in (QPD-..., ...)` (fields `[summary, status, issuetype, customfield_10001]`).
- Epic children (completion %): `parent in (QPD-..., ...)` (fields `[status, parent]`). **Paginate** via `nextPageToken` — popular epics have hundreds of children; the searchJiraIssuesUsingJql output caps at 100/page and large pages spill to disk.

## Notes

- `statusCategory = Done` covers all done aliases (Done/Closed/Resolved/Released).
- Split the SW&I umbrella in code by `customfield_10001.name` into Cloud / Backend, APP, SW&I, UX/QA.
- Perpetual buckets to EXCLUDE from the epic table: QPD-152 (Production Incidents/Maintenance), Bug Fixing & Fleet Diagnostics, Tech Debt — list them in the buckets footer instead.
