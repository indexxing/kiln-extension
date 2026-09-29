// Copyright (C) 2026 Index
// Kiln - a quality-of-life browser extension for Polytoria.com
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import readline from "node:readline/promises";
import { $ } from "bun";

const root = `${import.meta.dir}/..`;
const workerRoot = `${root}/../worker`;

const pkg = await Bun.file(`${root}/package.json`).json();
const version: string = pkg.version;

const fallbackConfigPath = `${root}/utils/static/fallbackConfig.json`;
const fallbackConfig = await Bun.file(fallbackConfigPath).json();

console.log(`\nReady to publish v${version}`);
console.log(`  config latestVersion: ${fallbackConfig.latestVersion}`);

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});
const confirmed = await rl.question(
	`\nPush mirror + update KV for v${version}? (y/N): `,
);
rl.close();
if (confirmed.trim().toLowerCase() !== "y") {
	console.log("Aborted.");
	process.exit(0);
}

console.log("\nPushing extension mirror...");
await $`bun scripts/deploy-mirror.ts`.cwd(root);

console.log("\nPushing config to Cloudflare Workers KV...");
await $`bunx wrangler kv key put config:${version} ${JSON.stringify(fallbackConfig)} --binding=CONFIG --remote`.cwd(
	workerRoot,
);
console.log(`✓ Pushed config:${version}`);

await $`bunx wrangler kv key put latestVersion ${version} --binding=CONFIG --remote`.cwd(
	workerRoot,
);
console.log(`✓ Updated latestVersion → ${version} in KV`);

console.log(`\n✓ Done! v${version} published.`);
