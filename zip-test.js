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
  // DOWNLOAD EACH MEDIA FILE TO A TEMP FOLDER, THEN ZIP
  // ------------------------------------------------------------
  const TEMP_DIR = "media_temp";
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
  }

  const axios = require("axios");
  const { finished } = require("stream/promises");

  for (const url of urls) {
    const filename = path.basename(url);
    const dest = path.join(TEMP_DIR, filename);

    console.log("Downloading:", url);

    try {
      const writer = fs.createWriteStream(dest);
      const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream',
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': 'https://www.justice.gov/'
          }
      });
      response.data.pipe(writer);
      await finished(writer);
      console.log("Downloaded:", filename);
    } catch (err) {
      console.error(`Error downloading ${url}: ${err.message}`);
    }
  }

  console.log("Adding files to ZIP archive…");
  const files = fs.readdirSync(TEMP_DIR);
  for (const file of files) {
    const filePath = path.join(TEMP_DIR, file);
    archive.file(filePath, { name: file });
    console.log("Added to ZIP:", file);
  }


  await browser.close();

  console.log("Finalizing ZIP…");
  archive.finalize();

  zipOutput.on("close", () => {
    console.log(`Created media_archive.zip (${archive.pointer()} bytes)`);
  });
})();
