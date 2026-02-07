const fs = require('fs').promises;
const path = require('path');

async function findMissingEntries() {
    // Corrected paths to look for files in the root directory
    const pdfListPath = path.join(__dirname, 'pdf_list.txt');
    const validMediaPath = path.join(__dirname, 'valid_media.txt');
    const missingEntriesPath = path.join(__dirname, 'entries_missing_files.txt');

    try {
        // Read the content of both files
        const pdfListContent = await fs.readFile(pdfListPath, 'utf8');
        const validMediaContent = await fs.readFile(validMediaPath, 'utf8');

        // Split contents into arrays of lines and trim whitespace
        const pdfEntries = pdfListContent.split('\n').map(entry => entry.trim()).filter(entry => entry !== '');
        const validMediaEntries = new Set(validMediaContent.split('\n').map(entry => entry.trim()).filter(entry => entry !== ''));

        // Find entries in pdfList that are not in validMedia
        const missingEntries = pdfEntries.filter(entry => !validMediaEntries.has(entry));

        // Write the missing entries to the new file
        if (missingEntries.length > 0) {
            await fs.writeFile(missingEntriesPath, missingEntries.join('\n') + '\n', 'utf8');
            console.log(`Successfully wrote ${missingEntries.length} missing entries to ${missingEntriesPath}`);
        } else {
            await fs.writeFile(missingEntriesPath, '', 'utf8'); // Create an empty file if no missing entries
            console.log('No missing entries found. An empty file has been created.');
        }

    } catch (error) {
        console.error(`Error finding missing entries: ${error.message}`);
        // If the error is due to file not found, inform the user more specifically
        if (error.code === 'ENOENT') {
            console.error('Make sure "pdf_list.txt" and "valid_media.txt" exist in the root directory.');
        }
        // Optionally, re-throw the error if you want to propagate it further
        // throw error;
    }
}

findMissingEntries();