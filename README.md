# AssetMaster

Image cutouts, background cleanup, collages, sprite sheets, and frame animation.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

The development server uses `http://localhost:3001` and stops if that port is unavailable.

## Import Animation Frames

For video, use **Choose Video**, watch the preview, then select start and end times with the sliders, time fields, or **Use Playback Position**. **Play Selected Range** previews the chosen interval; **Extract Selected Range** creates the PNG frames. Choose **Preserve source background / alpha** to retain browser-decoded transparency, or remove a uniform background with automatic border-color detection or a custom key color. Adjust color tolerance and edge softness, then use **Preview First Selected Frame** to inspect the result on a checkerboard before extracting. Automatic detection fixes one color from the first selected frame for the entire range. Matching subject colors are also removed; complex backgrounds need frame cleanup. All processing stays in your browser. Source videos must be at most 10 minutes, 250 MiB, and 4K (8,294,400 pixels, maximum 4096px edge). Each selection supports up to 10 seconds and 90 frames at 5–30 FPS. Output preserves aspect ratio and is reduced to a maximum 1280px edge and a total decoded-pixel budget of 32 Mi pixels. Encoded frame strings have a separate 48 MiB budget. These are conservative application limits; codec support and available memory still depend on the browser/device.

Open Animation Studio and use **Choose Images** to select multiple images or **Choose Folder** to import an image sequence. On small screens, open **Source & Slice** first. Images are appended in natural filename order (`walk_2.png` before `walk_10.png`), keep their full dimensions and transparency, and are saved as a cutout collection. Hidden and unsupported files are skipped. Undo removes the imported batch from the timeline; existing frames and playback speed are preserved.

Animation Studio includes a floating **Tips** panel for import, cleanup, and ordered export. Use **Hide tips**, Escape, or click outside it to dismiss it. Your preference is remembered; reopen it from the question-mark button in the studio header.

## Deploy To created.link

Run:

`npm run deploy`

This builds the app, publishes `dist` to `https://created.link/assetmaster/`, and verifies that the live page is serving the newly built asset hash.

## Local MCP Companion

AssetMaster 1.1.19 includes a local AI-agent integration. Open **AI integrations** in the web editor, then follow the setup page. The companion provides import, transparent cutout creation, image previews, PNG export, undo/redo and existing editor commands through MCP stdio. A paired browser workspace and explicitly configured asset folder are required. Requested previews and returned content may reach the AI provider.

See [the companion guide](mcp/README.md) for installation, privacy, recovery, tests and release packaging. Run `npm run mcp:install`, then `npm run release:mcp` to validate and build the npm tarball, Windows runtime package, checksums and website downloads. Packages are generated locally; npm publication and a signed installer require publisher access and signing configuration.

## Feature requests

The header includes **Request a feature**, with a title, description, and optional reply email. Recipient and provider credentials stay in private server configuration. See [delivery setup](scripts/feature-request-setup.md) before deployment. `npm run feedback:check` scans built assets for leaked mail settings; backend tests exercise validation, unavailable delivery, rate limits, provider failures, and successful acceptance without sending email.
