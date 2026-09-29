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

import { Polytoria } from "@kiln/schemas";
import type { Menus } from "webextension-polyfill";
import { onMessage } from "@/utils/messaging";
import { cache, migrateThemesToLocal } from "@/utils/storage";
import {
	ApiDisabledError,
	ApiHttpError,
	handle,
	NoSessionError,
	resolveInjectableTabId,
	safeFetch,
	withApi,
} from "./background/shared";

import "./background/config";
import "./background/users";
import "./background/items";
import "./background/places";
import "./background/profileThemes";
import "./background/notifications";
import "./background/trades";
import "./background/auth";
import "./background/profileBio";
import "./background/extension";
import "./background/timePlayed";
import "./background/feedback";
import "./background/feed";
import "./background/storeListing";
import "./background/placesListing";
import "./background/forumSearch";
import "./background/feedSearch";
import { scheduleAssetApprovalCheck } from "./background/assetApprovals";
import { logError, purgeOldErrors } from "./background/errors";
import { scheduleThemeAutoUpdateCheck } from "./background/themeAutoUpdate";

export { ApiDisabledError, ApiHttpError, NoSessionError };

const MAX_CACHE_BYTES = 4 * 1024 * 1024;

async function resolveIdFromUrl(linkUrl: string): Promise<string> {
	const parts = new URL(linkUrl).pathname.split("/");
	if (parts[1] === "u") {
		const config = await withApi("public_api", "public");
		const res = await safeFetch(
			`${config.resolvedUrls.public}users/find?username=${parts[2]}`,
			Polytoria.FindUserByUsernameApiSchema,
		);
		if ("id" in res) return String(res.id);
		throw new Error("Failed to resolve user");
	}
	return parts[parts.length - 1];
}

type ContextMenuDef = {
	title: string;
	id: string;
	contexts: Menus.ContextType[];
	targetUrlPatterns: string[];
	extract: (info: Menus.OnClickData) => string | Promise<string>;
};

const CONTEXT_MENUS: ContextMenuDef[] = [
	{
		title: "Copy ID",
		id: "Kiln-CopyID",
		contexts: ["link"],
		targetUrlPatterns: [
			"https://polytoria.com/places/*",
			"https://polytoria.com/users/*",
			"https://polytoria.com/store/*",
			"https://polytoria.com/guilds/*",
			"https://polytoria.com/u/*",
			"https://polytoria.com/inbox/messages/*",
			"https://polytoria.com/models/*",
			"https://polytoria.com/create/ad/*",
			"https://polytoria.com/addons/*",
		],
		extract: (info) => resolveIdFromUrl(info.linkUrl!),
	},
	{
		title: "Copy Thread ID",
		id: "Kiln-CopyThreadID",
		contexts: ["link"],
		targetUrlPatterns: ["https://polytoria.com/forum/post/*"],
		extract: (info) => new URL(info.linkUrl!).pathname.split("/")[3],
	},
	{
		title: "Copy Avatar Hash",
		id: "Kiln-CopyAvatarHash",
		contexts: ["image"],
		targetUrlPatterns: [
			"https://c0.ptacdn.com/thumbnails/avatars/*",
			"https://cdn.polytoria.com/thumbnails/avatars/*",
		],
		extract: (info) => {
			const pathname = new URL(info.srcUrl!).pathname;
			return pathname.split("/")[3].replace("-icon", "").replace(".png", "");
		},
	},
];

async function copyToTab(tabId: number, value: string) {
	await browser.scripting.executeScript({
		target: { tabId },
		func: (v: string) => navigator.clipboard.writeText(v),
		args: [value],
	});
}

function setupContextMenus() {
	const docPatterns = ["https://polytoria.com/*"];

	browser.contextMenus.removeAll().then(() => {
		for (const menu of CONTEXT_MENUS) {
			browser.contextMenus.create({
				title: menu.title,
				id: menu.id,
				contexts: menu.contexts,
				documentUrlPatterns: docPatterns,
				targetUrlPatterns: menu.targetUrlPatterns,
			});
		}
	});

	browser.contextMenus.onClicked.addListener(async (info, tab) => {
		if (!tab?.id) return;

		const menu = CONTEXT_MENUS.find((m) => m.id === info.menuItemId);
		if (!menu) return;

		try {
			const value = await menu.extract(info);
			await copyToTab(tab.id, value);
		} catch (err) {
			await logError({
				type: "content",
				message: err instanceof Error ? err.message : String(err),
				source: `contextMenus:${menu.id}`,
			}).catch(() => {});
			await browser.scripting
				.executeScript({
					target: { tabId: tab.id },
					world: "MAIN",
					func: () => {
						// @ts-expect-error
						window.Swal?.fire({
							icon: "error",
							title: "Couldn't copy ID",
							toast: true,
							position: "bottom-end",
							timer: 3000,
							timerProgressBar: true,
							showConfirmButton: false,
						});
					},
				})
				.catch(() => {});
		}
	});
}

async function trimCacheIfNeeded() {
	const cacheValue = await cache.getValue();
	const bytes = new TextEncoder().encode(JSON.stringify(cacheValue)).byteLength;
	if (bytes > MAX_CACHE_BYTES) {
		console.log(
			`[Kiln] Cache is ${(bytes / (1024 * 1024)).toFixed(2)} MB, clearing...`,
		);
		await cache.setValue(cache.fallback);
	}
}

function reportStartupError(source: string) {
	return (err: unknown) =>
		logError({
			type: "content",
			message: err instanceof Error ? err.message : String(err),
			source,
		});
}

export default defineBackground(() => {
	console.log("Kiln background service worker is running!", {
		id: browser.runtime.id,
	});

	trimCacheIfNeeded().catch(reportStartupError("trimCacheIfNeeded"));

	purgeOldErrors().catch(reportStartupError("purgeOldErrors"));

	migrateThemesToLocal().catch(reportStartupError("migrateThemesToLocal"));

	scheduleThemeAutoUpdateCheck().catch(
		reportStartupError("scheduleThemeAutoUpdateCheck"),
	);

	scheduleAssetApprovalCheck().catch(
		reportStartupError("scheduleAssetApprovalCheck"),
	);

	migrateLegacySettings()
		.then((migration) => {
			if (migration) {
				browser.tabs.create({
					url: "https://kiln.indexx.dev/rewrite",
					active: true,
				});
			}
		})
		.catch(reportStartupError("migrateLegacySettings"));

	setupContextMenus();
});

browser.runtime.onInstalled.addListener(async ({ reason }) => {
	const rules = [
		{
			id: 1,
			priority: 1,
			action: {
				type: "modifyHeaders",
				requestHeaders: [
					{
						header: "User-Agent",
						operation: "set",
						value: "UnityPlayer/",
					},
					{ header: "Sec-Ch-Ua", operation: "remove" },
					{ header: "Sec-Ch-Ua-Mobile", operation: "remove" },
					{ header: "Sec-Ch-Ua-Platform", operation: "remove" },
					{ header: "Sec-Fetch-Dest", operation: "remove" },
					{ header: "Sec-Fetch-Mode", operation: "remove" },
					{ header: "Sec-Fetch-Site", operation: "remove" },
				],
			},
			condition: {
				urlFilter: "||api.polytoria.com",
				resourceTypes: ["xmlhttprequest"],
			},
		},
	];

	try {
		await browser.declarativeNetRequest.updateDynamicRules({
			removeRuleIds: [1],
			addRules: rules as any,
		});
		console.log("UnityPlayer headers active.");
	} catch (err) {
		console.error("Failed to set rules:", err);
	}

	if (reason === "update" && import.meta.env.PROD) {
		await cache.setValue(cache.fallback);
		console.log("[Kiln] Cache cleared on update.");
	}
});

onMessage("openPreferences", () => {
	browser.tabs.create({ url: "https://polytoria.com/my/settings/kiln" });
});

onMessage("registerBootstrapElements", async ({ sender }) => {
	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) return;

	browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: () => {
			//@ts-expect-error
			const bootstrap = window.bootstrap;
			[...document.querySelectorAll('[data-bs-toggle="tooltip"]')]
				.filter((el) => !bootstrap.Tooltip.getInstance(el))
				.map((el) => new bootstrap.Tooltip(el));
			[...document.querySelectorAll('[data-bs-toggle="dropdown"]')]
				.filter((el) => !bootstrap.Dropdown.getInstance(el))
				.map((el) => new bootstrap.Dropdown(el));
		},
	});
});

onMessage("getStreakFreezeCount", ({ sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No injectable tab");

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			func: () => {
				//@ts-expect-error
				const count = window.streakFreezeCount;
				return typeof count === "number" ? count : null;
			},
		});

		return (results[0]?.result ?? null) as number | null;
	}),
);

onMessage("disableFeedAutoScroll", async ({ sender }) => {
	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) return;

	browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: () => {
			//@ts-expect-error
			const axios = window.axios;
			if (!axios?.get || axios.get.__kilnPatched) return;

			const originalGet = axios.get.bind(axios);
			const patchedGet = (
				url: string,
				config?: { params?: { page?: number } },
			) => {
				if (url === "/api/feed" && (config?.params?.page ?? 1) > 1) {
					return Promise.resolve({
						data: {
							data: [],
							meta: { nextPageURL: null, currentPage: config!.params!.page },
						},
					});
				}
				return originalGet(url, config);
			};
			patchedGet.__kilnPatched = true;
			axios.get = patchedGet;
		},
	});
});

onMessage("disablePlacesAutoScroll", async ({ sender }) => {
	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) return;

	browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		func: () => {
			//@ts-expect-error
			const axios = window.axios;
			if (!axios?.get || axios.get.__kilnPatched) return;

			const originalGet = axios.get.bind(axios);
			const patchedGet = (
				url: string,
				config?: { params?: { page?: number } },
			) => {
				if (url === "/api/places" && (config?.params?.page ?? 1) > 1) {
					return Promise.resolve({
						data: {
							data: [],
							meta: { nextPageURL: null },
						},
					});
				}
				return originalGet(url, config);
			};
			patchedGet.__kilnPatched = true;
			axios.get = patchedGet;
		},
	});
});
