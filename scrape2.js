const { chromium } = require("playwright");

const pdfUrls = [
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.pdf",
  "https://www.justice.gov/epstein/files/DataSet%208/EFTA00033360.pdf",
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA01154497.pdf"
];

const extensions = [".mp4", ".avi", ".m4a", ".m4v"];

async function testUrl(page, url) {
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);

    await page.goto(url, { timeout: 15000 });

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
  // ⭐ Visible browser so you can click the button
  const browser = await chromium.launch({
    headless: false,
    slowMo: 250
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // ⭐ STEP 1: Visit DOJ once so you can click “I am not a robot”
  console.log("Open browser and solve the bot‑gate…");
  await page.goto("https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.mp4");

  // ⭐ STEP 2: Pause so you can click the button manually
  await page.pause();  
  // After clicking the button and the page loads normally, click “Resume” in Playwright Inspector.

  // ⭐ STEP 3: Now the session is authenticated — run your real logic
  const validUrls = [];

  for (const pdfUrl of pdfUrls) {
    const base = pdfUrl.replace(/\.pdf$/i, "");

    for (const ext of extensions) {
        const candidate = base + ext;
        console.log("Testing:", candidate);

        const result = await testUrl(page, candidate);

        if (result === "video" || result === "download") {
            validUrls.push({ url: candidate, type: result });
            break; // ⭐ stop checking other extensions for this PDF
        }
    }
  }

  console.log("\n=== VALID MEDIA URLS FOUND ===");
  validUrls.forEach(entry => {
    console.log(`${entry.url}   (${entry.type})`);
  });

  await browser.close();
})();
