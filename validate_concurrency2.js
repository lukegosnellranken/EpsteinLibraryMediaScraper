const { chromium } = require("playwright");
const fs = require("fs");

// ------------------------------------------------------------
// LOAD PDF URLS
// ------------------------------------------------------------
const pdfUrls = fs.readFileSync("pdf_list.txt", "utf8")
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.length > 0);

console.log(`Loaded ${pdfUrls.length} PDF URLs from pdf_list.txt`);

const extensions = [".mp4", ".avi", ".m4a", ".m4v"];

// ------------------------------------------------------------
// LOAD EXISTING VALID MEDIA URLS
// ------------------------------------------------------------
const outputFile = "valid_media.txt";

let existing = new Set();
if (fs.existsSync(outputFile)) {
  existing = new Set(
    fs.readFileSync(outputFile, "utf8")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
  );
}

// ------------------------------------------------------------
// BOT-GATE
// ------------------------------------------------------------
async function waitForBotGate(context) {
  await context.waitForEvent("requestfinished", async () => {
    const cookies = await context.cookies();
    return cookies.some(c =>
      c.name.includes("cf") ||
      c.name.includes("bm") ||
      c.name.includes("ak")
    );
  });
}

// ------------------------------------------------------------
// AGE-GATE
// ------------------------------------------------------------
async function waitForAgeGate(page) {
  await page.waitForFunction(() => document.querySelector("video"), { timeout: 0 });
}

// ------------------------------------------------------------
// TEST MEDIA URL
// ------------------------------------------------------------
async function testUrl(page, url) {
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 1500 }).catch(() => null);

    try {
      await page.goto(url, { timeout: 1000, waitUntil: "load" });
    } catch {}

    const download = await downloadPromise;
    if (download) return "download";

    const hasVideo = await page.$("video");
    if (hasVideo) return "video";

    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// WORKER (1 browser context per worker)
// ------------------------------------------------------------
async function worker(workerId, tasks, results) {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Clear gates independently
  await page.goto("https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.mp4");
  await waitForBotGate(context);
  await waitForAgeGate(page);

  while (true) {
    const pdfUrl = tasks.shift();
    if (!pdfUrl) break;

    const base = pdfUrl.replace(/\.pdf$/i, "");

    for (const ext of extensions) {
      const candidate = base + ext;
      console.log(`Worker ${workerId} testing: ${candidate}`);

      const result = await testUrl(page, candidate);

      if (result === "video" || result === "download") {
        results.push({ url: candidate, type: result });
        break;
      }
    }
  }

  await browser.close();
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async () => {
  const WORKERS = 5;

  const tasks = [...pdfUrls];
  const results = [];

  const workers = [];
  for (let i = 0; i < WORKERS; i++) {
    workers.push(worker(i + 1, tasks, results));
  }

  await Promise.all(workers);

  console.log("\n=== VALID MEDIA URLS FOUND ===");
  results.forEach(entry => console.log(`${entry.url} (${entry.type})`));

  const newOnes = results
    .map(v => v.url)
    .filter(url => !existing.has(url));

  if (newOnes.length > 0) {
    fs.appendFileSync(outputFile, newOnes.join("\n") + "\n");
    console.log(`\nAdded ${newOnes.length} new URLs to ${outputFile}`);
  } else {
    console.log("\nNo new URLs to add.");
  }
})();
