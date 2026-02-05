const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const unzip = require("unzipper");
const cliProgress = require("cli-progress");

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------
const MP4_WORKERS = 5;
const AVI_WORKERS = 3;

// ------------------------------------------------------------
// LOAD MEDIA URLS
// ------------------------------------------------------------
const urls = fs.readFileSync("valid_media.txt", "utf8")
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.length > 0);

console.log(`Loaded ${urls.length} media URLs from valid_media.txt`);

const aviQueue = [];
const mp4Queue = [];

for (const url of urls) {
  const filename = path.basename(url).split("?")[0];
  const lower = filename.toLowerCase();

  // ------------------------------------------------------------
  // UPDATED: .avi and .mov behave the same (direct download)
  // ------------------------------------------------------------
  if (lower.endsWith(".avi") || lower.endsWith(".mov")) {
    aviQueue.push(url);
  } else {
    mp4Queue.push(url); // includes .mp4, .m4v, .m4a, etc.
  }
}

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

  // ------------------------------------------------------------
  // GLOBAL GATE CLEAR
  // ------------------------------------------------------------
  const gateUrl = "https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.mp4";
  const gatePage = await context.newPage();

  console.log("Clearing gates on context…");
  await gatePage.goto(gateUrl);

  await context.waitForEvent("requestfinished", async () => {
    const cookies = await context.cookies();
    return cookies.some(c =>
      c.name.includes("cf") ||
      c.name.includes("bm") ||
      c.name.includes("ak")
    );
  });

  await gatePage.waitForFunction(() => document.querySelector("video"), { timeout: 0 });
  await gatePage.close();

  console.log("Context gates cleared. Starting parallel downloads…");

  // ------------------------------------------------------------
  // PROGRESS BAR
  // ------------------------------------------------------------
  const totalCount = urls.length;
  const progressBar = new cliProgress.SingleBar({
    format: 'Progress |{bar}| {value}/{total} files',
    hideCursor: true,
    clearOnComplete: false,
    stopOnComplete: false
  }, cliProgress.Presets.shades_classic);

  progressBar.start(totalCount, 0);

  let completed = 0;
  function tick() {
    completed++;
    progressBar.update(completed);
  }

  // ------------------------------------------------------------
  // MP4 WORKER
  // ------------------------------------------------------------
  async function mp4Worker(id) {
    const page = await context.newPage();

    while (mp4Queue.length > 0) {
      const url = mp4Queue.shift();
      if (!url) break;

      let filename = path.basename(url).split("?")[0];

      if (existingFiles.has(filename)) {
        tick();
        continue;
      }

      try {
        await page.goto(url, { timeout: 5000, waitUntil: "domcontentloaded" });
      } catch {}

      try {
        await page.waitForFunction(() => document.querySelector("video"), { timeout: 5000 });
      } catch {
        tick();
        continue;
      }

      const realVideoUrl = await page.evaluate(() => {
        const video = document.querySelector("video");
        const source = video?.querySelector("source");
        return source?.src || video?.src || null;
      });

      if (!realVideoUrl) {
        tick();
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
      if (stream) {
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        archive.append(Buffer.concat(chunks), { name: filename });
      }

      tick();
    }

    await page.close();
  }

  // ------------------------------------------------------------
  // AVI WORKER
  // ------------------------------------------------------------
  async function aviWorker(id) {
    const page = await context.newPage();

    try {
      await page.goto(gateUrl);
      await page.waitForFunction(() => document.querySelector("video"), { timeout: 0 });
    } catch {}

    while (aviQueue.length > 0) {
      const url = aviQueue.shift();
      if (!url) break;

      let filename = path.basename(url).split("?")[0];

      if (existingFiles.has(filename)) {
        tick();
        continue;
      }

      try {
        const aviBytes = await page.evaluate(async (aviUrl) => {
          const res = await fetch(aviUrl);
          const arrayBuffer = await res.arrayBuffer();
          return Array.from(new Uint8Array(arrayBuffer));
        }, url);

        archive.append(Buffer.from(aviBytes), { name: filename });
      } catch (err) {
        console.log(`[AVI W${id}] AVI fetch error:`, err.message || err);
      }

      tick();
    }

    await page.close();
  }

  // ------------------------------------------------------------
  // START WORKERS
  // ------------------------------------------------------------
  const workers = [];

  for (let i = 1; i <= MP4_WORKERS; i++) workers.push(mp4Worker(i));
  for (let i = 1; i <= AVI_WORKERS; i++) workers.push(aviWorker(i));

  await Promise.all(workers);

  // ------------------------------------------------------------
  // FINALIZE ZIP
  // ------------------------------------------------------------
  progressBar.stop();

  await browser.close();

  console.log("\nFinalizing ZIP…");
  archive.finalize();

  zipOutput.on("close", () => {
    console.log("Updated media_archive.zip");
    fs.renameSync("media_archive_new.zip", "media_archive.zip");
  });

})();
