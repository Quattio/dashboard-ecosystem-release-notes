# Jira queries for release notes

Cloud ID: `e00d2e3c-9946-4be6-b81a-0bb231fc50c7` (Quatt's `quatt-team.atlassian.net`)
Project: **QPD** (Quatt Product Development) — all release-notes-relevant tickets live here.

## Fix Version naming patterns

| Product | Pattern | Example |
|---|---|---|
| CiC | `CiC - V<major>.<minor>.<patch>` | `CiC - V4.5.0` |
| App | `App v<major>.<minor>.<patch>` | `App v1.55.0` |
| Cloud | `Cloud v<major>.<minor>.<patch>` | `Cloud v2.36.0` |
| Wireless Platform | `Wireless Platform - V<major>.<minor>.<patch>` | `Wireless Platform - V2.8.0` |
| Heatcharger | `Heatcharger - V<major>.<minor>.<patch>` | `Heatcharger - V1.3.0` |
| N/A sentinel | literal `N/A` | (exclude from release notes; see `release-auditor` for policy) |

Spacing, casing, and dashes are exact — `cic v4.5.0` will not match.

## Window-discovery query (Step 2 of the SKILL process)

Enumerate every Fix Version released in the CiC release window, so paired App / Cloud / Wireless versions can be auto-identified:

```jql
project = QPD AND fixVersion in releasedVersions() AND resolved >= "<previous-cic-date>" AND resolved <= "<target-cic-date+8d>"
```

Returns potentially hundreds of tickets — **expect MCP response truncation**. The tool spills to a file. Use `jq` to enumerate fixVersions:

```bash
jq -r '.issues.nodes[].fields.fixVersions[]?.name' <spill-file> | sort | uniq -c | sort -rn
```

The +8 day tail catches App / Cloud releases that ship slightly after the CiC tag.

## Per-fixVersion ticket pull (Step 3)

```jql
project = QPD AND fixVersion = "<exact-name>" ORDER BY issuetype, key
```

Fields to request:

```
summary, status, issuetype, priority, parent, labels, components
```

**Do NOT request `description`** for the bulk listing — it blows past the MCP token budget even for small fixVersions (a single CiC release can spill 167KB with descriptions). Pull descriptions one-at-a-time for ambiguous tickets via:

```jql
key = QPD-XXXXX
```

with `fields: ["description"]`.

## Parsing the spill file

When the MCP response is too large, the Atlassian tool saves it to a spill file under the current session's tool-results directory and prints the path. The path is environment-specific (local laptop vs. cloud routine) — **always read the printed path from the tool output**, do not hardcode it. Schema:

```json
{
  "issues": {
    "totalCount": <int>,
    "nodes": [ { "key": "QPD-...", "fields": { ... } } ],
    "webUrl": "..."
  }
}
```

Useful jq one-liners:

```bash
# Count
jq '.issues.totalCount' <file>

# Compact summary table
jq -r '.issues.nodes[] |
  "\(.key)\t\(.fields.issuetype.name)\t\(.fields.priority.name // "-")\t\(.fields.parent.fields.summary // "no-epic")\t\(.fields.summary)"' <file>

# Unique parent epics in the release
jq -r '.issues.nodes[].fields.parent.fields.summary // "no-epic"' <file> | sort -u

# Tickets with a specific label
jq -r '.issues.nodes[] | select(.fields.labels[]? == "customer-facing") | .key' <file>
```

## Auditor handoff

For commit-vs-ticket traceability (which commits map to which Fix Version, which commits lack a ticket, which `N/A` tickets touch production code), invoke the `release-auditor` skill — same Jira data source, different output. Don't reimplement the audit in this skill.
