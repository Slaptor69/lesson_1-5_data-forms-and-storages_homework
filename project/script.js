const form = document.querySelector(".card-form");
const panels = document.querySelectorAll("[data-state-panel]");
const status = document.querySelector(".workspace__status");
const message = document.querySelector(".workspace__message");
const list = document.querySelector(".match-list");
const cardTitle = document.querySelector(".saved-card__title");
const sourceLink = document.querySelector(".saved-card__source");
const noSource = document.querySelector(".saved-card__no-source");
const draftPanel = document.querySelector(".draft");
const draftText = document.querySelector(".draft__text");
const restoreDraftButton = document.querySelector('[data-action="restore-draft"]');
const exportButton = document.querySelector('[data-action="export"]');
const importButton = document.querySelector('[data-action="import"]');
const importInput = document.querySelector("#import-file");
const saveAsNewButton = document.querySelector('[data-action="save-as-new"]');

const competitions = {
  "world-cup": "Чемпионат мира",
  "world-cup-qualifiers": "Отбор на чемпионат мира",
  "champions-league": "Лига чемпионов",
  "la-liga": "Ла Лига",
  other: "Другой турнир",
};
const fieldNames = ["homeTeam", "awayTeam", "date", "competition", "score", "goals", "note", "source"];
const dateFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" });
const storageKey = "ronaldo-matches";
const draftKey = "ronaldo-match-draft";

let matches = [];
let selectedId = null;
let editingId = null;
let currentState = "empty";
let draft = null;
let editingBase = null;
let importing = false;

function showMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}

function showState(state) {
  currentState = state;
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.statePanel !== state;
  });
  status.textContent = state === "editor" ? "Редактирование матча" : `Матчей в коллекции: ${matches.length}`;
  renderDraft();
  updateTools();
  updateEditorConflict();
}

function updateTools() {
  exportButton.disabled = !matches.length;
  importButton.disabled = importing || currentState === "editor" || Boolean(draft);
}

function updateEditorConflict() {
  const original = matches.find((match) => match.id === editingId);
  const conflict = currentState === "editor" && editingId !== null
    && (!original || JSON.stringify(original) !== editingBase);
  saveAsNewButton.hidden = !conflict;
  return conflict;
}

function renderDraft() {
  draftPanel.hidden = !draft;
  restoreDraftButton.hidden = currentState === "editor";
  draftText.textContent = currentState === "editor"
    ? "Черновик сохранён. Карточка пока осталась без изменений."
    : "Вы начали заполнять форму. Можно продолжить с того же места или удалить черновик.";
  updateTools();
}

function readStoredDraft() {
  try {
    const json = sessionStorage.getItem(draftKey);
    if (json === null) return null;
    const stored = JSON.parse(json);
    if (!stored || typeof stored !== "object" || !stored.values
      || !fieldNames.every((name) => typeof stored.values[name] === "string" && stored.values[name].length <= 500)
      || !(stored.editingId === null || (typeof stored.editingId === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(stored.editingId)))
      || !(stored.baseMatch === null || (typeof stored.baseMatch === "string" && stored.baseMatch.length <= 5000))) {
      throw new Error("Неподходящий черновик");
    }
    return stored;
  } catch {
    showMessage("Не получилось открыть черновик. Попробуйте заполнить форму заново.");
    return null;
  }
}

function saveDraft() {
  if (currentState !== "editor") return;
  const data = new FormData(form);
  draft = {
    editingId,
    baseMatch: editingBase,
    values: Object.fromEntries(fieldNames.map((name) => [name, data.get(name)])),
  };
  renderDraft();
  try {
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  } catch {
    draftText.textContent = "Браузер не сохранил черновик. Сначала сохраните матч, потом перезагружайте страницу.";
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(draftKey);
    draft = null;
    editingBase = null;
    renderDraft();
    return true;
  } catch {
    showMessage("Не получилось удалить черновик. Попробуйте ещё раз.");
    return false;
  }
}

function matchTitle(match) {
  return `${match.homeTeam} - ${match.awayTeam}`;
}

function formatDate(date) {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) === 0) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidSource(value) {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidMatch(match) {
  if (!match || typeof match !== "object" || Array.isArray(match)) return false;
  return typeof match.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(match.id)
    && [match.homeTeam, match.awayTeam].every((team) =>
      typeof team === "string" && team.trim().length >= 2 && team.length <= 80)
    && isValidDate(match.date)
    && typeof match.competition === "string" && Object.hasOwn(competitions, match.competition)
    && typeof match.score === "string" && /^\d{1,2}:\d{1,2}$/.test(match.score)
    && Number.isInteger(match.goals) && match.goals >= 0 && match.goals <= 99
    && typeof match.note === "string" && match.note.length <= 500
    && isValidSource(match.source);
}

function isValidCollection(value) {
  return Array.isArray(value) && value.length <= 500 && value.every(isValidMatch)
    && new Set(value.map((match) => match.id)).size === value.length;
}

function readStoredMatches() {
  let json;
  try {
    json = localStorage.getItem(storageKey);
  } catch {
    showMessage("Браузер не даёт открыть сохранённые матчи. Проверьте, разрешено ли сайту хранить данные.");
    return null;
  }
  if (json === null) return [];
  try {
    const stored = JSON.parse(json);
    if (!isValidCollection(stored)) throw new Error("Неподходящие данные");
    return stored;
  } catch {
    showMessage("Не получилось прочитать сохранённые матчи. Можно добавить их заново или загрузить подборку.");
    return [];
  }
}

function refreshMatches() {
  const stored = readStoredMatches();
  if (stored === null) return false;
  matches = stored;
  return true;
}

function saveMatches(nextMatches) {
  try {
    if (nextMatches.length) localStorage.setItem(storageKey, JSON.stringify(nextMatches));
    else localStorage.removeItem(storageKey);
    matches = nextMatches;
    return true;
  } catch {
    showMessage("Браузер не сохранил изменения. Проверьте, разрешено ли сайту хранить данные, и попробуйте ещё раз.");
    return false;
  }
}

function renderCollection() {
  if (!matches.some((match) => match.id === selectedId)) {
    selectedId = matches[0]?.id ?? null;
  }

  list.replaceChildren();
  matches.forEach((match) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "match-list__button";
    button.dataset.id = match.id;
    button.classList.toggle("match-list__button--selected", match.id === selectedId);
    button.setAttribute("aria-pressed", String(match.id === selectedId));

    const title = document.createElement("span");
    title.className = "match-list__title";
    title.textContent = matchTitle(match);
    const meta = document.createElement("span");
    meta.className = "match-list__meta";
    meta.textContent = `${formatDate(match.date)} · ${match.score} · Голы Роналду: ${match.goals}`;
    button.append(title, meta);
    item.append(button);
    list.append(item);
  });

  const match = matches.find((item) => item.id === selectedId);
  if (match) {
    cardTitle.textContent = matchTitle(match);
    const values = {
      date: formatDate(match.date),
      competition: competitions[match.competition],
      score: match.score,
      goals: match.goals,
      note: match.note || "Не указано",
    };
    Object.entries(values).forEach(([name, value]) => {
      document.querySelector(`[data-value="${name}"]`).textContent = value;
    });
    sourceLink.hidden = !match.source;
    noSource.hidden = Boolean(match.source);
    sourceLink.textContent = match.source;
    if (match.source) sourceLink.href = match.source;
    else sourceLink.removeAttribute("href");
  }
  showState(matches.length ? "viewer" : "empty");
}

function readForm() {
  const data = new FormData(form);
  return {
    homeTeam: data.get("homeTeam").trim(),
    awayTeam: data.get("awayTeam").trim(),
    date: data.get("date"),
    competition: data.get("competition"),
    score: data.get("score").trim(),
    goals: Number(data.get("goals")),
    note: data.get("note").trim(),
    source: data.get("source").trim(),
  };
}

function fillForm(values) {
  fieldNames.forEach((name) => {
    form.elements.namedItem(name).value = values[name] ?? "";
  });
}

function openEditor(match = null) {
  if (draft) {
    showMessage("У вас уже есть черновик. Продолжите его или удалите, чтобы открыть другую форму.");
    return;
  }
  showMessage("");
  form.reset();
  editingId = match?.id ?? null;
  editingBase = match ? JSON.stringify(match) : null;
  if (match) fillForm(match);
  showState("editor");
  form.elements.namedItem("homeTeam").focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!refreshMatches()) return;
  if (updateEditorConflict()) {
    showMessage("Этот матч уже изменили или удалили в другой вкладке. Сохраните свой вариант отдельным матчем. Или удалите черновик и откройте карточку заново.");
    return;
  }
  const match = {
    id: editingId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    ...readForm(),
  };
  if (!isValidMatch(match)) {
    showMessage("Проверьте данные: названия не должны состоять из пробелов, а ссылка должна начинаться с http:// или https://.");
    return;
  }
  if (matches.length >= 500 && !editingId) {
    showMessage("В коллекции может быть не больше 500 матчей.");
    return;
  }
  const nextMatches = editingId
    ? matches.map((item) => item.id === editingId ? match : item)
    : [...matches, match];
  if (!saveMatches(nextMatches)) return;
  const draftCleared = clearDraft();
  selectedId = match.id;
  editingId = null;
  form.reset();
  renderCollection();
  showMessage(draftCleared ? "Матч сохранён." : "Матч сохранён, но черновик не получилось удалить.");
});

form.addEventListener("input", saveDraft);
form.addEventListener("change", saveDraft);

restoreDraftButton.addEventListener("click", () => {
  if (!draft) return;
  form.reset();
  fillForm(draft.values);
  editingId = draft.editingId;
  editingBase = draft.baseMatch;
  const originalDeleted = editingId && !matches.some((match) => match.id === editingId);
  if (originalDeleted) {
    editingId = null;
    editingBase = null;
  }
  showState("editor");
  saveDraft();
  showMessage(originalDeleted ? "Матч удалили, но черновик остался. Его можно сохранить как новый матч."
    : updateEditorConflict() ? "Матч уже изменили. Ваш черновик можно сохранить отдельно." : "");
  form.elements.namedItem("homeTeam").focus();
});

document.querySelector('[data-action="discard-draft"]').addEventListener("click", () => {
  if (!clearDraft()) return;
  editingId = null;
  form.reset();
  renderCollection();
  showMessage("Черновик удалён.");
});

document.querySelectorAll('[data-action="create"]').forEach((button) => {
  button.addEventListener("click", () => openEditor());
});

document.querySelector('[data-action="cancel"]').addEventListener("click", () => {
  editingId = null;
  editingBase = null;
  form.reset();
  renderCollection();
  showMessage(draft ? "Форма закрыта, черновик остался. К нему можно вернуться позже." : "");
});

document.querySelector('[data-action="edit"]').addEventListener("click", () => {
  openEditor(matches.find((match) => match.id === selectedId));
});

document.querySelector('[data-action="delete"]').addEventListener("click", () => {
  if (!refreshMatches()) return;
  if (!matches.some((match) => match.id === selectedId)) {
    renderCollection();
    showMessage("Этот матч уже удалён в другой вкладке.");
    return;
  }
  if (!saveMatches(matches.filter((match) => match.id !== selectedId))) return;
  if (draft?.editingId === selectedId) clearDraft();
  selectedId = null;
  form.reset();
  renderCollection();
  showMessage("Матч удалён.");
});

list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  selectedId = button.dataset.id;
  showMessage("");
  renderCollection();
});

document.querySelector('[data-action="samples"]').addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch("matches.json");
    if (!response.ok) throw new Error("Не удалось загрузить файл");
    const samples = await response.json();
    if (!isValidCollection(samples)) throw new Error("Неподходящие данные");
    if (!refreshMatches()) return;
    const additions = samples.filter((sample) => !matches.some((match) => match.id === sample.id));
    if (matches.length + additions.length > 500) throw new Error("Слишком много матчей");
    if (!saveMatches([...matches, ...additions])) return;
    if (currentState === "editor") updateTools();
    else renderCollection();
    showMessage(`Добавлено матчей: ${additions.length}.`);
  } catch {
    showMessage("Не удалось загрузить подборку. Попробуйте ещё раз или добавьте матч вручную.");
  } finally {
    button.disabled = false;
  }
});

saveAsNewButton.addEventListener("click", () => {
  editingId = null;
  editingBase = null;
  saveDraft();
  updateEditorConflict();
  showMessage("Теперь нажмите «Сохранить матч». Ваш вариант добавится отдельной карточкой.");
});

exportButton.addEventListener("click", () => {
  if (!refreshMatches()) return;
  if (!matches.length) {
    renderCollection();
    showMessage("Пока нечего выгружать. Сначала добавьте матч.");
    return;
  }
  const blob = new Blob([JSON.stringify(matches, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ronaldo-matches.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("Файл с матчами готов. Черновик в него не входит.");
});

importButton.addEventListener("click", () => {
  importInput.click();
});

importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  importing = true;
  updateTools();
  try {
    if (file.size === 0 || file.size > 1024 * 1024) throw new Error("Размер файла");
    const incoming = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    if (!isValidCollection(incoming)) throw new Error("Структура файла");
    if (currentState === "editor" || draft) {
      showMessage("Сначала сохраните матч или удалите черновик. После этого можно загрузить файл.");
      return;
    }
    if (!refreshMatches()) return;
    const merged = new Map(matches.map((match) => [match.id, match]));
    incoming.forEach((match) => {
      const cleanMatch = { id: match.id };
      fieldNames.forEach((name) => { cleanMatch[name] = match[name]; });
      merged.set(match.id, cleanMatch);
    });
    if (merged.size > 500) throw new Error("Слишком много матчей");
    if (!saveMatches([...merged.values()])) return;
    renderCollection();
    showMessage(`Импортировано матчей: ${incoming.length}. Всего в коллекции: ${matches.length}.`);
  } catch {
    showMessage("Файл не подошёл. Нужен JSON в том же формате, что и при экспорте: до 500 матчей и до 1 МБ. Ваши матчи остались без изменений.");
  } finally {
    importing = false;
    updateTools();
  }
});

window.addEventListener("storage", (event) => {
  if (event.storageArea !== localStorage || (event.key !== storageKey && event.key !== null)) return;
  if (!refreshMatches()) return;
  if (currentState === "editor") {
    updateTools();
    const conflict = updateEditorConflict();
    showMessage(conflict
      ? "Этот матч уже изменили или удалили в другой вкладке. Ваш текст остался в форме, его можно сохранить отдельным матчем."
      : "Список матчей обновился в другой вкладке. Ваш ввод остался в форме.");
  } else {
    renderCollection();
    showMessage("Список матчей обновился в другой вкладке.");
  }
});

matches = readStoredMatches() ?? [];
draft = readStoredDraft();
renderCollection();

