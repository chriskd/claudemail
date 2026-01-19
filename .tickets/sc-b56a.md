---
id: sc-b56a
status: closed
deps: []
links: []
created: 2026-01-19T05:30:01Z
type: task
priority: 1
assignee: chriskd
---
# Add minimal auth, workdir enforcement, and README warning

Clamp obvious security issues with minimal overhead: enforce workdir root on session creation, add optional token auth for API/WS, and add prominent README warnings about PoC/gag + LAN/Tailscale usage.

## Acceptance Criteria

- [ ] Server enforces CLAUDE_WORKDIR_ROOT for all session workdirs\n- [ ] Optional token auth gates API + WebSocket when configured\n- [ ] README includes PoC/security warning and LAN/Tailscale guidance

