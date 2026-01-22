const sessionList = document.getElementById("sessionList");
const messageThread = document.getElementById("messageThread");
const messageThreadContent = document.getElementById("messageThreadContent");
const messageTitle = document.getElementById("messageTitle");
const messageSubtitle = document.getElementById("messageSubtitle");
const messageSubject = document.getElementById("messageSubject");
const detailTitle = document.getElementById("detailTitle");
const emptyState = document.getElementById("emptyState");
const terminalCard = document.getElementById("terminalCard");
const terminalMount = document.getElementById("terminalMount");
const terminalTime = document.getElementById("terminalTime");
const composer = document.getElementById("composer");
const composerInput = document.getElementById("composerInput");
const newSessionButton = document.getElementById("newSession");
const deleteSessionButton = document.getElementById("stopSession");
const refreshSessionsButton = document.getElementById("refreshSessions");
const statusPill = document.getElementById("statusPill");
const unreadCount = document.getElementById("unreadCount");
const filterButton = document.getElementById("filterButton");
const filterIndicator = document.getElementById("filterIndicator");
const footerMeta = document.querySelector(".footer-meta");
const searchInput = document.getElementById("searchInput");
const listEmpty = document.getElementById("listEmpty");
const listEmptyTitle = listEmpty?.querySelector(".empty-title");
const listEmptyCopy = listEmpty?.querySelector(".empty-copy");
const messagePane = document.getElementById("messagePane");
const backButton = document.getElementById("backButton");
const mailSubtitle = document.getElementById("mailSubtitle");
const selectButton = document.getElementById("selectButton");
const selectAllButton = document.getElementById("selectAllButton");
const cancelSelectButton = document.getElementById("cancelSelectButton");
const moreButton = document.getElementById("moreButton");
const moreButtonSelect = document.getElementById("moreButtonSelect");
const markButton = document.getElementById("markButton");
const moveButton = document.getElementById("moveButton");
const trashButton = document.getElementById("trashButton");
const menuBackdrop = document.getElementById("menuBackdrop");
const moreMenu = document.getElementById("moreMenu");
const menuCategories = document.getElementById("menuCategories");
const menuList = document.getElementById("menuList");
const menuContactPhotos = document.getElementById("menuContactPhotos");
const menuSelect = document.getElementById("menuSelect");
const menuSettings = document.getElementById("menuSettings");
const menuAbout = document.getElementById("menuAbout");
const menuPriority = document.getElementById("menuPriority");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const settingsPanel = document.getElementById("settingsPanel");
const settingsClose = document.getElementById("settingsClose");
const settingsCancel = document.getElementById("settingsCancel");
const settingsForm = document.getElementById("settingsForm");
const settingsStart = document.getElementById("settingsStart");
const themeInput = document.getElementById("themeInput");
const terminalModeInput = document.getElementById("terminalModeInput");
const permissionModeInput = document.getElementById("permissionModeInput");
const workdirInput = document.getElementById("workdirInput");
const workdirBrowse = document.getElementById("workdirBrowse");
const userInitialInput = document.getElementById("userInitialInput");
const promptInput = document.getElementById("promptInput");
const accessTokenInput = document.getElementById("accessTokenInput");
const folderPickerBackdrop = document.getElementById("folderPickerBackdrop");
const folderPicker = document.getElementById("folderPicker");
const folderPickerClose = document.getElementById("folderPickerClose");
const folderPickerUp = document.getElementById("folderPickerUp");
const folderPickerList = document.getElementById("folderPickerList");
const folderPickerPath = document.getElementById("folderPickerPath");
const folderPickerSubtitle = document.getElementById("folderPickerSubtitle");
const folderPickerStatus = document.getElementById("folderPickerStatus");
const folderPickerUse = document.getElementById("folderPickerUse");
const folderPickerNew = document.getElementById("folderPickerNew");
const categoryButtons = Array.from(document.querySelectorAll(".icon-chip"));
const rootStyle = document.documentElement.style;

const SETTINGS_KEY = "claudemail.settings";
const UI_KEY = "claudemail.ui";

const defaultSettings = {
  terminalMode: false,
  permissionMode: "acceptEdits",
  workdir: "",
  prompt: "",
  theme: "system",
  userInitial: "",
  accessToken: "",
};

const TERMINAL_THEME_BASE = {
  foreground: "#f2f2f7",
  selection: "rgba(255, 255, 255, 0.2)",
  cursor: "#f2f2f7",
};

const CLAUDE_AVATAR = "/static/icons/claude-color.png";

const defaultUi = {
  showContactPhotos: true,
  listView: true,
};

const TITLE_ADJECTIVES = [
  "Amber",
  "Brave",
  "Bright",
  "Calm",
  "Clever",
  "Crimson",
  "Dapper",
  "Daring",
  "Dusky",
  "Golden",
  "Icy",
  "Jolly",
  "Lucky",
  "Misty",
  "Noble",
  "Quiet",
  "Rapid",
  "Sandy",
  "Silent",
  "Silver",
  "Solar",
  "Swift",
  "Velvet",
  "Wild",
];

const TITLE_ANIMALS = [
  "Badger",
  "Bear",
  "Cat",
  "Coyote",
  "Crane",
  "Deer",
  "Falcon",
  "Fox",
  "Heron",
  "Hound",
  "Lynx",
  "Moose",
  "Owl",
  "Otter",
  "Panda",
  "Rabbit",
  "Seal",
  "Shark",
  "Tiger",
  "Turtle",
  "Wolf",
  "Wren",
  "Yak",
  "Zebra",
];

const state = {
  sessions: [],
  activeSessionId: null,
  activeSessionMode: "stream",
  socket: null,
  messageMap: new Map(),
  activeMessages: null,
  activeSession: null,
  pendingInputs: [],
  filter: "",
  filterUnread: false,
  activeCategory: "primary",
  selectionMode: false,
  selectedIds: new Set(),
  ui: { ...defaultUi },
  settings: { ...defaultSettings },
};

const folderPickerState = {
  path: "",
  parent: null,
  root: "",
};

const terminalState = {
  socket: null,
  term: null,
  fitAddon: null,
  sessionId: null,
  resizeTimer: null,
  pendingInputs: [],
};

let viewportRaf = null;

function updateViewportMetrics() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const keyboardGap = Math.max(0, window.innerHeight - height - offsetTop);
  if (Number.isFinite(height)) {
    rootStyle.setProperty("--viewport-height", `${Math.round(height)}px`);
  }
  const effectiveOffset = keyboardGap > 0 ? 0 : offsetTop;
  if (Number.isFinite(effectiveOffset)) {
    rootStyle.setProperty("--viewport-offset", `${Math.round(effectiveOffset)}px`);
  }
  rootStyle.setProperty("--keyboard-gap", `${Math.round(keyboardGap)}px`);
  document.body.classList.toggle("keyboard-open", keyboardGap > 100);
}

function scheduleViewportUpdate() {
  if (viewportRaf) return;
  viewportRaf = window.requestAnimationFrame(() => {
    viewportRaf = null;
    updateViewportMetrics();
  });
}

function setStatus(text, offline = false) {
  if (!statusPill) return;
  const status = (text || "").toLowerCase();
  let label = "Updated Just Now";
  if (status === "closed" || status === "offline") {
    label = "Offline";
  } else if (status === "stopping") {
    label = "Updating";
  }
  statusPill.textContent = label;
  statusPill.classList.toggle("offline", offline || status === "closed");
}

function sanitizeSettings(raw) {
  const rawTheme = typeof raw?.theme === "string" ? raw.theme : "system";
  const theme =
    rawTheme === "dark" || rawTheme === "light" || rawTheme === "oled" ? rawTheme : "system";
  const rawInitial = typeof raw?.userInitial === "string" ? raw.userInitial.trim() : "";
  return {
    terminalMode: raw?.terminalMode === true,
    permissionMode: typeof raw?.permissionMode === "string" ? raw.permissionMode : "",
    workdir: typeof raw?.workdir === "string" ? raw.workdir : "",
    prompt: typeof raw?.prompt === "string" ? raw.prompt : "",
    theme,
    userInitial: rawInitial ? rawInitial.slice(0, 1) : "",
    accessToken: typeof raw?.accessToken === "string" ? raw.accessToken.trim() : "",
  };
}

function loadSettings() {
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return { ...defaultSettings };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...sanitizeSettings(parsed) };
  } catch (error) {
    return { ...defaultSettings };
  }
}

function saveSettings(next) {
  const sanitized = sanitizeSettings(next);
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
  return sanitized;
}

const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");

function isDarkTheme(theme) {
  if (theme === "dark") return true;
  if (theme === "oled") return true;
  if (theme === "light") return false;
  return themeMedia.matches;
}

function terminalThemeFor(theme) {
  return {
    ...TERMINAL_THEME_BASE,
    background: theme === "oled" ? "#000000" : "#0b0b0f",
  };
}

function applyTheme(theme) {
  const dark = isDarkTheme(theme);
  const oled = theme === "oled";
  document.body.classList.toggle("theme-dark", dark);
  document.body.classList.toggle("theme-light", !dark);
  document.body.classList.toggle("theme-oled", oled);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", oled ? "#000000" : dark ? "#0b0b10" : "#ffffff");
  }
  if (terminalState.term) {
    terminalState.term.options.theme = terminalThemeFor(theme);
  }
}

function applySettingsState(next) {
  const previousWorkdir = state.settings.workdir || "";
  state.settings = saveSettings(next);
  applyTheme(state.settings.theme);
  if (state.activeMessages) {
    renderMessages(state.activeMessages);
  }
  if (state.settings.workdir !== previousWorkdir) {
    if (state.activeSession && !matchesWorkdir(state.activeSession, state.settings.workdir)) {
      clearActiveSession();
      hideMessagePane();
    }
    state.sessions = state.sessions.filter((session) => !session.is_history);
    if (!normalizeWorkdir(state.settings.workdir)) {
      state.sessions = [];
      renderSessionList();
      return state.settings;
    }
    renderSessionList();
    fetchSessions();
    fetchHistorySessions(state.settings.workdir);
  }
  return state.settings;
}

function sanitizeUi(raw) {
  return {
    showContactPhotos: raw?.showContactPhotos !== false,
    listView: raw?.listView !== false,
  };
}

function loadUiSettings() {
  const raw = window.localStorage.getItem(UI_KEY);
  if (!raw) {
    return { ...defaultUi };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultUi, ...sanitizeUi(parsed) };
  } catch (error) {
    return { ...defaultUi };
  }
}

function saveUiSettings(next) {
  const sanitized = sanitizeUi(next);
  window.localStorage.setItem(UI_KEY, JSON.stringify(sanitized));
  return sanitized;
}

function collectSettingsFromForm() {
  return {
    terminalMode: terminalModeInput.checked,
    permissionMode: permissionModeInput.value.trim(),
    workdir: workdirInput.value.trim(),
    prompt: promptInput.value.trim(),
    theme: themeInput?.value || "system",
    userInitial: userInitialInput?.value || "",
    accessToken: accessTokenInput?.value || "",
  };
}

function applySettingsToForm(settings) {
  terminalModeInput.checked = settings.terminalMode;
  permissionModeInput.value = settings.permissionMode;
  workdirInput.value = settings.workdir;
  promptInput.value = settings.prompt;
  if (themeInput) themeInput.value = settings.theme || "system";
  if (userInitialInput) userInitialInput.value = settings.userInitial || "";
  if (accessTokenInput) accessTokenInput.value = settings.accessToken || "";
}

function showMessagePane() {
  messagePane.classList.add("open");
  messagePane.setAttribute("aria-hidden", "false");
  scheduleViewportUpdate();
}

function hideMessagePane() {
  messagePane.classList.remove("open");
  messagePane.setAttribute("aria-hidden", "true");
}

function openMenu() {
  updateMenuState();
  moreMenu.classList.add("open");
  menuBackdrop.classList.add("visible");
  moreMenu.setAttribute("aria-hidden", "false");
}

function closeMenu() {
  moreMenu.classList.remove("open");
  menuBackdrop.classList.remove("visible");
  moreMenu.setAttribute("aria-hidden", "true");
}

function openSettingsPanel() {
  settingsPanel.classList.add("open");
  settingsBackdrop.classList.add("visible");
  settingsPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("settings-open");
}

function closeSettingsPanel() {
  settingsPanel.classList.remove("open");
  settingsBackdrop.classList.remove("visible");
  settingsPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("settings-open");
  closeFolderPicker();
}

function isTerminalMode() {
  return state.activeSessionMode === "terminal";
}

function toggleTerminalCard(active) {
  if (!terminalCard) return;
  terminalCard.classList.toggle("active", active);
  terminalCard.setAttribute("aria-hidden", active ? "false" : "true");
}

function updateTerminalTime(timestamp) {
  if (!terminalTime) return;
  terminalTime.textContent = formatThreadTime(timestamp);
}

function ensureTerminalInstance() {
  if (!terminalMount || !window.Terminal) {
    return null;
  }
  if (terminalState.term) {
    return terminalState.term;
  }
  const term = new window.Terminal({
    convertEol: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    theme: terminalThemeFor(state.settings.theme),
  });
  const FitAddonCtor = window.FitAddon?.FitAddon || window.FitAddon;
  if (FitAddonCtor) {
    const fitAddon = new FitAddonCtor();
    term.loadAddon(fitAddon);
    terminalState.fitAddon = fitAddon;
  }
  term.open(terminalMount);
  term.onData((data) => sendTerminalInput(data));
  terminalState.term = term;
  return term;
}

function closeTerminalSocket() {
  if (terminalState.socket) {
    terminalState.socket.close();
  }
  terminalState.socket = null;
  terminalState.sessionId = null;
  terminalState.pendingInputs = [];
}

function flushTerminalInputs() {
  if (!terminalState.socket || terminalState.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  while (terminalState.pendingInputs.length) {
    terminalState.socket.send(
      JSON.stringify({ type: "input", data: terminalState.pendingInputs.shift() })
    );
  }
}

function sendTerminalInput(data) {
  if (!data) return;
  if (!terminalState.socket || terminalState.socket.readyState !== WebSocket.OPEN) {
    terminalState.pendingInputs.push(data);
    return;
  }
  terminalState.socket.send(JSON.stringify({ type: "input", data }));
}

function sendTerminalResize() {
  if (!terminalState.socket || terminalState.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  if (!terminalState.term) return;
  terminalState.socket.send(
    JSON.stringify({ type: "resize", cols: terminalState.term.cols, rows: terminalState.term.rows })
  );
}

function fitTerminal() {
  if (!terminalState.term || !terminalState.fitAddon) return;
  terminalState.fitAddon.fit();
  sendTerminalResize();
}

function scheduleTerminalFit() {
  if (!terminalState.term || !terminalState.fitAddon) return;
  if (terminalState.resizeTimer) {
    window.clearTimeout(terminalState.resizeTimer);
  }
  terminalState.resizeTimer = window.setTimeout(() => {
    terminalState.resizeTimer = null;
    fitTerminal();
  }, 120);
}

function openTerminalSocket(sessionId) {
  closeTerminalSocket();
  const term = ensureTerminalInstance();
  if (!term) return;
  term.reset();
  const socket = new WebSocket(buildWsUrl(`/ws/terminal/${sessionId}`));
  socket.addEventListener("open", () => {
    terminalState.sessionId = sessionId;
    flushTerminalInputs();
    fitTerminal();
    term.focus();
  });
  socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    if (payload.type === "status") {
      const offline = payload.status === "closed";
      setStatus(payload.status, offline);
      return;
    }
    if (payload.type === "output" && typeof payload.data === "string") {
      term.write(payload.data);
      updateTerminalTime(payload.timestamp);
    }
  });
  socket.addEventListener("close", () => {
    setStatus("offline", true);
  });
  terminalState.socket = socket;
}

function openFolderPicker() {
  folderPicker.classList.add("open");
  folderPickerBackdrop.classList.add("visible");
  folderPicker.setAttribute("aria-hidden", "false");
  document.body.classList.add("folder-picker-open");
  const initialPath = workdirInput.value.trim();
  const targetPath = initialPath || folderPickerState.path || null;
  loadFolderPicker(targetPath);
}

function closeFolderPicker() {
  folderPicker.classList.remove("open");
  folderPickerBackdrop.classList.remove("visible");
  folderPicker.setAttribute("aria-hidden", "true");
  document.body.classList.remove("folder-picker-open");
}

function setFolderPickerStatus(message) {
  folderPickerStatus.textContent = message || "";
}

function getAccessToken() {
  return (state.settings?.accessToken || "").trim();
}

function authHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), ...authHeaders() };
  return fetch(url, { ...options, headers });
}

function buildWsUrl(path) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = new URL(`${protocol}://${window.location.host}${path}`);
  const token = getAccessToken();
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

async function fetchFolderList(path) {
  const url = new URL("/api/fs/list", window.location.origin);
  if (path) {
    url.searchParams.set("path", path);
  }
  const response = await apiFetch(url);
  if (!response.ok) {
    let detail = "Unable to load folders.";
    try {
      const payload = await response.json();
      if (payload?.detail) {
        detail = payload.detail;
      }
    } catch (error) {
      // Ignore JSON parse errors.
    }
    throw new Error(detail);
  }
  return response.json();
}

async function createFolder(parent, name) {
  const response = await apiFetch("/api/fs/mkdir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parent, name }),
  });
  if (!response.ok) {
    let detail = "Unable to create folder.";
    try {
      const payload = await response.json();
      if (payload?.detail) {
        detail = payload.detail;
      }
    } catch (error) {
      // Ignore JSON parse errors.
    }
    throw new Error(detail);
  }
  return response.json();
}

function renderFolderPicker(data) {
  folderPickerState.path = data.path;
  folderPickerState.parent = data.parent;
  folderPickerState.root = data.root;
  folderPickerPath.textContent = data.path || "";
  folderPickerSubtitle.textContent = data.root ? `Root: ${data.root}` : "";
  folderPickerUp.disabled = !data.parent;
  folderPickerList.innerHTML = "";
  if (!data.directories?.length) {
    const empty = document.createElement("div");
    empty.className = "folder-picker-empty";
    empty.textContent = "No folders found.";
    folderPickerList.appendChild(empty);
    return;
  }
  data.directories.forEach((entry) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "folder-picker-item";
    const name = document.createElement("span");
    name.textContent = entry.name;
    const chevron = document.createElement("span");
    chevron.className = "folder-picker-chevron";
    chevron.textContent = ">";
    item.append(name, chevron);
    item.addEventListener("click", () => {
      loadFolderPicker(entry.path);
    });
    folderPickerList.appendChild(item);
  });
}

async function loadFolderPicker(path) {
  folderPickerList.innerHTML = "";
  setFolderPickerStatus("Loading...");
  try {
    const data = await fetchFolderList(path);
    setFolderPickerStatus("");
    renderFolderPicker(data);
    return true;
  } catch (error) {
    setFolderPickerStatus(error?.message || "Unable to load folders.");
    return false;
  }
}

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatThreadTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  if (sameDay) {
    return formatTime(iso);
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays >= 0 && diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "long" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatSubjectLine(title) {
  const trimmed = (title || "").trim();
  if (!trimmed) return "Re: Claude Code";
  if (/^re:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

function getUserInitial() {
  const raw = (state.settings?.userInitial || "").trim();
  const initial = raw ? raw[0] : "Y";
  return initial.toUpperCase();
}

function normalizePreview(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

function normalizeWorkdir(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function matchesWorkdir(session, workdir) {
  const scoped = normalizeWorkdir(workdir);
  if (!scoped) return false;
  const sessionWorkdir = normalizeWorkdir(session?.workdir);
  if (!sessionWorkdir) return false;
  return sessionWorkdir === scoped;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseInline(text) {
  if (!text) return "";
  const segments = text.split("`");
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return `<code>${segment}</code>`;
      }
      let output = segment;
      output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      output = output.replace(/(^|[^*])\*(?!\s)(.+?)(?!\s)\*/g, "$1<em>$2</em>");
      return output;
    })
    .join("");
}

function renderMarkdown(text) {
  if (!text) return "";
  const lines = escapeHtml(text).replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const content = paragraph.join("<br>");
    output.push(`<p>${parseInline(content)}</p>`);
    paragraph = [];
  };

  const isTableSeparator = (value) =>
    /^\s*\|?\s*[-:]+(\s*\|\s*[-:]+)+\s*\|?\s*$/.test(value);

  const splitTableRow = (value) => {
    const trimmed = value.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  };

  while (lines.length) {
    const line = lines.shift();
    if (line === undefined) break;
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      const language = line.slice(3).trim();
      const codeLines = [];
      while (lines.length) {
        const next = lines.shift();
        if (next === undefined) break;
        if (next.startsWith("```")) break;
        codeLines.push(next);
      }
      const code = codeLines.join("\n");
      const className = language ? ` class="language-${language}"` : "";
      output.push(`<pre><code${className}>${code}</code></pre>`);
      continue;
    }

    if (line.includes("|") && lines.length && isTableSeparator(lines[0])) {
      flushParagraph();
      const header = splitTableRow(line);
      lines.shift();
      const rows = [];
      while (lines.length) {
        const next = lines[0];
        if (!next || !next.includes("|")) break;
        rows.push(splitTableRow(lines.shift()));
      }
      const headerHtml = header.map((cell) => `<th>${parseInline(cell)}</th>`).join("");
      const rowsHtml = rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${parseInline(cell)}</td>`).join("")}</tr>`
        )
        .join("");
      output.push(`<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoteLines = [line.replace(/^\s*>\s?/, "")];
      while (lines.length && /^\s*>\s?/.test(lines[0])) {
        quoteLines.push(lines.shift().replace(/^\s*>\s?/, ""));
      }
      output.push(`<blockquote>${parseInline(quoteLines.join("<br>"))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const items = [line.replace(/^\s*[-*+]\s+/, "")];
      while (lines.length && /^\s*[-*+]\s+/.test(lines[0])) {
        items.push(lines.shift().replace(/^\s*[-*+]\s+/, ""));
      }
      output.push(`<ul>${items.map((item) => `<li>${parseInline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      const items = [line.replace(/^\s*\d+\.\s+/, "")];
      while (lines.length && /^\s*\d+\.\s+/.test(lines[0])) {
        items.push(lines.shift().replace(/^\s*\d+\.\s+/, ""));
      }
      output.push(`<ol>${items.map((item) => `<li>${parseInline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return output.join("");
}

function renderMessageContent(message) {
  const content = message?.content || "";
  if (message?.role === "tool") {
    return `<pre><code>${escapeHtml(content)}</code></pre>`;
  }
  return renderMarkdown(content);
}

function hashSeed(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function autoTitleFor(session) {
  const seed = session?.id || session?.title || "claude";
  const hash = hashSeed(seed);
  const adjective = TITLE_ADJECTIVES[hash % TITLE_ADJECTIVES.length];
  const animal =
    TITLE_ANIMALS[Math.floor(hash / TITLE_ADJECTIVES.length) % TITLE_ANIMALS.length];
  return `${adjective} ${animal}`;
}

function firstUserMessageFrom(messages) {
  if (!Array.isArray(messages)) return "";
  for (const message of messages) {
    if (message?.role !== "user") continue;
    const content = (message?.content || "").trim();
    if (content) return content;
  }
  return "";
}

function avatarColorFor(text) {
  const palette = [
    "#007aff",
    "#34c759",
    "#ff9f0a",
    "#af52de",
    "#ff2d55",
    "#32ade6",
    "#5856d6",
    "#ff375f",
  ];
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % palette.length;
  }
  return palette[hash];
}

function updateUnreadCount() {
  const unread = state.sessions.filter((session) => session.unread).length;
  const unreadLabel = `${unread.toLocaleString()} Unread`;
  unreadCount.textContent = unreadLabel;
  if (mailSubtitle) {
    if (state.selectionMode) {
      mailSubtitle.textContent = "Select Messages";
    } else if (state.ui.listView) {
      mailSubtitle.textContent = unreadLabel;
    } else {
      mailSubtitle.innerHTML = `All Mail &middot; ${unreadLabel}`;
    }
  }
}

function clearThread() {
  state.messageMap.clear();
  messageThreadContent.innerHTML = "";
  if (terminalCard) {
    messageThreadContent.appendChild(terminalCard);
  }
  messageThreadContent.appendChild(emptyState);
}

function updateEmptyState(hasMessages) {
  const showEmpty = !hasMessages && !isTerminalMode();
  emptyState.style.display = showEmpty ? "grid" : "none";
}

function updateListEmptyState(count) {
  if (!listEmpty) return;
  const hasWorkdir = Boolean(normalizeWorkdir(state.settings.workdir));
  const hasFilter = state.filter.trim().length > 0;
  const hasUnreadFilter = state.filterUnread;
  if (listEmptyTitle) {
    if (!hasWorkdir) {
      listEmptyTitle.textContent = "Set a Working Directory";
    } else if (hasFilter) {
      listEmptyTitle.textContent = "No Results";
    } else if (hasUnreadFilter) {
      listEmptyTitle.textContent = "No Unread";
    } else {
      listEmptyTitle.textContent = "No Mail";
    }
  }
  if (listEmptyCopy) {
    if (!hasWorkdir) {
      listEmptyCopy.textContent = "Choose a folder in Settings to view sessions.";
    } else if (hasFilter) {
      listEmptyCopy.textContent = "Try a different search.";
    } else if (hasUnreadFilter) {
      listEmptyCopy.textContent = "You're all caught up.";
    } else {
      listEmptyCopy.textContent = "You're all caught up.";
    }
  }
  const visible = !hasWorkdir || count === 0;
  listEmpty.classList.toggle("visible", visible);
  listEmpty.setAttribute("aria-hidden", visible ? "false" : "true");
}

function updateFilterIndicator() {
  if (!filterIndicator) return;
  const active = state.filterUnread;
  filterIndicator.classList.toggle("visible", active);
  filterIndicator.setAttribute("aria-hidden", active ? "false" : "true");
  if (filterButton) {
    filterButton.classList.toggle("active", active);
  }
  if (footerMeta) {
    footerMeta.classList.toggle("visible", active);
  }
}

function setActiveCategory(category) {
  if (!categoryButtons.length) return;
  const next =
    category ||
    categoryButtons.find((button) => button.classList.contains("active"))?.dataset.category ||
    categoryButtons[0]?.dataset.category ||
    "primary";
  state.activeCategory = next;
  categoryButtons.forEach((button) => {
    const isActive = button.dataset.category === next;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function initCategoryChips() {
  if (!categoryButtons.length) return;
  setActiveCategory(state.activeCategory);
  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveCategory(button.dataset.category);
    });
  });
}

function buildMessageElement(message) {
  const wrapper = document.createElement("div");
  wrapper.className = `thread-card ${message.role}`;
  wrapper.dataset.messageId = message.id;

  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  const header = document.createElement("div");
  header.className = "thread-header";

  const avatar = document.createElement("div");
  avatar.className = "thread-avatar";
  if (isUser) {
    avatar.textContent = getUserInitial();
  } else {
    const img = document.createElement("img");
    img.src = CLAUDE_AVATAR;
    img.alt = "Claude";
    avatar.appendChild(img);
  }

  const meta = document.createElement("div");
  meta.className = "thread-meta";

  const fromRow = document.createElement("div");
  fromRow.className = "thread-from-row";

  const from = document.createElement("div");
  from.className = "thread-from";
  from.textContent = isUser ? "You" : isTool ? "Claude Tool" : "Claude";

  const time = document.createElement("div");
  time.className = "thread-time";
  time.textContent = formatThreadTime(message.timestamp);

  fromRow.appendChild(from);
  fromRow.appendChild(time);

  const to = document.createElement("div");
  to.className = "thread-to";
  to.textContent = isUser ? "To: Claude Code" : "To: You";

  meta.appendChild(fromRow);
  meta.appendChild(to);

  const body = document.createElement("div");
  body.className = "thread-body";
  body.innerHTML = renderMessageContent(message);

  header.appendChild(avatar);
  header.appendChild(meta);

  wrapper.appendChild(header);
  wrapper.appendChild(body);

  return wrapper;
}

function upsertMessage(message) {
  if (isTerminalMode()) return;
  let element = state.messageMap.get(message.id);
  if (!element) {
    element = buildMessageElement(message);
    state.messageMap.set(message.id, element);
    messageThreadContent.appendChild(element);
  } else {
    const body = element.querySelector(".thread-body");
    const time = element.querySelector(".thread-time");
    if (body) body.innerHTML = renderMessageContent(message);
    if (time) time.textContent = formatThreadTime(message.timestamp);
  }
  updateEmptyState(state.messageMap.size > 0);
  messageThread.scrollTop = messageThread.scrollHeight;
  updateMessageCount(state.messageMap.size);
}

function renderMessages(messages) {
  state.activeMessages = messages;
  clearThread();
  toggleTerminalCard(isTerminalMode());
  if (isTerminalMode()) {
    updateEmptyState(false);
    updateMessageCount(0);
    scheduleTerminalFit();
    return;
  }
  if (!messages.length) {
    updateEmptyState(false);
    updateMessageCount(0);
    return;
  }
  updateEmptyState(true);
  messages.forEach((message) => upsertMessage(message));
  updateMessageCount(messages.length);
}

function sessionTimestamp(session) {
  const raw = session.last_updated || session.created_at || "";
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortSessions(sessions) {
  return sessions.sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
}

function getFilteredSessions() {
  if (!normalizeWorkdir(state.settings.workdir)) {
    return [];
  }
  const filter = state.filter.toLowerCase();
  const scoped = state.sessions.filter((session) =>
    matchesWorkdir(session, state.settings.workdir)
  );
  const filtered = scoped.filter(
    (session) =>
      autoTitleFor(session).toLowerCase().includes(filter) ||
      (session.title || "").toLowerCase().includes(filter) ||
      (session.first_user_message || "").toLowerCase().includes(filter) ||
      (session.preview || "").toLowerCase().includes(filter)
  );
  if (!state.filterUnread) return filtered;
  return filtered.filter((session) => session.unread);
}

function updateSelectionLabel() {
  if (!state.selectionMode) {
    updateSelectionActions();
    return;
  }
  const filtered = getFilteredSessions();
  const allSelected =
    filtered.length > 0 && filtered.every((session) => state.selectedIds.has(session.id));
  selectAllButton.textContent = allSelected ? "Deselect All" : "Select All";
  updateSelectionActions();
}

function updateSelectionActions() {
  const hasSelection = state.selectedIds.size > 0;
  [markButton, moveButton, trashButton].forEach((button) => {
    if (!button) return;
    button.disabled = !hasSelection;
  });
}

function toggleSelection(sessionId) {
  if (state.selectedIds.has(sessionId)) {
    state.selectedIds.delete(sessionId);
  } else {
    state.selectedIds.add(sessionId);
  }
  updateSelectionLabel();
  renderSessionList();
}

function enterSelectionMode() {
  if (state.selectionMode) return;
  state.selectionMode = true;
  state.selectedIds.clear();
  document.body.classList.add("selection-mode");
  updateSelectionLabel();
  renderSessionList();
}

function exitSelectionMode() {
  if (!state.selectionMode) return;
  state.selectionMode = false;
  state.selectedIds.clear();
  document.body.classList.remove("selection-mode");
  renderSessionList();
}

function toggleSelectAll() {
  const filtered = getFilteredSessions();
  const allSelected =
    filtered.length > 0 && filtered.every((session) => state.selectedIds.has(session.id));
  state.selectedIds.clear();
  if (!allSelected) {
    filtered.forEach((session) => state.selectedIds.add(session.id));
  }
  updateSelectionLabel();
  renderSessionList();
}

function applyUiState(next) {
  state.ui = saveUiSettings(next);
  document.body.classList.toggle("hide-avatars", !state.ui.showContactPhotos);
  document.body.classList.toggle("list-view", state.ui.listView);
  updateMenuState();
  renderSessionList();
}

function updateMenuState() {
  if (!menuCategories || !menuList) return;
  menuCategories.classList.toggle("selected", !state.ui.listView);
  menuList.classList.toggle("selected", state.ui.listView);
  const check = menuContactPhotos?.querySelector(".menu-check");
  if (check) {
    check.classList.toggle("checked", state.ui.showContactPhotos);
  }
}

function renderSessionList() {
  sessionList.innerHTML = "";
  if (listEmpty) {
    sessionList.appendChild(listEmpty);
  }
  const filtered = getFilteredSessions();

  filtered.forEach((session) => {
    const card = document.createElement("div");
    card.className = "session-card";
    card.dataset.sessionId = session.id;

    const isUnread = session.unread ?? session.id !== state.activeSessionId;
    session.unread = isUnread;

    if (isUnread) {
      card.classList.add("unread");
    }
    if (state.selectionMode && state.selectedIds.has(session.id)) {
      card.classList.add("selected");
    }

    const marker = document.createElement("div");
    marker.className = "session-marker";

    const dot = document.createElement("div");
    dot.className = "session-dot";

    const select = document.createElement("div");
    select.className = "session-select";
    select.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';

    marker.appendChild(dot);
    marker.appendChild(select);

    const content = document.createElement("div");
    content.className = "session-content";

    const row = document.createElement("div");
    row.className = "session-row";

    const title = document.createElement("div");
    title.className = "session-title";
    const titleText = autoTitleFor(session);
    title.textContent = titleText;

    const meta = document.createElement("div");
    meta.className = "session-meta";

    const time = document.createElement("div");
    time.className = "session-time";
    time.textContent = formatTime(session.last_updated);

    const chevron = document.createElement("div");
    chevron.className = "session-chevron";
    chevron.setAttribute("aria-hidden", "true");

    meta.appendChild(time);
    meta.appendChild(chevron);

    row.appendChild(title);
    row.appendChild(meta);

    const subjectEl = document.createElement("div");
    subjectEl.className = "session-subject";
    const subjectText = normalizePreview(session.title || "Claude Code");
    subjectEl.textContent = subjectText;

    const snippetEl = document.createElement("div");
    snippetEl.className = "session-snippet";
    const snippetText = normalizePreview(session.first_user_message || "");
    snippetEl.textContent =
      snippetText || (session.status === "closed" ? "Session closed." : "Tap to open.");

    content.appendChild(row);
    content.appendChild(subjectEl);
    content.appendChild(snippetEl);

    card.appendChild(marker);

    if (state.ui.showContactPhotos) {
      const avatar = document.createElement("div");
      avatar.className = "session-avatar";
      const initial = titleText.trim()[0] ? titleText.trim()[0].toUpperCase() : "C";
      avatar.textContent = initial;
      avatar.style.background = avatarColorFor(titleText || session.id);
      card.appendChild(avatar);
    }

    card.appendChild(content);

    card.addEventListener("click", () => {
      if (state.selectionMode) {
        toggleSelection(session.id);
      } else {
        selectSession(session.id);
      }
    });

    sessionList.appendChild(card);
  });

  updateUnreadCount();
  updateSelectionLabel();
  updateListEmptyState(filtered.length);
  updateFilterIndicator();
}

async function fetchSessions() {
  if (!normalizeWorkdir(state.settings.workdir)) {
    state.sessions = [];
    renderSessionList();
    return;
  }
  const response = await apiFetch("/api/sessions");
  if (!response.ok) return;
  const sessions = await response.json();
  const previous = new Map(
    state.sessions.filter((session) => !session.is_history).map((session) => [session.id, session])
  );
  const activeSessions = sessions.map((session) => {
    const cached = previous.get(session.id);
    return {
      ...session,
      is_history: false,
      mode: session.mode || cached?.mode || "stream",
      unread: cached?.unread ?? session.id !== state.activeSessionId,
      last_role: cached?.last_role || null,
    };
  });
  const activeIds = new Set(activeSessions.map((session) => session.id));
  const historySessions = state.sessions.filter((session) => session.is_history);
  state.sessions = sortSessions([
    ...activeSessions,
    ...historySessions.filter((session) => !activeIds.has(session.id)),
  ]);
  renderSessionList();
}

function mergeHistorySessions(historySessions, workdir) {
  const activeSessions = state.sessions.filter((session) => !session.is_history);
  const activeIds = new Set(activeSessions.map((session) => session.id));
  const normalizedHistory = historySessions.map((session) => ({
    ...session,
    is_history: true,
    unread: false,
    last_role: null,
    workdir: session.workdir || workdir || "",
  }));
  state.sessions = sortSessions([
    ...activeSessions,
    ...normalizedHistory.filter((session) => !activeIds.has(session.id)),
  ]);
  renderSessionList();
}

async function fetchHistorySessions(workdirOverride) {
  const candidate = workdirOverride ?? state.settings.workdir;
  const workdir = (candidate || "").trim();
  if (!workdir) {
    return;
  }
  const url = new URL("/api/history", window.location.origin);
  if (workdir) {
    url.searchParams.set("workdir", workdir);
  }
  const response = await apiFetch(url);
  if (!response.ok) return;
  const historySessions = await response.json();
  mergeHistorySessions(historySessions, workdir);
}

async function fetchSessionDetail(sessionId) {
  const response = await apiFetch(`/api/sessions/${sessionId}`);
  if (!response.ok) return null;
  return response.json();
}

function closeSocket() {
  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }
}

function clearActiveSession() {
  state.activeSessionId = null;
  state.activeSession = null;
  state.activeMessages = null;
  state.activeSessionMode = "stream";
  closeSocket();
  closeTerminalSocket();
  updateHeader(null);
  renderMessages([]);
  setStatus("idle");
  hideMessagePane();
}

function removeLocalSessions(sessionIds, { render = true } = {}) {
  if (!sessionIds.length) return;
  const idSet = new Set(sessionIds);
  const activeRemoved = state.activeSessionId && idSet.has(state.activeSessionId);
  state.sessions = state.sessions.filter((session) => !idSet.has(session.id));
  sessionIds.forEach((sessionId) => state.selectedIds.delete(sessionId));
  if (activeRemoved) {
    clearActiveSession();
  }
  if (render) {
    renderSessionList();
  }
}

function updateHeader(session) {
  if (!session) {
    messageTitle.textContent = "No Message Selected";
    messageSubtitle.textContent = "Select a session to control Claude Code.";
    if (messageSubject) messageSubject.textContent = "";
    if (detailTitle) detailTitle.textContent = "0 Messages";
    return;
  }
  messageTitle.textContent = formatSubjectLine(session.title);
  messageSubtitle.textContent = "From: Claude Code";
  if (messageSubject) {
    const stamp = formatThreadTime(session.last_updated || session.created_at);
    messageSubject.textContent = stamp ? `To: You - ${stamp}` : "To: You";
  }
}

function updateMessageCount(count) {
  if (!detailTitle) return;
  if (isTerminalMode() && state.activeSessionId) {
    detailTitle.textContent = "Terminal";
    return;
  }
  const label = count === 1 ? "Message" : "Messages";
  detailTitle.textContent = `${count} ${label}`;
}

function openSocket(sessionId) {
  closeSocket();
  const socket = new WebSocket(buildWsUrl(`/ws/${sessionId}`));

  socket.addEventListener("open", () => {
    flushPendingInputs();
  });

  socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    if (payload.type === "status") {
      const offline = payload.status === "closed";
      setStatus(payload.status, offline);
      return;
    }
    if (payload.type === "input" || payload.type === "output") {
      upsertMessage(payload);
      updateSessionPreview(payload);
    }
  });

  socket.addEventListener("close", () => {
    setStatus("offline", true);
  });

  state.socket = socket;
}

function updateSessionPreview(message) {
  if (message.role === "tool") return;
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  if (!session) return;
  session.preview = message.content;
  if (message.role === "user" && !session.first_user_message) {
    session.first_user_message = message.content;
  }
  session.last_updated = message.timestamp;
  session.last_role = message.role;
  if (message.role === "claude" && session.id !== state.activeSessionId) {
    session.unread = true;
  }
  if (session.id === state.activeSessionId) {
    session.unread = false;
  }
  renderSessionList();
}

function ensureSession() {
  if (state.activeSessionId) {
    return Promise.resolve(state.activeSessionId);
  }
  return createSession();
}

function applySessionDetail(detail) {
  const normalizedDetail = {
    ...detail,
    first_user_message: detail.first_user_message || firstUserMessageFrom(detail.messages),
  };
  const existingIndex = state.sessions.findIndex(
    (item) => item.id === normalizedDetail.id && !item.is_history
  );
  if (existingIndex >= 0) {
    state.sessions[existingIndex] = {
      ...state.sessions[existingIndex],
      ...normalizedDetail,
    };
    state.sessions[existingIndex].unread = false;
    state.sessions[existingIndex].is_history = false;
  } else {
    state.sessions.unshift({
      ...normalizedDetail,
      unread: false,
      last_role: null,
      is_history: false,
    });
  }
  state.sessions = state.sessions.filter(
    (item) => !(item.is_history && item.id === normalizedDetail.id)
  );
  state.activeSessionId = normalizedDetail.id;
  state.activeSessionMode = normalizedDetail.mode || "stream";
  state.activeSession = normalizedDetail;
  setStatus(normalizedDetail.status || "running", normalizedDetail.status === "closed");
  updateHeader(normalizedDetail);
  composerInput.placeholder = isTerminalMode() ? "Send to terminal" : "Reply";
  if (isTerminalMode()) {
    updateTerminalTime(normalizedDetail.last_updated || normalizedDetail.created_at);
  }
  renderMessages(normalizedDetail.messages || []);
  renderSessionList();
  showMessagePane();
  if (isTerminalMode()) {
    closeSocket();
    openTerminalSocket(normalizedDetail.id);
  } else {
    closeTerminalSocket();
    openSocket(normalizedDetail.id);
  }
}

async function resumeHistorySession(session) {
  const payload = buildResumePayload(session.id, state.settings);
  const response = await apiFetch("/api/sessions/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return;
  const detail = await response.json();
  applySessionDetail(detail);
}

async function selectSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (session?.is_history) {
    await resumeHistorySession(session);
    return;
  }
  const detail = await fetchSessionDetail(sessionId);
  if (!detail) return;
  applySessionDetail(detail);
}

function buildSessionPayload(settings) {
  return {
    mode: settings.terminalMode ? "terminal" : "stream",
    permission_mode: settings.permissionMode || null,
    workdir: settings.workdir || null,
    prompt: settings.prompt || null,
  };
}

function buildResumePayload(sessionId, settings) {
  return {
    session_id: sessionId,
    mode: settings.terminalMode ? "terminal" : "stream",
    permission_mode: settings.permissionMode || null,
    workdir: settings.workdir || null,
  };
}

async function createSession(settingsOverride) {
  const overrides = settingsOverride ? sanitizeSettings(settingsOverride) : {};
  const settings = { ...loadSettings(), ...overrides };
  const payload = buildSessionPayload(settings);
  const response = await apiFetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Failed to create session");
  }
  const session = await response.json();
  state.sessions.unshift({ ...session, unread: false, last_role: null, is_history: false });
  await selectSession(session.id);
  return session.id;
}

function flushPendingInputs() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  while (state.pendingInputs.length) {
    const content = state.pendingInputs.shift();
    state.socket.send(JSON.stringify({ type: "input", content }));
  }
}

async function sendInput(content) {
  const trimmed = content.trim();
  if (!trimmed) return;
  const sessionId = await ensureSession();
  if (isTerminalMode()) {
    if (terminalState.sessionId !== sessionId) {
      openTerminalSocket(sessionId);
    }
    sendTerminalInput(`${trimmed}\r`);
  } else {
    state.pendingInputs.push(trimmed);
    flushPendingInputs();
  }
  composerInput.value = "";
  composerInput.style.height = "";
  scheduleComposerMetricsUpdate();
}

async function deleteSessions(sessionIds, { renderAfter = true } = {}) {
  if (!sessionIds.length) return;
  let failed = false;
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const response = await apiFetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        failed = true;
      }
    })
  );
  removeLocalSessions(sessionIds, { render: renderAfter });
  if (failed) {
    await fetchSessions();
  }
}

async function deleteActiveSession() {
  if (!state.activeSessionId) return;
  await deleteSessions([state.activeSessionId]);
}

async function deleteSelectedSessions() {
  if (!state.selectionMode || state.selectedIds.size === 0) return;
  const sessionIds = Array.from(state.selectedIds);
  await deleteSessions(sessionIds, { renderAfter: false });
  exitSelectionMode();
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendInput(composerInput.value);
});

composerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendInput(composerInput.value);
  }
});

composerInput.addEventListener("input", () => {
  composerInput.style.height = "";
  composerInput.style.height = `${composerInput.scrollHeight}px`;
});

composerInput.addEventListener("focus", () => {
  scheduleViewportUpdate();
});

composerInput.addEventListener("blur", () => {
  scheduleViewportUpdate();
});

newSessionButton.addEventListener("click", () => createSession());
deleteSessionButton.addEventListener("click", () => deleteActiveSession());
refreshSessionsButton.addEventListener("click", () => fetchSessions());
backButton.addEventListener("click", () => hideMessagePane());

searchInput.addEventListener("input", (event) => {
  state.filter = event.target.value;
  renderSessionList();
});

if (filterButton) {
  filterButton.addEventListener("click", () => {
    state.filterUnread = !state.filterUnread;
    renderSessionList();
  });
}

selectButton.addEventListener("click", () => enterSelectionMode());
selectAllButton.addEventListener("click", () => toggleSelectAll());
cancelSelectButton.addEventListener("click", () => exitSelectionMode());
if (trashButton) {
  trashButton.addEventListener("click", () => deleteSelectedSessions());
}

const menuButtons = [moreButton, moreButtonSelect].filter(Boolean);
menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (moreMenu.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });
});
menuBackdrop.addEventListener("click", () => closeMenu());
menuAbout.addEventListener("click", () => closeMenu());
menuPriority.addEventListener("click", () => closeMenu());
menuCategories.addEventListener("click", () => {
  applyUiState({ ...state.ui, listView: false });
  closeMenu();
});
menuList.addEventListener("click", () => {
  applyUiState({ ...state.ui, listView: true });
  closeMenu();
});
menuContactPhotos.addEventListener("click", () => {
  applyUiState({ ...state.ui, showContactPhotos: !state.ui.showContactPhotos });
});
menuSelect.addEventListener("click", () => {
  closeMenu();
  enterSelectionMode();
});
menuSettings.addEventListener("click", () => {
  closeMenu();
  applySettingsToForm(loadSettings());
  openSettingsPanel();
});

settingsClose.addEventListener("click", () => closeSettingsPanel());
settingsCancel.addEventListener("click", () => closeSettingsPanel());
settingsBackdrop.addEventListener("click", () => closeSettingsPanel());
workdirBrowse.addEventListener("click", () => openFolderPicker());
folderPickerClose.addEventListener("click", () => closeFolderPicker());
folderPickerBackdrop.addEventListener("click", () => closeFolderPicker());
folderPickerUp.addEventListener("click", () => {
  if (folderPickerState.parent) {
    loadFolderPicker(folderPickerState.parent);
  }
});
folderPickerUse.addEventListener("click", () => {
  if (folderPickerState.path) {
    workdirInput.value = folderPickerState.path;
  }
  closeFolderPicker();
});
folderPickerNew.addEventListener("click", async () => {
  const name = window.prompt("New folder name");
  if (!name) return;
  try {
    const result = await createFolder(folderPickerState.path || "", name);
    await loadFolderPicker(result.path);
  } catch (error) {
    setFolderPickerStatus(error?.message || "Unable to create folder.");
  }
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applySettingsState(collectSettingsFromForm());
  closeSettingsPanel();
});

settingsStart.addEventListener("click", async () => {
  const settings = applySettingsState(collectSettingsFromForm());
  closeSettingsPanel();
  await createSession(settings);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (settingsPanel.classList.contains("open")) {
      closeSettingsPanel();
    }
    if (folderPicker.classList.contains("open")) {
      closeFolderPicker();
    }
    if (moreMenu.classList.contains("open")) {
      closeMenu();
    }
  }
});

document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches("input, textarea, select")) return;
  if (settingsPanel.contains(target) || folderPicker.contains(target)) {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }
});

window.addEventListener("resize", () => {
  if (isTerminalMode()) {
    scheduleTerminalFit();
  }
  scheduleViewportUpdate();
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", scheduleViewportUpdate);
  window.visualViewport.addEventListener("scroll", scheduleViewportUpdate);
}

scheduleViewportUpdate();

state.ui = loadUiSettings();
applyUiState(state.ui);
state.settings = loadSettings();
applyTheme(state.settings.theme);
setStatus("idle");
applySettingsToForm(state.settings);
if (normalizeWorkdir(state.settings.workdir)) {
  fetchSessions();
  fetchHistorySessions(state.settings.workdir);
} else {
  renderSessionList();
}
initCategoryChips();

themeMedia.addEventListener("change", () => {
  if (state.settings.theme === "system") {
    applyTheme("system");
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.update())
      .catch(() => undefined);
  });
}
