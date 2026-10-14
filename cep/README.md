# CEP extension

## Node.js dependencies

The `node_modules` folder is committed to the repository and is the source of truth
for the Node.js packages shipped with the extension. They are not installed by any
build step.

`package.json` exists only so Software Composition Analysis (SCA) tools can identify
those packages. It lists every top-level package in `node_modules` with the exact
installed version. CEP 11 runs Node.js 15.9.0.

### Updating a package

1. Replace the package folder in `node_modules` with the new version.
2. Update its version in `package.json` so both stay in sync.
3. Rebuild and sign the ZXP (see the root `README.md`); users only receive changes
   through the signed ZXP.

**Notes:**
- Running `npm install` is not needed. It rebuilds `node_modules` from `package.json`
  and will likely add, move, or update nested packages. If a lockfile is ever
  required, `npm install --package-lock-only --ignore-scripts` might generate it
  without touching `node_modules`; check `git status node_modules` afterwards.
