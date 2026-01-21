---
id: sc-9edc
status: open
deps: []
links: []
created: 2026-01-21T17:53:15Z
type: feature
priority: 2
assignee: chriskd
---
# Add OpenAI Codex support (stream + terminal)

Implement Codex CLI support alongside Claude Code. Scope includes: provider abstraction, Codex stream parsing into mailbox messages, Codex terminal mode (pty) as fallback, session resume support via codex exec resume, history integration (parse ~/.codex/sessions or persist app-managed history), and UI/settings updates for provider + approvals/sandbox settings.

## Acceptance Criteria

- [ ] Provider selector available (Claude/Codex) and stored per session\n- [ ] Codex stream mode supported via codex exec --json with parsed assistant/user/tool messages\n- [ ] Codex terminal mode supported via pty (interactive)\n- [ ] Codex sessions can resume by session id\n- [ ] History list includes Codex sessions (native ~/.codex/sessions parsing or app-managed persistence)\n- [ ] Settings panel includes Codex-specific approvals/sandbox mapping\n- [ ] README updated with Codex env/config and run examples

