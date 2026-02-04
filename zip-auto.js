const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const request = require("request");

// ------------------------------------------------------------
// LOAD MEDIA URLS
// ------------------------------------------------------------
const urls = fs.readFileSync("valid_media.txt", "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

console.log(`Loaded ${urls.length} media URLs from valid_media.txt`);

// ------------------------------------------------------------
// PREP ZIP ARCHIVE (NO TEMP FOLDER)
// ------------------------------------------------------------
const zipOutput = fs.createWriteStream("media_archive.zip");
const archive = archiver("zip", { zlib: { level: 0 } }); // Using level 0 for no compression, should be faster and safer for media files

archive.on("error", err => { throw err; });
archive.pipe(zipOutput);

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async () => {
    for (const url of urls) {
        const filename = path.basename(url);
        console.log("Downloading:", url);

        // Use a Promise to handle the async nature of the download
        await new Promise((resolve, reject) => {
            const fileRequest = request({
                url: url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.justice.gov/'
                }
            });

            fileRequest.on("response", (response) => {
                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download ${url} with status code: ${response.statusCode}`));
                }

                // Append the file stream directly to the archive
                archive.append(fileRequest, { name: filename });
                console.log("Added to ZIP:", filename);
                
                // The 'end' event on the request stream is the signal that the file has been fully piped.
                fileRequest.on('end', () => {
                    resolve();
                });
            });

            fileRequest.on("error", (err) => {
                reject(err);
            });
        }).catch(err => {
            console.error(`Error processing ${url}: ${err.message}`);
            // Continue to the next file even if one fails
        });
    }

    console.log("Finalizing ZIP…");
    archive.finalize();

    zipOutput.on("close", () => {
        console.log(`Created media_archive.zip (${archive.pointer()} bytes)`);
    });
})();
