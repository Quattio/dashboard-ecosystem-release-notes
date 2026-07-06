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

_(none yet)_
