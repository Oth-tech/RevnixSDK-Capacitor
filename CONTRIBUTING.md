# Contributing

This guide provides instructions for contributing to this Capacitor plugin.

## Developing

### Local Setup

1. Fork and clone the repo **with submodules** — the native SDKs live in
   `ios/Revnix` and `android/revnix-kotlin`:

    ```shell
    git clone --recurse-submodules <your fork>
    # or, in an existing checkout:
    git submodule update --init
    ```

1. Install the dependencies.

    ```shell
    npm install
    ```

1. Install SwiftLint if you're on macOS.

    ```shell
    brew install swiftlint
    ```

### Scripts

#### `npm run build`

Build the plugin web assets and generate plugin API documentation using [`@capacitor/docgen`](https://github.com/ionic-team/capacitor-docgen).

It will compile the TypeScript code from `src/` into ESM JavaScript in `dist/esm/`. These files are used in apps with bundlers when your plugin is imported.

Then, Rollup will bundle the code into a single file at `dist/plugin.js`. This file is used in apps without bundlers by including it as a script in `index.html`.

#### `npm test`

Build, then run the tests in `test/` against the compiled output in `dist/esm/` with Node's test runner. The iOS bridge's XCTest suite runs separately with `npm run verify:ios:test` (iPhone 17 Pro simulator).

#### `npm run verify`

Build and validate the web and native projects.

This is useful to run in CI to verify that the plugin builds for all platforms.

#### `npm run lint` / `npm run fmt`

Check formatting and code quality, autoformat/autofix if possible.

This template is integrated with ESLint, Prettier, and SwiftLint. Using these tools is completely optional, but the [Capacitor Community](https://github.com/capacitor-community/) strives to have consistent code style and structure for easier cooperation.

## Publishing

Releases are automated; do not run `npm publish` by hand. Every merge to
revnix-app's `main` dispatches this repo's `Release` workflow
(`.github/workflows/release.yml`), which:

1. builds and tests `main`;
2. moves the native submodules to their upstream `main` and bumps the
   `revnix-react` dependency to the version just released;
3. reads `## Unreleased` in `CHANGELOG.md` to pick the bump —
   `### Breaking` → major, `### Added` → minor, anything else → patch, empty →
   patch with a lockstep note (the version always moves, by decision);
4. bumps `package.json` / `package-lock.json`, dates the changelog entry
   (the submodule and dependency moves are appended under `### Changed`),
   regenerates the docgen blocks in `README.md`, and lands it all through a
   pull request merged with a merge commit (the org ruleset allows nothing
   else on `main`);
5. checks the tarball carries the native sources, publishes via npm trusted
   publishing (OIDC), then tags `vX.Y.Z` and `X.Y.Z` (the podspec fetches the
   bare one) and cuts a GitHub release.

So the only thing a change needs is a bullet under the right `###` heading in
`## Unreleased`. Run it by hand from the Actions tab (`bump` and
`revnix_react_version` can be forced).

One-time setup (an npm owner): on npmjs.com, package `revnix-capacitor` →
Settings → Trusted Publisher → GitHub Actions, organisation `Oth-tech`,
repository `RevnixSDK-Capacitor`, workflow `release.yml`.

> **Note**: The [`files`](https://docs.npmjs.com/cli/v7/configuring-npm/package-json#files) array in `package.json` specifies which files get published. If you rename files/directories or add files elsewhere, you may need to update it — and the release's tarball check in the workflow.
