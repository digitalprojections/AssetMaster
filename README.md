# AssetMaster

Image cutouts, background cleanup, collages, sprite sheets, and frame animation.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Import Animation Frames

Open Animation Studio and use **Choose Images** to select multiple images or **Choose Folder** to import an image sequence. On small screens, open **Source & Slice** first. Images are appended in natural filename order (`walk_2.png` before `walk_10.png`), keep their full dimensions and transparency, and are saved as a cutout collection. Hidden and unsupported files are skipped. Undo removes the imported batch from the timeline; existing frames and playback speed are preserved.

## Deploy To created.link

Run:

`npm run deploy`

This builds the app, publishes `dist` to `https://created.link/assetmaster/`, and verifies that the live page is serving the newly built asset hash.
