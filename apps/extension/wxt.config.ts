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

import { defineConfig } from "wxt";

export default defineConfig({
	browser: "chrome",
	manifest: {
		name: "Kiln for Polytoria",
		description: "50+ features. Everything Polytoria should have built in.",
		permissions: [
			"storage",
			"declarativeNetRequest",
			"contextMenus",
			"scripting",
			"alarms",
		],
		host_permissions: [
			"https://polytoria.com/*",
			"https://api.polytoria.com/*",
			"https://kiln-api.indexx.dev/*",
			"https://kiln.indexx.dev/*",
			"https://polytoria.trade/api/*",
			"https://polytrack.top/*",
			"https://cdn.polytoria.com/*",
			"https://poly-upd-archival.pages.dev/*",
		],
		browser_specific_settings: {
			gecko: {
				id: "index.business.purposes@gmail.com",
			},
		},
		web_accessible_resources: [
			{
				resources: ["css/*", "icon/*", "images/*", "svgs/*", "fonts/*"],
				matches: ["https://polytoria.com/*"],
			},
		],
	},
	vite: () => ({
		plugins: [
			{
				name: "gpl-banner",
				renderChunk(code) {
					return {
						code: `/*! This file is part of Kiln, licensed under the GNU General Public License v3.0. See LICENSE for details. */\n${code}`,
						map: null,
					};
				},
			},
		],
	}),
	runner: {
		startUrls: ["https://polytoria.com/home"],
		chromiumArgs: [
			"--user-data-dir=./.wxt/chrome-data",
			"--disable-blink-features=AutomationControlled",
		],
		binaries: {
			chrome: "/Applications/Helium.app/Contents/MacOS/Helium",
			firefox: "/Applications/Zen.app/Contents/MacOS/zen",
		},
		firefoxProfile: "./.wxt/firefox-data",
	},
});
