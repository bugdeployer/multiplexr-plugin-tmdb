import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateManifest } from 'multiplexr_plugin_sdk/manifest';
import { ROOT } from './project.mjs';

export async function configure(id, name, root = ROOT) {
  const path = join(root, 'plugin/manifest.json');
  const original = JSON.parse(await readFile(path, 'utf8'));
  if (original.id !== 'org.example.plugin') throw Error('Already configured; edit the manifest directly.');
  if (typeof id !== 'string' || id === original.id || typeof name !== 'string' || !name.trim()) {
    throw Error('Provide a new --id and --name.');
  }
  const updated = JSON.parse(JSON.stringify(original).replaceAll(`${original.id}:`, `${id}:`));
  updated.id = id;
  updated.name = name.trim();
  validateManifest(updated);
  const sourcePath = join(root, 'plugin/plugin.js');
  const source = await readFile(sourcePath, 'utf8');
  const marker = `const PLUGIN_ID = ${JSON.stringify(original.id)};`;
  if (!source.includes(marker)) throw Error('Plugin source changed; configure the namespace manually.');
  const packagePath = join(root, 'package.json');
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  pkg.name = id.replaceAll('.', '-');
  await writeFile(sourcePath, source.replace(marker, `const PLUGIN_ID = ${JSON.stringify(id)};`));
  await writeFile(path, JSON.stringify(updated, null, 2) + '\n');
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  const lockPath = join(root, 'package-lock.json');
  try {
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    lock.name = pkg.name;
    lock.packages[''].name = pkg.name;
    await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { id: { type: 'string' }, name: { type: 'string' } } });
  configure(values.id, values.name).then(() => console.log('Plugin identity configured.')).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
