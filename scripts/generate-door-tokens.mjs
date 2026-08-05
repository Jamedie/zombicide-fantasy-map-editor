import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';


const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const generator = path.join(scriptDir, 'generate-door-tokens.py');
const bundledPython = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
const candidates = [process.env.CODEX_PYTHON, bundledPython, 'python', 'python3'].filter(Boolean);

for (const executable of candidates) {
  if (path.isAbsolute(executable) && !fs.existsSync(executable)) continue;
  const result = spawnSync(executable, [generator], { stdio: 'inherit' });
  if (result.status === 0) process.exit(0);
  if (result.error?.code === 'ENOENT') continue;
}

console.error('Impossible de générer le PDF. Installez reportlab (`python -m pip install reportlab`) ou définissez CODEX_PYTHON.');
process.exit(1);
