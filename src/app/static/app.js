const sessionList = document.getElementById("sessionList");
const messageThread = document.getElementById("messageThread");
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
const stopSessionButton = document.getElementById("stopSession");
const refreshSessionsButton = document.getElementById("refreshSessions");
const statusPill = document.getElementById("statusPill");
const unreadCount = document.getElementById("unreadCount");
const searchInput = document.getElementById("searchInput");
const messagePane = document.getElementById("messagePane");
const backButton = document.getElementById("backButton");
const mailSubtitle = document.getElementById("mailSubtitle");
const selectButton = document.getElementById("selectButton");
const selectAllButton = document.getElementById("selectAllButton");
const cancelSelectButton = document.getElementById("cancelSelectButton");
const moreButton = document.getElementById("moreButton");
const menuBackdrop = document.getElementById("menuBackdrop");
const moreMenu = document.getElementById("moreMenu");
const menuCategories = document.getElementById("menuCategories");
const menuList = document.getElementById("menuList");
const menuContactPhotos = document.getElementById("menuContactPhotos");
const menuSelect = document.getElementById("menuSelect");
const menuSettings = document.getElementById("menuSettings");
const menuAbout = document.getElementById("menuAbout");
const menuPriority = document.getElementById("menuPriority");
const summarizeButton = document.getElementById("summarizeButton");
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

const SETTINGS_KEY = "claudemail.settings";
const UI_KEY = "claudemail.ui";

const defaultSettings = {
  terminalMode: true,
  permissionMode: "acceptEdits",
  workdir: "",
  prompt: "",
  theme: "system",
  userInitial: "",
  accessToken: "",
};

const CLAUDE_AVATAR = "/static/icons/claude-color.png";

const defaultUi = {
  showContactPhotos: true,
  listView: true,
};

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

function setStatus(text, offline = false) {
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
  const theme = rawTheme === "dark" || rawTheme === "light" ? rawTheme : "system";
  const rawInitial = typeof raw?.userInitial === "string" ? raw.userInitial.trim() : "";
  return {
    terminalMode: raw?.terminalMode !== false,
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
  if (theme === "light") return false;
  return themeMedia.matches;
}

function applyTheme(theme) {
  const dark = isDarkTheme(theme);
  document.body.classList.toggle("theme-dark", dark);
  document.body.classList.toggle("theme-light", !dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", dark ? "#0b0b10" : "#f2f2f7");
  }
}

function applySettingsState(next) {
  state.settings = saveSettings(next);
  applyTheme(state.settings.theme);
  if (state.activeMessages) {
    renderMessages(state.activeMessages);
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
    theme: {
      background: "#0b0b0f",
      foreground: "#f2f2f7",
      selection: "rgba(255, 255, 255, 0.2)",
      cursor: "#f2f2f7",
    },
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
  loadFolderPicker(initialPath || null).then((ok) => {
    if (!ok && initialPath) {
      loadFolderPicker(null);
    }
  });
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

function splitPreview(text) {
  const cleaned = normalizePreview(text);
  if (!cleaned) {
    return { subject: "Claude Code", snippet: "No activity yet." };
  }
  if (cleaned.length <= 52) {
    return { subject: cleaned, snippet: "" };
  }
  const cutoff = cleaned.lastIndexOf(" ", 52);
  const splitAt = cutoff > 24 ? cutoff : 52;
  return {
    subject: cleaned.slice(0, splitAt),
    snippet: cleaned.slice(splitAt).trim().slice(0, 80),
  };
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
    mailSubtitle.innerHTML = `All Mail &middot; ${unreadLabel}`;
  }
}

function clearThread() {
  state.messageMap.clear();
  messageThread.innerHTML = "";
  if (terminalCard) {
    messageThread.appendChild(terminalCard);
  }
  messageThread.appendChild(emptyState);
}

function updateEmptyState(hasMessages) {
  const showEmpty = !hasMessages && !isTerminalMode();
  emptyState.style.display = showEmpty ? "grid" : "none";
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
  body.textContent = message.content;

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
    messageThread.appendChild(element);
  } else {
    const body = element.querySelector(".thread-body");
    const time = element.querySelector(".thread-time");
    if (body) body.textContent = message.content;
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

function getFilteredSessions() {
  const filter = state.filter.toLowerCase();
  return state.sessions.filter((session) =>
    session.title.toLowerCase().includes(filter) ||
    (session.preview || "").toLowerCase().includes(filter)
  );
}

function updateSelectionLabel() {
  if (!state.selectionMode) return;
  const filtered = getFilteredSessions();
  const allSelected =
    filtered.length > 0 && filtered.every((session) => state.selectedIds.has(session.id));
  selectAllButton.textContent = allSelected ? "Deselect All" : "Select All";
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
    const titleText = session.title || "Claude Code";
    title.textContent = titleText;

    const time = document.createElement("div");
    time.className = "session-time";
    time.textContent = formatTime(session.last_updated);

    row.appendChild(title);
    row.appendChild(time);

    const { subject, snippet } = splitPreview(session.preview);

    const subjectEl = document.createElement("div");
    subjectEl.className = "session-subject";
    subjectEl.textContent = subject;

    const snippetEl = document.createElement("div");
    snippetEl.className = "session-snippet";
    snippetEl.textContent =
      snippet || (session.status === "closed" ? "Session closed." : "Tap to open.");

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
}

async function fetchSessions() {
  const response = await apiFetch("/api/sessions");
  if (!response.ok) return;
  const sessions = await response.json();
  const previous = new Map(state.sessions.map((session) => [session.id, session]));
  state.sessions = sessions.map((session) => {
    const cached = previous.get(session.id);
    return {
      ...session,
      mode: session.mode || cached?.mode || "stream",
      unread: cached?.unread ?? session.id !== state.activeSessionId,
      last_role: cached?.last_role || null,
    };
  });
  renderSessionList();
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

async function selectSession(sessionId) {
  const detail = await fetchSessionDetail(sessionId);
  if (!detail) return;
  const existingIndex = state.sessions.findIndex((item) => item.id === sessionId);
  if (existingIndex >= 0) {
    state.sessions[existingIndex] = { ...state.sessions[existingIndex], ...detail };
    state.sessions[existingIndex].unread = false;
  } else {
    state.sessions.unshift({ ...detail, unread: false, last_role: null });
  }
  state.activeSessionId = sessionId;
  state.activeSessionMode = detail.mode || "stream";
  state.activeSession = detail;
  setStatus(detail.status || "running", detail.status === "closed");
  updateHeader(detail);
  composerInput.placeholder = isTerminalMode() ? "Send to terminal" : "Reply";
  if (isTerminalMode()) {
    updateTerminalTime(detail.last_updated || detail.created_at);
  }
  renderMessages(detail.messages || []);
  renderSessionList();
  showMessagePane();
  if (isTerminalMode()) {
    closeSocket();
    openTerminalSocket(sessionId);
  } else {
    closeTerminalSocket();
    openSocket(sessionId);
  }
}

function buildSessionPayload(settings) {
  return {
    mode: settings.terminalMode ? "terminal" : "stream",
    permission_mode: settings.permissionMode || null,
    workdir: settings.workdir || null,
    prompt: settings.prompt || null,
  };
}

async function createSession(settingsOverride) {
  const settings = { ...loadSettings(), ...sanitizeSettings(settingsOverride || {}) };
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
  state.sessions.unshift({ ...session, unread: false, last_role: null });
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
}

async function stopSession() {
  if (!state.activeSessionId) return;
  await apiFetch(`/api/sessions/${state.activeSessionId}/stop`, { method: "POST" });
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

newSessionButton.addEventListener("click", () => createSession());
stopSessionButton.addEventListener("click", () => stopSession());
refreshSessionsButton.addEventListener("click", () => fetchSessions());
backButton.addEventListener("click", () => hideMessagePane());
if (summarizeButton) {
  summarizeButton.addEventListener("click", () => {
    if (!state.activeSessionId) return;
    sendInput("Summarize this thread so far.");
  });
}

searchInput.addEventListener("input", (event) => {
  state.filter = event.target.value;
  renderSessionList();
});

selectButton.addEventListener("click", () => enterSelectionMode());
selectAllButton.addEventListener("click", () => toggleSelectAll());
cancelSelectButton.addEventListener("click", () => exitSelectionMode());

moreButton.addEventListener("click", () => {
  if (moreMenu.classList.contains("open")) {
    closeMenu();
  } else {
    openMenu();
  }
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

window.addEventListener("resize", () => {
  if (isTerminalMode()) {
    scheduleTerminalFit();
  }
});

state.ui = loadUiSettings();
applyUiState(state.ui);
state.settings = loadSettings();
applyTheme(state.settings.theme);
setStatus("idle");
applySettingsToForm(state.settings);
fetchSessions();

themeMedia.addEventListener("change", () => {
  if (state.settings.theme === "system") {
    applyTheme("system");
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
