// Repeatable privacy check for web and Android bundles. Run after either build.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) check(path);
    else if (/\.(js|html|json|map|php)$/.test(entry.name)) {
      const text = readFileSync(path, 'utf8');
      if (/ahmadjangroup|re_[A-Za-z0-9]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}/i.test(text)) throw new Error(`Private mail configuration exposed in ${path}`);
    }
  }
}
check('dist');
console.log('Feature request bundle privacy check passed.');
