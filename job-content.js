chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCRAPE_JOB_DETAILS") {
    return false;
  }

  try {
    const data = scrapeJobDetails(message.jobUrl || window.location.href);
    sendResponse({ success: true, data });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message || String(error),
    });
  }

  return true;
});

function scrapeJobDetails(jobUrl) {
  const jobTitle = extractJobTitle();
  const companyName = extractCompanyName();
  const jobDescription = extractJobDescription();

  return {
    jobLink: jobUrl,
    jobTitle,
    companyName,
    jobDescription,
  };
}

function extractJobTitle() {
  const metaTitle =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector('meta[name="twitter:title"]')?.content;

  const candidate =
    metaTitle ||
    firstText([
      "h1",
      '[data-testid*="job-title"]',
      '[class*="job-title"]',
      '[class*="posting-headline"]',
      '[class*="title"]',
    ]) ||
    document.title;

  const cleaned = cleanText(candidate);

  if (cleaned.includes(" at ")) {
    return cleaned.split(" at ")[0].trim();
  }

  return cleaned.split("|")[0].split(" - ")[0].trim();
}

function extractCompanyName() {
  const urlPatternCompany = extractCompanyFromKnownJobBoardUrl();
  if (urlPatternCompany) {
    return urlPatternCompany;
  }

  const metaTitle =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector('meta[name="twitter:title"]')?.content ||
    document.title;

  const structuredCompany = extractCompanyFromStructuredData();
  if (structuredCompany) {
    return structuredCompany;
  }

  const greenhouseCompany =
    firstText([
      ".company-name",
      ".app-title + div",
      "#header .company-name",
      '[data-testid*="company"]',
    ]) || "";

  if (greenhouseCompany) {
    return cleanText(greenhouseCompany);
  }

  const greenhousePathCompany = extractGreenhouseCompanyFromPath();
  if (greenhousePathCompany) {
    return greenhousePathCompany;
  }

  const titleCompanyMatch = cleanText(metaTitle).match(/\s+at\s+([^|]+)/i);
  if (titleCompanyMatch?.[1]) {
    const candidate = cleanText(titleCompanyMatch[1]).split(" - ")[0].trim();
    if (!isGenericCompanyLabel(candidate)) {
      return candidate;
    }
  }

  const metaCompany =
    document.querySelector('meta[property="og:site_name"]')?.content ||
    document.querySelector('meta[name="application-name"]')?.content;

  const directMatch =
    firstText([
      '[data-testid*="company"]',
      '[class*="company"]',
      '[class*="employer"]',
      '[class*="hiring"]',
      '[aria-label*="company" i]',
      '[itemprop="hiringOrganization"]',
    ]) || metaCompany;

  if (directMatch && !isGenericCompanyLabel(directMatch)) {
    return cleanText(directMatch);
  }

  const hostname = window.location.hostname.replace(/^www\./, "");
  return hostname.split(".")[0].replace(/[-_]/g, " ").trim();
}

function extractJobDescription() {
  const candidate =
    firstText([
      '[data-testid*="job-description"]',
      '[class*="job-description"]',
      '[class*="description"]',
      '[class*="details"]',
      "article",
      "main",
    ], true) || document.body?.innerText || "";

  return cleanText(candidate).slice(0, 12000);
}

function firstText(selectors, allowLong = false) {
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      const text = cleanText(node?.textContent || node?.innerText || "");
      if (!text) continue;
      if (!allowLong && text.length > 180) continue;
      if (allowLong && text.length < 120) continue;
      return text;
    }
  }
  return "";
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function extractCompanyFromStructuredData() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    const raw = script.textContent || "";
    if (!raw.trim()) continue;

    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];

      for (const node of nodes) {
        const candidate =
          node?.hiringOrganization?.name ||
          node?.organization?.name ||
          node?.company?.name ||
          node?.employer?.name ||
          node?.name;

        if (
          typeof candidate === "string" &&
          candidate.trim() &&
          !isGenericCompanyLabel(candidate)
        ) {
          return cleanText(candidate);
        }
      }
    } catch (_error) {
      // ignore malformed JSON-LD blocks
    }
  }

  return "";
}

function extractGreenhouseCompanyFromPath() {
  const hostname = window.location.hostname.toLowerCase();
  if (!hostname.includes("greenhouse.io")) {
    return "";
  }

  const segments = window.location.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return "";
  }

  const companySlug = segments[0];
  if (!companySlug || ["job-boards", "boards", "jobs"].includes(companySlug.toLowerCase())) {
    return "";
  }

  return humanizeSlug(companySlug);
}

function extractCompanyFromKnownJobBoardUrl() {
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  if (hostname.includes("greenhouse.io")) {
    return extractGreenhouseCompanyFromUrl(pathname, searchParams);
  }

  if (hostname === "jobs.ashbyhq.com" || hostname.endsWith(".ashbyhq.com")) {
    return extractAshbyCompanyFromUrl(pathname);
  }

  if (hostname === "jobs.lever.co" || hostname.endsWith(".lever.co")) {
    return extractLeverCompanyFromUrl(pathname);
  }

  return "";
}

function extractGreenhouseCompanyFromUrl(pathname, searchParams) {
  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments[0] === "embed") {
    const embeddedCompany = searchParams.get("for");
    if (embeddedCompany) {
      return humanizeSlug(embeddedCompany);
    }
  }

  if (segments[0] === "job-boards" && segments[1]) {
    return humanizeSlug(segments[1]);
  }

  if (segments[0] && !["embed", "job-boards", "jobs"].includes(segments[0].toLowerCase())) {
    return humanizeSlug(segments[0]);
  }

  return "";
}

function extractAshbyCompanyFromUrl(pathname) {
  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return "";
  }

  return humanizeSlug(segments[0]);
}

function extractLeverCompanyFromUrl(pathname) {
  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return "";
  }

  return humanizeSlug(segments[0]);
}

function isGenericCompanyLabel(value) {
  const normalized = cleanText(value).toLowerCase();
  return [
    "job boards",
    "job board",
    "jobs",
    "careers",
    "greenhouse",
    "greenhouse job board",
  ].includes(normalized);
}

function humanizeSlug(value) {
  return String(value || "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d/.test(part)) {
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
