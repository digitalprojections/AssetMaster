import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const timeline = readFileSync('src/components/AnimationTimeline.tsx', 'utf8');
const animationStudio = readFileSync('src/components/AnimationStudio.tsx', 'utf8');

assert.match(animationStudio, /duplicateFrameAt/u);
assert.match(animationStudio, /duplicateAnimationFrameAt/u);
assert.match(timeline, /title="Duplicate Frame"/u);
assert.match(timeline, /aria-label=\{`Duplicate frame \$\{idx \+ 1\}`\}/u);
assert.match(animationStudio, /toggleActiveFrameFlip/u);
assert.match(animationStudio, /FlipHorizontal/u);
assert.match(animationStudio, /FlipVertical/u);
assert.match(animationStudio, /title="Flip Horizontally"/u);
assert.match(animationStudio, /title="Flip Vertically"/u);
assert.match(animationStudio, /flipX \? -frame\.scale : frame\.scale/u);
assert.match(animationStudio, /flipY \? -frame\.scale : frame\.scale/u);
assert.match(animationStudio, /flipX: Boolean\(frame\.flipX\)/u);
assert.match(animationStudio, /flipY: Boolean\(frame\.flipY\)/u);

console.log('animation studio timeline tests passed');
