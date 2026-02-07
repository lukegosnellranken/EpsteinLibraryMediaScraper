const fs = require('fs').promises;
const path = require('path');

// Helper function to extract the filename without extension from a path or URL
function extractFilename(entry) {
    try {
        let filename;
        // Check if it's a URL
        if (entry.startsWith('http://') || entry.startsWith('https://')) {
            const url = new URL(entry);
            // Decode the URI component to handle encoded characters like %20
            filename = decodeURIComponent(path.basename(url.pathname));
        } else {
            // Assume it's a file path or just a filename
            filename = path.basename(entry);
        }
        // Remove the extension
        return path.parse(filename).name;
    } catch (e) {
        // If URL parsing fails, or any other error, return the original entry as a fallback
        // Or handle specific errors if needed
        console.warn(`Could not extract filename from entry: ${entry}. Using full entry for comparison.`);
        return entry; // Fallback to full entry if extraction fails
    }
}

async function findMissingEntries() {
    const pdfListPath = path.join(__dirname, 'pdf_list.txt');
    const validMediaPath = path.join(__dirname, 'valid_media.txt');
    const missingEntriesPath = path.join(__dirname, 'entries_missing_files.txt');

    try {
        // Read the content of both files
        const pdfListContent = await fs.readFile(pdfListPath, 'utf8');
        const validMediaContent = await fs.readFile(validMediaPath, 'utf8');

        // Split contents into arrays of lines and filter out empty ones
        const pdfEntries = pdfListContent.split('\n').map(entry => entry.trim()).filter(entry => entry !== '');
        const validMediaEntries = validMediaContent.split('\n').map(entry => entry.trim()).filter(entry => entry !== '');

        // Extract filenames from validMedia entries for efficient lookup
        const validMediaFilenames = new Set(validMediaEntries.map(entry => extractFilename(entry)));

        // Find original pdfList entries whose extracted filename is not in validMediaFilenames
        const missingEntries = pdfEntries.filter(pdfEntry => {
            const pdfFilename = extractFilename(pdfEntry);
            return !validMediaFilenames.has(pdfFilename);
        });

        // Write the original missing entries to the new file
        if (missingEntries.length > 0) {
            await fs.writeFile(missingEntriesPath, missingEntries.join('\n') + '\n', 'utf8');
            console.log(`Successfully wrote ${missingEntries.length} missing entries to ${missingEntriesPath}`);
        } else {
            await fs.writeFile(missingEntriesPath, '', 'utf8'); // Create an empty file if no missing entries
            console.log('No missing entries found. An empty file has been created.');
        }

    } catch (error) {
        console.error(`Error finding missing entries: ${error.message}`);
        if (error.code === 'ENOENT') {
            console.error('Make sure "pdf_list.txt" and "valid_media.txt" exist in the root directory.');
        }
    }
}

findMissingEntries();
