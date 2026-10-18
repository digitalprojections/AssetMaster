import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/App.tsx', 'utf8');
const segmentList = readFileSync('src/components/SegmentList.tsx', 'utf8');
const animationStudio = readFileSync('src/components/AnimationStudio.tsx', 'utf8');
const collageStudio = readFileSync('src/components/CollageStudio.tsx', 'utf8');

assert.match(segmentList, /title="Delete saved cutout"/u);
assert.match(segmentList, /aria-label=\{`Delete \$\{segment\.name\}`\}/u);
assert.match(animationStudio, /onDeleteSavedSegment\?: \(id: string\) => void/u);
assert.match(animationStudio, /deleteSourceSegment/u);
assert.match(readFileSync('src/components/SourceGroupManager.tsx', 'utf8'), /Delete grouped cutout/u);
assert.match(collageStudio, /onDeleteSavedSegment\?: \(id: string\) => void/u);
assert.match(collageStudio, /deleteSavedCutoutFromSourceList/u);
assert.match(collageStudio, /title="Delete Layer"/u);
assert.match(collageStudio, /removeCustomFont/u);
assert.match(collageStudio, /title="Delete Font"/u);
assert.match(app, /onDeleteSavedSegment=\{handleDeleteSegment\}/u);

console.log('list deletion control tests passed');
assert.match(app, /onDeleteSourceGroup=\{requestSourceDeletion\}/u);
assert.match(animationStudio, /planSourceDeletion\(project.frames, savedSegments, pendingBulkDelete.sourceIds\)/u);
assert.doesNotMatch(readFileSync('src/components/BulkFrameDeletionDialog.tsx', 'utf8'), /Remove from Timeline Only/u);
