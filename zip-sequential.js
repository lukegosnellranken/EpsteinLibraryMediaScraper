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
    const lower = filename.toLowerCase();

    console.log("\nDownloading:", url);

    // ------------------------------------------------------------
    // AVI + MOV HANDLING — SAME AS PARALLEL SCRIPT
    // ------------------------------------------------------------
    if (lower.endsWith(".avi") || lower.endsWith(".mov")) {
      try {
        console.log("Fetching AVI/MOV via browser context:", url);

        const bytes = await page.evaluate(async (fileUrl) => {
          const res = await fetch(fileUrl);
          const arrayBuffer = await res.arrayBuffer();
          return Array.from(new Uint8Array(arrayBuffer));
        }, url);

        archive.append(Buffer.from(bytes), { name: filename });
        console.log("Added AVI/MOV to ZIP:", filename);

      } catch (err) {
        console.log("AVI/MOV fetch error:", err.message || err);
      }

      completed++;
      renderProgress(completed, urls.length);
      continue;
    }

    // ------------------------------------------------------------
    // MP4 / M4V / M4A HANDLING — MATCH PARALLEL SCRIPT EXACTLY
    // ------------------------------------------------------------
    try {
      await page.goto(url, { timeout: 5000, waitUntil: "domcontentloaded" });
    } catch {}

    try {
      await page.waitForFunction(() => document.querySelector("video"), { timeout: 5000 });
    } catch {
      console.log("No video element found:", url);
      completed++;
      renderProgress(completed, urls.length);
      continue;
    }

    const realVideoUrl = await page.evaluate(() => {
      const video = document.querySelector("video");
      const source = video?.querySelector("source");
      return source?.src || video?.src || null;
    });

    if (!realVideoUrl) {
      console.log("No usable video URL found:", url);
      completed++;
      renderProgress(completed, urls.length);
      continue;
    }

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate((src) => {
        const a = document.createElement("a");
        a.href = src;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, realVideoUrl)
    ]);

    const stream = await download.createReadStream();
    if (!stream) {
      console.log("Download stream was null, skipping:", filename);
      completed++;
      renderProgress(completed, urls.length);
      continue;
    }

    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);

    archive.append(Buffer.concat(chunks), { name: filename });
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
