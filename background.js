const DEFAULT_APP_URL = "http://localhost:3000/user/jobs";
const DEFAULT_STATE = {
  running: false,
  queue: [],
  currentIndex: 0,
  results: [],
  appUrl: DEFAULT_APP_URL,
  profileName: "",
  updatedAt: null,
};

let processing = false;

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await getState();
  if (!existing || !existing.appUrl) {
    await setState(DEFAULT_STATE);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "START_AUTOFILL") {
    handleStart(message)
      .then(() => sendResponse({ success: true }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message || String(error) })
      );
    return true;
  }

  if (message?.type === "STOP_AUTOFILL") {
    handleStop()
      .then(() => sendResponse({ success: true }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message || String(error) })
      );
    return true;
  }

  if (message?.type === "GET_AUTOFILL_STATE") {
    getState().then((state) => sendResponse({ success: true, state }));
    return true;
  }

  return false;
});

async function handleStart(message) {
  const queue = (message.urls || [])
    .map((url) => String(url || "").trim())
    .filter(Boolean);

  if (!queue.length) {
    throw new Error("Please provide at least one job link.");
  }

  const appUrl = normalizeAppUrl(message.appUrl || DEFAULT_APP_URL);
  const profileName = String(message.profileName || "").trim();

  await setState({
    running: true,
    queue,
    currentIndex: 0,
    results: [],
    appUrl,
    profileName,
    updatedAt: new Date().toISOString(),
  });

  await processQueue();
}

async function handleStop() {
  const state = await getState();
  await setState({
    ...state,
    running: false,
    updatedAt: new Date().toISOString(),
  });
}

async function processQueue() {
  if (processing) return;
  processing = true;

  try {
    while (true) {
      const state = await getState();
      if (!state.running) break;
      if (state.currentIndex >= state.queue.length) {
        await setState({
          ...state,
          running: false,
          updatedAt: new Date().toISOString(),
        });
        break;
      }

      const jobUrl = state.queue[state.currentIndex];
      let resultRecord = {
        url: jobUrl,
        status: "success",
        message: "Saved successfully.",
      };

      try {
        const appTab = await ensureAppTab(state.appUrl);
        const jobTab = await createTab(jobUrl, false);

        try {
          await waitForTabComplete(jobTab.id);
          await sleep(1200);

          const scrapeResponse = await sendMessageToTab(jobTab.id, {
            type: "SCRAPE_JOB_DETAILS",
            jobUrl,
          });

          if (!scrapeResponse?.success) {
            throw new Error(scrapeResponse?.error || "Failed to scrape job page.");
          }

          await navigateTab(appTab.id, state.appUrl);
          await waitForTabComplete(appTab.id);
          await sleep(800);

          const fillResponse = await sendMessageToTab(appTab.id, {
            type: "FILL_ADD_JOB_FORM",
            profileName: state.profileName,
            jobData: scrapeResponse.data,
          });

          if (!fillResponse?.success) {
            throw new Error(fillResponse?.error || "Failed to fill Add Job form.");
          }

          await waitForTabUrlToLeavePrefix(appTab.id, state.appUrl, 7000);
        } finally {
          await closeTab(jobTab.id);
        }
      } catch (error) {
        resultRecord = {
          url: jobUrl,
          status: "error",
          message: error.message || String(error),
        };
      }

      const latest = await getState();
      await setState({
        ...latest,
        currentIndex: latest.currentIndex + 1,
        results: [...(latest.results || []), resultRecord],
        updatedAt: new Date().toISOString(),
      });
    }
  } finally {
    processing = false;
  }
}

function normalizeAppUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return DEFAULT_APP_URL;
  return trimmed.endsWith("/user/jobs")
    ? trimmed
    : `${trimmed.replace(/\/$/, "")}/user/jobs`;
}

async function getState() {
  const stored = await chrome.storage.local.get("autofillState");
  return stored.autofillState || { ...DEFAULT_STATE };
}

async function setState(state) {
  await chrome.storage.local.set({ autofillState: state });
}

async function ensureAppTab(appUrl) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.url && tab.url.startsWith(appUrl));
  if (existing) {
    return existing;
  }
  return createTab(appUrl, true);
}

async function createTab(url, active) {
  return chrome.tabs.create({ url, active });
}

async function closeTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (_error) {
    // tab may already be closed
  }
}

async function navigateTab(tabId, url) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url && tab.url.startsWith(url)) return tab;
  return chrome.tabs.update(tabId, { url, active: false });
}

async function waitForTabComplete(tabId, timeoutMs = 30000) {
  const startedAt = Date.now();
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return;

  await new Promise((resolve, reject) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    const timer = setInterval(async () => {
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timed out waiting for tab to finish loading."));
        return;
      }

      try {
        const current = await chrome.tabs.get(tabId);
        if (current.status === "complete") {
          clearInterval(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      } catch (error) {
        clearInterval(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(error);
      }
    }, 500);
  });
}

async function sendMessageToTab(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await injectRequiredScript(tabId, payload?.type);
    await sleep(300);
    return chrome.tabs.sendMessage(tabId, payload);
  }
}

async function waitForTabUrlToLeavePrefix(tabId, urlPrefix, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith(urlPrefix)) {
      return;
    }
    await sleep(250);
  }

  throw new Error(
    "Save did not finish as expected. The Add Job page did not redirect after submission."
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingReceiverError(error) {
  const message = error?.message || String(error);
  return message.includes("Receiving end does not exist");
}

async function injectRequiredScript(tabId, messageType) {
  const file =
    messageType === "FILL_ADD_JOB_FORM" ? "app-content.js" : "job-content.js";

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [file],
  });
}
