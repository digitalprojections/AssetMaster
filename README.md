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

For video, use **Choose Video**, watch the preview, then select start and end times with the sliders, time fields, or **Use Playback Position**. **Play Selected Range** previews the chosen interval; **Extract Selected Range** creates the PNG frames. Source videos must be at most 10 minutes, 250 MiB, and 4K (8,294,400 pixels, maximum 4096px edge). Each selection supports up to 10 seconds and 90 frames at 5–30 FPS. Output preserves aspect ratio and is reduced to a maximum 1280px edge and a total decoded-pixel budget of 32 Mi pixels. Encoded frame strings have a separate 48 MiB budget. These are conservative application limits; codec support and available memory still depend on the browser/device.

Open Animation Studio and use **Choose Images** to select multiple images or **Choose Folder** to import an image sequence. On small screens, open **Source & Slice** first. Images are appended in natural filename order (`walk_2.png` before `walk_10.png`), keep their full dimensions and transparency, and are saved as a cutout collection. Hidden and unsupported files are skipped. Undo removes the imported batch from the timeline; existing frames and playback speed are preserved.

Animation Studio includes a floating **Tips** panel for import, cleanup, and ordered export. Use **Hide tips**, Escape, or click outside it to dismiss it. Your preference is remembered; reopen it from the question-mark button in the studio header.

## Deploy To created.link

Run:

`npm run deploy`

This builds the app, publishes `dist` to `https://created.link/assetmaster/`, and verifies that the live page is serving the newly built asset hash.
