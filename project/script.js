const form = document.querySelector(".card-form");
const panels = document.querySelectorAll("[data-state-panel]");
const status = document.querySelector(".workspace__status");
const message = document.querySelector(".workspace__message");
const list = document.querySelector(".match-list");
const cardTitle = document.querySelector(".saved-card__title");
const sourceLink = document.querySelector(".saved-card__source");
const noSource = document.querySelector(".saved-card__no-source");

const competitions = {
  "world-cup": "Чемпионат мира",
  "world-cup-qualifiers": "Отбор на чемпионат мира",
  "champions-league": "Лига чемпионов",
  "la-liga": "Ла Лига",
  other: "Другой турнир",
};
const fieldNames = ["homeTeam", "awayTeam", "date", "competition", "score", "goals", "note", "source"];
const dateFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" });

let matches = [];
let selectedId = null;
let editingId = null;
let currentState = "empty";

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
}

function matchTitle(match) {
  return `${match.homeTeam} — ${match.awayTeam}`;
}

function formatDate(date) {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
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
    && Object.hasOwn(competitions, match.competition)
    && typeof match.score === "string" && /^\d{1,2}:\d{1,2}$/.test(match.score)
    && Number.isInteger(match.goals) && match.goals >= 0 && match.goals <= 99
    && typeof match.note === "string" && match.note.length <= 500
    && isValidSource(match.source);
}

function isValidCollection(value) {
  return Array.isArray(value) && value.length <= 500 && value.every(isValidMatch)
    && new Set(value.map((match) => match.id)).size === value.length;
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
  showMessage("");
  form.reset();
  editingId = match?.id ?? null;
  if (match) fillForm(match);
  showState("editor");
  form.elements.namedItem("homeTeam").focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
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
  matches = editingId
    ? matches.map((item) => item.id === editingId ? match : item)
    : [...matches, match];
  selectedId = match.id;
  editingId = null;
  form.reset();
  renderCollection();
  showMessage("Матч сохранён.");
});

document.querySelectorAll('[data-action="create"]').forEach((button) => {
  button.addEventListener("click", () => openEditor());
});

document.querySelector('[data-action="cancel"]').addEventListener("click", () => {
  editingId = null;
  form.reset();
  showMessage("");
  renderCollection();
});

document.querySelector('[data-action="edit"]').addEventListener("click", () => {
  openEditor(matches.find((match) => match.id === selectedId));
});

document.querySelector('[data-action="delete"]').addEventListener("click", () => {
  matches = matches.filter((match) => match.id !== selectedId);
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
    const additions = samples.filter((sample) => !matches.some((match) => match.id === sample.id));
    matches = [...matches, ...additions];
    renderCollection();
    showMessage(`Добавлено матчей: ${additions.length}.`);
  } catch {
    showMessage("Не удалось загрузить подборку. Попробуйте ещё раз или добавьте матч вручную.");
  } finally {
    button.disabled = false;
  }
});

renderCollection();

