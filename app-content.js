chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FILL_ADD_JOB_FORM") {
    return false;
  }

  fillAddJobForm(message.jobData, message.profileName)
    .then((result) => sendResponse({ success: true, ...result }))
    .catch((error) =>
      sendResponse({
        success: false,
        error: error.message || String(error),
      })
    );

  return true;
});

async function fillAddJobForm(jobData, profileName) {
  if (!window.location.pathname.startsWith("/user/jobs")) { 
    throw new Error("Add Job page is not open.");
  }

  const jobLinkInput = await waitForElement("#jobLink");
  const jobTitleInput = await waitForElement("#jobTitle");
  const companyInput = await waitForElement("#companyName");
  const descriptionInput = await waitForElement("#jobDescription");
  const saveButton = await waitForElement('[data-autofill="save-job"]');

  setReactValue(jobLinkInput, jobData.jobLink || window.location.href);
  setReactValue(jobTitleInput, jobData.jobTitle || "");
  setReactValue(companyInput, jobData.companyName || "");
  setReactValue(descriptionInput, jobData.jobDescription || "");

  if (profileName) {
    await selectProfile(profileName);
  } else if (!hasSelectedProfile()) {
    throw new Error("No profile selected. Choose a profile in the Add Job page or provide one in the extension.");
  }

  await sleep(250);

  if (saveButton.disabled) {
    throw new Error("Save is disabled. This usually means the company is duplicated or required fields are still missing.");
  }

  clickElement(saveButton);

  return {
    submitted: true,
  };
}

async function selectProfile(profileName) {
  const trigger = await waitForElement('[data-autofill="profile-trigger"]');
  const currentLabel = trigger.textContent?.trim() || "";
  if (currentLabel.toLowerCase() === profileName.trim().toLowerCase()) {
    return;
  }

  await openProfileSelect(trigger);

  const option = await waitForProfileOption(profileName);

  if (!option) {
    throw new Error(`Profile "${profileName}" was not found on the Add Job page.`);
  }

  clickElement(option);
  await sleep(400);

  const updatedLabel = (trigger.textContent || "").trim().toLowerCase();
  if (updatedLabel !== profileName.trim().toLowerCase()) {
    throw new Error(`Profile "${profileName}" could not be selected.`);
  }
}

function hasSelectedProfile() {
  const trigger = document.querySelector('[data-autofill="profile-trigger"]');
  if (!trigger) return false;
  const text = trigger.textContent?.trim() || "";
  return text && text !== "Select a profile";
}

function setReactValue(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value"
  )?.set;

  nativeInputValueSetter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function clickElement(element) {
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "center" });
  }
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  element.click();
}

async function openProfileSelect(trigger) {
  clickElement(trigger);
  await sleep(250);

  let option = findProfileOptionInDom();
  if (option) return;

  trigger.focus();
  trigger.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })
  );
  await sleep(250);

  option = findProfileOptionInDom();
  if (option) return;

  trigger.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "ArrowDown",
      code: "ArrowDown",
      bubbles: true,
    })
  );
  await sleep(250);
}

async function waitForProfileOption(profileName, timeoutMs = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const option = findProfileOptionInDom(profileName);
    if (option) {
      return option;
    }
    await sleep(150);
  }
  return null;
}

function findProfileOptionInDom(profileName = "") {
  const normalizedTarget = normalizeText(profileName);
  const candidates = [
    ...document.querySelectorAll('[data-profile-name]'),
    ...document.querySelectorAll('[role="option"]'),
    ...document.querySelectorAll('[data-radix-collection-item]'),
  ];

  if (!normalizedTarget) {
    return candidates[0] || null;
  }

  return (
    candidates.find((node) => {
      const nodeText = normalizeText(
        node.getAttribute("data-profile-name") || node.textContent || ""
      );
      return nodeText === normalizedTarget;
    }) || null
  );
}

async function waitForElement(selector, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const element = document.querySelector(selector);
    if (element) return element;
    await sleep(150);
  }
  throw new Error(`Element not found: ${selector}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}
