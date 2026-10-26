import { parseArgs } from 'node:util';
import { sign, command } from './project.mjs';
command(async () => {
  const { values } = parseArgs({ options: { key: { type: 'string' } } });
  console.log(await sign({ keyPath: values.key, keyPem: process.env.PLUGIN_SIGNING_KEY }));
});
