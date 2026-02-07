const fs = require("fs");
const { chromium } = require("playwright");

const QUERY = "No Images Produced";
const BASE_URL = "https://www.justice.gov/multimedia-search";
const OUTPUT = "pdf_list.txt";

// ------------------------------------------------------------
// RANGE SELECTION (CLI ARGUMENT)
// Usage:
//   node scrape.js 0        → all
//   node scrape.js 1        → first entry
//   node scrape.js 5        → fifth entry
//   node scrape.js 5-12     → entries 5 through 12
// ------------------------------------------------------------

const arg = process.argv[2] || "0";

let startIndex = 0;
let endIndex = Infinity;

if (arg.includes("-")) {
  const [start, end] = arg.split("-").map(n => parseInt(n, 10));

  // 1-based → 0-based
  startIndex = Math.max(start - 1, 0);
  endIndex = Math.max(end - 1, 0);
} else {
  const n = parseInt(arg, 10);

  if (n === 0) {
    // 0 → all entries
    startIndex = 0;
    endIndex = Infinity;
  } else {
    // 1-based → 0-based
    startIndex = Math.max(n - 1, 0);
    endIndex = startIndex;
  }
}

const startPage = Math.floor(startIndex / 10);
const endPage = isFinite(endIndex) ? Math.floor(endIndex / 10) : Infinity;

const startOffset = startIndex % 10;
const endOffset = endIndex % 10;

function renderTwoLineProgress(current, total, pageCount, totalCount, firstRender) {
  const width = 40;
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);

  if (!firstRender) {
    process.stdout.write("\x1b[2A");
  }

  process.stdout.write(`[${bar}] ${current}/${total}\n`);
  process.stdout.write(`${pageCount} PDFs, total so far: ${totalCount}\n`);
}

function makePageUrl(page) {
  return `${BASE_URL}?keys=${encodeURIComponent(QUERY)}&page=${page}`;
}

function buildTargetUrl(fileName) {
  return `https://www.justice.gov/epstein/files/DataSet%2010/${encodeURIComponent(fileName)}`;
}

async function scrapeAll() {
  console.log("Launching browser…");

  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext();
  const page = await context.newPage();

  const startUrl = makePageUrl(startPage);
  console.log(`Opening initial page: ${startUrl}`);
  await page.goto(startUrl);

  console.log("\nSolve Cloudflare and age-gate on THIS PAGE.");
  console.log("Wait until you see the JSON payload.");
  console.log("Then press Enter here.\n");

  await new Promise(resolve => process.stdin.once("data", resolve));
  process.stdin.setRawMode(false);
  process.stdin.pause();


  // Load existing entries so we append instead of overwrite
  let existing = [];
  if (fs.existsSync(OUTPUT)) {
    existing = fs.readFileSync(OUTPUT, "utf8")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);
  }

  const pdfs = new Set(existing);
  const existingCount = pdfs.size;

  let pageNum = startPage;
  let totalPages = null;
  let firstRender = true;

  console.log(""); // spacer line for clean progress bar area

  while (true) {
    const url = makePageUrl(pageNum);

    // Fetch JSON inside browser context
    const data = await page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    }, url);

    if (!data) break;

    if (totalPages === null) {
      const totalHits = data?.hits?.total?.value || 0;
      // Total pages for the FULL dataset
      const fullTotalPages = Math.ceil(totalHits / 10);

      // Total pages we actually intend to scrape
      const rangeTotalPages = isFinite(endPage)
        ? (endPage - startPage + 1)
        : fullTotalPages;

      // Use rangeTotalPages for progress bar
      totalPages = rangeTotalPages;
    }

    const hits = data?.hits?.hits || [];
    if (!hits.length) break;

    const pageFiles = hits
      .map(h => {
        const key = h?._source?.key;
        if (!key) return null;

        const [datasetFolder, fileName] = key.split("/");
        if (!datasetFolder || !fileName) return null;

        const encodedDataset = encodeURIComponent(datasetFolder);
        const encodedFile = encodeURIComponent(fileName);

        return `https://www.justice.gov/epstein/files/${encodedDataset}/${encodedFile}`;
      })
      .filter(Boolean);

    // Determine which entries on this page we should include
    let sliceStart = 0;
    let sliceEnd = pageFiles.length;

    if (pageNum === startPage) {
      sliceStart = startOffset;
    }
    if (pageNum === endPage && isFinite(endIndex)) {
      sliceEnd = endOffset + 1;
    }

    const selectedFiles = pageFiles.slice(sliceStart, sliceEnd);

    for (const url of selectedFiles) {
      pdfs.add(url);
    }

    // Line 1: progress bar
    const currentPageIndex = pageNum - startPage + 1;

    renderTwoLineProgress(
      currentPageIndex,
      totalPages,
      selectedFiles.length,
      pdfs.size,
      firstRender
    );

    firstRender = false;

    if (pageNum >= endPage) break;
    pageNum++;
  }

  fs.writeFileSync(OUTPUT, Array.from(pdfs).join("\n") + "\n");

  const addedCount = pdfs.size - existingCount;
  console.log(`Done. Added ${addedCount} new URLs. Total now: ${pdfs.size}.`);

  await browser.close();
}

scrapeAll();
