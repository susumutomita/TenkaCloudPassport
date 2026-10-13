#!/usr/bin/env bash
set -euo pipefail
output="$(pwd)/release-output/store-screenshots"
app_binary=/tmp/passport-store-app/Build/Products/Release-iphonesimulator/TenkaCloudPassport.app
ruby tests/ios-learning/generate-project.rb /tmp/PassportStoreScreenshots PassportStoreScreenshots "$(pwd)/tests/ios-store-screenshots/PassportStoreScreenshots.swift" local.passport.store.screenshots
runtime=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; rows=[x for x in json.load(sys.stdin)["runtimes"] if x["isAvailable"] and x["name"]=="iOS 26.5"]; assert len(rows)==1; print(rows[0]["identifier"])')
for pair in 'iphone-medium|iPhone 17 Pro' 'iphone-6.9|iPhone 17 Pro Max' 'ipad-13|iPad Pro 13-inch (M5)'; do
  size=${pair%%|*}
  device=${pair#*|}
  destination="$output/$size"
  mkdir -p "$destination"
  identifier=$(xcrun simctl create "Passport Store $size" "$device" "$runtime")
  printf '%s\n%s\n%s\n' "$device" "$runtime" "$identifier" > "$destination/device.txt"
  xcrun simctl boot "$identifier"
  xcrun simctl bootstatus "$identifier" -b
  xcrun simctl status_bar "$identifier" override --time '9:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100
  xcrun simctl ui "$identifier" appearance light
  xcrun simctl install "$identifier" "$app_binary"
  diagnose_launch() {
    xcrun simctl spawn "$identifier" log show --style compact --last 3m --predicate 'process == "TenkaCloudPassport" OR eventMessage CONTAINS "cloud.tenka.passport"' > "$destination/launch-diagnostics.log" 2>&1 || true
    tail -n 150 "$destination/launch-diagnostics.log"
    for report in "$HOME"/Library/Logs/DiagnosticReports/TenkaCloudPassport*.ips; do
      if test -f "$report"; then cp "$report" "$destination/"; head -n 100 "$report"; fi
    done
  }
  if ! xcrun simctl launch "$identifier" cloud.tenka.passport > "$destination/launch.log" 2>&1; then
    cat "$destination/launch.log"
    diagnose_launch
    exit 1
  fi
  cat "$destination/launch.log"
  xcrun simctl terminate "$identifier" cloud.tenka.passport || true
  if ! xcodebuild test -project /tmp/PassportStoreScreenshots/PassportStoreScreenshots.xcodeproj -scheme PassportStoreScreenshots -destination "platform=iOS Simulator,id=$identifier" -resultBundlePath "$destination/result.xcresult" CODE_SIGNING_ALLOWED=NO > "$destination/test.log" 2>&1; then
    tail -n 110 "$destination/test.log"
    xcrun xcresulttool export attachments --path "$destination/result.xcresult" --output-path "$destination/attachments" || true
    diagnose_launch
    exit 1
  fi
  xcrun xcresulttool export attachments --path "$destination/result.xcresult" --output-path "$destination/attachments"
  xcrun simctl shutdown "$identifier"
done
