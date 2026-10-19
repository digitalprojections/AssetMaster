# AssetMaster MCP companion

Connect a local AI application to the AssetMaster browser editor. Version 1.1.19 uses the official MCP TypeScript SDK v2 and stdio transport. The companion must run on the same computer as the browser.

## Windows download

Download and extract the Windows x64 archive from AssetMaster's AI integrations page. Run `install.ps1` in PowerShell. The package bundles the Node.js runtime, server, licenses, a command launcher and an uninstaller; no separate Node.js installation is needed. The installer prints a client configuration and installs only under your local application-data folder. It does not alter AI-client settings, register a background service, or add startup tasks.

This initial package is unsigned unless the release manifest reports a verified Authenticode signature. SHA-256 checksums detect download corruption; they do not substitute for publisher signing.

Select the folder you want the agent to use:

```powershell
powershell -NoProfile -File .\install.ps1 -Workspace 'C:\Users\you\Pictures\AssetMaster'
```

Paste the emitted `mcpServers` entry into a compatible client's settings. Clients with a different settings format need the same executable and arguments in their own format. Client-specific installation shortcuts are not claimed as tested.

## npm / other operating systems

With Node.js 22 or newer, install the supplied tarball:

```text
npm install -g ./assetmaster-mcp-server-1.1.19.tgz
assetmaster-mcp --config --workspace /absolute/path/to/assets
```

The package is independently buildable and ready for npm publication, but a package name on the public registry is not claimed until publication and readback have completed. Do not use an unverified similarly named package.

## Pair your editor

1. Add the emitted executable/arguments to your AI application and start its MCP connection.
2. Ask it to call `assetmaster_status`. Open the returned local `pairingUrl` directly in your browser.
3. Follow **Open AssetMaster to connect**, then choose **Connect workspace**. For local development pass `--origin http://localhost:3001` so this link opens the development editor.
4. If your browser asks, allow local network access for AssetMaster. Keep both the local pairing page and editor tab open. The pairing page relays messages using the exact origin and opened-window identity; the hosted editor does not need to fetch localhost directly. The **AI integrations** button shows connection status and lets you disconnect.
5. Ask the agent to inspect state, import an image, create a cutout, preview it, and export a PNG to a new filename.

Pairing expires after ten minutes. One workspace can connect to a companion at a time. Credentials stay in memory. Reloading/closing the editor loses the connection. Disconnect, refresh the local pairing page, and pair again; restarting the companion also creates fresh credentials. A different AI-client connection needs its own companion port (`--port 0` chooses a free one).

## Tools

- `assetmaster_status`: connection and setup URL, without pairing secrets.
- `assetmaster_get_state`: editor state, command capabilities and cutout undo/redo availability.
- `assetmaster_list_assets`: paginated metadata and stable cutout IDs, without image data.
- `assetmaster_import_image`: PNG/JPEG/WebP from the configured folder; saved cutouts are preserved.
- `assetmaster_create_cutout`: source-pixel rectangle or polygon, optional feathering, saved transparent PNG.
- `assetmaster_preview`: source/cutout PNG preview up to 1024px per edge.
- `assetmaster_export_png`: full-resolution PNG to a new file in the configured folder, never overwriting.
- `assetmaster_undo_cutout`: undo or redo cutouts created during the current pairing.
- `assetmaster_editor_command`: existing selection, zoom, overlay and animation commands.
- `assetmaster_batch_commands`: sequential editor commands, stopping at the first error. Earlier edits remain applied.

The resource `assetmaster://workflow` describes usage and recovery. This release does not expose every collage or animation editing feature through MCP. Existing animation commands require the studio to be open and report available before use.

## Privacy and file access

No folder is accessible unless `--workspace` is explicitly configured. File paths and resolved directory links must stay inside it. Choose a dedicated assets folder. The browser-message relay accepts only the exact opened editor window and configured origin. The companion binds to `127.0.0.1`, validates HTTP Host and exact allowed browser origins, and requires a short-lived pairing code followed by a per-session credential. Pairing secrets never appear in MCP tool results or persistent configuration.

Editing runs in the browser. Metadata, requested previews, and any other returned content are passed to your AI application and may be sent to its model provider. Local processing does not imply that the AI provider receives no data. AssetMaster does not add a remote relay in this release.

The 20 MiB encoded-file transfer budget, 32 Mi-pixel decoded-image budget, 16384px edge, and 32 MiB HTTP body budget bound memory use. Preview size is capped to reduce agent context. Cutout undo keeps up to 100 creation IDs; redo retains up to 100 images within a 64 MiB string-memory budget. Older history is discarded when these budgets are reached. These are technical resource limits, not paid-tier restrictions.

## Diagnostics and recovery

```text
assetmaster-mcp --version
assetmaster-mcp --doctor --workspace /absolute/path/to/assets
assetmaster-mcp --config --workspace /absolute/path/to/assets
assetmaster-mcp --serve --workspace /absolute/path/to/assets
```

The default port is 38475; `--port 0` selects an available one. `--doctor` checks the runtime, workspace and port, then exits. It does not claim a live browser connection. `--serve` starts only the browser bridge for manual diagnostics. Normal MCP startup logs only to stderr; stdout is reserved for protocol messages.

On timeout, the operation's outcome is unknown. Reconnect and inspect the editor before repeating an edit. Cutout undo/redo is scoped to the current pairing; other assets remain untouched. Animation undo/redo follows Animation Studio's history.

## Updates and uninstall

Install a new version alongside the previous one, review its configuration, and update the client's executable path. Restart the client's MCP connection. Keep the older version for rollback until the new one passes your workflow.

Stop the MCP connection before running the installed `uninstall.ps1`. It removes only that version's companion files. User images, exports, browser projects and client settings are preserved. To uninstall an npm installation, use `npm uninstall -g assetmaster-mcp-server`.

## Development and release checks

From the repository root:

```text
npm run mcp:install
npm run mcp:verify
npm run verify
npm run mcp:package
npm run build
```

`mcp:package` builds the bundled server, collects third-party licenses, creates an npm tarball and Windows x64 archive, validates runtime checksums, and writes release metadata and download checksums. `release:mcp` runs the checks and packaging together. Generated downloads are copied into `public/downloads/` for the website build.

For a signed release supply `-SigningCertificateThumbprint` to `scripts/package-mcp.ps1`. The script uses PowerShell Authenticode signing and verifies the result. Without a configured certificate it records an unsigned preview package. Do not represent that package as signed.

`mcp/scripts/browser-smoke.mjs` drives the real MCP protocol against a manually paired browser, using a disposable fixture in `.browser-test/mcp/`. It verifies import, polygon cutting, preview, PNG dimensions, undo/redo, committed state, batching, invalid bounds, overwrite rejection and disconnect. Unit/protocol tests run without a browser; browser proof is a separate check.
