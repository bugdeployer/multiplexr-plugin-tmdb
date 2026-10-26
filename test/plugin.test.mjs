import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { ROOT, build, manifest, origins, sign } from '../scripts/project.mjs';
import { configure } from '../scripts/configure.mjs';

async function project(action, configured = false, source = join(ROOT, 'test/fixtures/starter')) {
  const root = await mkdtemp(join(tmpdir(), 'multiplexr-plugin-test-'));
  try {
    await cp(join(source, 'plugin'), join(root, 'plugin'), { recursive: true });
    await cp(join(ROOT, 'package.json'), join(root, 'package.json'));
    await cp(join(ROOT, 'package-lock.json'), join(root, 'package-lock.json'));
    if (configured) await configure('org.example.testplugin', 'Test plugin', root);
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function invoke(root, method = 'plugin.open', denied = false) {
  const proof = JSON.parse(await readFile(await build(root), 'utf8'));
  const value = await manifest(root);
  const greeting = value.contributions.find(c => c.family === 'settings.section').fields[0];
  const calls = [];
  // Only trusted repository fixtures run in this test VM.
  const context = createContext({ __hostCall: raw => {
    const request = JSON.parse(raw);
    calls.push(request);
    assert.equal(request.method, 'settings.effective');
    assert.equal(request.params.id, greeting.id);
    assert.deepEqual(request.params.lineage, [{ scope: 'app' }]);
    return JSON.stringify({ v: 1, id: request.id, ...(denied
      ? { error: { code: 'permission_denied' } }
      : { result: { value: greeting.default, source: null, revision: 0 } }) });
  } });
  runInContext(proof.code, context, { timeout: 1000 });
  const request = JSON.stringify({ v: 1, id: 'test-1', method, params: { scope: { scope: 'app' } } });
  const result = runInContext(`multiplexrEntry(${request})`, context, { timeout: 1000 });
  return { response: JSON.parse(JSON.stringify(result)), calls };
}

test('starter displays its declared setting through the host API', () => project(async root => {
  const { response, calls } = await invoke(root);
  assert.deepEqual(response, { v: 1, id: 'test-1', result: { kind: 'text', text: 'Hello from your plugin.' } });
  assert.equal(calls.length, 1);
}));

test('permission denial remains a permission error', () => project(async root => {
  const { response } = await invoke(root, 'plugin.open', true);
  assert.equal(response.error.code, 'permission_denied');
}));

test('unknown handler cannot call the host', () => project(async root => {
  const { response, calls } = await invoke(root, 'plugin.unknown');
  assert.equal(response.error.code, 'unsupported_capability');
  assert.equal(calls.length, 0);
}));

test('configuration updates manifest fields, source namespace and package identity', () => project(async root => {
  await configure('org.example.testplugin', 'Test plugin', root);
  const value = await manifest(root);
  assert.equal(value.id, 'org.example.testplugin');
  for (const c of value.contributions) {
    assert.ok(c.id.startsWith(value.id + ':'));
    for (const field of c.fields ?? []) assert.ok(field.id.startsWith(value.id + ':'));
  }
  assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name, 'org-example-testplugin');
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.name, 'org-example-testplugin');
  assert.equal(lock.packages[''].name, lock.name);
  assert.equal((await invoke(root)).response.result.text, 'Hello from your plugin.');
  await assert.rejects(configure('org.example.another', 'Another', root), /Already configured/);
}));

test('invalid identity leaves the starter unchanged', () => project(async root => {
  const before = await readFile(join(root, 'plugin/manifest.json'), 'utf8');
  await assert.rejects(configure('../outside', 'Invalid', root));
  assert.equal(await readFile(join(root, 'plugin/manifest.json'), 'utf8'), before);
}));

test('template identity cannot be signed for distribution', () => project(async root => {
  await assert.rejects(sign({ keyPem: 'unused' }, root), /configure/);
}));

test('configured package is signed by the supplied P-256 publisher key', () => project(async root => {
  await build(root);
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const path = await sign({ keyPem }, root);
  const file = await readFile(path);
  const bundle = JSON.parse(file);
  assert.equal(bundle.format, 'multiplexr-plugin-1');
  const payload = Buffer.from(bundle.payload, 'base64');
  const publishedKey = createPublicKey({ key: Buffer.from(bundle.publicKey, 'base64'), type: 'spki', format: 'der' });
  assert.ok(verify('sha256', payload, publishedKey, Buffer.from(bundle.signature, 'base64')));
  assert.equal(publishedKey.export({ type: 'spki', format: 'der' }).toString('hex'), publicKey.export({ type: 'spki', format: 'der' }).toString('hex'));
  const body = JSON.parse(payload);
  assert.equal(body.manifest.id, 'org.example.testplugin');
  assert.deepEqual(body.networkOrigins, []);
  assert.equal(body.digests['plugin.js'], createHash('sha256').update(body.files['plugin.js']).digest('hex'));
  assert.ok((await readFile(join(root, 'dist/SHA256SUMS'), 'utf8')).startsWith(createHash('sha256').update(file).digest('hex')));
  assert.ok(!file.includes('PRIVATE KEY'));
}, true));

test('changed manifest requires a fresh build', () => project(async root => {
  await build(root);
  const value = await manifest(root);
  value.name = 'Changed name';
  await writeFile(join(root, 'plugin/manifest.json'), JSON.stringify(value));
  await assert.rejects(sign({ keyPem: 'unused' }, root), /Manifest changed/);
}, true));

test('failed signing preserves the previous signed artifact', () => project(async root => {
  const proofPath = await build(root);
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const signedPath = await sign({ keyPem }, root);
  const previous = await readFile(signedPath, 'utf8');
  const proof = JSON.parse(await readFile(proofPath, 'utf8'));
  proof.code += '\n// modified after build';
  await writeFile(proofPath, JSON.stringify(proof));
  await assert.rejects(sign({ keyPem }, root));
  assert.equal(await readFile(signedPath, 'utf8'), previous);
}, true));

test('network destinations reject HTTP, paths and duplicate origins', () => project(async root => {
  for (const values of [['http://example.org'], ['https://example.org/path'], ['https://example.org', 'https://example.org']]) {
    await writeFile(join(root, 'plugin/network-origins.json'), JSON.stringify(values));
    await assert.rejects(origins(root));
  }
}));

test('network access cannot be added without a declared permission', () => project(async root => {
  await build(root);
  await writeFile(join(root, 'plugin/network-origins.json'), '["https://api.example.org"]');
  await assert.rejects(sign({ keyPem: 'unused' }, root), /http.request/);
}, true));
