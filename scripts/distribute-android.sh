#!/usr/bin/env bash
# Builds the signed release APK of apps/mobile (Kinfall) and uploads it to Firebase App Distribution.
#
#   scripts/distribute-android.sh [--dry-run] [--config prd] [--groups testers] [--notes "text"]
#
# Secrets come from Doppler (project kinfall, config prd by default) through `doppler run`; nothing
# is written into the repository and no secret value is printed. See docs/distribution.md.
#
#   --dry-run       build, sign and verify the APK, print what would be uploaded, upload nothing
#   --config NAME   Doppler config (default: prd)
#   --groups LIST   App Distribution groups, comma separated (default: testers)
#   --notes TEXT    release notes (default: commit subjects since the last tag, or the last 15)
#
# Needs: doppler (logged in), node/npm, a JDK 17+ in JAVA_HOME, the Android SDK in ANDROID_HOME
# (the NDK version React Native asks for is installed by sdkmanager), and for the upload either the
# service account from Doppler (used here) or nothing else.
set -euo pipefail

DOPPLER_PROJECT="${DOPPLER_PROJECT_OVERRIDE:-kinfall}"
CONFIG="prd"
DIST_GROUPS="testers"
NOTES=""
DRY_RUN=0
INSIDE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --config) CONFIG="$2"; shift ;;
    --groups) DIST_GROUPS="$2"; shift ;;
    --notes) NOTES="$2"; shift ;;
    --inside-doppler) INSIDE=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
MOBILE="$REPO_ROOT/apps/mobile"

# Re-run this script inside `doppler run`, so the secrets exist only in this process tree.
if [ "$INSIDE" -eq 0 ]; then
  command -v doppler >/dev/null || { echo "doppler CLI not found" >&2; exit 1; }
  args=(--inside-doppler --config "$CONFIG" --groups "$DIST_GROUPS")
  [ "$DRY_RUN" -eq 1 ] && args+=(--dry-run)
  [ -n "$NOTES" ] && args+=(--notes "$NOTES")
  exec doppler run -p "$DOPPLER_PROJECT" -c "$CONFIG" -- bash "$SCRIPT_PATH" "${args[@]}"
fi

for name in SIGNING_KEYSTORE_BASE64 SIGNING_STORE_PASSWORD SIGNING_KEY_ALIAS SIGNING_KEY_PASSWORD FIREBASE_APP_ID FIREBASE_SERVICE_ACCOUNT_JSON; do
  if [ -z "${!name:-}" ]; then
    echo "Missing secret $name in Doppler $DOPPLER_PROJECT/$CONFIG (see docs/distribution.md)" >&2
    exit 1
  fi
done

# Native Windows tools (Java, Gradle) need Windows paths; elsewhere this is a no-op.
native_path() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

WORK="$(mktemp -d)"
PKG_BACKUP="$WORK/package.json"
cp "$MOBILE/package.json" "$PKG_BACKUP"
cleanup() {
  # `expo prebuild` rewrites the "android" script in apps/mobile/package.json: put it back.
  cp "$PKG_BACKUP" "$MOBILE/package.json"
  rm -rf "$WORK"
}
trap cleanup EXIT

KEYSTORE="$WORK/release.jks"
printf '%s' "$SIGNING_KEYSTORE_BASE64" | base64 -d > "$KEYSTORE"
export ANDROID_SIGNING_STORE_FILE="$(native_path "$KEYSTORE")"

cd "$REPO_ROOT"
VERSION_NAME="$(node -p "require('./apps/mobile/app.json').expo.version")"
# versionCode = number of commits on HEAD: grows with every commit, needs the full history.
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  echo "Shallow clone: the version code (commit count) would be wrong. Fetch the full history." >&2
  exit 1
fi
VERSION_CODE="$(git rev-list --count HEAD)"
COMMIT="$(git rev-parse --short HEAD)"
DIRTY=""
git diff --quiet HEAD -- . ':!apps/mobile/package.json' || DIRTY=" (uncommitted changes)"

if [ -z "$NOTES" ]; then
  if LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null)"; then
    RANGE="$LAST_TAG..HEAD"; SINCE="since $LAST_TAG"
  else
    RANGE="-15"; SINCE="last 15 commits"
  fi
  # shellcheck disable=SC2086
  NOTES="Kinfall $VERSION_NAME ($VERSION_CODE), commit $COMMIT$DIRTY. Changes ($SINCE):
$(git log $RANGE --no-merges --pretty='- %s')"
fi

echo "Building Kinfall $VERSION_NAME (versionCode $VERSION_CODE, commit $COMMIT$DIRTY)"

cd "$MOBILE"
npx expo prebuild --platform android --no-install
cd "$MOBILE/android"
./gradlew assembleRelease --no-daemon -PrequireReleaseSigning=true -PappVersionCode="$VERSION_CODE"

APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] || { echo "APK not found: $APK" >&2; exit 1; }

# Refuse an APK signed with the debug key.
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -n 1)"
APKSIGNER="$BUILD_TOOLS/apksigner"
[ -f "$APKSIGNER.bat" ] && APKSIGNER="$APKSIGNER.bat"
CERTS="$("$APKSIGNER" verify --print-certs "$(native_path "$APK")")"
if printf '%s' "$CERTS" | grep -qi "CN=Android Debug"; then
  echo "The APK is signed with the debug key. Not uploading." >&2
  exit 1
fi
printf '%s\n' "$CERTS" | grep -E "certificate DN|SHA-256 digest" | head -n 2

OUT="$REPO_ROOT/apps/mobile/android/kinfall-$VERSION_NAME-$VERSION_CODE.apk"
cp "$APK" "$OUT"
( cd "$(dirname "$OUT")" && sha256sum "$(basename "$OUT")" | tee "$(basename "$OUT").sha256" )
echo "APK: $OUT ($(wc -c < "$OUT") bytes)"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run: would upload to app \$FIREBASE_APP_ID, groups '$DIST_GROUPS', with these notes:"
  printf '%s\n' "$NOTES"
  exit 0
fi

SA_FILE="$WORK/firebase-sa.json"
printf '%s' "$FIREBASE_SERVICE_ACCOUNT_JSON" > "$SA_FILE"
export GOOGLE_APPLICATION_CREDENTIALS="$(native_path "$SA_FILE")"
if command -v firebase >/dev/null; then FIREBASE=(firebase); else FIREBASE=(npx --yes firebase-tools@15); fi
"${FIREBASE[@]}" appdistribution:distribute "$(native_path "$OUT")" \
  --app "$FIREBASE_APP_ID" \
  --groups "$DIST_GROUPS" \
  --release-notes "$NOTES"
