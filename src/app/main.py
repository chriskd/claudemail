from __future__ import annotations

import asyncio
import fcntl
import json
import os
import pty
import re
import shlex
import secrets
import struct
import subprocess
import termios
import threading
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import IO, Optional, cast

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_resolve(path: Path) -> Path:
    try:
        return path.expanduser().resolve(strict=False)
    except TypeError:
        return path.expanduser().resolve()


def get_workdir_root() -> Path:
    raw = os.getenv("CLAUDE_WORKDIR_ROOT", "/")
    return safe_resolve(Path(raw))


def normalize_workdir_path(raw: Optional[str], root: Path) -> Path:
    if not raw:
        return root
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = root / candidate
    candidate = safe_resolve(candidate)
    if candidate != root and root not in candidate.parents:
        raise HTTPException(status_code=403, detail="Path outside allowed root.")
    return candidate


def resolve_workdir(raw: Optional[str]) -> Path:
    root = get_workdir_root()
    trimmed = (raw or "").strip()
    if trimmed:
        return normalize_workdir_path(trimmed, root)
    env = (os.getenv("CLAUDE_WORKDIR") or "").strip()
    if env:
        return normalize_workdir_path(env, root)
    return root


def get_claude_config_dir() -> Path:
    raw = os.getenv("CLAUDE_CONFIG_DIR")
    if raw:
        return safe_resolve(Path(raw))
    return safe_resolve(Path.home() / ".claude")


def project_key_from_path(path: Path) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def project_dir_for_path(path: Path) -> Path:
    return get_claude_config_dir() / "projects" / project_key_from_path(path)


def parse_sessions_index(project_dir: Path) -> list[dict[str, object]]:
    index_path = project_dir / "sessions-index.json"
    if not index_path.exists():
        return []
    try:
        payload = json.loads(index_path.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    entries = payload.get("entries") if isinstance(payload, dict) else None
    return entries if isinstance(entries, list) else []


def iso_from_millis(value: object) -> Optional[str]:
    if not isinstance(value, (int, float)):
        return None
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat()


def extract_message_text(message: dict[str, object]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            block_map = cast(dict[str, object], block)
            block_type = block_map.get("type")
            text = block_map.get("text")
            if block_type == "text" and isinstance(text, str):
                parts.append(text)
        return "".join(parts)
    return ""


def is_command_meta_text(text: str) -> bool:
    trimmed = text.lstrip().lower()
    if not trimmed:
        return False
    markers = (
        "<command-name>",
        "<command-message>",
        "<command-args>",
        "<local-command-stdout>",
        "<local-command-stderr>",
        "<local-command-stdin>",
    )
    return any(marker in trimmed for marker in markers)


def should_skip_history_payload(payload: dict[str, object], text: str) -> bool:
    if payload.get("isMeta") is True:
        return True
    if is_command_meta_text(text):
        return True
    return False


def as_dict(value: object) -> Optional[dict[str, object]]:
    if isinstance(value, dict):
        return cast(dict[str, object], value)
    return None


def resolve_history_session_path(
    project_dir: Path,
    entry: dict[str, object],
    session_id: str,
) -> Optional[Path]:
    raw = entry.get("fullPath")
    if isinstance(raw, str):
        candidate = safe_resolve(Path(raw))
        if candidate.exists() and project_dir in candidate.parents:
            return candidate
    fallback = project_dir / f"{session_id}.jsonl"
    if fallback.exists():
        return fallback
    return None


def read_session_preview(session_path: Path) -> tuple[str, Optional[str]]:
    last_text = ""
    last_timestamp: Optional[str] = None
    try:
        with session_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if payload.get("type") not in {"user", "assistant"}:
                    continue
                message = payload.get("message")
                if not isinstance(message, dict):
                    continue
                text = extract_message_text(message).strip()
                if not text:
                    continue
                if should_skip_history_payload(payload, text):
                    continue
                last_text = text
                timestamp = payload.get("timestamp")
                if isinstance(timestamp, str):
                    last_timestamp = timestamp
    except OSError:
        return "", None
    return last_text, last_timestamp


def read_session_metadata(session_path: Path) -> Optional[dict[str, object]]:
    session_id: Optional[str] = None
    project_path: Optional[str] = None
    is_sidechain: Optional[bool] = None
    slug: Optional[str] = None
    summary: Optional[str] = None
    created: Optional[str] = None
    modified: Optional[str] = None
    try:
        with session_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if summary is None and payload.get("type") == "summary":
                    candidate = payload.get("summary")
                    if isinstance(candidate, str) and candidate.strip():
                        summary = candidate.strip()
                if session_id is None:
                    candidate = payload.get("sessionId")
                    if isinstance(candidate, str) and candidate.strip():
                        session_id = candidate.strip()
                if project_path is None:
                    candidate = payload.get("projectPath")
                    if isinstance(candidate, str) and candidate.strip():
                        project_path = candidate.strip()
                    else:
                        candidate = payload.get("cwd")
                        if isinstance(candidate, str) and candidate.strip():
                            project_path = candidate.strip()
                if is_sidechain is None and isinstance(
                    payload.get("isSidechain"), bool
                ):
                    is_sidechain = payload.get("isSidechain")
                if slug is None:
                    candidate = payload.get("slug")
                    if isinstance(candidate, str) and candidate.strip():
                        slug = candidate.strip()
                timestamp = payload.get("timestamp")
                if isinstance(timestamp, str) and timestamp.strip():
                    if created is None:
                        created = timestamp
                    modified = timestamp
    except OSError:
        return None
    if not session_id:
        return None
    file_mtime = None
    try:
        file_mtime = int(session_path.stat().st_mtime * 1000)
    except OSError:
        file_mtime = None
    entry: dict[str, object] = {
        "sessionId": session_id,
        "fullPath": str(session_path),
        "isSidechain": bool(is_sidechain) if is_sidechain is not None else False,
        "summary": summary,
        "slug": slug,
        "created": created,
        "modified": modified,
    }
    if project_path:
        entry["projectPath"] = project_path
    if file_mtime is not None:
        entry["fileMtime"] = file_mtime
    return entry


def build_history_entries_from_jsonl(project_dir: Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    if not project_dir.exists():
        return entries
    for session_path in project_dir.glob("*.jsonl"):
        if not session_path.is_file():
            continue
        entry = read_session_metadata(session_path)
        if not entry:
            continue
        entries.append(entry)
    return entries


def read_session_first_user_message(session_path: Path) -> str:
    try:
        with session_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if payload.get("type") != "user":
                    continue
                message = payload.get("message")
                if not isinstance(message, dict):
                    continue
                text = extract_message_text(message).strip()
                if text and not should_skip_history_payload(payload, text):
                    return text
    except OSError:
        return ""
    return ""


def normalize_slug_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        return ""
    if " " not in cleaned and "-" in cleaned:
        cleaned = " ".join(part.capitalize() for part in cleaned.split("-") if part)
    return cleaned


def select_history_title(entry: dict[str, object]) -> str:
    summary = entry.get("summary")
    if isinstance(summary, str) and summary.strip():
        return summary.strip()
    slug = entry.get("slug")
    if isinstance(slug, str) and slug.strip():
        return normalize_slug_title(slug)
    title = entry.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    first_prompt = entry.get("firstPrompt")
    if isinstance(first_prompt, str) and first_prompt.strip():
        return first_prompt.strip()
    return ""


def load_session_messages(
    session_path: Path, max_messages: int
) -> list[dict[str, str]]:
    messages: deque[dict[str, str]] = deque(maxlen=max_messages)
    try:
        with session_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                payload_type = payload.get("type")
                if payload_type not in {"user", "assistant"}:
                    continue
                message = payload.get("message")
                if not isinstance(message, dict):
                    continue
                text = extract_message_text(message).strip()
                if not text:
                    continue
                if should_skip_history_payload(payload, text):
                    continue
                message_id = payload.get("uuid")
                if not isinstance(message_id, str):
                    message_id = (
                        message.get("id")
                        if isinstance(message.get("id"), str)
                        else str(uuid.uuid4())
                    )
                timestamp = payload.get("timestamp")
                if not isinstance(timestamp, str):
                    timestamp = now_iso()
                role = "user" if payload_type == "user" else "claude"
                messages.append(
                    {
                        "id": message_id,
                        "role": role,
                        "content": text,
                        "timestamp": timestamp,
                    }
                )
    except OSError:
        return []
    return list(messages)


def get_api_token() -> Optional[str]:
    raw = os.getenv("CLAUDEMAIL_AUTH_KEY")
    if not raw:
        return None
    token = raw.strip()
    return token or None


def extract_bearer(header: Optional[str]) -> Optional[str]:
    if not header:
        return None
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return value.strip() or None


def is_token_valid(candidate: Optional[str], expected: Optional[str]) -> bool:
    if not expected:
        return True
    if not candidate:
        return False
    return secrets.compare_digest(candidate, expected)


def websocket_authorized(websocket: WebSocket) -> bool:
    expected = get_api_token()
    if not expected:
        return True
    token = websocket.query_params.get("token")
    if not token:
        token = extract_bearer(websocket.headers.get("authorization"))
    return is_token_valid(token, expected)


def resize_pty(fd: int, cols: int, rows: int) -> None:
    if cols <= 0 or rows <= 0:
        return
    size = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, size)


def build_command() -> list[str]:
    cmd = os.getenv("CLAUDE_CMD", "claude")
    args = os.getenv("CLAUDE_ARGS", "")
    return [cmd, *shlex.split(args)]


def has_flag(cmd: list[str], flag: str) -> bool:
    return any(part == flag or part.startswith(f"{flag}=") for part in cmd)


def ensure_flag(cmd: list[str], flag: str, value: Optional[str] = None) -> None:
    if has_flag(cmd, flag):
        return
    if value is None:
        cmd.append(flag)
    else:
        cmd.extend([flag, value])


def strip_flag(cmd: list[str], flag: str) -> list[str]:
    cleaned: list[str] = []
    skip_next = False
    for part in cmd:
        if skip_next:
            skip_next = False
            continue
        if part == flag:
            skip_next = True
            continue
        if part.startswith(f"{flag}="):
            continue
        cleaned.append(part)
    return cleaned


def build_stream_command(
    session_id: str,
    permission_mode: Optional[str],
    resume_id: Optional[str] = None,
) -> list[str]:
    cmd = build_command()
    ensure_flag(cmd, "--print")
    ensure_flag(cmd, "--input-format", "stream-json")
    ensure_flag(cmd, "--output-format", "stream-json")
    ensure_flag(cmd, "--include-partial-messages")
    ensure_flag(cmd, "--verbose")
    ensure_flag(cmd, "--session-id", session_id)
    permission_value = (permission_mode or "").strip()
    if permission_value:
        cmd = strip_flag(cmd, "--permission-mode")
        ensure_flag(cmd, "--permission-mode", permission_value)
    if resume_id:
        cmd = strip_flag(cmd, "--resume")
        ensure_flag(cmd, "--resume", resume_id)
    return cmd


def build_interactive_command(
    session_id: str,
    permission_mode: Optional[str],
    resume_id: Optional[str] = None,
) -> list[str]:
    cmd = build_command()
    cmd = strip_flag(cmd, "--print")
    cmd = strip_flag(cmd, "--input-format")
    cmd = strip_flag(cmd, "--output-format")
    cmd = strip_flag(cmd, "--include-partial-messages")
    cmd = strip_flag(cmd, "--verbose")
    permission_value = (permission_mode or "").strip()
    if permission_value:
        cmd = strip_flag(cmd, "--permission-mode")
        ensure_flag(cmd, "--permission-mode", permission_value)
    ensure_flag(cmd, "--session-id", session_id)
    if resume_id:
        cmd = strip_flag(cmd, "--resume")
        ensure_flag(cmd, "--resume", resume_id)
    return cmd


def spawn_process(
    workdir: Optional[str],
    session_id: str,
    permission_mode: Optional[str],
    resume_id: Optional[str] = None,
) -> subprocess.Popen[str]:
    cmd = build_stream_command(session_id, permission_mode, resume_id)
    resolved_workdir = resolve_workdir(workdir)
    return subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=str(resolved_workdir),
        env=os.environ.copy(),
        text=True,
        bufsize=1,
    )


def spawn_terminal_process(
    workdir: Optional[str],
    session_id: str,
    permission_mode: Optional[str],
    resume_id: Optional[str] = None,
) -> tuple[subprocess.Popen[bytes], int]:
    cmd = build_interactive_command(session_id, permission_mode, resume_id)
    resolved_workdir = resolve_workdir(workdir)
    master_fd, slave_fd = pty.openpty()
    env = os.environ.copy()
    env.setdefault("TERM", "xterm-256color")
    process = subprocess.Popen(
        cmd,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=str(resolved_workdir),
        env=env,
        start_new_session=True,
    )
    os.close(slave_fd)
    return process, master_fd


class CreateSessionRequest(BaseModel):
    title: Optional[str] = None
    prompt: Optional[str] = None
    workdir: Optional[str] = None
    permission_mode: Optional[str] = None
    mode: Optional[str] = None


class ResumeSessionRequest(BaseModel):
    session_id: str
    workdir: Optional[str] = None
    permission_mode: Optional[str] = None
    mode: Optional[str] = None


class InputRequest(BaseModel):
    content: str


class MkdirRequest(BaseModel):
    parent: str
    name: str


@dataclass
class Session:
    id: str
    title: str
    process: subprocess.Popen[str]
    stdin: IO[str]
    stdout: IO[str]
    loop: asyncio.AbstractEventLoop
    workdir: Optional[str] = None
    created_at: str = field(default_factory=now_iso)
    last_updated: str = field(default_factory=now_iso)
    status: str = "running"
    messages: list[dict[str, str]] = field(default_factory=list)
    clients: set[WebSocket] = field(default_factory=set)
    title_locked: bool = False
    open_assistant_index: Optional[int] = None
    assistant_index_by_id: dict[str, int] = field(default_factory=dict)
    current_stream_message_id: Optional[str] = None
    tool_index_by_id: dict[str, int] = field(default_factory=dict)
    tool_input_buffer_by_id: dict[str, str] = field(default_factory=dict)
    tool_name_by_id: dict[str, str] = field(default_factory=dict)
    tool_id_by_index: dict[int, str] = field(default_factory=dict)
    mode: str = "stream"
    closed: bool = False

    def start_reader(self) -> None:
        thread = threading.Thread(target=self._read_loop, daemon=True)
        thread.start()

    def _read_loop(self) -> None:
        try:
            for line in self.stdout:
                if not line:
                    break
                payload = self._parse_stream_line(line)
                if payload is not None:
                    self.loop.call_soon_threadsafe(self._queue_event, payload)
        except Exception:
            pass
        self.loop.call_soon_threadsafe(self._queue_status, "closed")
        try:
            self.stdout.close()
        except Exception:
            pass

    def _parse_stream_line(self, line: str) -> Optional[dict[str, object]]:
        cleaned = line.strip()
        if not cleaned:
            return None
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, dict):
            return None
        return parsed

    def _queue_event(self, payload: dict[str, object]) -> None:
        asyncio.create_task(self._handle_stream_event(payload))

    def _queue_status(self, status: str) -> None:
        asyncio.create_task(self._handle_status(status))

    def _append_user(self, content: str, timestamp: str) -> dict[str, str]:
        message = {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": content,
            "timestamp": timestamp,
        }
        self.messages.append(message)
        self.open_assistant_index = None
        self.current_stream_message_id = None
        self.last_updated = timestamp
        if not self.title_locked:
            first_line = content.strip().splitlines()[0] if content.strip() else ""
            if first_line:
                self.title = first_line[:48]
        return message

    def _append_assistant_delta(
        self, content: str, timestamp: str, source_id: Optional[str]
    ) -> Optional[dict[str, str]]:
        if not content:
            return None
        index = None
        if source_id:
            index = self.assistant_index_by_id.get(source_id)
        if index is None:
            if self.open_assistant_index is not None:
                index = self.open_assistant_index
        if index is None:
            message_id = source_id or str(uuid.uuid4())
            message = {
                "id": message_id,
                "role": "claude",
                "content": content,
                "timestamp": timestamp,
            }
            self.messages.append(message)
            index = len(self.messages) - 1
            if source_id:
                self.assistant_index_by_id[source_id] = index
        else:
            message = self.messages[index]
            message["content"] += content
            message["timestamp"] = timestamp
        self.open_assistant_index = index
        self.last_updated = timestamp
        return message

    def _set_assistant_content(
        self, content: str, timestamp: str, source_id: Optional[str]
    ) -> Optional[dict[str, str]]:
        if content is None:
            return None
        index = None
        if source_id:
            index = self.assistant_index_by_id.get(source_id)
        if index is None and self.open_assistant_index is not None:
            index = self.open_assistant_index
        if index is None:
            message_id = source_id or str(uuid.uuid4())
            message = {
                "id": message_id,
                "role": "claude",
                "content": content,
                "timestamp": timestamp,
            }
            self.messages.append(message)
            index = len(self.messages) - 1
            if source_id:
                self.assistant_index_by_id[source_id] = index
        else:
            message = self.messages[index]
            message["content"] = content
            message["timestamp"] = timestamp
        self.open_assistant_index = index
        self.last_updated = timestamp
        return message

    def _close_assistant(self) -> None:
        self.open_assistant_index = None
        self.current_stream_message_id = None

    def _upsert_tool_message(
        self, tool_id: str, content: str, timestamp: str
    ) -> dict[str, str]:
        index = self.tool_index_by_id.get(tool_id)
        if index is None:
            message = {
                "id": tool_id,
                "role": "tool",
                "content": content,
                "timestamp": timestamp,
            }
            self.messages.append(message)
            index = len(self.messages) - 1
            self.tool_index_by_id[tool_id] = index
        else:
            message = self.messages[index]
            message["content"] = content
            message["timestamp"] = timestamp
        self.last_updated = timestamp
        return message

    def _append_tool_result(
        self, tool_id: Optional[str], content: str, timestamp: str
    ) -> dict[str, str]:
        message_id = f"{tool_id}-result" if tool_id else str(uuid.uuid4())
        message = {
            "id": message_id,
            "role": "tool",
            "content": content,
            "timestamp": timestamp,
        }
        self.messages.append(message)
        self.last_updated = timestamp
        return message

    def _format_tool_input(self, tool_name: str, payload: object) -> str:
        header = f"Tool: {tool_name}"
        if payload is None:
            return header
        if isinstance(payload, str):
            body = payload.strip()
        else:
            try:
                body = json.dumps(payload, indent=2)
            except TypeError:
                body = str(payload)
        if not body:
            return header
        return f"{header}\nInput:\n{body}"

    def _format_tool_result(
        self, tool_name: Optional[str], content: str, is_error: bool
    ) -> str:
        header = f"Tool Result: {tool_name}" if tool_name else "Tool Result"
        if is_error:
            header += " (error)"
        body = content.strip() if content else "No output."
        return f"{header}\n{body}"

    @staticmethod
    def _extract_text(content: object) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if not isinstance(block, dict):
                    continue
                block_map = cast(dict[str, object], block)
                block_type = block_map.get("type")
                text = block_map.get("text")
                if block_type == "text" and isinstance(text, str):
                    parts.append(text)
            return "".join(parts)
        return ""

    async def _handle_stream_event(self, payload: dict[str, object]) -> None:
        if self.closed:
            return
        payload_type = payload.get("type")
        timestamp = now_iso()

        if payload_type == "stream_event":
            event = as_dict(payload.get("event"))
            if event:
                event_type = event.get("type")
                if event_type == "message_start":
                    message = as_dict(event.get("message"))
                    if message:
                        message_id = message.get("id")
                        if isinstance(message_id, str):
                            self.current_stream_message_id = message_id
                elif event_type == "content_block_start":
                    block = as_dict(event.get("content_block"))
                    if block:
                        block_type = block.get("type")
                        if block_type == "text":
                            text = block.get("text")
                            if isinstance(text, str) and text:
                                message = self._append_assistant_delta(
                                    text, timestamp, self.current_stream_message_id
                                )
                                if message:
                                    await self._broadcast({"type": "output", **message})
                        elif block_type == "tool_use":
                            tool_id = block.get("id")
                            tool_name = block.get("name") or "Tool"
                            index = event.get("index")
                            if isinstance(index, int) and isinstance(tool_id, str):
                                self.tool_id_by_index[index] = tool_id
                            if isinstance(tool_id, str):
                                self.tool_name_by_id[tool_id] = str(tool_name)
                                input_payload = block.get("input")
                                if (
                                    isinstance(input_payload, dict)
                                    and not input_payload
                                ):
                                    input_payload = None
                                content = self._format_tool_input(
                                    str(tool_name), input_payload
                                )
                                message = self._upsert_tool_message(
                                    tool_id, content, timestamp
                                )
                                await self._broadcast({"type": "output", **message})
                elif event_type == "content_block_delta":
                    delta = as_dict(event.get("delta"))
                    if delta:
                        delta_type = delta.get("type")
                        if delta_type == "text_delta":
                            text = delta.get("text")
                            if isinstance(text, str) and text:
                                message = self._append_assistant_delta(
                                    text, timestamp, self.current_stream_message_id
                                )
                                if message:
                                    await self._broadcast({"type": "output", **message})
                        elif delta_type == "input_json_delta":
                            index = event.get("index")
                            tool_id = (
                                self.tool_id_by_index.get(index)
                                if isinstance(index, int)
                                else None
                            )
                            if tool_id:
                                chunk = delta.get("partial_json")
                                if isinstance(chunk, str):
                                    buffer = (
                                        self.tool_input_buffer_by_id.get(tool_id, "")
                                        + chunk
                                    )
                                    self.tool_input_buffer_by_id[tool_id] = buffer
                                    tool_name = self.tool_name_by_id.get(
                                        tool_id, "Tool"
                                    )
                                    try:
                                        parsed = json.loads(buffer)
                                    except json.JSONDecodeError:
                                        parsed = buffer
                                    content = self._format_tool_input(tool_name, parsed)
                                    message = self._upsert_tool_message(
                                        tool_id, content, timestamp
                                    )
                                    await self._broadcast({"type": "output", **message})
                elif event_type == "content_block_stop":
                    index = event.get("index")
                    if isinstance(index, int):
                        self.tool_id_by_index.pop(index, None)
                elif event_type == "message_stop":
                    self._close_assistant()
            return

        if payload_type == "assistant":
            message_payload = as_dict(payload.get("message"))
            if message_payload:
                content = self._extract_text(message_payload.get("content"))
                message_id = message_payload.get("id")
                if content:
                    message = self._set_assistant_content(
                        content,
                        timestamp,
                        message_id if isinstance(message_id, str) else None,
                    )
                    if message:
                        await self._broadcast({"type": "output", **message})
            self._close_assistant()
            return

        if payload_type == "user":
            message_payload = as_dict(payload.get("message"))
            if message_payload:
                blocks = message_payload.get("content")
                if isinstance(blocks, list):
                    for block in blocks:
                        block_map = as_dict(block)
                        if not block_map:
                            continue
                        if block_map.get("type") != "tool_result":
                            continue
                        tool_id = block_map.get("tool_use_id")
                        tool_name = (
                            self.tool_name_by_id.get(tool_id)
                            if isinstance(tool_id, str)
                            else None
                        )
                        content_value = block_map.get("content")
                        content: str = (
                            content_value if isinstance(content_value, str) else ""
                        )
                        tool_result = as_dict(payload.get("tool_use_result"))
                        if not content and tool_result:
                            parts: list[str] = []
                            stdout = tool_result.get("stdout")
                            stderr = tool_result.get("stderr")
                            interrupted = tool_result.get("interrupted")
                            if isinstance(stdout, str) and stdout:
                                parts.append(stdout)
                            if isinstance(stderr, str) and stderr:
                                parts.append(f"[stderr]\\n{stderr}")
                            if interrupted:
                                parts.append("[interrupted]")
                            content = "\\n\\n".join(parts)
                        formatted = self._format_tool_result(
                            tool_name, content, bool(block_map.get("is_error"))
                        )
                        message = self._append_tool_result(
                            tool_id if isinstance(tool_id, str) else None,
                            formatted,
                            timestamp,
                        )
                        await self._broadcast({"type": "output", **message})
                        if isinstance(tool_id, str):
                            self.tool_input_buffer_by_id.pop(tool_id, None)
            return

        if payload_type == "result" and payload.get("is_error"):
            result = payload.get("result")
            error_text = result if isinstance(result, str) else "Claude error."
            message = self._set_assistant_content(error_text, timestamp, None)
            if message:
                await self._broadcast({"type": "output", **message})

    async def _handle_status(self, status: str) -> None:
        if self.closed:
            return
        self.status = status
        if status == "closed":
            self.closed = True
        payload = {"type": "status", "status": status, "timestamp": now_iso()}
        await self._broadcast(payload)

    async def handle_input(self, content: str) -> None:
        cleaned = content.rstrip()
        if not cleaned:
            return
        payload = {"type": "user", "message": {"role": "user", "content": cleaned}}
        try:
            self.stdin.write(json.dumps(payload) + "\n")
            self.stdin.flush()
        except Exception:
            self.loop.call_soon_threadsafe(self._queue_status, "closed")
            return
        timestamp = now_iso()
        message = self._append_user(cleaned, timestamp)
        await self._broadcast({"type": "input", **message})

    async def _broadcast(self, payload: dict[str, str]) -> None:
        if not self.clients:
            return
        stale: list[WebSocket] = []
        for client in self.clients:
            try:
                await client.send_json(payload)
            except Exception:
                stale.append(client)
        for client in stale:
            self.clients.discard(client)

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.stdin.close()
        except Exception:
            pass
        self.loop.call_soon_threadsafe(self._queue_status, "stopping")

    def to_meta(self) -> dict[str, str]:
        preview = ""
        if self.messages:
            preview = self.messages[-1]["content"].strip().splitlines()[0][:140]
        first_user = ""
        for message in self.messages:
            if message.get("role") != "user":
                continue
            content = message.get("content", "").strip()
            if content:
                first_user = content
                break
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at,
            "last_updated": self.last_updated,
            "preview": preview,
            "first_user_message": first_user,
            "workdir": self.workdir or "",
            "status": self.status,
            "mode": self.mode,
        }

    def to_detail(self) -> dict[str, object]:
        return {**self.to_meta(), "messages": self.messages}


@dataclass
class TerminalSession:
    id: str
    title: str
    process: subprocess.Popen[bytes]
    master_fd: int
    loop: asyncio.AbstractEventLoop
    workdir: Optional[str] = None
    created_at: str = field(default_factory=now_iso)
    last_updated: str = field(default_factory=now_iso)
    status: str = "running"
    clients: set[WebSocket] = field(default_factory=set)
    title_locked: bool = False
    mode: str = "terminal"
    closed: bool = False

    def start_reader(self) -> None:
        thread = threading.Thread(target=self._read_loop, daemon=True)
        thread.start()

    def _read_loop(self) -> None:
        try:
            while True:
                data = os.read(self.master_fd, 4096)
                if not data:
                    break
                text = data.decode("utf-8", errors="ignore")
                if text:
                    self.loop.call_soon_threadsafe(self._queue_output, text)
        except Exception:
            pass
        self.loop.call_soon_threadsafe(self._queue_status, "closed")
        try:
            os.close(self.master_fd)
        except Exception:
            pass

    def _queue_output(self, text: str) -> None:
        asyncio.create_task(self._handle_output(text))

    def _queue_status(self, status: str) -> None:
        asyncio.create_task(self._handle_status(status))

    async def _handle_output(self, text: str) -> None:
        if self.closed:
            return
        timestamp = now_iso()
        self.last_updated = timestamp
        await self._broadcast({"type": "output", "data": text, "timestamp": timestamp})

    async def _handle_status(self, status: str) -> None:
        if self.closed:
            return
        self.status = status
        if status == "closed":
            self.closed = True
        payload = {"type": "status", "status": status, "timestamp": now_iso()}
        await self._broadcast(payload)

    async def _broadcast(self, payload: dict[str, str]) -> None:
        if not self.clients:
            return
        stale: list[WebSocket] = []
        for client in self.clients:
            try:
                await client.send_json(payload)
            except Exception:
                stale.append(client)
        for client in stale:
            self.clients.discard(client)

    async def handle_input(self, data: str) -> None:
        if not data:
            return
        try:
            os.write(self.master_fd, data.encode())
            self.last_updated = now_iso()
        except Exception:
            self.loop.call_soon_threadsafe(self._queue_status, "closed")

    def resize(self, cols: int, rows: int) -> None:
        try:
            resize_pty(self.master_fd, cols, rows)
        except Exception:
            pass

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
        self.loop.call_soon_threadsafe(self._queue_status, "stopping")

    def to_meta(self) -> dict[str, str]:
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at,
            "last_updated": self.last_updated,
            "preview": "Interactive session",
            "first_user_message": "",
            "workdir": self.workdir or "",
            "status": self.status,
            "mode": self.mode,
        }

    def to_detail(self) -> dict[str, object]:
        return {**self.to_meta(), "messages": []}


class SessionManager:
    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop
        self.sessions: dict[str, Session | TerminalSession] = {}
        self.counter = 0

    def create(
        self,
        title: Optional[str],
        prompt: Optional[str],
        workdir: Optional[str],
        permission_mode: Optional[str],
        mode: str,
    ) -> Session | TerminalSession:
        self.counter += 1
        session_id = str(uuid.uuid4())
        fallback_title = f"Session {self.counter:02d}"
        resolved_workdir = str(resolve_workdir(workdir))
        if mode == "terminal":
            process, master_fd = spawn_terminal_process(
                resolved_workdir, session_id, permission_mode
            )
            session = TerminalSession(
                id=session_id,
                title=title or fallback_title,
                process=process,
                master_fd=master_fd,
                loop=self.loop,
                workdir=resolved_workdir,
                title_locked=bool(title),
            )
            self.sessions[session_id] = session
            session.start_reader()
            if prompt:
                if not title:
                    first_line = (
                        prompt.strip().splitlines()[0] if prompt.strip() else ""
                    )
                    if first_line:
                        session.title = first_line[:48]
                self.loop.call_soon_threadsafe(
                    lambda: asyncio.create_task(session.handle_input(f"{prompt}\r"))
                )
            return session
        process = spawn_process(resolved_workdir, session_id, permission_mode)
        if process.stdin is None or process.stdout is None:
            raise RuntimeError("Failed to open Claude Code streams.")
        session = Session(
            id=session_id,
            title=title or fallback_title,
            process=process,
            stdin=process.stdin,
            stdout=process.stdout,
            loop=self.loop,
            workdir=resolved_workdir,
            title_locked=bool(title),
        )
        self.sessions[session_id] = session
        session.start_reader()
        if prompt:
            self.loop.call_soon_threadsafe(
                lambda: asyncio.create_task(session.handle_input(prompt))
            )
        return session

    def resume(
        self,
        session_id: str,
        title: Optional[str],
        workdir: Optional[str],
        permission_mode: Optional[str],
        mode: str,
        messages: Optional[list[dict[str, str]]] = None,
        created_at: Optional[str] = None,
        last_updated: Optional[str] = None,
    ) -> Session | TerminalSession:
        existing = self.sessions.get(session_id)
        if existing:
            return existing
        self.counter += 1
        fallback_title = title or f"Session {self.counter:02d}"
        created = created_at or now_iso()
        updated = last_updated or created
        resolved_workdir = str(resolve_workdir(workdir))
        if mode == "terminal":
            process, master_fd = spawn_terminal_process(
                resolved_workdir, session_id, permission_mode, resume_id=session_id
            )
            session = TerminalSession(
                id=session_id,
                title=fallback_title,
                process=process,
                master_fd=master_fd,
                loop=self.loop,
                workdir=resolved_workdir,
                created_at=created,
                last_updated=updated,
                title_locked=bool(title),
            )
            self.sessions[session_id] = session
            session.start_reader()
            return session
        process = spawn_process(
            resolved_workdir, session_id, permission_mode, resume_id=session_id
        )
        if process.stdin is None or process.stdout is None:
            raise RuntimeError("Failed to open Claude Code streams.")
        session = Session(
            id=session_id,
            title=fallback_title,
            process=process,
            stdin=process.stdin,
            stdout=process.stdout,
            loop=self.loop,
            workdir=resolved_workdir,
            created_at=created,
            last_updated=updated,
            messages=list(messages or []),
            title_locked=bool(title),
        )
        self.sessions[session_id] = session
        session.start_reader()
        return session

    def get(self, session_id: str) -> Optional[Session | TerminalSession]:
        return self.sessions.get(session_id)

    def list_sessions(self) -> list[Session | TerminalSession]:
        return sorted(
            self.sessions.values(), key=lambda s: s.last_updated, reverse=True
        )

    def stop_all(self) -> None:
        for session in self.sessions.values():
            session.stop()

    def delete(self, session_id: str) -> Optional[Session | TerminalSession]:
        session = self.sessions.pop(session_id, None)
        if not session:
            return None
        session.stop()
        return session


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
MAX_HISTORY_MESSAGES = 200

app = FastAPI(title="Claudemail")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def api_token_guard(request: Request, call_next):
    expected = get_api_token()
    if expected and request.url.path.startswith("/api/"):
        token = extract_bearer(request.headers.get("authorization"))
        if not token:
            return JSONResponse(
                status_code=401, content={"detail": "Missing API token."}
            )
        if not is_token_valid(token, expected):
            return JSONResponse(
                status_code=403, content={"detail": "Invalid API token."}
            )
    return await call_next(request)


@app.on_event("startup")
async def startup() -> None:
    app.state.loop = asyncio.get_running_loop()
    app.state.manager = SessionManager(app.state.loop)


@app.on_event("shutdown")
async def shutdown() -> None:
    manager: SessionManager = app.state.manager
    manager.stop_all()


@app.get("/")
async def index() -> FileResponse:
    response = FileResponse(STATIC_DIR / "index.html")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/sw.js")
async def service_worker() -> FileResponse:
    response = FileResponse(STATIC_DIR / "sw.js")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Service-Worker-Allowed"] = "/"
    return response


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/history")
async def list_history(workdir: Optional[str] = None) -> list[dict[str, object]]:
    resolved = resolve_workdir(workdir)
    project_dir = project_dir_for_path(resolved)
    if not project_dir.exists():
        return []
    entries = parse_sessions_index(project_dir)
    if not entries:
        entries = build_history_entries_from_jsonl(project_dir)
    project_path = str(resolved)
    history: list[dict[str, object]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if entry.get("isSidechain") is True:
            continue
        if (
            isinstance(entry.get("projectPath"), str)
            and entry.get("projectPath") != project_path
        ):
            continue
        session_id = entry.get("sessionId")
        if not isinstance(session_id, str):
            continue
        session_path = resolve_history_session_path(project_dir, entry, session_id)
        if not session_path:
            continue
        title = select_history_title(entry) or "Claude Code"
        preview, preview_timestamp = read_session_preview(session_path)
        first_user_message = read_session_first_user_message(session_path)
        preview_line = preview.strip().splitlines()[0][:140] if preview else ""
        created = (
            entry.get("created") if isinstance(entry.get("created"), str) else None
        )
        modified = (
            entry.get("modified") if isinstance(entry.get("modified"), str) else None
        )
        if not created:
            created = iso_from_millis(entry.get("fileMtime"))
        last_updated = preview_timestamp or modified or created or now_iso()
        created_at = created or last_updated
        history.append(
            {
                "id": session_id,
                "title": title,
                "preview": preview_line,
                "first_user_message": first_user_message,
                "created_at": created_at,
                "last_updated": last_updated,
                "status": "closed",
                "mode": "stream",
                "workdir": project_path,
                "is_history": True,
            }
        )
    history.sort(key=lambda item: item.get("last_updated", ""), reverse=True)
    return history


@app.get("/api/sessions")
async def list_sessions() -> list[dict[str, str]]:
    manager: SessionManager = app.state.manager
    return [session.to_meta() for session in manager.list_sessions()]


@app.post("/api/sessions")
async def create_session(request: CreateSessionRequest) -> dict[str, object]:
    manager: SessionManager = app.state.manager
    mode = request.mode if request.mode in {"terminal", "stream"} else "stream"
    session = manager.create(
        request.title,
        request.prompt,
        request.workdir,
        request.permission_mode,
        mode,
    )
    return session.to_detail()


@app.post("/api/sessions/resume")
async def resume_session(request: ResumeSessionRequest) -> dict[str, object]:
    manager: SessionManager = app.state.manager
    session_id = request.session_id.strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID required.")
    existing = manager.get(session_id)
    if existing:
        return existing.to_detail()
    resolved = resolve_workdir(request.workdir)
    project_dir = project_dir_for_path(resolved)
    entries = parse_sessions_index(project_dir)
    if not entries:
        entries = build_history_entries_from_jsonl(project_dir)
    entry = next(
        (
            item
            for item in entries
            if isinstance(item, dict) and item.get("sessionId") == session_id
        ),
        None,
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found")
    session_path = resolve_history_session_path(project_dir, entry, session_id)
    if not session_path:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = load_session_messages(session_path, MAX_HISTORY_MESSAGES)
    title = select_history_title(entry)
    if not title and messages:
        title = messages[0]["content"].splitlines()[0]
    created = entry.get("created") if isinstance(entry.get("created"), str) else None
    modified = entry.get("modified") if isinstance(entry.get("modified"), str) else None
    if not created:
        created = iso_from_millis(entry.get("fileMtime"))
    if not modified and messages:
        modified = messages[-1].get("timestamp")
    mode = request.mode if request.mode in {"terminal", "stream"} else "stream"
    session = manager.resume(
        session_id=session_id,
        title=title.strip() or None,
        workdir=str(resolved),
        permission_mode=request.permission_mode,
        mode=mode,
        messages=messages if mode == "stream" else None,
        created_at=created,
        last_updated=modified,
    )
    return session.to_detail()


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str) -> dict[str, object]:
    manager: SessionManager = app.state.manager
    session = manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.to_detail()


@app.post("/api/sessions/{session_id}/input")
async def send_input(session_id: str, request: InputRequest) -> dict[str, str]:
    manager: SessionManager = app.state.manager
    session = manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await session.handle_input(request.content)
    return {"status": "ok"}


@app.post("/api/sessions/{session_id}/stop")
async def stop_session(session_id: str) -> dict[str, str]:
    manager: SessionManager = app.state.manager
    session = manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.stop()
    return {"status": "stopping"}


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str) -> dict[str, str]:
    manager: SessionManager = app.state.manager
    session = manager.delete(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted"}


@app.get("/api/fs/list")
async def list_directories(path: Optional[str] = None) -> dict[str, object]:
    root = get_workdir_root()
    current = normalize_workdir_path(path, root)
    if not current.exists() or not current.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found.")
    try:
        entries = sorted(
            (child for child in current.iterdir() if child.is_dir()),
            key=lambda entry: entry.name.lower(),
        )
    except OSError as exc:
        raise HTTPException(status_code=403, detail="Unable to list folder.") from exc
    directories = [{"name": entry.name, "path": str(entry)} for entry in entries]
    parent = str(current.parent) if current != root else None
    return {
        "path": str(current),
        "parent": parent,
        "root": str(root),
        "directories": directories,
    }


@app.post("/api/fs/mkdir")
async def create_directory(request: MkdirRequest) -> dict[str, str]:
    root = get_workdir_root()
    parent = normalize_workdir_path(request.parent, root)
    if not parent.exists() or not parent.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found.")
    name = request.name.strip()
    if not name or "/" in name or "\\" in name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid folder name.")
    target = safe_resolve(parent / name)
    if target != root and root not in target.parents:
        raise HTTPException(status_code=403, detail="Path outside allowed root.")
    try:
        target.mkdir(parents=False, exist_ok=False)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail="Folder already exists.") from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail="Unable to create folder.") from exc
    return {"path": str(target)}


@app.websocket("/ws/terminal/{session_id}")
async def terminal_ws(websocket: WebSocket, session_id: str) -> None:
    manager: SessionManager = app.state.manager
    session = manager.get(session_id)
    if not session or not isinstance(session, TerminalSession):
        await websocket.close(code=1008)
        return
    if not websocket_authorized(websocket):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    session.clients.add(websocket)
    await websocket.send_json(
        {"type": "status", "status": session.status, "timestamp": now_iso()}
    )
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"type": "input", "data": raw}
            if payload.get("type") == "input":
                data = payload.get("data", "")
                if isinstance(data, str):
                    await session.handle_input(data)
            elif payload.get("type") == "resize":
                cols = payload.get("cols")
                rows = payload.get("rows")
                if isinstance(cols, int) and isinstance(rows, int):
                    session.resize(cols, rows)
    except WebSocketDisconnect:
        session.clients.discard(websocket)


@app.websocket("/ws/{session_id}")
async def session_ws(websocket: WebSocket, session_id: str) -> None:
    manager: SessionManager = app.state.manager
    session = manager.get(session_id)
    if not session or not isinstance(session, Session):
        await websocket.close(code=1008)
        return
    if not websocket_authorized(websocket):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    session.clients.add(websocket)
    await websocket.send_json(
        {"type": "status", "status": session.status, "timestamp": now_iso()}
    )
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"type": "input", "content": raw}
            if payload.get("type") == "input":
                content = payload.get("content", "")
                await session.handle_input(content)
    except WebSocketDisconnect:
        session.clients.discard(websocket)
