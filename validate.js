const { chromium } = require("playwright");
const fs = require("fs");

// ------------------------------------------------------------
// LOAD PDF URLS FROM pdf_list.txt
// ------------------------------------------------------------
const pdfUrls = fs.readFileSync("pdf_list.txt", "utf8")
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.length > 0);

console.log(`Loaded ${pdfUrls.length} PDF URLs from pdf_list.txt`);

// Fast coverage -- covers most files
// const extensions = [".mp4", ".avi"];

// Full coverage -- covers almost, if not all files
const extensions = [".mp4", ".avi", ".m4a", ".m4v"];

// Paranoid coverage -- covers files that might exist (but probably don't)
// const extensions = [".mp4", ".avi", ".m4a", ".m4v", ".wav", ".mov", ".wmv"];

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

  await context.waitForEvent("requestfinished", async () => {
    const cookies = await context.cookies();
    return cookies.some(c =>
      c.name.includes("cf") ||
      c.name.includes("bm") ||
      c.name.includes("ak")
    );
  });

  console.log("Bot‑gate cleared.");
}

// ------------------------------------------------------------
// AGE-GATE
// ------------------------------------------------------------
async function waitForAgeGate(page) {
  console.log("Waiting for age‑gate clearance…");

  await page.waitForFunction(() => {
    return document.querySelector("video");
  }, { timeout: 0 });

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
    } catch {
      // .avi triggers download and prevents normal navigation
    }

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

  const validUrls = [];

  for (const pdfUrl of pdfUrls) {
    const base = pdfUrl.replace(/\.pdf$/i, "");

    for (const ext of extensions) {
      const candidate = base + ext;
      console.log("Testing:", candidate);

      const result = await testUrl(page, candidate);

      if (result === "video" || result === "download") {
        validUrls.push({ url: candidate, type: result });
        break;
      }
    }
  }

  console.log("\n=== VALID MEDIA URLS FOUND ===");
  validUrls.forEach(entry => {
    console.log(`${entry.url}   (${entry.type})`);
  });

  // ------------------------------------------------------------
  // WRITE ONLY NEW URLS TO valid_media.txt
  // ------------------------------------------------------------
  const newOnes = validUrls
    .map(v => v.url)
    .filter(url => !existing.has(url));

  if (newOnes.length > 0) {
    fs.appendFileSync(outputFile, newOnes.join("\n") + "\n");
    console.log(`\nAdded ${newOnes.length} new URLs to ${outputFile}`);
  } else {
    console.log("\nNo new URLs to add.");
  }

  await browser.close();
})();
