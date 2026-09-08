import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const animationStudio = readFileSync('src/components/AnimationStudio.tsx', 'utf8');
const collageStudio = readFileSync('src/components/CollageStudio.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');

assert.match(app, /COMPACT_CONTROLS_KEY = 'assetmaster\.compactControls\.v1'/u);
assert.match(app, /window\.localStorage\.getItem\(COMPACT_CONTROLS_KEY\) !== 'false'/u);
assert.match(app, /window\.localStorage\.setItem\(COMPACT_CONTROLS_KEY, useCompactControls \? 'true' : 'false'\)/u);
assert.match(app, /id="app-root"/u);
assert.match(app, /setUseCompactControls\(\(current\) => !current\)/u);
assert.match(app, /Compact UI/u);
assert.match(app, /useCompactControls=\{useCompactControls\}/u);
assert.match(app, /aria-label="Open Collage Studio"/u);
assert.match(app, /aria-label="Open Animation Studio"/u);
assert.match(app, /hidden lg:inline/u);
assert.match(animationStudio, /useCompactControls \? 'professional-tools-ui' : ''/u);
assert.match(collageStudio, /useCompactControls \? 'professional-tools-ui' : ''/u);
assert.match(styles, /\.professional-tools-ui \{/u);
assert.match(styles, /--tool-radius: 0\.25rem/u);
assert.match(styles, /--inspector-panel: #363636/u);
assert.match(styles, /\.professional-tools-ui #left-tools button:disabled svg/u);
assert.match(styles, /\.professional-tools-ui #main-header button,\n\.professional-tools-ui #main-header label/u);
assert.match(styles, /\.professional-tools-ui \.min-h-11/u);
assert.match(styles, /\.professional-tools-ui button,\n\.professional-tools-ui input,\n\.professional-tools-ui select/u);
assert.match(styles, /\.professional-tools-ui \.w-20\.h-20/u);

console.log('professional tool density tests passed');
