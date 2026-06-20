# VS Code Extension Publishing

The VS Code extension is published by `.github/workflows/vscode-extension.yml`.
It uses a separate release tag prefix from the browser extension workflows:

- VS Code Marketplace and Open VSX Registry: `vscode-extension-v<package.json version>`
- Chrome Web Store and Firefox Add-ons: `browser-extension-v<browser-extension/manifest.json version>`

For example, publishing VS Code extension version `0.18.8` uses:

```bash
git tag vscode-extension-v0.18.8
git push origin vscode-extension-v0.18.8
```

Publishing browser extension version `0.1.2` still uses:

```bash
git tag browser-extension-v0.1.2
git push origin browser-extension-v0.1.2
```

## Marketplace Setup

The workflow expects a GitHub Actions environment named `vscode-marketplace`
with two secrets:

- `VSCE_PAT`
- `OVSX_PAT`

Create that token from Azure DevOps with these values:

- Organization: `wilmtang`
- Scopes: `Custom defined`
- Marketplace: `Manage`

This account's Azure DevOps organization is reachable through the legacy
organization URL:

```text
https://wilmtang.visualstudio.com/_usersSettings/tokens
```

The `dev.azure.com/wilmtang` URL can show a 404 for this org even though the
organization appears on the Azure DevOps profile page.

Then create or verify the publisher in the Visual Studio Marketplace publisher
management page:

```text
https://marketplace.visualstudio.com/manage/publishers/
```

Use the same Microsoft account that owns the Azure DevOps token. The publisher
ID must match `publisher` in `package.json`; this repository currently uses:

```json
"publisher": "wilmtang"
```

If the publisher does not exist yet, create it from the marketplace page. The
required fields are:

- ID: `wilmtang`
- Name: `wilmtang`

After creating the publisher, verify the PAT locally if needed:

```bash
npx vsce login wilmtang
```

## Open VSX Setup

Create or verify the `wilmtang` namespace in Open VSX, then generate an access
token from the Open VSX user settings. The namespace must match the `publisher`
field in `package.json`.

If the namespace has not been created yet, run:

```bash
npx ovsx create-namespace wilmtang -p <open-vsx-token>
```

The workflow publishes the already-packaged VSIX using the `OVSX_PAT`
environment secret.

## GitHub Setup

In GitHub, open the repository settings and add the secrets:

```text
Settings > Environments > vscode-marketplace > Environment secrets > Add secret
```

Use these names:

- Name: `VSCE_PAT`
- Value: the Azure DevOps Personal Access Token
- Name: `OVSX_PAT`
- Value: the Open VSX access token

The environment can optionally require manual approval before publishing. The
workflow still validates and uploads a VSIX artifact without that approval.

## Release Flow

1. Update `package.json` version and `CHANGELOG.md`.
2. Run the local VS Code release check:

```bash
npm run release:vscode:local
```

This lints the extension and packages `dist/vscode-leetcode-auth-sync.vsix`,
matching the validation gates used by the GitHub Actions release workflow.

3. Merge the release commit to `main`.
4. Push a matching VS Code extension tag:

```bash
git tag vscode-extension-v$(node -p "require('./package.json').version")
git push origin vscode-extension-v$(node -p "require('./package.json').version")
```

The publish job verifies that the tag suffix exactly matches `package.json`.
If the version and tag do not match, the job fails before publishing to both
registries. When the tag matches, the same VSIX is published to the VS Code
Marketplace first and then to the Open VSX Registry. Duplicate versions are
skipped so a retried release job can finish cleanly.

You can also run the workflow manually from GitHub Actions with `publish=true`.
Manual publishing uses the current checked-out `package.json` version and does
not require a tag. It publishes to both registries.

## Manual Upload Fallback

The Visual Studio Marketplace publisher hub can upload a packaged VSIX directly
from the publisher page:

```bash
npm run release:vscode:local
```

Then open:

```text
https://marketplace.visualstudio.com/manage/publishers/wilmtang
```

Choose `New extension > Visual Studio Code`, select the VSIX, and upload it.
This can publish a release without a PAT, but it does not replace the PAT for
GitHub Actions automation. Automated release tags still need `VSCE_PAT`.

To publish the same packaged VSIX to Open VSX manually, run:

```bash
OVSX_PAT=<open-vsx-token> npm run publish:vscode:open-vsx -- dist/vscode-leetcode-auth-sync.vsix
```
