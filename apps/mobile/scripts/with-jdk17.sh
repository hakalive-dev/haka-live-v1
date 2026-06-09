#!/usr/bin/env bash
# React Native / Android Gradle require JDK 17–21. Java 25+ breaks plugin resolution
# (e.g. com.facebook.react.settings) before the app module configures.
set -euo pipefail

need_jdk17() {
  if [[ -z "${JAVA_HOME:-}" ]]; then
    return 0
  fi
  if ! command -v java >/dev/null 2>&1; then
    return 0
  fi
  local ver
  ver="$(java -version 2>&1 | head -1)"
  [[ "$ver" =~ version\ \"(1\.)?((1[789])|2[01])\. ]] && return 1
  [[ "$ver" =~ version\ \"2[5-9] ]] && return 0
  return 0
}

if need_jdk17; then
  for candidate in \
    /usr/lib/jvm/java-1.17.0-openjdk-amd64 \
    /usr/lib/jvm/java-17-openjdk-amd64 \
    /Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home \
    /Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home; do
    if [[ -d "$candidate" ]]; then
      export JAVA_HOME="$candidate"
      export PATH="$JAVA_HOME/bin:$PATH"
      break
    fi
  done
fi

if need_jdk17; then
  echo "error: Android builds need JDK 17–21. Set JAVA_HOME to a supported JDK, then retry." >&2
  java -version 2>&1 || true
  exit 1
fi

exec "$@"
