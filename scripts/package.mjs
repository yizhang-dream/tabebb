import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extDir = path.join(root, 'extension');
const distDir = path.join(root, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
const outZip = path.join(distDir, `tabebb-v${manifest.version}.zip`);

fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

// Always write POSIX '/' entry paths inside the ZIP for cross-platform store compatibility.
const py = [
  'import os, sys, zipfile',
  'src, out = sys.argv[1], sys.argv[2]',
  'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:',
  '    for dirpath, _, filenames in os.walk(src):',
  '        for fn in sorted(filenames):',
  '            full = os.path.join(dirpath, fn)',
  '            arc = os.path.relpath(full, src).replace("\\\\", "/")',
  '            zf.write(full, arc)',
].join('\n');

execFileSync('python', ['-c', py, extDir, outZip], { stdio: 'inherit' });
const stat = fs.statSync(outZip);
console.log(`Packaged ${outZip} (${(stat.size / 1024).toFixed(1)} KB)`);
