import { build, command } from './project.mjs';
command(async () => console.log(await build()));
