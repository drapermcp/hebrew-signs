#!/bin/bash
# Downloads UXLC Leningrad Codex XML and extracts the word corpus.
# The corpus (~79MB) is not included in this repository.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$PROJECT_ROOT/source-xml"
DATA_DIR="$PROJECT_ROOT/data"

if [ -f "$DATA_DIR/tanach-word-corpus.json" ]; then
  echo "Corpus already exists at data/tanach-word-corpus.json"
  echo "Delete it and re-run to regenerate."
  exit 0
fi

echo "=== Downloading UXLC Leningrad Codex XML ==="
mkdir -p "$SOURCE_DIR/Books"

if command -v git &> /dev/null; then
  git clone --depth 1 https://github.com/openscriptures/UXLC.git "$SOURCE_DIR/.uxlc-temp"
  # The UXLC repo stores XML books in the root Books/ directory
  if [ -d "$SOURCE_DIR/.uxlc-temp/Books" ]; then
    cp "$SOURCE_DIR/.uxlc-temp/Books/"*.xml "$SOURCE_DIR/Books/"
  else
    echo "ERROR: Could not find Books/ directory in UXLC repo."
    echo "Check https://github.com/openscriptures/UXLC for current structure."
    rm -rf "$SOURCE_DIR/.uxlc-temp"
    exit 1
  fi
  rm -rf "$SOURCE_DIR/.uxlc-temp"
else
  echo "ERROR: git is required to download the UXLC source."
  exit 1
fi

echo "=== Extracting word corpus ==="
node "$SCRIPT_DIR/extraction.js"

echo ""
echo "=== Done ==="
echo "Corpus written to: $DATA_DIR/tanach-word-corpus.json"
