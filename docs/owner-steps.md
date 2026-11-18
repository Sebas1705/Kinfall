# Owner-only steps and what is not verified

State after the React Native plan ([tasks 1-10](superpowers/plans/2026-11-16-react-native-app.md)) on branch `rn-monorepo`. Everything below needs a device, an account, a tool that is not installed on the development machine, or a decision that is the owner's.

## Not verified yet

| Item | Why it is open | What to do |
|---|---|---|
| Determinism on a real phone's Hermes | The self test passed on the Android emulator only | Follow [Verify on a real phone](../apps/mobile/README.md#verify-on-a-real-phone): Dev tools, Self test, Run self test; expect PASS and the current golden counts. Note the Hermes version and device model. A FAIL is a core bug: do not update the goldens |
| TalkBack and VoiceOver on real devices | TalkBack 16 on the emulator focused the heading, but injected swipes never moved focus; no iOS device or Mac for VoiceOver | Walk each screen with TalkBack on an Android phone and VoiceOver on an iPhone. The checklist in [apps/mobile/ACCESSIBILITY.md](../apps/mobile/ACCESSIBILITY.md) marks what remains |
| Maestro flows | Maestro is not installed on the development machine; the two flows in `apps/mobile/.maestro` were only checked against the docs and parsed as YAML | Install [Maestro](https://docs.maestro.dev) and run them as in [Mobile tests](../apps/mobile/README.md#mobile-tests). Watch `scrollUntilVisible` on small screens, `enabled: true` against RN 0.88 accessibility state, and debug-build start time |
| First CI run | The repository has no GitHub remote, so `.github/workflows/ci.yml` has never run (Firefox and WebKit determinism included) | Create the remote, push, and read the first run. Actions are pinned by major tag (`actions/checkout@v4`, `setup-node@v4`, `setup-java@v4`, `upload-artifact@v4`, `gradle/actions/setup-gradle@v4`); consider pinning them by commit SHA |
| Android debug build | `expo prebuild` works locally, but `./gradlew assembleDebug` never ran: Gradle 9.4.1 (the wrapper's) and the NDK are not installed here | The `android-debug` CI job is the first real check; or install the NDK and run the commands in [CI](../README.md#ci) |
| `expo-system-ui` warning | Expo warns "userInterfaceStyle: Install expo-system-ui": dark mode may not follow the system in a native build. Expo Go is unaffected | Decide whether to add `expo-system-ui` before any native build ships. Not changed in this plan |

## Decisions for the owner

- **`rn-monorepo`:** the branch is not merged and not pushed. Merging it, pushing it and creating the remote are the owner's calls.
- **Starter not recorded in saves.** A run save does not store the chosen starter, so after a resume the end screen's **New run** uses the first starter. Fixing it needs a save-format change in core (check the goldens afterwards), so it was left out. Decide if it is worth a save version bump.
- **Balance (phase 3).** The game is effectively unwinnable (bots win 0 of 900 runs). That is a separate effort with its own plan: see the [phase 3 handoff](superpowers/notes/2026-11-16-phase-3-handoff.md). Core changes there move the golden files for both apps.

## Out of scope on purpose (store publishing)

No store listing, signing key, Play or App Store account, EAS build, push notification, backend or analytics was set up, and none is needed to run or test the app. If you decide to publish later (Play internal testing, TestFlight), it needs your accounts and signing keys, a real app name, slug and package id (the current `Webgames`, `webgames` and `app.webgames.placeholder` are placeholders), and a decision about the project name. Do it as a separate plan; never commit keystores or tokens.
