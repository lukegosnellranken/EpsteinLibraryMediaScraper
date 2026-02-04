const { chromium } = require("playwright");

const pdfUrls = [
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.pdf",
  "https://www.justice.gov/epstein/files/DataSet%208/EFTA00033360.pdf",
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA01154497.pdf"
];

const extensions = [".mp4", ".avi", ".m4a", ".m4v"];

async function testUrl(page, url) {
  try {
    // Start listening for a download BEFORE navigation
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);

    // Navigate to the candidate URL; this may fail for pure-download responses
    try {
      await page.goto(url, { timeout: 15000, waitUntil: "load" });
    } catch {
      // For .avi (pure download), goto may reject or never fully load a document.
      // We don't treat this as a failure; we rely on the download event instead.
    }

    // If a download happened, treat as a valid direct media file (.avi, etc.)
    const download = await downloadPromise;
    if (download) {
      return "download";
    }

    // If no download, check for a <video> element (wrapper page for .mp4)
    const hasVideo = await page.$("video");
    if (hasVideo) {
      return "video";
    }

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

  const context = await browser.newContext({
    acceptDownloads: true
  });

  const page = await context.newPage();

  // Manually solve both gates once
  console.log("Open browser and solve both gates…");
  await page.goto("https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.mp4");
  await page.pause(); // solve bot + 18+ gates, wait for video to play, then Resume

  const validUrls = [];

  for (const pdfUrl of pdfUrls) {
    const base = pdfUrl.replace(/\.pdf$/i, "");

    for (const ext of extensions) {
      const candidate = base + ext;
      console.log("Testing:", candidate);

      const result = await testUrl(page, candidate);

      if (result === "video" || result === "download") {
        validUrls.push({ url: candidate, type: result });
        break; // stop checking other extensions for this PDF
      }
    }
  }

  console.log("\n=== VALID MEDIA URLS FOUND ===");
  validUrls.forEach(entry => {
    console.log(`${entry.url}   (${entry.type})`);
  });

  await browser.close();
})();
