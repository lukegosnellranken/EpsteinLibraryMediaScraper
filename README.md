# Epstein Library Media Scraper

This project is designed to scrape, validate, and archive media files from the Epstein Library. It uses `scrape.js` to extract URLs, `validate.js` to verify them, and `zip.js` to download and compress the media into a ZIP archive.

Note: Not all files have valid extensions, thus the number of valid URLs may be less than the number of files that were processed during scraping.

## ☕ Buy Me a Coffee ☕
All donations are deeply appreciated: https://buymeacoffee.com/lukegosnell

## Getting Started

1.  **Environment Variables**: Ensure your `.env` file is configured with necessary variables, including `TOTAL_LIBRARY_FILES`, which should be equal to the number of files returned when searching "No Images Produced" in the Epstein Library.
2.  **Dependencies**: Install Node.js dependencies:
    ```bash
    npm install
    ```
### General Use Example
1.  In the project root folder, run `./run.sh 0` to scrape and validate all files. 
    - Scraped files will be viewable in pdf_list.txt and validated files will be viewable in valid_media.txt.
    - Note that in the test browser, the user must manually validate the "I am not a robot" and "Are you 18 years or older?" messages on the landing page of the Epstein Library before scraping and/or validating. Not doing so will cause the run to fail.
2.  Run `node zip.js 0` to download all media files from `valid_media.txt`.
3.  View the media in the generated `media_archive.zip` folder.

NOTE: All files (as of 2/5/26) are listed in the testing folder (`pdf_list.all.txt`, `valid_media.all.txt`). Move these files into the root of the project and remove the `.all` from their filenames. From here, you can simply run the `zip.js` command (see `Zipping Media Files` section below) to download the files.

## Deeper Usage

### Running the Scraper and Validator (`run.sh`)

The `run.sh` script automates the process of scraping media URLs using `scrape.js` and then validating them using `validate.js`. You can control which entries are processed by providing an argument to the script.

**Syntax:**

```bash
./run.sh <SCRAPE_ENTRIES_VALUE>
```

**Arguments:**

*   `<SCRAPE_ENTRIES_VALUE>`: A string representing the entries to scrape. Examples include:
    *   `<index>` (e.g., `25`): Process only the first 25 files`.
    *   `0`: A special argument. If you pass `0`, the script will read the `TOTAL_LIBRARY_FILES` value from your `.env` file and use that to set `SCRAPE_ENTRIES`, effectively processing all files if `TOTAL_LIBRARY_FILES` represents the total count.

**Examples:**

```bash
# Scrape and validate entries 1, 5, and 10
./run.sh "1,5,10"

# Scrape and validate entries from 20 to 50
./run.sh "20-50"

# Scrape and validate all entries based on TOTAL_LIBRARY_FILES from .env
./run.sh 0
```

### Zipping Media Files (`zip.js`)

The `zip.js` script downloads the valid media URLs (found in `valid_media.txt`) and archives them into `media_archive.zip`.

**Syntax:**

```bash
node zip.js <RANGE_OR_INDEX>
```

**Arguments:**

*   `<RANGE_OR_INDEX>`: (Optional) Controls which media URLs are processed for zipping.
    *   `0`: Process all URLs found in `valid_media.txt`.
    *   `<index>` (e.g., `5`): Process only the URL at the specified 1-based index from `valid_media.txt`.
    *   `<start>-<end>` (e.g., `5-12`): Process URLs within the specified 1-based range from `valid_media.txt`.
    *   *If no argument is provided, it defaults to processing all URLs (equivalent to `0`).*

**Examples:**

```bash
# Zip all media files from valid_media.txt
node zip.js 0

# Zip only the 7th media file
node zip.js 7

# Zip media files from the 10th to the 25th entry
node zip.js 10-25

# Zip all media files (no argument implicitly means all)
node zip.js
```