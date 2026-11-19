# ADR 0002: The game is named Kinfall and its Android build reaches testers only through Firebase App Distribution

- **Status:** accepted
- **Date:** 2026-11-19
- **Area:** naming, release, secrets

## Context

- Until now the project used the placeholder name `webgames` (app name `Webgames`, slug `webgames`, package id `app.webgames.placeholder`), and no native build had ever been made.
- The owner wants the first installable Android build in testers' hands, the same way the other apps (Folio, YouKnow, Omni-Impostor) already ship tester builds: Firebase App Distribution, group `testers`, secrets in Doppler, never a public GitHub Release for an APK.
- An Android application id cannot change after a build has been installed by testers (or listed in a store) without it becoming a different app, and a release key cannot be replaced without every tester reinstalling. Both had to be decided before the first upload.

## Decision

- The game is named **Kinfall** (both languages). The Expo app is `name: Kinfall`, `slug: kinfall`, `scheme: kinfall`, and the Android application id and iOS bundle id are `es.sebas1705.kinfall`, following the owner's `es.sebas1705.*` convention. The web page title and header say Kinfall too (`app.title`).
- The npm packages take the new name too (amended 2026-11-19, branch `kinfall-rename`): root package `kinfall`, workspace scope `@kinfall/*` (`@kinfall/core`, `@kinfall/web`, `@kinfall/mobile`). They are private and never published, so the rename only touches imports, workspace filters and the lockfile.
- The storage keys keep the old name on purpose: `webgames.run.v1`, `webgames.lang` and `webgames.textSize`. Renaming them would orphan existing saves and settings in browsers and on testers' phones; a rename would need a one-time migration that copies the old keys first. The golden files do not contain package names, so the rename leaves them byte-identical.
- The local folder stays `Repos/Sebas1705/webgames` until the owner renames it to `kinfall`. A future GitHub repository should be `Sebas1705/kinfall`; renaming the folder and creating the remote are owner steps ([owner-steps.md](../owner-steps.md)).
- Android tester builds are release-variant APKs (JS bundled with Hermes, no Metro), signed with one upload key kept outside the repository, and are uploaded to Firebase project `kinfall-sebas1705`, group `testers`, by `scripts/distribute-android.sh`. Secrets live in Doppler project `kinfall`. The pipeline is described in [docs/distribution.md](../distribution.md).

## Consequences

- Testers install Kinfall from the App Distribution invitation; later builds update in place as long as the same key and application id are used.
- The application id is now fixed. Changing it means a new Firebase app registration and a separate app on testers' phones.
- Losing the keystore means a new key and every tester uninstalling and reinstalling (local saves are lost). The keystore must be backed up off this PC.
- Old placeholder identifiers remain only in the storage keys (and the local folder until it is renamed); they are not visible to players.

## Alternatives considered

- Keep the placeholder until a store listing: rejected, because the first tester install would have pinned the placeholder application id.
- EAS Build and EAS Submit: not used; they add an Expo account and a hosted build service, while the owner's other apps already use local Gradle builds plus App Distribution.
- Attach the APK to a GitHub Release: not used. This APK embeds no secret, but the owner's rule is that app builds go through App Distribution.
