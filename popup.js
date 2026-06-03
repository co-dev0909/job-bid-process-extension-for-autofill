const appUrlInput = document.getElementById("appUrl");
const profileNameInput = document.getElementById("profileName");
const jobUrlsInput = document.getElementById("jobUrls");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

init();

startBtn.addEventListener("click", async () => {
  const urls = jobUrlsInput.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  const appUrl = appUrlInput.value.trim();
  const profileName = profileNameInput.value.trim();

  const response = await chrome.runtime.sendMessage({
    type: "START_AUTOFILL",
    urls,
    appUrl,
    profileName,
  });

  if (!response?.success) {
    statusEl.textContent = response?.error || "Failed to start.";
    return;
  }

  await chrome.storage.local.set({
    autofillFormState: {
      appUrl,
      profileName,
      jobUrls: jobUrlsInput.value,
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
  jobUrlsInput.value = formState.jobUrls || "";
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
