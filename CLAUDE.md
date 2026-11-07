# RevnixSDK-Capacitor

Capacitor plugin `revnix-capacitor` (version in `package.json`; it moves with every release). Peer dep `@capacitor/core >=8.0.0`. Revnix purchases (StoreKit 2 / Play Billing), entitlements, paywalls, A/B, attribution over the Revnix `/v1` API (backend `../revnix-app`). Plugin name `Revnix`. Repo `Oth-tech/RevnixSDK-Capacitor` (public), default branch `main`.

## It is a thin bridge, not a reimplementation
- iOS bridges the Swift SDK: git submodule `ios/Revnix` = `Oth-tech/RevnixSDK-iOS` (local source of truth `../RevnixSDK-iOS`).
- Android bridges the Kotlin SDK: git submodule `android/revnix-kotlin` = `Oth-tech/RevnixSDK-Android` (`../RevnixSDK-Android`).
- Web (`src/web.ts`) delegates to npm `react-native-revnix` (`RevnixClient`), the canonical TS client (`../revnix-sdk`).
- All HTTP, retry queues, entitlement caching and store observers live in those three. Never fix SDK logic here: fix upstream, then re-pin the submodule / bump the RN version. Never edit the submodule copies.
- Submodules are compiled straight into the plugin (podspec globs `ios/Revnix/Sources/Revnix/**`; `android/build.gradle` adds the Kotlin source dirs), not pulled from a registry. `package.json` `files` must keep shipping them; the release checks the tarball.
- Fresh clone: `git clone --recurse-submodules` or `git submodule update --init`.

## Stack
- TypeScript 5.9; `tsc` → `dist/esm`; rollup 4 (`rollup.config.mjs`) → `dist/plugin.js` (iife `capacitorRevnix`) + `dist/plugin.cjs.js`; externals `@capacitor/core`, `react-native-revnix`.
- Android (`android/build.gradle`): Kotlin 2.2.20, AGP 8.13.0, compileSdk/targetSdk 36, minSdk 24, JVM 21, namespace `com.revnix.capacitor`; billing-ktx 8.3.0, installreferrer, play integrity, okhttp, kotlinx-serialization.
- iOS: deployment target 16.0, swift-tools 5.9; pod `RevnixCapacitor` (`RevnixCapacitor.podspec`), SPM product `RevnixCapacitor` / target `RevnixPlugin` (`Package.swift`, depends on capacitor-swift-pm >=8 + local `ios/Revnix`).
- Tests: `node --test test/*.test.mjs` against `dist/esm` (jsdom devDep); iOS XCTest in `ios/Tests/RevnixPluginTests`; Android has only template stubs.

## Layout
- `src/definitions.ts` (~700 lines): `RevnixPlugin` interface + types. `docgen` reads it and writes `docs/API.md` + `dist/docs.json` (CONTRIBUTING.md and a release.yml comment still say README; the script's `--output-readme docs/API.md` is what runs).
- `src/index.ts` (`registerPlugin('Revnix', {web})`), `src/web.ts`, `src/ui.ts` (`renderRevnixPaywall()` DOM renderer), `src/blocks.ts` (~2000 lines, block-document renderer), `src/locale.ts`.
- `android/src/main/kotlin/com/revnix/capacitor/RevnixPlugin.kt`; `ios/Sources/RevnixPlugin/RevnixPlugin.swift`.
- `scripts/release.mjs` (CI version/changelog tool), `test/*.test.mjs` + two `paywall-*-wire.json` fixtures, `dist/` (gitignored build output), `docs/`.

## Plugin surface (`src/definitions.ts`)
configure, getCustomerId, logout, identify, getEntitlements, getCachedEntitlements, isEntitled, waitForEntitlements, registerPurchase, purchase, restore, retryPendingPurchases, pendingPurchaseCount, resolvePlacement, registerInstall, updateSkanConversionValue, logPaywallShown, logPaywallClosed, logPaywallEvent, logAdRevenue, track, flushEvents, preload, setAttribution, setPushToken, requestTrackingAuthorization, setAttributes, handleDeepLink, resolveDeepLink, getLastDeepLink, getAttribution, handleInstallReferrer, addListener (4 overloads), removeAllListeners.
- `configure({apiKey, baseUrl, timeoutMs?, entitlementsTtlMs?, offlineMaxCacheAgeMs?, …})`: apiKey = publishable `rvx_pk_live_…` / `rvx_pk_test_…`, baseUrl `https://<deployment>.convex.site`. Both required natively.
- Adding or changing a method = `definitions.ts` + Swift + Kotlin + `web.ts` + a test, and the native SDK must already expose it. Errors reject with `code` + `data.isRetryable`.
- `configure` starts the store observer (iOS `RevnixStoreKit.startObserving` on `Transaction.updates`; Android replays Play Billing purchases). Observed transactions are registered with proof and finished, so a later JS `registerPurchase` of the same one returns `duplicate: true`. Re-`configure` cancels the old observer. Web has no store flow.

## Commands (`package.json`)
```bash
npm ci
npm test                 # build (clean + docgen + tsc + rollup) then node --test; what CI runs
npm run build
npm run lint             # eslint + prettier --check + swiftlint; not run in CI
npm run verify:android   # cd android && ./gradlew clean build test; needs JAVA_HOME=/opt/homebrew/opt/openjdk@21
npm run verify:ios:test  # xcodebuild test on iPhone 17 Pro simulator; blocked on this Mac (Xcode license)
```
- Never `npm publish` by hand. `npm test` rewrites `dist/` and `docs/API.md`.

## Git, CI, release
- `.github/workflows/ci.yml`: PRs to `main` + manual; ubuntu, Node 22, `npm ci` + `npm test`. No Android/iOS build in CI.
- `.github/workflows/release.yml`: dispatch only (inputs bump, version, react_native_revnix_version, app_sha, run_key), dispatched by `../revnix-app/.github/workflows/release-sdks.yml` (job `revnix-capacitor`, after the `react-native-revnix` job, passing the new RN version). Steps: GitHub App token for submodules, move submodules to upstream `main`, follow latest `react-native-revnix` (polls npm until the version is visible), skip if nothing changed, version from `## Unreleased` in `CHANGELOG.md` via `scripts/release.mjs`, PR `release/vX.Y.Z` merged with `--merge`, tarball must contain the native sources, `npm publish --access public`, tags `vX.Y.Z` and bare `X.Y.Z` (podspec uses the bare one), GitHub release.
- Every user-visible change gets a bullet under `## Unreleased` (`### Breaking` → major, `### Added` → minor, else patch). Never hand-bump or tag.
- PR CI tests the lockfile's `react-native-revnix`; the release tests the latest. When an RN release changes web behavior, bump the RN dependency here in the same PR.
- Merge commits only into `main` (ruleset; squash is refused). Opposite of revnix-app, which squash-merges into `dev`.

## Gotchas
- `/usr/bin/git` is blocked by the Xcode license prompt on this Mac; use `/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git`. That binary has no `submodule` subcommand here, so read `ios/Revnix` / `android/revnix-kotlin` directly to see what is pinned.
- Local Android builds need Homebrew `openjdk@21` via an explicit `JAVA_HOME` (`java_home -v 21` lookups were unreliable).
