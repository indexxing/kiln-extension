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

import { expect, FIXTURE_HTML, test } from "./fixtures";

test("service worker starts and exposes the extension runtime", async ({
	background,
}) => {
	expect(background.url()).toMatch(/^chrome-extension:\/\//);
	const manifest = await background.evaluate(() =>
		chrome.runtime.getManifest(),
	);
	expect(manifest.name).toBe("Kiln for Polytoria");
	expect(manifest.manifest_version).toBe(3);
});

test("content script runs on polytoria.com", async ({ context }) => {
	const page = await context.newPage();
	await page.goto("https://polytoria.com/");
	await expect(page.locator("body")).toHaveAttribute("data-URL", "/");
});

test("content script tracks the current path", async ({ context }) => {
	const page = await context.newPage();
	await page.goto("https://polytoria.com/store/");
	await expect(page.locator("body")).toHaveAttribute("data-URL", "/store/");
});

test("content script does not run on other sites", async ({ context }) => {
	await context.route("https://example.com/", (route) =>
		route.fulfill({ contentType: "text/html", body: FIXTURE_HTML }),
	);
	const page = await context.newPage();
	await page.goto("https://example.com/");
	await expect(page.locator("body")).not.toHaveAttribute("data-URL", /.*/);
});

test("stored settings reach the content script", async ({
	context,
	background,
}) => {
	const page = await context.newPage();
	await page.goto("https://polytoria.com/");
	await expect(page.locator("body")).toHaveAttribute(
		"data-kiln-text-truncate-fix",
		"false",
	);

	await background.evaluate(() =>
		chrome.storage.local.set({ textTruncateFix: true }),
	);
	await page.reload();
	await expect(page.locator("body")).toHaveAttribute(
		"data-kiln-text-truncate-fix",
		"true",
	);
});

test("page load raises no uncaught errors", async ({ context }) => {
	const errors: string[] = [];
	const page = await context.newPage();
	page.on("pageerror", (err) => errors.push(err.stack ?? err.message));
	await page.goto("https://polytoria.com/about");
	await expect(page.locator("body")).toHaveAttribute("data-URL", "/about");
	expect(errors).toEqual([]);
});
