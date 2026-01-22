# Claudemail

iOS Mail inspired web UI that wraps a Claude Code CLI session behind a mailbox interface.

> Note: This is a quick PoC and a gag. It may contain security issues and should not be exposed
> to the public internet. Prefer local LAN or something like Tailscale, and set a token if you
> need remote access.

## Run

```bash
uv venv
uv sync

# Local Claude Code
CLAUDE_CMD=claude uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`.
For LAN/Tailscale access, keep `--host 0.0.0.0` and set `CLAUDEMAIL_AUTH_KEY`.

## Settings Panel

Use the in-app settings panel to set the working directory (picker is limited to `CLAUDE_WORKDIR_ROOT`),
session mode (interactive terminal vs stream), permission mode, optional theme, your avatar initial,
a security key (if the server requires it), and an optional auto-send prompt.
These values are stored in browser localStorage and applied when you create new sessions.
The inbox stays empty until a working directory is set.

## Environment Variables

- `CLAUDE_CMD`: Base command (default `claude`).
- `CLAUDE_ARGS`: Extra CLI args.
- `CLAUDE_WORKDIR`: Working directory for the CLI process (must be inside `CLAUDE_WORKDIR_ROOT`).
- `CLAUDE_WORKDIR_ROOT`: Root folder exposed to the working directory picker (default `/`, so set this to restrict access).
- `CLAUDEMAIL_AUTH_KEY`: Optional bearer token to protect `/api/*` and websocket endpoints.

## API Overrides

`POST /api/sessions` accepts:

- `workdir`: Override working directory for this session only.
- `mode`: `terminal` (interactive xterm) or `stream` (stream-json output).
- `permission_mode`: Claude Code permission mode (`default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `delegate`, `plan`).
- `prompt`: Optional prompt to send immediately.

`terminal` mode supports interactive permission prompts; `stream` mode requires permissive settings (`acceptEdits` or `dontAsk`)
to avoid blocked tool actions.

If `CLAUDEMAIL_AUTH_KEY` is set, send `Authorization: Bearer <token>` for `/api/*` requests and pass
`?token=<token>` on websocket connections.
