import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const appShell = readFileSync('src/App.tsx', 'utf8');

test('page navigation ignores repeat taps while an interstitial transition is pending', () => {
  assert.match(appShell, /const pageChangeInProgressRef = useRef<boolean>\(false\);/u);
  assert.match(appShell, /if \(pageChangeInProgressRef\.current\) \{\s*return;\s*\}/u);
  assert.match(appShell, /pageChangeInProgressRef\.current = true;/u);
  assert.match(appShell, /finally \{\s*pageChangeInProgressRef\.current = false;\s*\}/u);
});
