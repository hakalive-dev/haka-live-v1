#!/usr/bin/env bash
# Capture native crashes when reproducing Discover → Video on APK.
# Usage: ./scripts/video-tab-logcat.sh
set -euo pipefail
echo "Reproduce: open app → Discover → Video tab. Press Ctrl+C when done."
adb logcat -c
adb logcat -s AndroidRuntime:E ExoPlayerImpl:E ExoPlayerImplInternal:E ReactNativeJS:E ReactNativeJNI:E
