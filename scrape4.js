const { chromium } = require("playwright");

const pdfUrls = [
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.pdf",
  "https://www.justice.gov/epstein/files/DataSet%208/EFTA00033360.pdf",
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA01154497.pdf"
];

const extensions = [".mp4", ".avi", ".m4a", ".m4v"];

async function testUrl(page, url) {
  try {
    // Attach download listener BEFORE navigation
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);

    // Navigate normally (DOJ requires this)
    const response = await page.goto(url, { timeout: 15000 });

    // If a download happened → .avi (or other direct file)
    const download = await downloadPromise;
    if (download) return "download";

    // If the page contains a <video> element → .mp4 wrapper
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

  const context = await browser.newContext();
  const page = await context.newPage();

  // Solve both gates manually
  console.log("Open browser and solve both gates…");
  await page.goto("https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.mp4");
  await page.pause(); // Solve bot-gate + age gate, then Resume

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
