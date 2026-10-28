import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseConfig } from './config.mjs';
import { buildConsoleScript } from './console-script.mjs';

const config = parseConfig(await readFile(new URL('../config.local.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('./form.js', import.meta.url), 'utf8');
const destination = new URL('../console-ready.local.js', import.meta.url);
await writeFile(destination, buildConsoleScript(config, source), { mode: 0o600 });
console.log('Gotowy skrypt:', fileURLToPath(destination));
console.log('Zawiera Twoją aktualną konfigurację. Tylko wypełnia; wysłanie przyciskiem Zapisz.');
