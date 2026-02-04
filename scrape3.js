const { chromium } = require("playwright");

const pdfUrls = [
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA00064604.pdf",
  "https://www.justice.gov/epstein/files/DataSet%208/EFTA00033360.pdf",
  "https://www.justice.gov/epstein/files/DataSet%209/EFTA01154497.pdf"
];

const extensions = [".mp4", ".avi", ".m4a", ".m4v"];

async function testUrl(page, url) {
  try {
    // 1. Inject a link WITHOUT destroying the page
    await page.evaluate((u) => {
      let a = document.getElementById("dl");
      if (!a) {
        a = document.createElement("a");
        a.id = "dl";
        a.style.display = "none";
        document.body.appendChild(a);
      }
      a.href = u;
    }, url);

    // 2. Try direct download (.avi)
    const downloadPromise = page.waitForEvent("download", { timeout: 1200 }).catch(() => null);
    await page.click("#dl");
    const download = await downloadPromise;
    if (download) return "download";

    // 3. Try .mp4 wrapper detection via fetch() inside SAME JS environment
    const html = await page.evaluate(async (u) => {
      try {
        const res = await fetch(u, { credentials: "include" });
        return await res.text();
      } catch {
        return "";
      }
    }, url);

    if (html.includes("<video")) return "video";

    return null;
  } catch {
    return null;
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 0
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // STEP 1 — Navigate to first URL to trigger both gates
  const firstBase = pdfUrls[0].replace(/\.pdf$/i, "");
  console.log("Solve both gates in the browser window…");
  await page.goto(firstBase + ".mp4");

  // STEP 2 — Wait for bot-gate clearance cookie
  await context.waitForEvent("requestfinished", async () => {
    const cookies = await context.cookies();
    return cookies.some(c =>
      c.name.includes("cf") ||
      c.name.includes("bm") ||
      c.name.includes("ak")
    );
  });

  // STEP 3 — Wait for YOU to click “Yes, I am 18+”
  await page.waitForFunction(() => {
    return document.querySelector("video");
  }, { timeout: 0 });

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
