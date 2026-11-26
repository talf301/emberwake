#!/bin/sh
# Usage: tools/shot.sh out.png 'query-string'   (server on :8477 serving the repository root)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=390,${3:-760} --virtual-time-budget=4000 \
  --screenshot="$1" "http://127.0.0.1:8477/tools/frame.html?h=${3:-760}&$2" >/dev/null 2>&1
