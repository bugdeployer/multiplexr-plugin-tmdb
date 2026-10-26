import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { ROOT, manifest, artifacts, command } from './project.mjs';

command(async () => {
  const value = await manifest();
  const tag = process.env.GITHUB_REF_NAME;
  if (tag !== `v${value.version}`) throw Error('Tag must match plugin/manifest.json version.');
  if (value.id === 'org.example.plugin') throw Error('Configure the plugin identity before releasing.');
  const bytes = await readFile(artifacts(ROOT, value).signed);
  const signed = JSON.parse(bytes);
  const payload = JSON.parse(Buffer.from(signed.payload, 'base64'));
  if (signed.format !== 'multiplexr-plugin-1' || !isDeepStrictEqual(payload.manifest, value)) {
    throw Error('Signed package does not match the current manifest.');
  }
  const expected = `${createHash('sha256').update(bytes).digest('hex')}  ${value.id}-${value.version}.mpx.json\n`;
  if (await readFile(join(ROOT, 'dist/SHA256SUMS'), 'utf8') !== expected) {
    throw Error('Checksum does not match the signed package.');
  }
  await promisify(execFile)('gh', [
    'release', 'create', tag, artifacts(ROOT, value).signed, join(ROOT, 'dist/SHA256SUMS'),
    '--verify-tag', '--title', `${value.name} ${value.version}`,
    '--notes', 'Install the signed .mpx.json file through Multiplexr Settings > Plugins & themes.',
  ], { cwd: ROOT });
  console.log('Signed plugin release published.');
});
