#!/usr/bin/env bash
set -euo pipefail

readonly PACKAGE_ROOT="node_modules/llama.rn"
readonly DOWNLOADER_PATH="${PACKAGE_ROOT}/install/download-native-artifacts.js"

bun scripts/llama-native-artifacts.ts inspect "${PACKAGE_ROOT}"
RNLLAMA_SKIP_POSTINSTALL=0 bun "${DOWNLOADER_PATH}" --force
bun scripts/llama-native-artifacts.ts verify "${PACKAGE_ROOT}"
