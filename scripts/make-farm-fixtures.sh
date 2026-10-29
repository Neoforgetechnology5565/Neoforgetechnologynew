#!/usr/bin/env bash
# Test-only media for scripts/test-farm-ui.mjs. Not shipped with the site (licence of the source photograph is not stated).
# Downloads the "horses" test photograph used by the YOLO project and pans a crop window across it to make a short clip in which horses move into the right of the frame.
set -euo pipefail
DIR="${1:-/tmp/claude-0/samp}"; mkdir -p "$DIR"
[ -f "$DIR/horses.jpg" ] || curl -sSf -o "$DIR/horses.jpg" https://raw.githubusercontent.com/pjreddie/darknet/master/data/horses.jpg
ffmpeg -y -loglevel error -loop 1 -framerate 10 -t 6 -i "$DIR/horses.jpg" -vf "crop=480:300:x='293*(1-t/6)':y=150,format=yuv420p" -c:v libvpx-vp9 -b:v 1M "$DIR/horses-pan.webm"
echo "fixtures in $DIR"
