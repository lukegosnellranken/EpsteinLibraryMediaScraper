#!/bin/bash

# Dynamically get the total number of entries from pdf_list.txt
TOTAL_ENTRIES=$(wc -l < pdf_list.txt)

CHUNK_SIZE=50
START_INDEX=1

echo "Total entries to validate: $TOTAL_ENTRIES"

while [ $START_INDEX -le $TOTAL_ENTRIES ]; do
    END_INDEX=$((START_INDEX + CHUNK_SIZE - 1))

    if [ $END_INDEX -gt $TOTAL_ENTRIES ]; then
        END_INDEX=$TOTAL_ENTRIES
    fi

    echo "Running validation for entries $START_INDEX-$END_INDEX"
    node validate.js "$START_INDEX-$END_INDEX"

    if [ $END_INDEX -lt $TOTAL_ENTRIES ]; then
        echo "Pausing for 30 seconds..."
        sleep 30
    fi

    START_INDEX=$((START_INDEX + CHUNK_SIZE))
done

echo "Validation complete."
