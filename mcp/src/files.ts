import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
const MAX_BYTES = 20 * 1024 * 1024;
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export class WorkspaceFiles {
  constructor(private root: string) {}
  private async resolve(name: string, output = false) {
    const root = await realpath(this.root);
    const requested = path.resolve(root, name);
    const resolved = output ? path.join(await realpath(path.dirname(requested)), path.basename(requested)) : await realpath(requested).catch(() => requested);
    const relative = path.relative(root, resolved);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.basename(resolved).includes(':')) throw new Error('File must be inside the configured workspace folder.');
    return resolved;
  }
  async importImage(name: string) {
    const file = await this.resolve(name);
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) throw new Error('Import supports PNG, JPEG and WebP images.');
    const handle = await open(file, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Image must be a file at most 20 MiB to stay within the transfer memory budget.');
      const buffer = await handle.readFile();
      if (buffer.length > MAX_BYTES) throw new Error('Image exceeds transfer memory budget.');
      return { name: path.basename(file), dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
    } finally { await handle.close(); }
  }
  async exportPng(name: string, dataUrl: string) {
    if (!name.toLowerCase().endsWith('.png')) throw new Error('Export destination must use the .png extension.');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw new Error('Editor must return a valid PNG image.');
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (encoded.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('PNG exceeds the 20 MiB export memory budget.');
    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('Editor result is not a PNG image.');
    const file = await this.resolve(name, true);
    const handle = await open(file, 'wx');
    try { await handle.writeFile(buffer); await handle.sync(); } finally { await handle.close(); }
    const info = await stat(file);
    return { path: file, bytes: info.size };
  }
}
