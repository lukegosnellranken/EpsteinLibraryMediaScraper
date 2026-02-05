const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

// ------------------------------------------------------------
// LOAD MEDIA URLS
// ------------------------------------------------------------
const urls = fs.readFileSync("valid_media.txt", "utf8")
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.length > 0);

console.log(`Loaded ${urls.length} media URLs from valid_media.txt`);

// ------------------------------------------------------------
// SIMPLE BUILT-IN PROGRESS BAR
// ------------------------------------------------------------
function renderProgress(current, total) {
  const width = 30;
  const ratio = current / total;
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  process.stdout.write(`\rProgress [${bar}] ${current}/${total}`);
  if (current === total) process.stdout.write("\n");
}

// ------------------------------------------------------------
// PREP ZIP ARCHIVE
// ------------------------------------------------------------
const zipOutput = fs.createWriteStream("media_archive.zip");
const archive = archiver("zip", { zlib: { level: 9 } });

archive.on("error", err => { throw err; });
archive.pipe(zipOutput);

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 150
  });

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // ------------------------------------------------------------
  // CLEAR BOT-GATE + AGE-GATE
  // ------------------------------------------------------------
  console.log("Clearing gates…");
  await page.goto("https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.mp4");

  await context.waitForEvent("requestfinished", async () => {
    const cookies = await context.cookies();
    return cookies.some(c =>
      c.name.includes("cf") ||
      c.name.includes("bm") ||
      c.name.includes("ak")
    );
  });

  await page.waitForFunction(() => document.querySelector("video"), { timeout: 0 });

  console.log("Gates cleared. Starting downloads…");

  // ------------------------------------------------------------
  // SEQUENTIAL DOWNLOAD LOOP
  // ------------------------------------------------------------
  let completed = 0;

  for (const url of urls) {
    const filename = path.basename(url).split("?")[0];

    console.log("\nDownloading:", url);

    // ------------------------------------------------------------
    // AVI HANDLING — FETCH INSIDE BROWSER CONTEXT (AUTHENTICATED)
    // ------------------------------------------------------------
    if (filename.toLowerCase().endsWith(".avi")) {
      try {
        console.log("Fetching AVI via browser context:", url);

        const aviBytes = await page.evaluate(async (aviUrl) => {
          const res = await fetch(aviUrl, { credentials: "include" });
          const arrayBuffer = await res.arrayBuffer();
          return Array.from(new Uint8Array(arrayBuffer));
        }, url);

        archive.append(Buffer.from(aviBytes), { name: filename });
        console.log("Added AVI to ZIP:", filename);

      } catch (err) {
        console.log("AVI fetch error:", err.message || err);
      }

      completed++;
      renderProgress(completed, urls.length);
      continue;
    }

    // ------------------------------------------------------------
    // MP4 / M4V / M4A HANDLING — REQUEST CAPTURE
    // ------------------------------------------------------------
    let captured = null;

    const listener = async (request) => {
      const reqUrl = request.url();

      if (
        reqUrl.endsWith(".mp4") ||
        reqUrl.endsWith(".m4v") ||
        reqUrl.endsWith(".m4a")
      ) {
        try {
          const response = await request.response();
          if (!response) return;

          const buffer = await response.body();
          captured = buffer;
        } catch {}
      }
    };

    page.on("requestfinished", listener);

    try {
      await page.goto(url, { timeout: 5000, waitUntil: "domcontentloaded" });
    } catch {}

    await page.waitForTimeout(1500);

    page.off("requestfinished", listener);

    if (!captured) {
      console.log("Failed to capture media request:", url);
      completed++;
      renderProgress(completed, urls.length);
      continue;
    }

    archive.append(captured, { name: filename });
    console.log("Added to ZIP:", filename);

    completed++;
    renderProgress(completed, urls.length);
  }

  await browser.close();

  console.log("\nFinalizing ZIP…");
  archive.finalize();

  zipOutput.on("close", () => {
    console.log(`Created media_archive.zip (${archive.pointer()} bytes)`);
  });
})();
