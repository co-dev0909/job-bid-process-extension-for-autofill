const appUrlInput = document.getElementById("appUrl");
const profileNameInput = document.getElementById("profileName");
const inputModeSelect = document.getElementById("inputMode");
const jobInputLabel = document.getElementById("jobInputLabel");
const jobInput = document.getElementById("jobInput");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

init();

inputModeSelect.addEventListener("change", updateInputModeUi);

startBtn.addEventListener("click", async () => {
  const appUrl = appUrlInput.value.trim();
  const profileName = profileNameInput.value.trim();
  const inputMode = inputModeSelect.value;
  const inputText = jobInput.value;

  const response = await chrome.runtime.sendMessage({
    type: "START_AUTOFILL",
    appUrl,
    profileName,
    inputMode,
    inputText,
  });

  if (!response?.success) {
    statusEl.textContent = response?.error || "Failed to start.";
    return;
  }

  await chrome.storage.local.set({
    autofillFormState: {
      appUrl,
      profileName,
      inputMode,
      jobInput: inputText,
    },
  });

  renderState();
});

stopBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_AUTOFILL" });
  renderState();
});

setInterval(renderState, 1000);

async function init() {
  const saved = await chrome.storage.local.get("autofillFormState");
  const formState = saved.autofillFormState || {};
  appUrlInput.value = formState.appUrl || "http://localhost:3000/user/jobs";
  profileNameInput.value = formState.profileName || "";
  inputModeSelect.value = formState.inputMode || "job-links";
  jobInput.value = formState.jobInput || formState.jobUrls || "";
  updateInputModeUi();
  await renderState();
}

async function renderState() {
  const response = await chrome.runtime.sendMessage({
    type: "GET_AUTOFILL_STATE",
  });

  if (!response?.success) {
    statusEl.textContent = "Unable to read extension state.";
    return;
  }

  const state = response.state;
  const total = state.queue?.length || 0;
  const current = Math.min(state.currentIndex || 0, total);
  const runningLabel = state.running ? "Running" : "Idle";

  statusEl.textContent =
    `${runningLabel}. ${current}/${total} processed.` +
    (state.profileName ? ` Profile: ${state.profileName}.` : "");

  resultsEl.innerHTML = "";
  (state.results || []).slice().reverse().forEach((result) => {
    const item = document.createElement("div");
    item.className = `result ${result.status}`;
    item.textContent = `[${result.status}] ${result.url} - ${result.message}`;
    resultsEl.appendChild(item);
  });
}

function updateInputModeUi() {
  const isJsonMode = inputModeSelect.value === "job-applications";

  jobInputLabel.textContent = isJsonMode ? "Job applications JSON" : "Job links";
  jobInput.placeholder = isJsonMode
    ? '[\n  {\n    "job_link": "https://example.com/job",\n    "job_title": "Frontend Engineer",\n    "company": "Example",\n    "job_description": "Job details..."\n  }\n]'
    : "One job link per line";
}
