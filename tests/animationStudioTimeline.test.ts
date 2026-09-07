import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const animationStudio = readFileSync('src/components/AnimationStudio.tsx', 'utf8');

assert.match(animationStudio, /duplicateFrameAt/u);
assert.match(animationStudio, /duplicateAnimationFrameAt/u);
assert.match(animationStudio, /title="Duplicate Frame"/u);
assert.match(animationStudio, /aria-label=\{`Duplicate frame \$\{idx \+ 1\}`\}/u);

console.log('animation studio timeline tests passed');
