#!/bin/zsh
# Archive the app and send it to TestFlight. No phone cable, no Xcode window.
#
#   apps/ios/scripts/testflight.sh            archive + upload
#   apps/ios/scripts/testflight.sh --archive  archive + export only (no upload)
#
# Signing is automatic through an App Store Connect API key (Admin role), read
# from ~/.config/op-guard/asc.env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH.
# The build number is the UTC minute, so every upload is higher than the last.
set -eo pipefail
source ~/.config/op-guard/asc.env
cd "$(dirname "$0")/.."

OUT=/tmp/ov-testflight
BUILD=$(date -u +%Y%m%d%H%M)
DEST=upload; [[ "${1:-}" == "--archive" ]] && DEST=export
AUTH=(-allowProvisioningUpdates
  -authenticationKeyPath "$ASC_KEY_PATH"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID")

mkdir -p "$OUT"
# ponytail: iPhone only on TestFlight; iPad needs its own icon set and
# all four orientations, add both when an iPad build matters.
xcodebuild archive -project OpenVitals.xcodeproj -scheme OpenVitals \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$OUT/OpenVitals.xcarchive" \
  CURRENT_PROJECT_VERSION="$BUILD" TARGETED_DEVICE_FAMILY=1 \
  "${AUTH[@]}" | tail -5

cat > "$OUT/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$DEST</string>
  <key>teamID</key><string>9SRWEPF965</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
EOF

xcodebuild -exportArchive -archivePath "$OUT/OpenVitals.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" \
  "${AUTH[@]}" | tail -5
echo "build $BUILD: $DEST done"
