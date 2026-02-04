const { chromium } = require("playwright");

const pdfUrls = [
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.pdf",
  "https://www.justice.gov/epstein/files/DataSet%208/EFTA00033360.pdf",
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA01154497.pdf"
];

const extensions = [".mp4", ".avi", ".m4a", ".m4v"];

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

async function waitForAgeGate(page) {
  console.log("Waiting for age‑gate clearance…");

  await page.waitForFunction(() => {
    return document.querySelector("video");
  }, { timeout: 0 });

  console.log("Age‑gate cleared.");
}

async function testUrl(page, url) {
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 1500 }).catch(() => null);

    try {
      await page.goto(url, { timeout: 1000, waitUntil: "load" });
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

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 250
  });

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const firstBase = pdfUrls[0].replace(/\.pdf$/i, "");
  console.log("Open browser and solve both gates…");
  await page.goto(firstBase + ".mp4");

  // ⭐ Automatically detect both gates
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

  await browser.close();
})();
