const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const unzip = require("unzipper");

// ------------------------------------------------------------
// LOAD MEDIA URLS
// ------------------------------------------------------------
const urls = fs.readFileSync("valid_media.txt", "utf8")
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.length > 0);

console.log(`Loaded ${urls.length} media URLs from valid_media.txt`);

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async () => {

  // ------------------------------------------------------------
  // LOAD EXISTING ZIP CONTENTS
  // ------------------------------------------------------------
  const existingFiles = new Set();

  if (fs.existsSync("media_archive.zip")) {
    console.log("Reading existing ZIP…");

    const directory = await unzip.Open.file("media_archive.zip");
    for (const entry of directory.files) {
      existingFiles.add(entry.path);
    }

    console.log("Existing files:", existingFiles.size);
  }

  // ------------------------------------------------------------
  // PREP NEW ZIP ARCHIVE
  // ------------------------------------------------------------
  const zipOutput = fs.createWriteStream("media_archive_new.zip");
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", err => { throw err; });
  archive.pipe(zipOutput);

  // Copy old ZIP contents into new ZIP
  if (fs.existsSync("media_archive.zip")) {
    const directory = await unzip.Open.file("media_archive.zip");

    for (const entry of directory.files) {
      const stream = entry.stream();
      archive.append(stream, { name: entry.path });
    }
  }

  // ------------------------------------------------------------
  // BROWSER SETUP
  // ------------------------------------------------------------
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
    let filename = path.basename(url).split("?")[0];

    // ------------------------------------------------------------
    // AVI HANDLING — ALWAYS FETCH (native download never fires)
    // ------------------------------------------------------------
    if (filename.toLowerCase().endsWith(".avi")) {

      if (existingFiles.has(filename)) {
        console.log("Already exists, skipping AVI:", filename);
        continue;
      }

      console.log("Downloading AVI via fetch():", url);

      const aviBuffer = await page.evaluate(async (aviUrl) => {
        const res = await fetch(aviUrl);
        const arrayBuffer = await res.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      }, url);

      archive.append(Buffer.from(aviBuffer), { name: filename });

      console.log("Added AVI to ZIP:", filename);
      continue;
    }

    // ------------------------------------------------------------
    // MP4 / M4V / etc. HANDLING (your original working logic)
    // ------------------------------------------------------------
    if (existingFiles.has(filename)) {
      console.log("Already exists, skipping:", filename);
      continue;
    }

    console.log("Downloading:", url);

    try {
      await page.goto(url, { timeout: 5000, waitUntil: "domcontentloaded" });
    } catch {}

    try {
      await page.waitForFunction(() => document.querySelector("video"), { timeout: 5000 });
    } catch {
      console.log("No video element found:", url);
      continue;
    }

    const realVideoUrl = await page.evaluate(() => {
      const video = document.querySelector("video");
      const source = video?.querySelector("source");
      return source?.src || video?.src || null;
    });

    if (!realVideoUrl) {
      console.log("No usable video URL found:", url);
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
      continue;
    }

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const fullBuffer = Buffer.concat(chunks);

    archive.append(fullBuffer, { name: filename });

    console.log("Added to ZIP:", filename);
  }

  await browser.close();

  console.log("Finalizing ZIP…");
  archive.finalize();

  zipOutput.on("close", () => {
    fs.renameSync("media_archive_new.zip", "media_archive.zip");
    console.log("Updated media_archive.zip");
  });

})();
