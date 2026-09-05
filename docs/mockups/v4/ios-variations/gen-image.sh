#!/bin/sh
# Spot illustration via OpenRouter (google/gemini-2.5-flash-image), ~$0.04 each.
#   ./gen-image.sh "<prompt>" out.png
# Reads OPENROUTER_API_KEY from apps/simple/.env. Never prints the key.
set -e
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
KEY=$(grep '^OPENROUTER_API_KEY=' "$ROOT/apps/simple/.env" | cut -d= -f2- | tr -d '"')
PROMPT="$1"; OUT="$2"
STYLE="Flat minimal spot illustration for a health app. Cream background #FBF6EE, dark ink outlines #2B2622, one accent colour indigo #4C46A6 used sparingly, no text, no shadows, no gradients, centered, square, generous margin."
python3 - "$PROMPT" "$OUT" "$STYLE" "$KEY" <<'PY'
import sys, json, base64, urllib.request
prompt, out, style, key = sys.argv[1:5]
body = json.dumps({"model":"google/gemini-2.5-flash-image","modalities":["image","text"],
  "messages":[{"role":"user","content": style + " Subject: " + prompt}]}).encode()
req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=body,
  headers={"Authorization":"Bearer "+key, "Content-Type":"application/json"})
r = json.load(urllib.request.urlopen(req, timeout=120))
if "error" in r: sys.exit("error: " + r["error"].get("message","")[:200])
imgs = r["choices"][0]["message"].get("images") or []
if not imgs: sys.exit("no image returned")
url = imgs[0]["image_url"]["url"]; b64 = url.split(",",1)[1]
open(out,"wb").write(base64.b64decode(b64)); print("wrote", out, "cost", r.get("usage",{}).get("cost"))
PY
