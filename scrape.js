const { chromium } = require("playwright");
const fs = require("fs");
const readline = require("readline");

// ------------------------------
// CONFIG: LIMIT NUMBER OF RESULTS
// ------------------------------
const MAX_RESULTS = 2;   // <-- change this to however many PDFs you want

// ------------------------------
// BOT-GATE
// ------------------------------
async function waitForBotGate(context) {
  await context.waitForEvent("requestfinished", async () => {
    const cookies = await context.cookies();
    return cookies.some(c =>
      c.name.includes("cf") ||
      c.name.includes("bm") ||
      c.name.includes("ak")
    );
  });
}

// ------------------------------
// MANUAL AGE-GATE
// ------------------------------
function waitForUserConfirmation(message) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

// ------------------------------
// MAIN SCRAPER
// ------------------------------
async function scrapePDFs() {
  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Opening Epstein Library…");
  await page.goto("https://www.justice.gov/epstein");

  console.log("Waiting for bot‑gate…");
  await waitForBotGate(context);
  console.log("Bot‑gate cleared.");

  console.log("If an age‑gate is visible, click “Yes” in the browser.");
  await waitForUserConfirmation("After you click Yes on the age‑gate, press Enter here to continue… ");

  // ------------------------------
  // SEARCH INPUT + BUTTON
  // ------------------------------

  console.log("Locating search input…");

  const input = page.locator("input[placeholder*='Type to search']");
  await input.waitFor({ state: "visible", timeout: 15000 });

  console.log("Typing search query…");
  await input.fill("No Images Produced");

  console.log("Locating search button…");

  const searchButton = page.locator("button:has-text('Search')");
  await searchButton.waitFor({ state: "visible", timeout: 15000 });

  console.log("Submitting search…");
  await searchButton.click();

  // ------------------------------
  // WAIT FOR RESULTS (#results)
  // ------------------------------
  console.log("Waiting for results…");

  await page.waitForSelector("#results", { timeout: 20000 });

  const pdfs = new Set();

  while (true) {
    // Extract PDFs from <h3><a>
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("#results h3 a"))
        .map(a => a.href)
        .filter(h => h && h.toLowerCase().endsWith(".pdf"));
    });

    for (const h of links) {
      if (pdfs.size >= MAX_RESULTS) break;
      pdfs.add(h);
    }

    if (pdfs.size >= MAX_RESULTS) break;

    // Pagination: look for a "Next" link
    const nextButton = page.locator("a:has-text('Next')");
    const hasNext = await nextButton.count();

    if (!hasNext) break;

    console.log("Next page…");
    await nextButton.first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("#results", { timeout: 20000 });
  }

  // ------------------------------
  // WRITE RESULTS WITHOUT OVERWRITING
  // ------------------------------
  const outputFile = "pdf_list.txt";

  // Load existing entries if file exists
  let existing = new Set();
  if (fs.existsSync(outputFile)) {
    existing = new Set(
      fs.readFileSync(outputFile, "utf8")
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(x => x.length > 0)
    );
  }

  // Merge new PDFs into the existing set
  for (const pdf of pdfs) {
    existing.add(pdf);
  }

  // Write back the merged set
  fs.writeFileSync(outputFile, Array.from(existing).join("\n"));

  console.log(`Done. Extracted ${pdfs.size} PDFs.`);
  console.log("Updated pdf_list.txt without overwriting existing entries.");

  await browser.close();
}

scrapePDFs();
