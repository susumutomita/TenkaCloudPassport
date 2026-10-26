#!/usr/bin/env bash
set -euo pipefail
# Each run creates fresh synthetic-data simulators. Never reuse a personal one.
output="$(pwd)/release-output/responsive"
mkdir -p "$output"
xcodebuild -version > "$output/xcode.txt"
git rev-parse HEAD > "$output/source.txt"
ruby tests/ios-learning/generate-project.rb /tmp/PassportResponsiveQA PassportResponsiveQA "$(pwd)/tests/ios-responsive/PassportResponsiveQA.swift" local.passport.responsive.qa
# The iOS 27.1 simulator runtime supports Duo only; the other models use 27.0.
for device_and_runtime in 'iPhone SE (3rd generation)|27.0' 'iPhone 17 Pro|27.0' 'iPhone Duo|27.1' 'iPad Pro 13-inch (M5)|27.0'; do
  device=${device_and_runtime%|*}
  runtime_version=${device_and_runtime##*|}
  runtime=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; version=sys.argv[1]; rows=[x for x in json.load(sys.stdin)["runtimes"] if x["isAvailable"] and x["version"]==version]; assert len(rows)==1, f"Install the iOS {version} simulator runtime"; print(rows[0]["identifier"])' "$runtime_version")
  destination="$output/$device"
  mkdir -p "$destination"
  identifier=$(xcrun simctl create "Passport responsive $device" "$device" "$runtime")
  printf '%s\n%s\n%s\n' "$device" "$runtime" "$identifier" > "$destination/device.txt"
  xcrun simctl boot "$identifier"
  xcrun simctl bootstatus "$identifier" -b
  xcrun simctl install "$identifier" /tmp/passport-responsive-app/Build/Products/Release-iphonesimulator/TenkaCloudPassport.app
  for text_size in large accessibility-extra-extra-extra-large; do
    xcrun simctl ui "$identifier" content_size "$text_size"
    xcodebuild test -project /tmp/PassportResponsiveQA/PassportResponsiveQA.xcodeproj -scheme PassportResponsiveQA -destination "platform=iOS Simulator,id=$identifier" -resultBundlePath "$destination/$text_size.xcresult" CODE_SIGNING_ALLOWED=NO > "$destination/$text_size.log" 2>&1
    xcrun xcresulttool export attachments --path "$destination/$text_size.xcresult" --output-path "$destination/$text_size-attachments"
  done
  xcrun simctl shutdown "$identifier"
done
