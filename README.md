# Epstein Library Media Scraper

This project is designed to scrape, validate, and archive media files from the Epstein Library. It uses `scrape.js` to extract URLs, `validate.js` to verify them, and `zip.js` to download and compress the media into a ZIP archive.

# On the Total Number of Valid Files

1. The total search results for "No Images Produced" are less than the Library states due to a bug on the DOJ website. For instance, as of 2/7/25, the site states "Showing 1 to 10 of 3,803 Results." The actual number of returned non-duplicate results is 2775.
2. Not all files have valid extensions, thus the number of valid URLs may be less than the number of files that were processed during scraping.

## ☕ Buy Me a Coffee ☕
All donations are deeply appreciated: https://buymeacoffee.com/lukegosnell

## Getting Started

1.  **Environment Variables**: Ensure your `.env` file is configured with necessary variables, including `TOTAL_LIBRARY_FILES`, which should be equal to the number of files returned when searching "No Images Produced" in the Epstein Library.
2.  **Dependencies**: Install Node.js dependencies:
    ```bash
    npm install
    ```
### General Use Example
The following example is theoretical, as after a few hundered or so requests while validating, I began having my access denied from the Library. Thus, it is best to spread validation and zipping (see `Validating URLS` and `Zipping Media Files` sections below for usage) across multiple runs if downloading a large number of files.

1.  In the project root folder, run `node scrape.js 0` to scrape all search results. 
    - In the test browser, the user must manually validate the "I am not a robot" and "Are you 18 years or older?" messages on the landing page of the Epstein Library before scraping (and hit `enter` in the terminal afterward). Not doing so will cause the run to fail.
    - Scraped entries will be viewable in `pdf_list.txt`.
2.  Run `node validate.js 0` to validate all stored entries from scraping.
    - In the test browser, the user must manually validate the "Are you 18 years or older?" message.
    - Validated files will be viewable in `valid_media.txt`.
3.  Run `node zip.js 0` to download all media files from `valid_media.txt`.
4.  View the media in the generated `media_archive.zip` folder.

NOTE: All files (as of 2/7/26) are listed in the `results` folder (`pdf_list.all.txt`). To skip the scraping step, move this file into the root of the project and remove the `.all` from its filename. From here, validate and zip to download the files.

## Deeper Usage

### Scraping URLs (`scrape.js`)

The `scrape.js` script compiles every .pdf resulting from the search of "No Images Produced" and archives them into `pdf_list.txt`.

NOTE: The search results ordered from the backend search (https://www.justice.gov/multimedia-search?keys=No%20Images%20Produced&page=0) may be in a different order than what appears on the DOJ website.

**Syntax:**

```bash
node scrape.js <RANGE_OR_INDEX>
```

**Arguments:**

*   `<RANGE_OR_INDEX>`: (Optional) Controls which entries are to be scraped.
    *   `0`: Process all entries found in search results.
    *   `<index>` (e.g., `5`): Process only the entry at the specified 1-based index from the search results.
    *   `<start>-<end>` (e.g., `5-12`): Process entires within the specified 1-based range from the search results.
    *   *If no argument is provided, it defaults to processing all entries (equivalent to `0`).*

**Examples:**

```bash
# Scrape all entries from pdf_list.txt
node scrape.js 0

# Scrape only the 7th entry
node scrape.js 7

# Scrape entries from the 10th to the 25th entry
node scrape.js 10-25

# Scrape all entries (no argument implicitly means all)
node scrape.js
```

### Validating URLs (`validate.js`)

The `validate.js` script finds the valid media URLs (based on `pdf_list.txt`) and archives them into `valid_media.txt`.

NOTE: Take note of the terminal if the run times out. There are instructions for continuing where the run left off.

**Syntax:**

```bash
node validate.js <RANGE_OR_INDEX>
```

**Arguments:**

*   `<RANGE_OR_INDEX>`: (Optional) Controls which entries are processed for zipping.
    *   `0`: Process all entries found in `pdf_list.txt`.
    *   `<index>` (e.g., `5`): Process only the entry at the specified 1-based index from `pdf_list.txt`.
    *   `<start>-<end>` (e.g., `5-12`): Process entires within the specified 1-based range from `pdf_list.txt`.
    *   *If no argument is provided, it defaults to processing all entries (equivalent to `0`).*

**Examples:**

```bash
# Validate all entries from pdf_list.txt
node validate.js 0

# Validate only the 7th entry
node validate.js 7

# Validate entries from the 10th to the 25th entry
node validate.js 10-25

# Validate all entries (no argument implicitly means all)
node validate.js
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