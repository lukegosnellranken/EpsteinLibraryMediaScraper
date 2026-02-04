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

    let captured = null;

    const listener = async (request) => {
      const reqUrl = request.url();

      if (
        reqUrl.endsWith(".mp4") ||
        reqUrl.endsWith(".m4v") ||
        reqUrl.endsWith(".avi") ||
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
      continue;
    }

    archive.append(captured, { name: filename });
    console.log("Added to ZIP:", filename);
  }

  await browser.close();

  console.log("Finalizing ZIP…");
  archive.finalize();

  zipOutput.on("close", () => {
    console.log(`Created media_archive.zip (${archive.pointer()} bytes)`);
  });
})();