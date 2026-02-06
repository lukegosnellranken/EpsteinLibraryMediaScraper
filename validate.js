const { chromium } = require("playwright");
const fs = require("fs");

// ------------------------------------------------------------
// LOAD PDF URLS FROM pdf_list.txt
// ------------------------------------------------------------
let pdfUrls = fs.readFileSync("pdf_list.txt", "utf8")
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.length > 0);

// ------------------------------------------------------------
// RANGE SELECTION (CLI ARGUMENT)
// Usage:
//   node validate.js 0        → all
//   node validate.js 10       → only 10th entry
//   node validate.js 10-20    → entries 10 through 20
// ------------------------------------------------------------
const arg = process.argv[2];

if (arg && arg !== "0") {
  if (arg.includes("-")) {
    const [startStr, endStr] = arg.split("-");
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);

    if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
      pdfUrls = pdfUrls.slice(start - 1, end);
      console.log(`Using range ${start}-${end} (${pdfUrls.length} entries)`);
    }
  } else {
    const count = parseInt(arg, 10);
    if (!isNaN(count) && count > 0) {
      pdfUrls = pdfUrls.slice(0, count);
      console.log(`Using first ${count} entries`);
    }
  }
}

console.log(`Loaded ${pdfUrls.length} PDF URLs from pdf_list.txt`);

// Full coverage
const extensions = [".mp4", ".avi", ".m4a", ".m4v", ".mov"];

// ------------------------------------------------------------
// LOAD EXISTING VALID MEDIA URLS (avoid duplicates)
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
  console.log("Waiting for bot‑gate clearance…");

  await context.waitForEvent("requestfinished", {
    timeout: 0,
    predicate: async () => {
      const cookies = await context.cookies();
      return cookies.some(c =>
        c.name.includes("cf") ||
        c.name.includes("bm") ||
        c.name.includes("ak")
      );
    }
  });

  console.log("Bot‑gate cleared.");
}

// ------------------------------------------------------------
// AGE-GATE
// ------------------------------------------------------------
async function waitForAgeGate(page) {
  console.log("Waiting for age‑gate clearance…");

  await page.waitForFunction(
    () => document.querySelector("video"),
    { timeout: 0 }
  );

  console.log("Age‑gate cleared.");
}

// ------------------------------------------------------------
// TEST MEDIA URL
// ------------------------------------------------------------
async function testUrl(page, url) {
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 1500 }).catch(() => null);

    try {
      await page.goto(url, { timeout: 800, waitUntil: "load" });
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
// MAIN
// ------------------------------------------------------------
(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 0
  });

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // ------------------------------------------------------------
  // Use a known-good media URL to clear both gates
  // ------------------------------------------------------------
  console.log("Open browser and solve both gates…");
  await page.goto("https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.mp4");

  await waitForBotGate(context);
  await waitForAgeGate(page);

  console.log("Both gates cleared. Running tests…");

  // ------------------------------------------------------------
  // 8-WORKER PARALLEL VALIDATION
  // ------------------------------------------------------------
  const WORKERS = 4;
  const queues = Array.from({ length: WORKERS }, () => []);

  pdfUrls.forEach((url, i) => queues[i % WORKERS].push(url));

  async function worker(queueIndex) {
    const workerPage = await context.newPage();
    const myQueue = queues[queueIndex];

    for (const pdfUrl of myQueue) {
      const base = pdfUrl.replace(/\.pdf$/i, "");

      for (const ext of extensions) {
        const candidate = base + ext;
        console.log(`[W${queueIndex}] Testing:`, candidate);

        const result = await testUrl(workerPage, candidate);

        if (result === "video" || result === "download") {

          // ------------------------------------------------------------
          // WRITE IMMEDIATELY WHEN FOUND
          // ------------------------------------------------------------
          if (!existing.has(candidate)) {
            fs.appendFileSync(outputFile, candidate + "\n");
            existing.add(candidate);
            console.log(`[W${queueIndex}] Added immediately: ${candidate}`);
          }

          break;
        }
      }
    }

    await workerPage.close();
  }

  await Promise.all(
    Array.from({ length: WORKERS }, (_, i) => worker(i))
  );

  console.log("\nValidation complete.");
  await browser.close();
})();
