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

import path from "node:path";
import {
	type BrowserContext,
	test as base,
	chromium,
	type Worker,
} from "@playwright/test";

const EXTENSION_PATH = path.resolve(
	import.meta.dirname,
	"../.output/chrome-mv3",
);

export const FIXTURE_HTML = `<!doctype html>
<html><head><title>Polytoria fixture</title></head>
<body>
  <nav class="navbar navbar-expand-lg navbar-light bg-navbar nav-secondary"></nav>
  <div id="app"><main id="main-content"><h1>Fixture</h1></main></div>
</body></html>`;

type Fixtures = {
	context: BrowserContext;
	background: Worker;
};

export const test = base.extend<Fixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: playwright fixture signature
	context: async ({}, use) => {
		const context = await chromium.launchPersistentContext("", {
			channel: "chromium",
			args: [
				`--disable-extensions-except=${EXTENSION_PATH}`,
				`--load-extension=${EXTENSION_PATH}`,
			],
		});
		await context.route(/^https:\/\/polytoria\.com\//, (route) =>
			route.fulfill({ contentType: "text/html", body: FIXTURE_HTML }),
		);
		await context.route(
			(url) =>
				!["polytoria.com"].includes(url.hostname) && url.protocol === "https:",
			(route) => route.abort(),
		);
		await use(context);
		await context.close();
	},

	background: async ({ context }, use) => {
		const worker =
			context.serviceWorkers()[0] ??
			(await context.waitForEvent("serviceworker"));
		await use(worker);
	},
});

export { expect } from "@playwright/test";
