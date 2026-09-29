#!/bin/sh
# Ambient video clip via fal.ai (Seedance lite text-to-video), then a small silent loop.
#   ./gen-video.sh "<prompt>" out.mp4
# Reads FAL_API_KEY from ~/Development/pxls/.env. Never prints the key.
set -e
KEY=$(grep '^FAL_API_KEY=' "$HOME/Development/pxls/.env" | cut -d= -f2- | tr -d '"')
PROMPT="$1"; OUT="$2"
URL=$(python3 - "$PROMPT" "$KEY" <<'PY'
import sys, json, urllib.request
prompt, key = sys.argv[1:3]
body = json.dumps({"prompt": prompt, "aspect_ratio": "9:16", "resolution": "720p", "duration": "5", "camera_fixed": True}).encode()
req = urllib.request.Request("https://fal.run/fal-ai/bytedance/seedance/v1/lite/text-to-video", data=body,
  headers={"Authorization": "Key " + key, "Content-Type": "application/json"})
r = json.load(urllib.request.urlopen(req, timeout=600))
print(r["video"]["url"])
PY
)
RAW=$(mktemp /tmp/gen-video.XXXXXX).mp4
curl -sL "$URL" -o "$RAW"
# silent, 540 wide, crossfade-free loop is left to the page (play forward then reverse is not needed for slow drifts)
ffmpeg -y -loglevel error -i "$RAW" -an -vf scale=540:-2 -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart "$OUT"
ls -la "$OUT"
