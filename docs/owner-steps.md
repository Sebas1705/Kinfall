# Owner-only steps and what is not verified

State after the React Native plan ([tasks 1-10](superpowers/plans/2026-11-16-react-native-app.md)) and the first Android tester distribution (branch `distribution`, 2026-11-19). Everything below needs a device, an account, a tool that is not installed on the development machine, or a decision that is the owner's.

## Done on 2026-11-19 (branch `distribution`)

- **Name decided:** the game is **Kinfall**, application id and bundle id `es.sebas1705.kinfall` ([ADR 0002](adr/0002-kinfall-name-and-tester-distribution.md)). The npm packages were renamed afterwards (branch `kinfall-rename`: root `kinfall`, scope `@kinfall/*`); the storage keys (`webgames.run.v1`, `webgames.lang`, `webgames.textSize`) keep the old name so saves survive, and the folder stays until the owner renames it.
- **Android release build:** `expo prebuild` plus `./gradlew assembleRelease` run locally on Windows (NDK 27.1.12297006 installed in the user SDK; Gradle 9.4.1 from the wrapper). The APK bundles the JavaScript (no Metro) and was checked on the emulator. `expo-system-ui` is added, so dark mode follows the system in native builds.
- **Signing:** one upload keystore outside the repository (`C:\Users\sebss\Documents\kinfall-release.jks`), with its base64 and passwords in Doppler project `kinfall` (config `prd`).
- **Firebase:** project `kinfall-sebas1705` (Kinfall), Android app `es.sebas1705.kinfall` with the key's SHA-1 and SHA-256, App Distribution group `testers` (no testers yet), CI service account `kinfall-ci` with only the App Distribution Admin role (key in Doppler).
- **Pipeline:** `scripts/distribute-android.sh` (with `--dry-run`) and the workflow `.github/workflows/distribute-android.yml` (manual at first; since branch `kinfall-rename` it also uploads on pushed `vX.Y.Z` tags); the first release (0.1.0, versionCode 108) was uploaded to group `testers`. On the emulator the same build started without Metro, played in English and Spanish, resumed a battle after a force stop, followed dark mode and passed the self test on Hermes. Details: [docs/distribution.md](distribution.md).

## Owner steps for tester distribution

1. **Add testers** (no one is in group `testers` yet, so nobody has been invited): Firebase console > project Kinfall > App Distribution > Testers & Groups > `testers` > Add testers, or `firebase appdistribution:testers:add --project kinfall-sebas1705 --group-alias testers you@example.com other@example.com`. Then open the 0.1.0 release (App Distribution > Releases) and distribute it to `testers` again, or upload a new build: only testers in the group when a release is distributed get its email.
2. **Back up the keystore off this PC:** copy `C:\Users\sebss\Documents\kinfall-release.jks` and its password (Doppler `kinfall/prd`, `SIGNING_STORE_PASSWORD`) to a password manager or another safe place. Losing it means every tester must uninstall and reinstall Kinfall.
3. **Test on a real phone:** accept the invitation on an Android phone, install Kinfall, play into a battle, kill and reopen the app (Continue run), switch ES/EN and the system dark mode.
4. **Hermes self test on the phone:** with the release build installed, open `kinfall://selftest` (for example from `adb shell am start -a android.intent.action.VIEW -d "kinfall://selftest"` over USB, or a link in a note app). It runs at once; expect **PASS**, `Battle 3/3`, `Run 6/6` and `HermesInternal: present`, and write down the Hermes version and the device model. A FAIL is a core bug: do not update the goldens.
5. **Create the GitHub remote and turn on automatic distribution:** create `Sebas1705/kinfall`, add the repository secret `DOPPLER_TOKEN` (a read-only Doppler service token for `kinfall/prd`), push `main`, then push the tags. From then on, pushing a tag `vX.Y.Z` that matches `apps/mobile/app.json` uploads that build to `testers`. `v0.1.0` was already uploaded by hand and pushing it starts no upload. Exact commands, with no token printed: [Owner steps to activate it](distribution.md#owner-steps-to-activate-it).
6. **Rename the local folder** from `Repos/Sebas1705/webgames` to `Repos/Sebas1705/kinfall` (the npm packages are already `kinfall` / `@kinfall/*`). Stop Metro, editors and Gradle daemons first (`apps/mobile/android/gradlew --stop` if `android/` exists), rename the folder, then run `npm ci` in it: the workspace links in `node_modules/@kinfall` point to the old absolute path. Delete `apps/mobile/android` (it is generated) and, if you want the space back, `~/.cxx`. The storage keys keep the `webgames.*` names on purpose, so saves are not affected.
7. **Before any store listing** (Play internal testing, TestFlight): a Play Console app for `es.sebas1705.kinfall`, Play App Signing with this key as the upload key, an AAB build (`bundleRelease`), a privacy policy and store texts. The name and package id are decided; do this as a separate plan.

## Not verified yet

| Item | Why it is open | What to do |
|---|---|---|
| Determinism on a real phone's Hermes | The self test passed on the Android emulator only (Expo Go and the release build) | Step 4 above, or [Verify on a real phone](../apps/mobile/README.md#verify-on-a-real-phone) with Expo Go |
| Install from App Distribution on a phone | No tester has been added, so no invitation was sent and the install flow (App Tester, unknown sources prompt) was not seen | Steps 1 and 3 above |
| TalkBack and VoiceOver on real devices | TalkBack 16 on the emulator focused the heading, but injected swipes never moved focus; no iOS device or Mac for VoiceOver | Walk each screen with TalkBack on an Android phone and VoiceOver on an iPhone. The checklist in [apps/mobile/ACCESSIBILITY.md](../apps/mobile/ACCESSIBILITY.md) marks what remains |
| Maestro flows | Maestro is not installed on the development machine; the two flows in `apps/mobile/.maestro` (now `appId: es.sebas1705.kinfall`) were only checked against the docs and parsed as YAML | Install [Maestro](https://docs.maestro.dev) and run them as in [Mobile tests](../apps/mobile/README.md#mobile-tests). Watch `scrollUntilVisible` on small screens, `enabled: true` against RN 0.88 accessibility state, and debug-build start time |
| First CI run | The repository has no GitHub remote, so `.github/workflows/ci.yml` has never run (Firefox and WebKit determinism included), nor has `distribute-android.yml` | Create the remote, push, and read the first run. Actions are pinned by major tag (`actions/checkout@v4`, `setup-node@v4`, `setup-java@v4`, `upload-artifact@v4`, `gradle/actions/setup-gradle@v4`, `dopplerhq/cli-action@v3`); consider pinning them by commit SHA |
| Android debug build in CI | The release build runs locally; the `android-debug` job (Linux, `x86_64` only) has not run | First CI run |
| iOS | No Mac; `ios.bundleIdentifier` is set but no iOS build was made | Separate plan |

## Decisions for the owner

- **`kinfall-rename`:** the distribution work is on local `main`; branch `kinfall-rename` (cut from it) adds the package rename and the tag-triggered distribution. Nothing is pushed. Merging the branch, pushing and creating the remote are the owner's calls.
- **Starter not recorded in saves.** A run save does not store the chosen starter, so after a resume the end screen's **New run** uses the first starter. Fixing it needs a save-format change in core (check the goldens afterwards), so it was left out. Decide if it is worth a save version bump.
- **Balance (phase 3).** The game is effectively unwinnable (bots win 0 of 900 runs). That is a separate effort with its own plan: see the [phase 3 handoff](superpowers/notes/2026-11-16-phase-3-handoff.md). Core changes there move the golden files for both apps.

## Out of scope on purpose

No store listing, Play or App Store account, EAS build, push notification, backend or analytics was set up, and none is needed to run, test or distribute the app to testers. Never commit keystores, service account keys or tokens.
