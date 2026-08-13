#!/usr/bin/env bash
#
# Vercel build step for AF.
#
# Vercel's build image has no Flutter SDK, so fetch one pinned to the same
# version this project is developed against and build the web bundle with it.
# Vercel caches the working directory between builds, so the clone usually
# only happens on the first deploy.
set -euo pipefail

FLUTTER_VERSION="3.32.2"
FLUTTER_DIR="$PWD/.flutter"

if [ ! -x "$FLUTTER_DIR/bin/flutter" ]; then
  echo "Fetching Flutter $FLUTTER_VERSION..."
  rm -rf "$FLUTTER_DIR"
  git clone https://github.com/flutter/flutter.git \
    --depth 1 --branch "$FLUTTER_VERSION" "$FLUTTER_DIR"
else
  echo "Reusing cached Flutter SDK."
fi

# The build runs as root against a clone owned by another uid; without this
# git refuses to read the SDK's own revision and the flutter tool aborts.
git config --global --add safe.directory "$FLUTTER_DIR"

export PATH="$FLUTTER_DIR/bin:$PATH"
export PUB_CACHE="$PWD/.pub-cache"

flutter --version
flutter pub get
flutter build web --release
