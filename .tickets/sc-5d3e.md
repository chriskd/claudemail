---
id: sc-5d3e
status: closed
deps: []
links: []
created: 2026-01-21T22:41:58Z
type: task
priority: 2
assignee: chriskd
---
# Fix session list scoping by workdir

Ensure session list refreshes when switching workdir; scope active/history sessions to selected path.

## Acceptance Criteria

- [ ] Switching workdir clears old history entries
- [ ] Active sessions filtered by selected workdir when set
- [ ] History responses include workdir metadata

