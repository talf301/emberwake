#!/bin/sh
# Renders the app icons from tools/icon.html (server on :8477 serving the repository root).
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=512,512 --virtual-time-budget=3000 --screenshot=public/icon-512.png "http://127.0.0.1:8477/tools/icon.html" >/dev/null 2>&1
sips -z 192 192 public/icon-512.png --out public/icon-192.png >/dev/null
sips -z 180 180 public/icon-512.png --out public/icon-180.png >/dev/null
