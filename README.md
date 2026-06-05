# Job Autofill Extension

This Chrome extension lets you paste either job links or exported job application JSON, then automatically:

1. open each job page and extract data, or use the provided JSON data directly
2. open your Resume Builder `Add Job` page
3. fill the form
4. click `Save`
5. repeat for the next item

## What it works with

- Local frontend, for example: `http://localhost:3000/user/jobs`
- Deployed frontend, for example: `https://your-app.vercel.app/user/jobs`

## Files

- `manifest.json`: Chrome extension manifest
- `background.js`: queue runner and tab orchestration
- `job-content.js`: extracts job data from job sites
- `app-content.js`: fills and submits the Add Job form
- `popup.html` / `popup.js`: extension UI

## Install locally

1. Open Chrome and go to `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder:

```text
job-autofill-extension
```

## How to use

1. Log into your Resume Builder app in the browser.
2. Make sure the `Add Job` page is available.
3. Open the extension popup.
4. Set `Add Job page URL`
   - local: `http://localhost:3000/user/jobs`
   - deployed: `https://your-frontend.vercel.app/user/jobs`
5. Optional: enter the exact profile name you want selected.
6. Choose `Input type`.
7. For `Job links`, paste one job link per line.
8. For `Job applications JSON`, paste the exported JSON from the Applications page. Each item should include:

```json
{
  "job_link": "https://example.com/job",
  "job_title": "Frontend Engineer",
  "company": "Example",
  "job_description": "Job details..."
}
```

9. Click `Start`.

## Notes

- The extension uses general DOM heuristics to scrape job pages, so some sites will work better than others.
- If a site has unusual markup, the job title/company/description may need better selectors later.
- The Add Job page currently redirects to `Applications` after save. The extension handles that by reopening `Add Job` before processing the next link.
- If the `Company` field is detected as a duplicate for the selected profile, the extension will stop that item and record an error for it.

## Recommended workflow

1. Keep one browser profile dedicated to this app.
2. Stay logged into the app.
3. Test with 2 or 3 items first.
4. Then run larger batches.
