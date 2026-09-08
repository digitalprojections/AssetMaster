import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const animationStudio = readFileSync('src/components/AnimationStudio.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');

assert.match(animationStudio, /STUDIO_COMPACT_UI_STORAGE_KEY/u);
assert.match(animationStudio, /useCompactControls \? 'professional-tools-ui' : ''/u);
assert.match(animationStudio, /setUseCompactControls\(\(current\) => !current\)/u);
assert.match(animationStudio, /Compact UI/u);
assert.match(styles, /\.professional-tools-ui \{/u);
assert.match(styles, /--tool-radius: 0\.25rem/u);
assert.match(styles, /--inspector-panel: #363636/u);
assert.match(styles, /\.professional-tools-ui \.min-h-11/u);
assert.match(styles, /\.professional-tools-ui button,\n\.professional-tools-ui input,\n\.professional-tools-ui select/u);
assert.match(styles, /\.professional-tools-ui \.w-20\.h-20/u);

console.log('professional tool density tests passed');
