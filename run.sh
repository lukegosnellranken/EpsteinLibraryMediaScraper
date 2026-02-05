#!/bin/bash

# Check if an argument is provided for SCRAPE_ENTRIES
if [ -z "$1" ]; then
  echo "Usage: ./run.sh <SCRAPE_ENTRIES_VALUE>"
  echo "       Pass 0 to use TOTAL_LIBRARY_FILES from .env"
  echo "       Pass any other number to scrape and validate that number of files"
  exit 1
fi

if [ "$1" -eq "0" ]; then
  # Read TOTAL_LIBRARY_FILES from .env
  TOTAL_LIBRARY_FILES=$(grep '^TOTAL_LIBRARY_FILES' .env | cut -d '=' -f 2 | tr -d '[:space:]')
  if [ -z "$TOTAL_LIBRARY_FILES" ]; then
    echo "Error: TOTAL_LIBRARY_FILES not found in .env or is empty."
    exit 1
  fi
  export SCRAPE_ENTRIES="$TOTAL_LIBRARY_FILES"
  echo "Argument 0 detected. Setting SCRAPE_ENTRIES to TOTAL_LIBRARY_FILES ($TOTAL_LIBRARY_FILES) from .env"
else
  export SCRAPE_ENTRIES="$1"
  echo "Running scrape.js with SCRAPE_ENTRIES=$SCRAPE_ENTRIES"
fi

# Set the SCRAPE_ENTRIES environment variable for this execution
# This will override any SCRAPE_ENTRIES value present in the .env file for this command

# Execute the scrape.js script using node
node scrape.js
echo "Running validate.js"
node validate.js
