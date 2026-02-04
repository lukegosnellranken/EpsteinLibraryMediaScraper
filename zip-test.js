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
// PREP ZIP ARCHIVE (NO TEMP FOLDER)
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
  // DOWNLOAD EACH MEDIA FILE DIRECTLY INTO ZIP
  // ------------------------------------------------------------
  for (const url of urls) {
  const filename = path.basename(url);
  console.log("Downloading:", url);

  // Navigate to the page
  try {
    await page.goto(url, { timeout: 5000, waitUntil: "domcontentloaded" });
  } catch {}

  // Wait for the video element to load
  try {
    await page.waitForFunction(() => document.querySelector("video"), { timeout: 5000 });
  } catch {
    console.log("No video element found:", url);
    continue;
  }

  // Trigger a real browser download
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => {
      const video = document.querySelector("video");
      if (!video) return;

      const a = document.createElement("a");
      a.href = video.src;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
  ]);

  // Read the downloaded file into a buffer
  const stream = await download.createReadStream();
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const fullBuffer = Buffer.concat(chunks);

  // Add to ZIP
  archive.append(fullBuffer, { name: filename });

  console.log("Added to ZIP:", filename);
}


await browser.close();

console.log("Finalizing ZIP…");
archive.finalize();

})();