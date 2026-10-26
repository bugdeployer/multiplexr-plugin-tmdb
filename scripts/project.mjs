import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile, mkdtemp, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import { validateManifest } from 'multiplexr_plugin_sdk/manifest';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
// The author CLI lives beside the pinned SDK's src entrypoint.
const SDK_CLI = join(dirname(require.resolve('multiplexr_plugin_sdk')), '../bin/plugin.js');
const execute = promisify(execFile);

export async function manifest(root = ROOT) {
  return validateManifest(JSON.parse(await readFile(join(root, 'plugin/manifest.json'), 'utf8')));
}

export function artifacts(root, value) {
  const prefix = join(root, 'dist', `${value.id}-${value.version}`);
  return { proof: prefix + '.proof.json', signed: prefix + '.mpx.json' };
}

export async function build(root = ROOT) {
  const value = await manifest(root);
  const output = artifacts(root, value).proof;
  await mkdir(join(root, 'dist'), { recursive: true });
  await rm(output, { force: true });
  await execute(process.execPath, [SDK_CLI, 'build', join(root, 'plugin'), output]);
  return output;
}

export async function origins(root = ROOT) {
  const values = JSON.parse(await readFile(join(root, 'plugin/network-origins.json'), 'utf8'));
  if (!Array.isArray(values) || values.length > 32 || new Set(values).size !== values.length) {
    throw Error('Provide at most 32 unique HTTPS origins.');
  }
  for (const value of values) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.port) {
      throw Error('Use exact HTTPS origins without paths, credentials or custom ports.');
    }
  }
  return values;
}

export async function sign({ keyPath, keyPem } = {}, root = ROOT) {
  const value = await manifest(root);
  if (value.id === 'org.example.plugin') throw Error('Run npm run configure before signing.');
  const paths = artifacts(root, value);
  const proof = JSON.parse(await readFile(paths.proof, 'utf8'));
  if (!isDeepStrictEqual(proof.manifest, value)) throw Error('Manifest changed; run npm run build again.');
  const destinations = await origins(root);
  const permissions = [...value.capabilities.required, ...value.capabilities.optional];
  if (destinations.length && !permissions.includes('http.request')) {
    throw Error('Network origins require the http.request capability.');
  }
  if (Boolean(keyPath) === Boolean(keyPem)) throw Error('Provide one signing key: --key or PLUGIN_SIGNING_KEY.');
  let temporary;
  let staging;
  try {
    if (keyPem) {
      temporary = await mkdtemp(join(tmpdir(), 'multiplexr-key-'));
      keyPath = join(temporary, 'publisher.pem');
      await writeFile(keyPath, keyPem, { mode: 0o600, flag: 'wx' });
    }
    staging = await mkdtemp(join(root, 'dist/.sign-'));
    const signed = join(staging, 'package.mpx.json');
    await execute(process.execPath, [SDK_CLI, 'sign', paths.proof, signed, keyPath, ...destinations]);
    const digest = createHash('sha256').update(await readFile(signed)).digest('hex');
    await rename(signed, paths.signed);
    await writeFile(join(root, 'dist/SHA256SUMS'), `${digest}  ${value.id}-${value.version}.mpx.json\n`);
    return paths.signed;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

export function command(action) {
  action().catch(error => {
    // Do not forward subprocess output: signing tools handle private key data.
    console.error(error.stderr !== undefined
      ? 'Author tool failed. Check the build artifact and signing key format.'
      : error.message);
    process.exitCode = 1;
  });
}
