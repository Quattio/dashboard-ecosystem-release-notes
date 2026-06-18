#!/bin/bash
set -e

# Static site — no build step. Install deps for Pages Functions (jose for the
# OAuth middleware), then stage the site into dist/ (the Pages output dir).
npm install

mkdir -p dist
cp index.html styles.css releases.js env-banner.js dist/
cp -r releases dist/

echo "Build complete."
