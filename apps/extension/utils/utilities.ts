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

import type { Extension } from "@kiln/schemas";
import { escapeHtml, safeHttpUrl } from "@/utils/escapeHtml";
import fallbackConfig from "./static/fallbackConfig.json";
import fallbackCurrencyRates from "./static/fallbackCurrencyRates.json";
import staticMetadata from "./static/metadata.json";
import {
	_kilnNotifications,
	_notificationBellOpenedAt,
	apiSessions,
	cache,
	dismissedNotices,
	kilnBans,
} from "./storage";
import type {
	ApiSession,
	CacheInterface,
	CurrencyCode,
	KilnBan,
	UserDetails,
} from "./types";

const KILN_DISCLOSURE_TITLE =
	"This is a Kiln extension feature, not part of Polytoria.";

export const DEFAULT_PLACE_THUMBNAILS = [
	"https://cdn.polytoria.com/static/dft1-xzU-zWxM.png",
	"https://cdn.polytoria.com/static/dft2-DBQ3ipQw.png",
	"https://cdn.polytoria.com/static/dft3-BtyqU0FJ.png",
	"https://cdn.polytoria.com/static/dft4-N_Ef3AQ6.png",
	"https://cdn.polytoria.com/static/dft5-CRPCTPiv.png",
	"https://cdn.polytoria.com/static/dft6-CKhz_MVp.png",
];

export function kilnDisclosureBadgeHtml(show: boolean): string {
	if (!show) return "";
	return `<span class="badge bg-warning text-dark ms-1" style="font-size:0.6rem;font-weight:600;vertical-align:middle;" title="${KILN_DISCLOSURE_TITLE}">Kiln</span>`;
}

export function createKilnDisclosureBadge(): HTMLSpanElement {
	const badge = document.createElement("span");
	badge.className = "badge bg-warning text-dark ms-1";
	Object.assign(badge.style, {
		fontSize: "0.6rem",
		fontWeight: "600",
		verticalAlign: "middle",
	});
	badge.title = KILN_DISCLOSURE_TITLE;
	badge.textContent = "Kiln";
	return badge;
}

export function condenseTabBar(tabList: HTMLElement): void {
	tabList.classList.add("nav-fill");
	for (const link of tabList.querySelectorAll<HTMLElement>(".nav-link")) {
		link.querySelector("i")?.classList.remove("me-1");
		for (const node of Array.from(link.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) node.remove();
		}
	}
}

export function applyKilnDisclosureTitle(
	el: HTMLElement,
	show: boolean,
	baseTitle?: string,
): void {
	if (!show) {
		if (baseTitle) el.title = baseTitle;
		return;
	}
	el.title = baseTitle
		? `${baseTitle} (${KILN_DISCLOSURE_TITLE})`
		: KILN_DISCLOSURE_TITLE;
}

export async function getConfig(): Promise<Extension.ExtensionConfig> {
	const result = await sendMessage("getConfig").catch(() => null);
	if (result?.ok) return result.data;

	if (import.meta.env.MODE == "development") {
		console.warn(
			"[Kiln] Couldn't reach remote server, using fallback config..",
		);
	}
	return fallbackConfig;
}

export function getApiUrl(
	apiName: keyof typeof staticMetadata.endpoints,
	flags?: Record<string, boolean>,
): string {
	if (apiName === "public" && getFlag(flags, "apis.usePublicApiProxy", false)) {
		return staticMetadata.endpoints.proxy;
	}
	if (apiName === "extension" && import.meta.env.MODE === "development") {
		return "http://localhost:3000/v1/";
	}
	return staticMetadata.endpoints[apiName];
}

export async function getApiSession(
	userId: number,
): Promise<ApiSession | null> {
	const sessionStore = await apiSessions.getValue();
	const session = sessionStore.find((s: ApiSession) => s.userId == userId);

	return session || null;
}

export async function getKilnBan(userId: number): Promise<KilnBan | null> {
	const bans = await kilnBans.getValue();
	return bans.find((b) => b.userId == userId) ?? null;
}

export async function updateApiSession(
	userId: number,
	mutate: (session: ApiSession) => void,
): Promise<ApiSession> {
	const sessionStore = await apiSessions.getValue();
	const session = sessionStore.find((s: ApiSession) => s.userId == userId)!;

	mutate(session);
	await apiSessions.setValue(sessionStore);

	return session;
}

export function withJitter(ms: number, ratio = 0.1): number {
	return ms + (Math.random() * 2 - 1) * ms * ratio;
}

let _currencyRatesPromise: Promise<Extension.CurrencyExchangeRate> | null =
	null;
let _currencyRatesExpiry = 0;

export function getCurrencyRates(): Promise<Extension.CurrencyExchangeRate> {
	const now = Date.now();
	if (_currencyRatesPromise && now < _currencyRatesExpiry) {
		return _currencyRatesPromise;
	}
	const expiry = withJitter(24 * 60 * 60 * 1000);
	_currencyRatesExpiry = now + expiry;
	_currencyRatesPromise = (async () => {
		try {
			const result = (await pullCache(
				"currencyRates",
				async () => {
					const r = await sendMessage("getCurrencyRates");
					if (!r.ok) return "unavailable";
					return r.data;
				},
				expiry,
				false,
			)) as Extension.CurrencyExchangeRate | "unavailable";

			if (result !== "unavailable") return result;
		} catch (_err) {}

		if (import.meta.env.MODE == "development") {
			console.warn(
				"[Kiln] Couldn't reach remote server, using fallback currency rates..",
			);
		}
		return fallbackCurrencyRates;
	})();
	return _currencyRatesPromise;
}

const MAX_WILDCARD_SPAN = 20;

const REGEX_SYNTAX = /[\\[\](){}|^$+?]|\.[*+?{]/;
const REGEX_LITERAL = /^\/(.*)\/([a-z]*)$/;

function escapeLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToSource(glob: string): string {
	const literals = glob.split("*").filter(Boolean);
	if (literals.length === 0) return "";

	return [
		glob.startsWith("*") ? "" : "(?<!\\w)",
		literals.map(escapeLiteral).join(`.{0,${MAX_WILDCARD_SPAN}}?`),
		glob.endsWith("*") ? "" : "(?!\\w)",
	].join("");
}

const edgeWildcard = (match: string) => (match.includes("+") ? "\\S+" : "\\S*");

function regexToSource(source: string): string {
	return source
		.replace(/^(?:\.[*+]\??)+/, edgeWildcard)
		.replace(/(?<!\\)(?:\.[*+]\??)+$/, edgeWildcard)
		.replace(/(?<!\\)\.\*/g, `.{0,${MAX_WILDCARD_SPAN}}?`)
		.replace(/(?<!\\)\.\+/g, `.{1,${MAX_WILDCARD_SPAN}}?`);
}

function compileFilterPattern(line: string): RegExp | null {
	const literal = REGEX_LITERAL.exec(line);
	const source =
		literal || REGEX_SYNTAX.test(line)
			? regexToSource(literal ? literal[1] : line)
			: globToSource(line);
	if (!source) return null;

	try {
		return new RegExp(source, `gi${(literal?.[2] ?? "").replace(/[gi]/g, "")}`);
	} catch (_err) {
		return null;
	}
}

let _profanityFilterPromise: Promise<RegExp[]> | null = null;
let _profanityFilterExpiry = 0;

export function getProfanityFilter(): Promise<RegExp[]> {
	const now = Date.now();
	if (_profanityFilterPromise && now < _profanityFilterExpiry) {
		return _profanityFilterPromise;
	}
	_profanityFilterExpiry = now + 60 * 60 * 1000;
	_profanityFilterPromise = (async () => {
		try {
			const result = await sendMessage("getProfanityFilter");
			if (!result.ok) {
				if (import.meta.env.MODE == "development") {
					console.warn(
						"[Kiln] Couldn't reach remote server, disabling profanity filter highlighting..",
						result.message,
					);
				}
				return [];
			}

			let invalidLines = 0;
			const patterns = result.data
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.reduce<RegExp[]>((acc, line) => {
					const compiled = compileFilterPattern(line);
					if (compiled) acc.push(compiled);
					else invalidLines++;
					return acc;
				}, []);

			if (import.meta.env.MODE == "development") {
				console.log(
					`[Kiln] Loaded ${patterns.length} profanity filter pattern(s)${
						invalidLines ? ` (${invalidLines} invalid line(s) skipped)` : ""
					}`,
				);
			}

			return patterns;
		} catch (err) {
			if (import.meta.env.MODE == "development") {
				console.warn("[Kiln] Failed to load profanity filter:", err);
			}
			return [];
		}
	})();

	_profanityFilterPromise.then((patterns) => {
		if (patterns.length === 0) {
			_profanityFilterPromise = null;
			_profanityFilterExpiry = 0;
		}
	});

	return _profanityFilterPromise;
}

export function renderMarkdownLinks(
	message: string,
	linkClass = "text-black",
): string {
	return message.replace(
		/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
		(_, label, url) =>
			`<a href="${url}" target="_blank" rel="noopener noreferrer" class="${linkClass}" style="text-decoration: underline;">${label}</a>`,
	);
}

export function getFlag(
	flags: Record<string, boolean> | undefined,
	key: string,
	defaultValue = false,
) {
	return flags?.[key] ?? defaultValue;
}

export async function injectVerificationBanner() {
	const DISMISS_CACHE_KEY = "verificationBannerDismissed";
	const cacheStorage = await cache.getValue();
	if (cacheStorage[DISMISS_CACHE_KEY]) return;

	const config = await getConfig();

	if (
		!config.apiAvailability.extension ||
		!getFlag(config.flags, "apis.isExtensionApiStable", true)
	) {
		console.warn(
			"[Kiln] Extension API is disabled or not yet stable, rejecting verification banner..",
		);
		return;
	}

	const mainContent = document.querySelector(
		'#main-content div[style^="min-height"]',
	);
	if (!mainContent) return;

	const banner = document.createElement("div");
	banner.classList.add(
		"alert",
		"alert-warning",
		"d-flex",
		"align-items-center",
		"gap-3",
		"p-3",
		"rounded-0",
		"border-0",
		"text-dark",
	);
	banner.style =
		"background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px);";
	banner.style.margin = "0";
	banner.role = "alert";

	banner.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-exclamation-triangle-fill flex-shrink-0" viewBox="0 0 16 16">
    <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"></path>
  </svg>
  If you'd like to unlock additional Kiln features, please <a id="kiln-extension-verify-btn" href="#" class="text-secondary" style="text-decoration: underline;">verify your account</a>! It will only take a moment
  `;

	const dismissBtn = document.createElement("button");
	dismissBtn.type = "button";
	dismissBtn.className = "btn-close ms-auto";
	dismissBtn.setAttribute("aria-label", "Dismiss");
	dismissBtn.addEventListener("click", async () => {
		const cacheStorage = await cache.getValue();
		const metadata = (await cache.getMeta()) as { [key: string]: number };
		cacheStorage[DISMISS_CACHE_KEY] = "dismissed";
		metadata[DISMISS_CACHE_KEY] = Date.now();
		await cache.setValue(cacheStorage);
		await cache.setMeta(metadata);
		banner.remove();
	});
	banner.append(dismissBtn);

	mainContent.prepend(banner);

	const verifyBtn = document.getElementById("kiln-extension-verify-btn")!;
	verifyBtn.addEventListener("click", () => openVerificationModal());
}

function isNewerVersion(latest: string, current: string): boolean {
	const parse = (v: string) => v.split("-")[0].split(".").map(Number);
	const [lMaj, lMin, lPat] = parse(latest);
	const [cMaj, cMin, cPat] = parse(current);
	if (lMaj !== cMaj) return lMaj > cMaj;
	if (lMin !== cMin) return lMin > cMin;
	return lPat > cPat;
}

export async function injectUpdateBanner() {
	const config = await getConfig();
	const latest = config.latestVersion;
	if (!latest) return;

	const current = browser.runtime.getManifest().version;
	if (!isNewerVersion(latest, current)) return;

	const noticeId = `update-v${latest}`;
	const dismissed = await dismissedNotices.getValue();
	if (dismissed.includes("update-notices-disabled")) return;
	if (dismissed.includes(noticeId)) return;

	const mainContent = document.querySelector(
		'#main-content div[style^="min-height"]',
	);
	if (!mainContent) return;

	const banner = document.createElement("div");
	banner.classList.add(
		"alert",
		"alert-info",
		"d-flex",
		"align-items-center",
		"gap-2",
		"p-3",
		"rounded-0",
		"border-0",
		"text-dark",
	);
	banner.style.cssText =
		"background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px); margin: 0;";
	banner.role = "alert";
	banner.innerHTML = `<i class="fa-solid fa-circle-arrow-up"></i><span><b>Kiln ${latest} is available!</b> Check for updates in your browser's extension manager.</span>`;

	const dismissBtn = document.createElement("button");
	dismissBtn.type = "button";
	dismissBtn.className = "btn-close ms-auto";
	dismissBtn.setAttribute("aria-label", "Dismiss");
	dismissBtn.addEventListener("click", async () => {
		const current = await dismissedNotices.getValue();
		if (!current.includes(noticeId)) {
			await dismissedNotices.setValue([...current, noticeId]);
		}
		banner.remove();
	});
	banner.append(dismissBtn);

	mainContent.prepend(banner);
}

export async function injectPostUpdateBanner() {
	const current = browser.runtime.getManifest().version;
	const seenId = `seen-v${current}`;

	const dismissed = await dismissedNotices.getValue();
	if (dismissed.includes("post-update-notices-disabled")) return;

	const hasPriorSeenEntry = dismissed.some((id) => id.startsWith("seen-v"));

	if (!hasPriorSeenEntry) {
		await dismissedNotices.setValue([...dismissed, seenId]);
		return;
	}

	if (dismissed.includes(seenId)) return;

	const mainContent = document.querySelector(
		'#main-content div[style^="min-height"]',
	);
	if (!mainContent) return;

	const banner = document.createElement("div");
	banner.classList.add(
		"alert",
		"alert-info",
		"d-flex",
		"align-items-center",
		"gap-2",
		"p-3",
		"rounded-0",
		"border-0",
		"text-dark",
	);
	banner.style.cssText =
		"background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px); margin: 0;";
	banner.role = "alert";
	banner.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>Kiln has updated to <b>v${current}</b>! Check out the <a href="/my/settings/kiln?tab=changelog" class="alert-link">changelog</a>.</span>`;

	const dismissBtn = document.createElement("button");
	dismissBtn.type = "button";
	dismissBtn.className = "btn-close ms-auto";
	dismissBtn.setAttribute("aria-label", "Dismiss");
	dismissBtn.addEventListener("click", async () => {
		const d = await dismissedNotices.getValue();
		if (!d.includes(seenId)) {
			await dismissedNotices.setValue([...d, seenId]);
		}
		banner.remove();
	});
	banner.append(dismissBtn);

	mainContent.prepend(banner);
}

export async function injectNoticeBanners() {
	const config = await getConfig();
	if (!config.notices?.length) return;

	const dismissed = await dismissedNotices.getValue();
	const mainContent = document.querySelector(
		'#main-content div[style^="min-height"]',
	);
	if (!mainContent) return;

	for (const notice of config.notices) {
		if (dismissed.includes(notice.id)) continue;

		const alertClass =
			notice.type === "warning" ? "alert-warning" : "alert-info";
		const banner = document.createElement("div");
		banner.classList.add(
			"alert",
			alertClass,
			"d-flex",
			"align-items-center",
			"gap-2",
			"p-3",
			"rounded-0",
			"border-0",
			"text-dark",
		);
		banner.style.cssText =
			"background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px); margin: 0;";
		banner.role = "alert";

		const icon =
			notice.type === "warning"
				? `<i class="fa-solid fa-triangle-exclamation"></i>`
				: `<i class="fa-solid fa-circle-info"></i>`;

		const renderedMessage = renderMarkdownLinks(notice.message);

		banner.innerHTML = `${icon}<span>${renderedMessage}</span>`;

		const dismissBtn = document.createElement("button");
		dismissBtn.type = "button";
		dismissBtn.className = "btn-close ms-auto";
		dismissBtn.setAttribute("aria-label", "Dismiss");
		dismissBtn.addEventListener("click", async () => {
			const current = await dismissedNotices.getValue();
			if (!current.includes(notice.id)) {
				await dismissedNotices.setValue([...current, notice.id]);
			}
			banner.remove();
		});
		banner.append(dismissBtn);

		mainContent.prepend(banner);
	}
}

export function createModal(size: "sm" | "lg" = "sm"): HTMLDialogElement {
	const modal = document.createElement("dialog");
	modal.classList.add("kiln-extension-modal");
	if (size === "lg") modal.classList.add("kiln-modal--lg");
	document.body.prepend(modal);
	return modal;
}

export function openVerificationModal() {
	window.open(
		"https://polytoria.com/my/settings/kiln?tab=sync",
		"_blank",
		"noopener,noreferrer",
	);
}

export async function migrateLegacySettings(): Promise<boolean> {
	const legacyEnabledMap: Record<string, string> = {
		PinnedGamesOn: "favoritedPlaces",
		ForumMentsOn: "forumMentions",
		BestFriendsOn: "bestFriends",
		ImprovedFrListsOn: "improvedFriendLists",
		IRLPriceWithCurrencyOn: "irlBrickPrice",
		StoreOwnTagOn: "storeOwnedTags",
		TryOnItemsOn: "tryItems",
		OutfitCostOn: "outfitCost",
		ShowPlaceRevenueOn: "placeRevenue",
		HoardersListOn: "hoardersList",
		AvatarDimensionToggleOn: "avatarSandbox",
		MoreBlockedDetailsOn: "basicBlockedInfo",
	};

	const legacyCurrencyMap: Partial<Record<number, CurrencyCode>> = {
		0: "USD",
		1: "EUR",
		2: "CAD",
		3: "GBP",
		4: "MXN",
		5: "AUD",
		6: "TRY",
		7: "BRL",
	};

	if (typeof browser === "undefined" || !browser.storage?.sync) return false;

	const result = await browser.storage.sync.get("PolyPlus_Settings");
	const legacy = result?.PolyPlus_Settings as Record<string, any>;

	if (!legacy || typeof legacy !== "object") return false;

	const current = await preferences.getValue();
	const enabledSet = new Set(current.enabled);
	const disabledSet = new Set(current.disabled ?? []);

	for (const [oldKey, featureId] of Object.entries(legacyEnabledMap)) {
		if (oldKey in legacy) {
			if (legacy[oldKey]) {
				//@ts-expect-error
				enabledSet.add(featureId);
				//@ts-expect-error
				disabledSet.delete(featureId);
			} else {
				//@ts-expect-error
				enabledSet.delete(featureId);
				//@ts-expect-error
				disabledSet.add(featureId);
			}
		}
	}

	if (legacy.TheGreatDivide && typeof legacy.TheGreatDivide === "object") {
		if (legacy.TheGreatDivide.UserStatsOn) {
			enabledSet.add("tgdStats");
			disabledSet.delete("tgdStats");
		} else {
			enabledSet.delete("tgdStats");
			disabledSet.add("tgdStats");
		}
	}

	const config = { ...current.config };

	if (typeof legacy.IRLPriceWithCurrencyCurrency === "number") {
		const mapped = legacyCurrencyMap[legacy.IRLPriceWithCurrencyCurrency];
		if (mapped) {
			config.irlBrickPrice = { currency: mapped };
		}
	}

	if (legacy.HoardersList && typeof legacy.HoardersList === "object") {
		config.hoardersList = {
			minCopies:
				legacy.HoardersList.MinCopies ??
				defaultPreferences.config.hoardersList.minCopies,
			showAvatars:
				legacy.HoardersList.AvatarsEnabled ??
				defaultPreferences.config.hoardersList.showAvatars,
		};
	}

	if (
		legacy.ImprovedPlaceManagement &&
		typeof legacy.ImprovedPlaceManagement === "object"
	) {
		config.placeManagement = {
			download:
				legacy.ImprovedPlaceManagement.PlaceFileDownloadOn ??
				defaultPreferences.config.placeManagement.download,
			bulkWhitelist:
				legacy.ImprovedPlaceManagement.MultiWhitelistOn ??
				defaultPreferences.config.placeManagement.bulkWhitelist,
		};
	}

	if (
		legacy.ApplyMembershipTheme &&
		typeof legacy.ApplyMembershipTheme === "object"
	) {
		config.membershipThemes = {
			themeId: legacy.ApplyMembershipTheme.Theme === 1 ? "plusdx" : "plus",
		};
	}

	await preferences.setValue({
		enabled: [...enabledSet],
		config,
		disabled: [...disabledSet],
	});
	await browser.storage.sync.remove("PolyPlus_Settings");

	return true;
}

export async function pullCache(
	key: string,
	replenish: () => Promise<any>,
	expiry: number,
	forceReplenish: boolean,
) {
	const cacheStorage: CacheInterface = await cache.getValue();
	const metadata = (await cache.getMeta()) as { [key: string]: number };

	const overlap = Date.now() - (metadata[key] || 0);
	const shouldReplenish =
		!cacheStorage[key] ||
		cacheStorage[key] == "unavailable" ||
		!metadata[key] ||
		forceReplenish ||
		(expiry !== -1 && overlap >= expiry);

	if (shouldReplenish) {
		if (import.meta.env.MODE == "development") {
			console.info(
				`[Kiln] "${key}" cache ${
					expiry === -1 ? "doesn't exist" : "is stale"
				} replenishing...`,
				expiry !== -1 ? timeAgo(overlap) : "",
			);

			if (forceReplenish) {
				console.warn(`FORCE REPLENSIHING CACHE!! ${key}`);
			}
		}

		const replenishedCache = await replenish();
		if (replenishedCache !== "unavailable") {
			const freshStorage: CacheInterface = await cache.getValue();
			const freshMeta = (await cache.getMeta()) as { [key: string]: number };
			freshStorage[key] = replenishedCache;
			freshMeta[key] = Date.now();
			await cache.setValue(freshStorage);
			await cache.setMeta(freshMeta);
			return replenishedCache;
		} else {
			return "unavailable";
		}
	}

	return cacheStorage[key];
}

export async function pullKVCache(
	store: string,
	key: string,
	replenish: () => Promise<any>,
	expiry: number,
	forceReplenish: boolean,
) {
	const cacheStorage: CacheInterface = await cache.getValue();
	const metadata = (await cache.getMeta()) as {
		[key: string]: Record<string, number>;
	};

	if (!cacheStorage[store]) cacheStorage[store] = {};
	if (!metadata[store]) metadata[store] = {};

	const overlap = Date.now() - (metadata[store][key] || 0);
	const shouldReplenish =
		!cacheStorage[store][key] ||
		cacheStorage[store][key] == "unavailable" ||
		forceReplenish ||
		(expiry !== -1 && overlap >= expiry);

	if (shouldReplenish) {
		if (import.meta.env.MODE == "development") {
			console.info(
				`[Kiln] ${store}:"${key}" KV cache ${
					expiry === -1 ? "doesn't exist" : "is stale"
				} replenishing...`,
				expiry !== -1 ? timeAgo(overlap) : "",
			);
		}

		const replenishedCache = await replenish();
		if (replenishedCache !== "unavailable") {
			const freshStorage = await cache.getValue();
			const freshMeta = (await cache.getMeta()) as {
				[key: string]: Record<string, number>;
			};
			if (!freshStorage[store]) freshStorage[store] = {};
			if (!freshMeta[store]) freshMeta[store] = {};
			freshStorage[store][key] = replenishedCache;
			freshMeta[store][key] = Date.now();
			await cache.setValue(freshStorage);
			await cache.setMeta(freshMeta);
			return replenishedCache;
		} else {
			return "unavailable";
		}
	}

	return cacheStorage[store][key];
}

export async function pullBulkKVCache<T>(
	store: string,
	keys: string[],
	replenish: (missingKeys: string[]) => Promise<Record<string, T>>,
	expiry: number,
	forceReplenish: boolean,
): Promise<Record<string, T>> {
	const cacheStorage: CacheInterface = await cache.getValue();
	const metadata = (await cache.getMeta()) as {
		[key: string]: Record<string, number>;
	};
	if (!cacheStorage[store]) cacheStorage[store] = {};
	if (!metadata[store]) metadata[store] = {};

	const now = Date.now();
	const result: Record<string, T> = {};
	const missing: string[] = [];

	for (const key of keys) {
		const overlap = now - (metadata[store][key] || 0);
		const stale =
			cacheStorage[store][key] === undefined ||
			forceReplenish ||
			(expiry !== -1 && overlap >= expiry);

		if (stale) {
			missing.push(key);
		} else {
			result[key] = cacheStorage[store][key];
		}
	}

	if (missing.length > 0) {
		if (import.meta.env.MODE == "development") {
			console.info(
				`[Kiln] ${store}: bulk replenishing ${missing.length}/${keys.length} keys...`,
			);
		}

		const fetched = await replenish(missing);

		const freshStorage = await cache.getValue();
		const freshMeta = (await cache.getMeta()) as {
			[key: string]: Record<string, number>;
		};
		if (!freshStorage[store]) freshStorage[store] = {};
		if (!freshMeta[store]) freshMeta[store] = {};

		for (const [key, value] of Object.entries(fetched)) {
			freshStorage[store][key] = value;
			freshMeta[store][key] = now;
			result[key] = value;
		}

		await cache.setValue(freshStorage);
		await cache.setMeta(freshMeta);
	}

	return result;
}

export async function expireCache(key: string) {
	console.info(`[Kiln] Forcefully expiring "${key}" cache...`);

	const metadata = (await cache.getMeta()) as { [key: string]: number };
	metadata[key] = 0;
	await cache.setMeta(metadata);
}

export async function expireKVCache(store: string, key: string) {
	console.info(`[Kiln] Forcefully expiring "${store}":"${key}" KV cache...`);

	const metadata = (await cache.getMeta()) as {
		[key: string]: Record<string, number>;
	};
	if (!metadata[store]) metadata[store] = {};
	metadata[store][key] = 0;
	await cache.setMeta(metadata);
}

function timeAgo(overlap: number) {
	const units = [
		{ label: "day", value: 24 * 60 * 60 * 1000 },
		{ label: "hour", value: 60 * 60 * 1000 },
		{ label: "min", value: 60 * 1000 },
		{ label: "sec", value: 1000 },
	];

	for (const { label, value } of units) {
		const count = Math.floor(overlap / value);
		if (count > 0) {
			return `${count} ${label}${count > 1 ? "s" : ""} ago`;
		}
	}

	return "just now";
}

function parseBricksAmount(raw: string, suffix?: string): number {
	const base = Number.parseFloat(raw.replace(/,/g, ""));
	if (Number.isNaN(base)) return 0;

	const multiplier =
		suffix?.toLowerCase() === "k"
			? 1_000
			: suffix?.toLowerCase() === "m"
				? 1_000_000
				: suffix?.toLowerCase() === "b"
					? 1_000_000_000
					: 1;

	return Math.round(base * multiplier);
}

const GET_USER_DETAILS_TIMEOUT = 15_000;

export function getUserDetails(): Promise<UserDetails | null> {
	return new Promise((resolve) => {
		let settled = false;
		let observer: MutationObserver | null = null;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const finish = (value: UserDetails | null) => {
			if (settled) return;
			settled = true;
			observer?.disconnect();
			if (timeoutId !== null) clearTimeout(timeoutId);
			resolve(value);
		};

		function tryResolve() {
			const profileLink = document.querySelector<HTMLLinkElement>(
				'.navbar a.text-reset[href^="/users/"]',
			);
			const brickBalance = document.querySelector(
				'.navbar [data-bs-html="true"]',
			);

			if (!profileLink || !brickBalance) return false;

			const title =
				brickBalance.getAttribute("data-bs-original-title") ??
				brickBalance.getAttribute("data-bs-title");
			if (!title) return false;

			const match = title.match(/([\d,]+(?:\.\d+)?)\s*([kKmMbB])?\s*Bricks/);

			const userId = parseInt(profileLink.href.split("/")[4], 10);
			finish({
				username: profileLink.innerText.trim(),
				userId,
				bricks: match ? parseBricksAmount(match[1], match[2]) : 0,
				//@ts-expect-error: TODO: look into type error
				getAvatar: async () => {
					const r = await sendMessage("getUserAvatar", userId);
					if (!r.ok) return "unavailable" as const;
					return r.data;
				},
			});
			return true;
		}

		if (tryResolve()) return;

		observer = new MutationObserver(() => {
			tryResolve();
		});

		const navbar =
			document.querySelector(".navbar") ?? document.documentElement;
		observer.observe(navbar, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-bs-original-title", "data-bs-title"],
		});

		timeoutId = setTimeout(() => finish(null), GET_USER_DETAILS_TIMEOUT);

		const giveUpIfLoggedOut = () => {
			if (!document.querySelector('.navbar a.text-reset[href^="/users/"]')) {
				finish(null);
			}
		};
		if (document.readyState === "complete") {
			giveUpIfLoggedOut();
		} else {
			window.addEventListener("load", giveUpIfLoggedOut, { once: true });
		}
	});
}

const periodSeparatorCurrencies = new Set<CurrencyCode>([
	"EUR",
	"CHF",
	"RUB",
	"TRY",
	"PLN",
	"CZK",
	"HUF",
	"DKK",
	"NOK",
	"SEK",
	"RON",
	"UAH",
	"VND",
	"IDR",
]);

function formatCurrencyValue(value: number, currency: CurrencyCode): string {
	const locale = periodSeparatorCurrencies.has(currency) ? "de-DE" : "en-US";
	return value.toLocaleString(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

export async function bricksToCurrency(
	bricks: number,
	currency: CurrencyCode,
): Promise<string | null> {
	if (Number.isNaN(bricks) || bricks == 0) return null;

	const liveData = await getCurrencyRates();
	const packages = staticMetadata.economy.currencyPackages.base.toSorted(
		(a, b) => b[1] - a[1],
	);

	let totalValue = 0;
	for (const [currencyValue, bricksValue] of packages) {
		while (bricks >= bricksValue) {
			bricks -= bricksValue;
			totalValue += currencyValue;
		}
	}

	if (bricks > 0) {
		const cheapestPackage = packages[packages.length - 1];
		const [currencyValue, bricksValue] = cheapestPackage;
		totalValue += bricks * (currencyValue / bricksValue);
	}

	if (currency !== "USD") {
		const rate = liveData.usd[currency.toLowerCase()];
		if (!rate) {
			console.warn(`[Kiln] Missing conversion from USD to ${currency}`);
			return null;
		}
		totalValue *= rate;
	}

	return `~${formatCurrencyValue(totalValue, currency)} ${currency}`;
}

function _parseBrickValue(el: Element | null): number {
	if (!el) return 0;
	return parseFormattedNumber(el.textContent?.trim() ?? "0") || 0;
}

function _parseTradeSide(card: Element): TradeSide {
	const username =
		card.querySelector(".card-header")?.textContent?.trim() ?? "";
	const cleanUsername = username.replace(/\s+gives\s*$/i, "").trim();

	const itemLinks = card.querySelectorAll<HTMLAnchorElement>(
		'.card-body a[href*="/store/"]',
	);
	const items: TradeItem[] = Array.from(itemLinks).map((a) => {
		const href = a.getAttribute("href") ?? "";
		const storeIdMatch = href.match(/\/store\/(?:items\/)?(\d+)/);
		const storeId = storeIdMatch ? parseInt(storeIdMatch[1], 10) : 0;

		const valDiv = a.querySelector(".trd-box-val");
		const spans = valDiv?.querySelectorAll("span") ?? [];

		const serialText = spans[0]?.textContent?.trim() ?? "";
		const serial = serialText.startsWith("#")
			? parseInt(serialText.slice(1), 10)
			: null;

		const brickValue = _parseBrickValue(spans[1] ?? null);

		const thumbnailUrl =
			a.querySelector<HTMLImageElement>("img")?.getAttribute("src") ?? "";

		return { storeId, serial, brickValue, thumbnailUrl };
	});

	const footer = card.querySelector(".card-footer");
	const footerSuccessSpans = footer?.querySelectorAll(".text-success") ?? [];

	const totalValue = _parseBrickValue(footerSuccessSpans[0] ?? null);

	const bricksAddedText =
		footerSuccessSpans.length >= 3
			? (footerSuccessSpans[1]?.textContent?.trim() ?? "0")
			: "0";
	const bricksAdded = parseInt(bricksAddedText.replace(/[^0-9]/g, ""), 10) || 0;

	const afterFeesText = footer?.querySelector("small")?.textContent ?? "0";
	const bricksAfterFees =
		parseInt(afterFeesText.replace(/[^0-9]/g, ""), 10) || 0;

	const netValue = _parseBrickValue(
		footerSuccessSpans[footerSuccessSpans.length - 1] ?? null,
	);

	return {
		username: cleanUsername,
		items,
		totalValue,
		bricksAdded,
		bricksAfterFees,
		netValue,
	};
}

function _parseTradeStatus(root: Element | Document): {
	status: TradeStatus;
	counterparty: string;
} {
	const h5Text =
		root
			.querySelector(".d-flex.justify-content-center h5")
			?.textContent?.trim() ?? "";
	const counterparty = h5Text.replace(/^.+\bwith\s+/i, "").trim();

	if (
		root.querySelector(
			"button[onclick='accept()'], button[onclick='decline()']",
		)
	) {
		return { status: "pending", counterparty };
	}

	const badge =
		root.querySelector(".col-auto .badge")?.textContent?.trim().toLowerCase() ??
		"";
	if (badge === "accepted") return { status: "accepted", counterparty };
	if (badge === "declined") return { status: "declined", counterparty };
	if (badge === "canceled") return { status: "canceled", counterparty };

	return { status: "pending", counterparty };
}

export function parseTrade(root: Element | Document): ParsedTrade {
	const cards = root.querySelectorAll(".card");
	if (cards.length < 2) {
		throw new Error(`Expected at least 2 trade cards, found ${cards.length}`);
	}

	const { status, counterparty } = _parseTradeStatus(root);

	return {
		status,
		counterparty,
		sides: [_parseTradeSide(cards[0]), _parseTradeSide(cards[1])],
	};
}

export function parseFormattedNumber(value: string): number {
	return Number(value.replace(/,/g, ""));
}

export interface FabricatedNotification {
	message: string;
	date: Date;
	url: string;
	avatarUrl: string;
	unread?: boolean;
	lightBell?: boolean;
	onClick?: () => void;
}

const notificationRelativeUnits: Array<[string, number]> = [
	["year", 31_536_000_000],
	["month", 2_592_000_000],
	["week", 604_800_000],
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
	["second", 1_000],
];

export function formatNotificationRelativeTime(date: Date): string {
	const diffMs = Date.now() - date.getTime();
	if (diffMs < 60_000) return "Just now";

	for (const [label, unitMs] of notificationRelativeUnits) {
		const count = Math.floor(diffMs / unitMs);
		if (count > 0) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
	}

	return "Just now";
}

export function parseNotificationRelativeTime(text: string): Date | null {
	const trimmed = text.trim().toLowerCase();
	if (trimmed === "just now") return new Date();

	const match = trimmed.match(
		/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/,
	);
	if (match) {
		const amount = Number(match[1]);
		const unitMs = notificationRelativeUnits.find(
			([label]) => label === match[2],
		)?.[1];
		return unitMs ? new Date(Date.now() - amount * unitMs) : null;
	}

	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function lightNotificationBell(): void {
	for (const toggle of document.querySelectorAll<HTMLElement>(
		".notifications-toggle",
	)) {
		if (toggle.querySelector(".unread-indicator")) continue;

		toggle.dataset.kilnBellOpacity = toggle.style.opacity;
		toggle.style.removeProperty("opacity");
		const icon = toggle.querySelector("i");
		icon?.classList.remove("far", "fa-bell");
		icon?.classList.add("fas", "fa-bell-on");

		const indicator = document.createElement("span");
		indicator.className = "unread-indicator";
		indicator.dataset.kiln = "bell-indicator";
		toggle.appendChild(indicator);
	}
}

function restoreNotificationBell(): void {
	for (const toggle of document.querySelectorAll<HTMLElement>(
		".notifications-toggle",
	)) {
		const indicator = toggle.querySelector('[data-kiln="bell-indicator"]');
		if (!indicator) continue;

		indicator.remove();
		const icon = toggle.querySelector("i");
		icon?.classList.remove("fas", "fa-bell-on");
		icon?.classList.add("far", "fa-bell");
		if (toggle.dataset.kilnBellOpacity) {
			toggle.style.opacity = toggle.dataset.kilnBellOpacity;
		}
		delete toggle.dataset.kilnBellOpacity;
	}
}

export function injectNotification(notification: FabricatedNotification): void {
	const popup = document.querySelector<HTMLElement>(".notifications-popup");
	if (!popup) return;

	if (notification.lightBell) lightNotificationBell();

	const existingItems = Array.from(
		popup.querySelectorAll(":scope > a"),
	) as HTMLAnchorElement[];

	const insertBeforeItem = existingItems.find((item) => {
		const timeText = item
			.querySelector(".small.text-muted")
			?.textContent?.trim();
		if (!timeText) return false;

		const itemDate = parseNotificationRelativeTime(timeText);
		return itemDate !== null && itemDate < notification.date;
	});

	const anchor = document.createElement("a");
	anchor.href = notification.url;
	anchor.className = "text-reset";
	anchor.innerHTML = `
		<div class="notification-item ${notification.unread ? "unread" : ""}">
			<img src="${escapeHtml(safeHttpUrl(notification.avatarUrl))}" class="rounded-circle border border-2 border-secondary" height="38">
			<div>
				<div>${escapeHtml(notification.message)}</div>
				<div class="small text-muted">${formatNotificationRelativeTime(notification.date)}</div>
			</div>
		</div>
	`;

	if (notification.onClick) {
		anchor.addEventListener("click", () => notification.onClick!());
	}

	if (insertBeforeItem) {
		popup.insertBefore(anchor, insertBeforeItem);
	} else {
		popup.appendChild(anchor);
	}
}

export interface KilnNotificationInput {
	userId: number;
	id: string;
	message: string;
	date: Date;
	url: string;
	avatarUrl: string;
	dedupeValue?: string;
}

const KILN_NOTIFICATIONS_LIMIT = 500;

export async function fireKilnNotification(
	input: KilnNotificationInput,
): Promise<void> {
	const notifications = await _kilnNotifications.getValue();
	const existing = notifications[input.id];
	const dedupeValue = input.dedupeValue ?? input.date.toISOString();

	notifications[input.id] = {
		userId: input.userId,
		message: input.message,
		date: input.date.toISOString(),
		url: input.url,
		avatarUrl: input.avatarUrl,
		dedupeValue,
		read: existing?.dedupeValue === dedupeValue ? existing.read : false,
		notifiedAt:
			existing?.dedupeValue === dedupeValue
				? existing.notifiedAt
				: new Date().toISOString(),
	};

	const entries = Object.entries(notifications);
	if (entries.length > KILN_NOTIFICATIONS_LIMIT) {
		entries.sort(
			([, a], [, b]) => new Date(b.date).getTime() - new Date(a.date).getTime(),
		);
		await _kilnNotifications.setValue(
			Object.fromEntries(entries.slice(0, KILN_NOTIFICATIONS_LIMIT)),
		);
		return;
	}

	await _kilnNotifications.setValue(notifications);
}

export async function markKilnNotificationRead(id: string): Promise<void> {
	const notifications = await _kilnNotifications.getValue();
	const existing = notifications[id];
	if (existing && !existing.read) {
		notifications[id] = { ...existing, read: true };
		await _kilnNotifications.setValue(notifications);
	}
}

export async function renderKilnNotifications(userId: number): Promise<void> {
	const popup = document.querySelector<HTMLElement>(".notifications-popup");
	if (!popup) return;

	const existingDates = (
		Array.from(popup.querySelectorAll(":scope > a")) as HTMLAnchorElement[]
	)
		.map((item) => item.querySelector(".small.text-muted")?.textContent?.trim())
		.filter((text): text is string => !!text)
		.map(parseNotificationRelativeTime)
		.filter((date): date is Date => date !== null);

	const oldestExistingDate =
		existingDates.length > 0
			? new Date(Math.min(...existingDates.map((d) => d.getTime())))
			: null;

	for (const toggle of document.querySelectorAll<HTMLElement>(
		".notifications-toggle",
	)) {
		toggle.addEventListener("click", async () => {
			restoreNotificationBell();
			const opened = await _notificationBellOpenedAt.getValue();
			await _notificationBellOpenedAt.setValue({
				...opened,
				[userId]: Date.now(),
			});
		});
	}

	const bellOpenedAt =
		(await _notificationBellOpenedAt.getValue())[userId] ?? 0;

	const notifications = await _kilnNotifications.getValue();
	for (const [id, notification] of Object.entries(notifications)) {
		if (notification.userId !== undefined && notification.userId !== userId) {
			continue;
		}
		const date = new Date(notification.date);
		if (oldestExistingDate !== null && date < oldestExistingDate) continue;

		injectNotification({
			message: notification.message,
			date,
			url: notification.url,
			avatarUrl: notification.avatarUrl,
			unread: !notification.read,
			lightBell:
				!notification.read &&
				!!notification.notifiedAt &&
				new Date(notification.notifiedAt).getTime() > bellOpenedAt,
			onClick: () => markKilnNotificationRead(id),
		});
	}

	const serverResult = await sendMessage("getKilnNotifications", userId).catch(
		() => null,
	);
	if (!serverResult?.ok) return;

	for (const notification of serverResult.data.data) {
		const date = new Date(notification.createdAt);
		if (oldestExistingDate !== null && date < oldestExistingDate) continue;

		injectNotification({
			message: notification.message,
			date,
			url: notification.url,
			avatarUrl: notification.avatarUrl ?? "",
			unread: notification.seenAt === null,
			lightBell: notification.seenAt === null && date.getTime() > bellOpenedAt,
			onClick: () => {
				sendMessage("markKilnNotificationSeen", {
					userId,
					notificationId: notification.id,
				});
			},
		});
	}
}

const AUDIO_CIRCUMFERENCE = 2 * Math.PI * 45;

export function createAudioPlayButton(
	assetId: number,
	activeAudio: { current: HTMLAudioElement | null },
) {
	const cont = document.createElement("div");
	cont.className =
		"audioPlayButtonCont rounded-4 bg-dark d-flex justify-content-center align-items-center";
	cont.style.cssText = "width:100%;aspect-ratio:1/1;font-size:0";
	cont.innerHTML = `
		<button type="button" class="audioPlayButton" style="font-size: 28px;">
			<svg class="progress-circle" width="100%" height="100%" viewBox="0 0 100 100">
				<circle class="progress-bar" cx="50" cy="50" r="45" stroke="#007aff" stroke-width="0" fill="none" stroke-dasharray="0, ${AUDIO_CIRCUMFERENCE}"></circle>
			</svg>
			<i class="buttonIcon fas fa-play"></i>
		</button>
	`;

	const button = cont.querySelector<HTMLButtonElement>(".audioPlayButton")!;
	const icon = cont.querySelector<HTMLElement>(".buttonIcon")!;
	const circle = cont.querySelector<SVGCircleElement>(".progress-bar")!;

	let audio: HTMLAudioElement | null = null;
	let loading = false;

	const onTimeUpdate = () => {
		if (!audio?.duration) return;
		const progress = audio.currentTime / audio.duration;
		const dashOffset = AUDIO_CIRCUMFERENCE * (1 - progress);
		circle.setAttribute(
			"stroke-dasharray",
			`${AUDIO_CIRCUMFERENCE}, ${AUDIO_CIRCUMFERENCE}`,
		);
		circle.setAttribute("stroke-dashoffset", String(dashOffset));
	};

	const setPlaying = (playing: boolean) => {
		icon.classList.toggle("fa-play", !playing);
		icon.classList.toggle("fa-pause", playing);
		circle.setAttribute("stroke-width", playing ? "10%" : "0");
		if (!playing)
			circle.setAttribute("stroke-dasharray", `0, ${AUDIO_CIRCUMFERENCE}`);
	};

	button.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (loading) return;

		if (audio) {
			if (audio.paused) {
				if (activeAudio.current && activeAudio.current !== audio)
					activeAudio.current.pause();
				activeAudio.current = audio;
				await audio.play();
			} else {
				audio.pause();
			}
			return;
		}

		loading = true;
		icon.className = "buttonIcon fas fa-spinner fa-spin";

		const result = await sendMessage("getAssetAudio", assetId);
		loading = false;
		if (!result.ok || !result.data.url) {
			icon.className = "buttonIcon fas fa-play";
			return;
		}

		icon.className = "buttonIcon fas fa-play";
		audio = new Audio(result.data.url);
		audio.addEventListener("timeupdate", onTimeUpdate);
		audio.addEventListener("play", () => setPlaying(true));
		audio.addEventListener("pause", () => setPlaying(false));
		audio.addEventListener("ended", () => {
			if (audio) audio.currentTime = 0;
			setPlaying(false);
		});

		if (activeAudio.current) activeAudio.current.pause();
		activeAudio.current = audio;
		await audio.play();
	});

	return cont;
}
