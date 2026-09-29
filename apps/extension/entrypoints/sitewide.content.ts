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

import "@/public/css/specific.css";

import errorIcon from "@/assets/error.svg";
import plusIcon from "@/assets/plus.svg";
import plusDeluxeIcon from "@/assets/plusDx.svg";
import _preferencesJson from "@/public/preferences.json";

const preferencesData = _preferencesJson.preferences;

import { escapeHtml } from "@/utils/escapeHtml";
import type { FeatureId } from "@/utils/featureIds.generated";
import { PATH_FEATURES } from "@/utils/featurePaths.generated";
import { checkForumMentions } from "@/utils/forumMentionNotifications";
import { syncPublicOutfits } from "@/utils/publicOutfits";
import { syncPublicTimezone } from "@/utils/publicTimezone";
import { runFeature } from "@/utils/runFeature";
import {
	_pastNotifications,
	_savedThemes,
	_showKilnDisclosures,
	_textTruncateFix,
	getEnabledDeprecatedFeatures,
	type PastNotification,
	preferences,
	UNASSIGNED_PAST_NOTIFICATIONS,
} from "@/utils/storage";
import { applyKilnTheme, THEME_PRESETS } from "@/utils/theme";
import { screenTradeNotifications } from "@/utils/tradeScreening";
import type { CurrencyCode } from "@/utils/types";
import {
	applyKilnDisclosureTitle,
	bricksToCurrency,
	createKilnDisclosureBadge,
	createModal,
	formatNotificationRelativeTime,
	getApiSession,
	getUserDetails,
	injectNoticeBanners,
	injectPostUpdateBanner,
	injectUpdateBanner,
	kilnDisclosureBadgeHtml,
	parseNotificationRelativeTime,
	renderKilnNotifications,
} from "@/utils/utilities";

async function applyActiveKilnTheme(): Promise<void> {
	const values = await preferences.getPreferences();
	if (!values.enabled.includes("themeCreator")) return;
	const activeId = values.config.themeCreator.activeThemeId || "default";
	if (activeId === "default") return;
	if (activeId in THEME_PRESETS) {
		applyKilnTheme(THEME_PRESETS[activeId]);
	} else {
		const saved = await _savedThemes.getValue();
		const theme = saved.find((t) => t.id === activeId);
		applyKilnTheme(theme ?? null);
	}
}

export default defineContentScript({
	matches: ["https://polytoria.com/*"],
	runAt: "document_start",
	async main() {
		registerErrorTracking();

		const isProfilePage = /^\/(u\/[^/]+|users\/\d+)\/?$/.test(
			location.pathname,
		);
		if (!isProfilePage) {
			try {
				await applyActiveKilnTheme();
			} catch (err) {
				console.error("[Kiln] Failed to apply active theme", err);
			}
			onMessage("themeAutoUpdated", () =>
				applyActiveKilnTheme().catch((err) =>
					console.error("[Kiln] Failed to apply active theme", err),
				),
			);

			const values = await preferences.getPreferences();
			if (values.enabled.includes("legacySidebar")) {
				const style = document.createElement("style");
				style.textContent =
					".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-secondary { display: none !important; }" +
					"#main-content { min-width: 0; }" +
					"html, body { overflow-x: clip; }";
				(document.head || document.documentElement).appendChild(style);

				const observer = new MutationObserver(async () => {
					const mainContent = document.getElementById("main-content");
					if (mainContent?.parentElement) {
						observer.disconnect();
						if (!mainContent.parentElement.querySelector(".nav-sidebar-cont")) {
							mainContent.parentElement.prepend(
								createSidebarElement(
									resolveMembershipStyle(
										values.config.legacySidebar.membershipStyle,
										detectNativeMembershipStyle(),
									),
									values.config.legacySidebar.showUpgradeBtn,
								),
							);
						}
						getUserDetails().then((user) => {
							if (!user) return;
							const invLink = document.querySelector<HTMLAnchorElement>(
								".nav-sidebar-cont a[data-inventory]",
							);
							if (invLink) invLink.href = `/users/${user.userId}/inventory/`;
						});
					}
				});
				observer.observe(document.documentElement, {
					childList: true,
					subtree: true,
				});
				document.addEventListener(
					"DOMContentLoaded",
					() => observer.disconnect(),
					{ once: true },
				);
			}
		}

		const onDOMReady = () => {
			document.body.setAttribute("data-URL", window.location.pathname);
			_textTruncateFix.getValue().then((enabled) => {
				document.body.setAttribute(
					"data-kiln-text-truncate-fix",
					String(enabled),
				);
			});
			const nativeMembershipStyle = detectNativeMembershipStyle();

			runFeature("noticeBanners", () => injectNoticeBanners());
			runFeature("postUpdateBanner", () => injectPostUpdateBanner());
			runFeature("updateBanner", () => injectUpdateBanner());
			runFeature("kilnSettingsLink", () => injectKilnSettingsLink());
			getUserDetails().then((user) => {
				if (!user) {
					console.warn("[Kiln] Failure to get logged in user details.");
					return;
				}

				if (import.meta.env.MODE == "development")
					console.info("[Kiln] Logged in as: ", user);

				renderKilnNotifications(user.userId);

				getApiSession(user.userId).then((state) => {
					if (state == null) {
						injectVerificationBanner();
					}
				});

				Promise.all([
					preferences.getPreferences(),
					_showKilnDisclosures.getValue(),
				]).then(async ([values, showDisclosures]) => {
					runFeature("deprecatedFeaturesBanner", () =>
						injectDeprecatedFeaturesBanner(values.enabled),
					);
					runFeature("footerInjectionInfo", () =>
						footerInjectionInfo(values.enabled),
					);

					runFeature("timezoneSharing", () =>
						syncPublicTimezone(
							user.userId,
							values.enabled.includes("timezoneSharing") &&
								(values.config.timezoneSharing?.shareTimezone ?? false),
						),
					);

					const isSharingOutfits = (prefs: typeof values) =>
						prefs.enabled.includes("publicAvatarOutfits") &&
						(prefs.config.publicAvatarOutfits?.shareOutfits ?? false);

					let sharingOutfits = isSharingOutfits(values);
					runFeature("publicAvatarOutfits", () =>
						syncPublicOutfits(user.userId, sharingOutfits),
					);

					if (window.location.pathname.startsWith("/my/settings/kiln")) {
						preferences.watch(async () => {
							const next = isSharingOutfits(await preferences.getPreferences());
							if (next === sharingOutfits) return;
							sharingOutfits = next;
							syncPublicOutfits(user.userId, next, { force: true });
						});
					}

					if (values.enabled.includes("localizedTimestamps")) {
						runFeature("localizedTimestamps", () =>
							localizedTimestamps(showDisclosures),
						);
					}

					if (values.enabled.includes("stickyNavbar")) {
						runFeature("stickyNavbar", () => stickyNavbar());
					}

					if (values.enabled.includes("hideNotificationBadges")) {
						runFeature("hideNotificationBadges", () => {
							const badges = document.querySelectorAll(
								".nav-secondary .nav-link .badge",
							);
							for (const badge of Array.from(badges)) {
								badge.remove();
							}
						});
					}

					if (values.enabled.includes("hideUserAds")) {
						runFeature("hideUserAds", () => {
							const adSelectors = [
								{ enabled: values.config.hideUserAds.banners, width: "728px" },
								{
									enabled: values.config.hideUserAds.rectangles,
									width: "300px",
								},
							];

							for (const { enabled, width } of adSelectors) {
								if (!enabled) continue;
								for (const a of document.querySelectorAll(
									`div[style^="max-width: ${width};"] a[href^="/ads"]`,
								)) {
									a.closest(`div[style^="max-width: ${width};"]`)?.remove();
								}
							}
						});
					}

					const isProfilePage = /^\/(u\/[^/]+|users\/\d+)\/?$/.test(
						location.pathname,
					);
					if (
						values.enabled.includes("themeCreator") &&
						(!isProfilePage || !profileBlocksTheme())
					) {
						runFeature("themeCreator", async () => {
							const activeId =
								values.config.themeCreator.activeThemeId || "default";
							if (activeId === "default") return;
							if (activeId in THEME_PRESETS) {
								applyKilnTheme(THEME_PRESETS[activeId]);
							} else {
								const saved = await _savedThemes.getValue();
								const theme = saved.find((t) => t.id === activeId);
								applyKilnTheme(theme ?? null);
							}
						});
					}

					if (values.enabled.includes("membershipThemes")) {
						runFeature("membershipThemes", () =>
							membershipThemes(values.config.membershipThemes.themeId),
						);
					}

					if (values.enabled.includes("disableMembershipThemes")) {
						runFeature("disableMembershipThemes", () =>
							disableMembershipThemes(),
						);
					}

					if (values.enabled.includes("legacySidebar")) {
						runFeature("legacySidebar", () =>
							legacySidebar(
								resolveMembershipStyle(
									values.config.legacySidebar.membershipStyle,
									nativeMembershipStyle,
								),
								values.config.legacySidebar.showUpgradeBtn,
							),
						);
					}

					if (values.enabled.includes("irlBrickPrice")) {
						runFeature("irlBrickPrice", async () => {
							const currency = await bricksToCurrency(
								user.bricks,
								values.config.irlBrickPrice.currency as CurrencyCode,
							);

							if (!currency) return;

							const brickBalance = document
								.querySelector('.navbar [data-bs-html="true"]')!
								.getElementsByTagName("span")[0]!;

							const currencySpan = document.createElement("span");
							currencySpan.style.color = "rgb(141 141 141)";
							currencySpan.textContent = `(${currency})`;
							applyKilnDisclosureTitle(
								currencySpan,
								showDisclosures,
								"IRL currency conversion",
							);
							brickBalance.append(" ", currencySpan);
						});
					}

					if (values.enabled.includes("userAliases")) {
						runFeature("userAliases", async () => {
							const aliases = await _userAliases.getValue();
							userAliases(user.userId, aliases, showDisclosures);
						});
					}

					if (values.enabled.includes("friendReqNotifActions")) {
						runFeature("friendReqNotifActions", () =>
							friendReqNotifActions(showDisclosures),
						);
					}

					if (values.enabled.includes("reenableSearch")) {
						runFeature("reenableSearch", () => reenableSearch());
					}

					if (values.enabled.includes("advancedForumSearch")) {
						runFeature("advancedForumSearch", () =>
							linkForumSearchToAdvanced(),
						);
					}

					if (values.enabled.includes("streakFreezeDisplay")) {
						runFeature("streakFreezeDisplay", () =>
							streakFreezeDisplay(showDisclosures),
						);
					}

					if (
						values.enabled.includes("forumMentions") &&
						values.config.forumMentions.notifications
					) {
						runFeature("forumMentions", () => checkForumMentions(user));
					}

					if (values.enabled.includes("pastNotifications")) {
						runFeature("pastNotifications", () =>
							pastNotifications(user.userId, showDisclosures),
						);
					}

					const screenNFT = values.enabled.includes("nftItems");
					const screenNLF = values.enabled.includes("nlfItems");
					if (screenNFT || screenNLF) {
						runFeature("tradeScreening", () =>
							screenTradeNotifications(
								user,
								{ nft: screenNFT, nlf: screenNLF },
								showDisclosures,
							),
						);
					}
				});
			});

			import("@/utils/themeEditorSidebar").then((m) =>
				m.restoreThemeEditorIfNeeded(),
			);
			if (
				new URLSearchParams(window.location.search).has("kiln-theme-editor")
			) {
				import("@/utils/themeEditorSidebar").then((m) =>
					m.openThemeEditorSidebar(),
				);
			}
		};

		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", onDOMReady, { once: true });
		} else {
			onDOMReady();
		}
	},
});

function registerErrorTracking(): void {
	const extensionPrefix = (browser.runtime.getURL as (path: string) => string)(
		"",
	);

	const isOwnError = (...haystack: Array<string | undefined>) =>
		haystack.some((s) => s?.includes(extensionPrefix));

	window.addEventListener("error", (e) => {
		if (!isOwnError(e.filename, e.error?.stack)) return;
		sendMessage("reportError", {
			type: "content",
			message: e.message,
			source: e.filename,
			stack: e.error?.stack,
			url: location.href,
		});
	});

	window.addEventListener("unhandledrejection", (e) => {
		const reason = e.reason;
		const message = reason instanceof Error ? reason.message : String(reason);
		const stack = reason instanceof Error ? reason.stack : undefined;
		if (!isOwnError(stack)) return;
		sendMessage("reportError", {
			type: "content",
			message,
			stack,
			url: location.href,
		});
	});
}

const FREE_NAVBAR_LOGO_URL =
	"https://cdn.polytoria.com/static/icon-B17Jdbl0.svg";

const THEME_BLOCKING_ITEM_IDS = new Set([
	151140, 43548, 35699, 34715, 34698, 34419, 34418, 34416, 34392, 34391, 34390,
	34389, 34380, 34379,
]);

function detectNativeMembershipStyle(): "free" | "plus" | "plusdx" {
	const navbar = document.querySelector(
		".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-topbar",
	);
	if (navbar?.classList.contains("navbar-plusdx")) return "plusdx";
	if (navbar?.classList.contains("navbar-plus")) return "plus";
	return "free";
}

function resolveMembershipStyle(
	style: "auto" | "free" | "plus" | "plusdx",
	native: "free" | "plus" | "plusdx",
): "free" | "plus" | "plusdx" {
	return style === "auto" ? native : style;
}

function profileBlocksTheme(): boolean {
	const card = document.querySelector("#user-equipped-items-card");
	if (!card) return false;
	return Array.from(
		card.querySelectorAll<HTMLAnchorElement>('a[href^="/store/"]'),
	).some((a) => {
		const match = a.getAttribute("href")?.match(/\/store\/(\d+)/);
		return match ? THEME_BLOCKING_ITEM_IDS.has(+match[1]) : false;
	});
}

function injectKilnSettingsLink() {
	const settingsLink = document.querySelector(
		'.dropdown-menu-end a[href="/my/settings"]',
	);
	if (!settingsLink) return;

	settingsLink.insertAdjacentHTML(
		"afterend",
		`<a href="/my/settings/kiln" class="text-reset text-decoration-none">
			<li class="dropdown-item">
				<i class="fad fa-fire me-1"></i>
				Kiln
			</li>
		</a>`,
	);
}

function injectDeprecatedFeaturesBanner(enabled: FeatureId[]) {
	const count = getEnabledDeprecatedFeatures(enabled).length;
	if (count === 0) return;

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
		"gap-2",
		"p-3",
		"rounded-0",
		"border-0",
		"text-dark",
	);
	banner.style.cssText =
		"background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px); margin: 0;";
	banner.role = "alert";

	const verb = count === 1 ? "is" : "are";
	const pronoun = count === 1 ? "it" : "them";
	banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>You have <b>${count}</b> feature${count === 1 ? "" : "s"} enabled that ${verb} deprecated. It is recommended you <a href="/my/settings/kiln?tab=prefs&category=deprecated" class="alert-link text-black">disable ${pronoun}</a>.</span>`;

	mainContent.prepend(banner);
}

function membershipThemes(themeId: "plus" | "plusdx") {
	const navbar = document.querySelector(
		".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-topbar",
	)!;
	const secondaryNavbar = document.querySelector(
		".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-secondary",
	)!;

	navbar.classList.add(`navbar-${themeId}`);
	secondaryNavbar.classList.add(`navbar-${themeId}`);

	const logo = navbar.getElementsByClassName("navbar-brand")[0]!
		.children[0] as HTMLImageElement;
	if (themeId == "plus") {
		logo.src = plusIcon;
	} else {
		logo.src = plusDeluxeIcon;
	}
}

function disableMembershipThemes() {
	const navbar = document.querySelector(
		".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-topbar",
	)!;
	const secondaryNavbar = document.querySelector(
		".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-secondary",
	);

	navbar.classList.remove("navbar-plus", "navbar-plusdx");
	secondaryNavbar?.classList.remove("navbar-plus", "navbar-plusdx");

	const logo = navbar.getElementsByClassName("navbar-brand")[0]?.children[0] as
		| HTMLImageElement
		| undefined;
	if (logo) logo.src = FREE_NAVBAR_LOGO_URL;
}

function createSidebarElement(
	membershipStyle: "free" | "plus" | "plusdx",
	showUpgradeBtn: boolean = true,
) {
	const logoUrl = FREE_NAVBAR_LOGO_URL;

	const logoFilters: Record<"free" | "plus" | "plusdx", string> = {
		free: "",
		plus: "invert(1) sepia(1) saturate(5) hue-rotate(160deg) brightness(1.1)",
		plusdx: "invert(1) sepia(1) saturate(8) hue-rotate(240deg) brightness(0.9)",
	};

	const filter = logoFilters[membershipStyle];

	const sidebar = document.createElement("div");
	sidebar.classList.add("nav-sidebar-cont", "d-lg-flex", "d-none");
	sidebar.innerHTML = `
	<div class="d-flex flex-column flex-shrink-0 bg-sidebar nav-sidebar ${
		membershipStyle == "plus" || membershipStyle == "plusdx"
			? `sidebar-${membershipStyle}`
			: ""
	}">
		<a href="https://polytoria.com/" class="d-block p-3 link-dark text-decoration-none mb-2">
			<img src="${logoUrl}" class="img-fluid"${filter ? ` style="filter: ${filter};"` : ""}>
			${
				membershipStyle == "plus" || membershipStyle == "plusdx"
					? `<div class="n${membershipStyle}-banner">
            	<i class="pi pi-${membershipStyle}" style="margin-right:-0.4em"></i>
            </div>`
					: ""
			}
		</a>
		<ul class="nav nav-flush flex-column mb-auto text-center">
			<li class="nav-item">
				<a href="https://polytoria.com/home" class="nav-link py-1 nav-sidebar-link">
					<div class="nav-sidebar-button">
						<i class="far fa-home"></i>
					</div>
					<div class="nav-sidebar-text">
						<span>Home</span>
					</div>
				</a>
			</li>
			<li class="nav-item">
				<a href="https://polytoria.com/my/avatar" class="nav-link py-1 nav-sidebar-link">
					<div class="nav-sidebar-button">
						<i class="far fa-user-crown"></i>
					</div>
					<div class="nav-sidebar-text">
						<span>Avatar</span>
					</div>
				</a>
			</li>
			<li class="nav-item">
				<a href="/my/inventory" data-inventory class="nav-link py-1 nav-sidebar-link">
					<div class="nav-sidebar-button">
						<i class="far fa-backpack"></i>
					</div>
					<div class="nav-sidebar-text">
						<span>Inventory</span>
					</div>
				</a>
			</li>
			<li class="nav-item">
				<a href="https://polytoria.com/create/" class="nav-link py-1 nav-sidebar-link">
					<div class="nav-sidebar-button">
						<i class="far fa-screwdriver-wrench"></i>
					</div>
					<div class="nav-sidebar-text">
						<span>Create</span>
					</div>
				</a>
			</li>
			<li class="nav-item">
				<a href="https://polytoria.com/my/friends" class="nav-link py-1 nav-sidebar-link">
					<div class="nav-sidebar-button">
						<i class="far fa-users"></i>
					</div>
					<div class="nav-sidebar-text">
						<span>Friends</span>
					</div>
				</a>
			</li>
			<li class="nav-item">
				<a href="https://polytoria.com/inbox/" class="nav-link py-1 nav-sidebar-link">
					<div class="nav-sidebar-button">
						<i class="far fa-mailbox"></i>
					</div>
					<div class="nav-sidebar-text">
						<span>Inbox</span>
					</div>
				</a>
			</li>
			<li class="nav-item">
				<a href="https://polytoria.com/trade/" class="nav-link py-1 nav-sidebar-link">
					<div class="nav-sidebar-button">
						<i class="far fa-handshake"></i>
					</div>
					<div class="nav-sidebar-text">
						<span>Trades</span>
					</div>
				</a>
			</li>
			<li class="nav-item">
				<a href="https://polytoria.com/rankings/" class="nav-link py-1 nav-sidebar-link">
					<div class="nav-sidebar-button">
						<i class="far fa-ranking-star"></i>
					</div>
					<div class="nav-sidebar-text">
						<span>Rankings</span>
					</div>
				</a>
			</li>
		</ul>
		${
			showUpgradeBtn
				? `<div class="d-flex align-items-center justify-content-center text-center">
			<a style="overflow: initial" href="https://polytoria.com/upgrade" class="nav-link py-1 nav-sidebar-link">
				<div class="nav-sidebar-button nav-sidebar-upgrade-button d-flex justify-content-center align-items-center">
					<i class="pi pi-plus" style="margin-bottom:13px;"></i>
				</div>
				<div class="nav-sidebar-text">
					<span>Upgrade</span>
				</div>
			</a>
		</div>`
				: ""
		}
	</div>
`;
	return sidebar;
}

function legacySidebar(
	membershipStyle: "free" | "plus" | "plusdx",
	showUpgradeBtn: boolean = false,
) {
	if (!document.querySelector(".nav-sidebar-cont")) {
		const pageContent = document.getElementById("main-content")?.parentElement;
		if (!pageContent) {
			console.warn("[Kiln] #main-content not found");
			return;
		}
		pageContent.prepend(createSidebarElement(membershipStyle, showUpgradeBtn));
	}

	if (!document.getElementById("kiln-legacy-sidebar-style")) {
		const style = document.createElement("style");
		style.id = "kiln-legacy-sidebar-style";
		style.textContent =
			"#main-content { min-width: 0; }html, body { overflow-x: clip; }";
		(document.head || document.documentElement).appendChild(style);
	}

	copySidebarBadges();

	const navbar = document.querySelector(
		".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-topbar",
	);
	navbar?.getElementsByClassName("navbar-brand")[0]?.remove();

	document
		.querySelector(
			".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-secondary",
		)
		?.remove();
}

function copySidebarBadges() {
	const sidebar = document.querySelector<HTMLElement>(".nav-sidebar-cont");
	if (!sidebar) return;

	const secondaryLinks = document.querySelectorAll<HTMLAnchorElement>(
		".navbar.nav-secondary .navbar-nav a.nav-link",
	);

	for (const navLink of secondaryLinks) {
		const badge = navLink.querySelector<HTMLElement>(".badge");
		if (!badge) continue;

		const href = navLink.getAttribute("href");
		if (!href) continue;

		const normalizedPath = href.replace(/^\/|\/$/g, "");

		const sidebarLink = Array.from(
			sidebar.querySelectorAll<HTMLAnchorElement>("a.nav-sidebar-link"),
		).find((a) => {
			const sHref = (a.getAttribute("href") ?? "")
				.replace(/^https?:\/\/[^/]+/, "")
				.replace(/^\/|\/$/g, "");
			return sHref === normalizedPath;
		});

		if (!sidebarLink) continue;

		const cloned = badge.cloneNode(true) as HTMLElement;
		cloned.classList.add("notif-nav", "notif-sidebar");
		sidebarLink.appendChild(cloned);
	}
}

function footerInjectionInfo(enabledIds: FeatureId[]) {
	const footerInfoContainer = document.querySelector(
		".footer-container .col-12:has(img)",
	);
	if (!footerInfoContainer) return;

	const currentUrl = window.location.href;

	const activeFeatureIds = Object.entries(PATH_FEATURES)
		.filter(([pattern]) => {
			const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
			return regex.test(currentUrl);
		})
		.flatMap(([, features]) => features)
		.filter((id) => enabledIds.includes(id as FeatureId));

	const pathCount = (id: string) =>
		Object.values(PATH_FEATURES).filter((features) =>
			(features as readonly string[]).includes(id),
		).length;

	const activeNames = preferencesData
		.filter((pref) => activeFeatureIds.includes(pref.id as any))
		.sort((a, b) => {
			const diff = pathCount(a.id) - pathCount(b.id);
			return diff !== 0 ? diff : a.name.localeCompare(b.name);
		})
		.map((pref) => pref.name);

	const injectionInfo = document.createElement("small");
	injectionInfo.classList.add("d-block", "text-muted", "mt-3");
	injectionInfo.style.fontSize = "0.7rem";
	injectionInfo.innerText = `Kiln has added the following feature(s) to the current page: ${activeNames.join(", ")}`;

	footerInfoContainer.appendChild(injectionInfo);
}

function userAliases(
	userId: number,
	aliases: Record<number, string>,
	showDisclosures: boolean,
) {
	const getUserId = (link: HTMLElement): number | null => {
		const ownHref = link.getAttribute("href");
		if (ownHref) {
			const match = ownHref.match(/^\/users\/(\d+)\/?$/);
			if (match) return +match[1];
		}

		const ancestorHref = link.closest("a")?.getAttribute("href");
		if (ancestorHref) {
			const match = ancestorHref.match(/^\/users\/(\d+)\/?$/);
			if (match) return +match[1];
		}

		return null;
	};

	const processUserLink = (link: HTMLElement) => {
		const id = getUserId(link);
		if (id === null) return;

		const alias = aliases[id];
		if (!alias) return;

		if (!link.matches('a[href^="/users/"]')) {
			if (!link.textContent?.trim()) return;
			link.innerText = alias;
			applyKilnDisclosureTitle(link, showDisclosures, "Kiln alias");
			return;
		}

		const textNodes = Array.from(link.childNodes).filter(
			(n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
		);
		if (textNodes.length === 0) return;

		textNodes[0].textContent = alias;
		for (const node of textNodes.slice(1)) node.remove();
		applyKilnDisclosureTitle(link, showDisclosures, "Kiln alias");
	};

	const processHomeTitle = () => {
		const alias = aliases[userId];
		if (!alias) return;

		const span = document.querySelector<HTMLElement>(
			"h3.home-title2 span.text-truncate",
		);
		if (span?.textContent?.trim()) {
			span.innerText = alias;
			applyKilnDisclosureTitle(span, showDisclosures, "Kiln alias");
		}
	};

	for (const link of document.querySelectorAll<HTMLElement>(
		'a [class^="userlink-"]',
	)) {
		processUserLink(link);
	}

	for (const link of document.querySelectorAll<HTMLAnchorElement>(
		'a[href^="/users/"]',
	)) {
		processUserLink(link);
	}

	processHomeTitle();

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;

				const candidates: HTMLElement[] = [];

				if (node.matches('a [class^="userlink-"]')) candidates.push(node);
				candidates.push(
					...node.querySelectorAll<HTMLElement>('a [class^="userlink-"]'),
				);

				if (node.matches('a[href^="/users/"]')) candidates.push(node);
				candidates.push(
					...node.querySelectorAll<HTMLElement>('a[href^="/users/"]'),
				);

				for (const candidate of candidates) {
					processUserLink(candidate);
				}

				if (
					node.matches("h3.home-title2") ||
					node.querySelector("h3.home-title2")
				) {
					processHomeTitle();
				}
			}
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });
}

function friendReqNotifActions(showDisclosures: boolean) {
	const popup = document.querySelector<HTMLElement>(".notifications-popup");
	if (!popup) {
		console.warn("[Kiln] .notifications-popup not found");
		return;
	}

	let activePopout: HTMLElement | null = null;
	let activeAnchor: HTMLAnchorElement | null = null;

	function createPopout(username: string, notifUrl: string): HTMLElement {
		const popout = document.createElement("div");
		Object.assign(popout.style, {
			position: "fixed",
			background: "rgb(37,37,37)",
			border: "3px solid rgb(71,71,71)",
			borderRadius: "10px",
			padding: "12px 14px",
			width: "200px",
			maxWidth: "calc(100vw - 20px)",
			boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
			zIndex: "99999",
			pointerEvents: "all",
			boxSizing: "border-box",
		});

		if (showDisclosures) {
			const badge = createKilnDisclosureBadge();
			Object.assign(badge.style, {
				display: "block",
				width: "fit-content",
				margin: "0 auto 6px auto",
			});
			popout.appendChild(badge);
		}

		const viewProfileBtn = document.createElement("button");
		viewProfileBtn.className = "btn btn-primary btn-sm w-100 mb-1";
		viewProfileBtn.innerHTML = "View Profile";

		const acceptBtn = document.createElement("button");
		acceptBtn.className = "btn btn-success btn-sm w-100 mb-1";
		acceptBtn.innerHTML = '<i class="fa-solid fa-check"></i> Accept';

		const declineBtn = document.createElement("button");
		declineBtn.className = "btn btn-danger btn-sm w-100";
		declineBtn.innerHTML = '<i class="fa-solid fa-x"></i> Decline';

		const resolveUserId = async (): Promise<number | null> => {
			const urlMatch = notifUrl.match(/\/users\/(\d+)/);
			if (urlMatch) return +urlMatch[1];
			const user = await sendMessage("findUserByUsername", username);
			return user.ok ? user.data : null;
		};

		const setLoading = (loading: boolean) => {
			acceptBtn.disabled = loading;
			declineBtn.disabled = loading;
		};

		viewProfileBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			setLoading(true);
			const userId = await resolveUserId();
			if (userId === null) {
				setLoading(false);
				return;
			}
			window.location.href = `https://polytoria.com/users/${userId}`;
		});

		acceptBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			setLoading(true);
			const userId = await resolveUserId();
			if (userId === null) {
				setLoading(false);
				return;
			}
			const result = await sendMessage("acceptFriendRequest", userId);
			if (result.ok) closePopout();
			else setLoading(false);
		});

		declineBtn.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			setLoading(true);
			const userId = await resolveUserId();
			if (userId === null) {
				setLoading(false);
				return;
			}
			const result = await sendMessage("declineFriendRequest", userId);
			if (result.ok) closePopout();
			else setLoading(false);
		});

		popout.appendChild(viewProfileBtn);
		popout.appendChild(acceptBtn);
		popout.appendChild(declineBtn);
		return popout;
	}

	function positionPopout(
		popout: HTMLElement,
		anchor: HTMLAnchorElement,
	): void {
		const rect = anchor.getBoundingClientRect();
		const popoutWidth = Math.min(200, window.innerWidth - 20);
		const gap = 10;
		const popoutHeight = 140;

		let top = rect.top + rect.height / 2 - popoutHeight / 2;
		top = Math.max(10, Math.min(top, window.innerHeight - popoutHeight - 10));

		let left = rect.left - popoutWidth - gap;

		if (left < 10) {
			left = rect.right + gap;
		}

		if (left + popoutWidth > window.innerWidth - 10) {
			left = window.innerWidth - popoutWidth - 10;
		}

		popout.style.top = `${top}px`;
		popout.style.left = `${left}px`;
		popout.style.width = `${popoutWidth}px`;
	}

	function closePopout(): void {
		activePopout?.remove();
		activePopout = null;
		activeAnchor = null;
	}

	function isFriendRequestNotif(anchor: HTMLAnchorElement): boolean {
		return /has sent you a friend request/i.test(anchor.textContent ?? "");
	}

	function extractUsername(anchor: HTMLAnchorElement): string {
		const textNode = anchor.querySelector<HTMLElement>("div > div:first-child");
		if (textNode) {
			return (textNode.textContent ?? "")
				.replace(/\s*has sent you a friend request\.?\s*/i, "")
				.trim();
		}

		return (anchor.textContent ?? "")
			.replace(/\s*has sent you a friend request\.?\s*/i, "")
			.replace(/\s*\d+\s+\w+\s+ago\s*/i, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	popup
		.querySelectorAll<HTMLAnchorElement>("a.text-reset")
		.forEach((anchor) => {
			if (!isFriendRequestNotif(anchor)) return;

			anchor.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();

				if (activePopout && activeAnchor === anchor) {
					closePopout();
					return;
				}

				closePopout();

				const popout = createPopout(
					extractUsername(anchor),
					anchor.getAttribute("href") ?? "",
				);
				document.body.appendChild(popout);
				positionPopout(popout, anchor);
				activePopout = popout;
				activeAnchor = anchor;
			});
		});

	document.addEventListener("click", (e) => {
		if (!activePopout) return;
		const target = e.target as Node;
		if (!activePopout.contains(target) && !activeAnchor?.contains(target)) {
			closePopout();
		}
	});
}

function localizedTimestamps(showDisclosures: boolean): void {
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const MONTHS_FULL = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const MONTHS_ABBR = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];

	function monthIndexFromFull(name: string): number {
		return MONTHS_FULL.findIndex((m) => m.toLowerCase() === name.toLowerCase());
	}
	function monthIndexFromAbbr(name: string): number {
		return MONTHS_ABBR.findIndex(
			(m) => m.toLowerCase() === name.slice(0, 3).toLowerCase(),
		);
	}

	function getParts(date: Date, tz: string, opts: Intl.DateTimeFormatOptions) {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			...opts,
		}).formatToParts(date);
		return (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	}

	function formatLongAmPm(date: Date, tz: string): string {
		const get = getParts(date, tz, {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: true,
		});
		return `${get("month")} ${get("day")}, ${get("year")} - ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod").toUpperCase()}`;
	}

	function formatShort24h(date: Date, tz: string): string {
		const get = getParts(date, tz, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")}`;
	}

	type PatternDef = {
		regex: RegExp;
		parse: (match: RegExpExecArray) => Date | null;
		format: (date: Date, tz: string) => string;
	};

	const PATTERNS: PatternDef[] = [
		{
			regex:
				/([A-Za-z]+) (\d{1,2}), (\d{4}) - (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)/,
			parse: (m) => {
				const monthIndex = monthIndexFromFull(m[1]);
				if (monthIndex === -1) return null;
				let hour = parseInt(m[4], 10);
				const ampm = m[7].toUpperCase();
				if (ampm === "PM" && hour !== 12) hour += 12;
				if (ampm === "AM" && hour === 12) hour = 0;
				return new Date(
					Date.UTC(
						parseInt(m[3], 10),
						monthIndex,
						parseInt(m[2], 10),
						hour,
						parseInt(m[5], 10),
						parseInt(m[6], 10),
					),
				);
			},
			format: formatLongAmPm,
		},
		{
			regex: /(\d{1,2}) ([A-Za-z]{3,9}) (\d{4}), (\d{2}):(\d{2})/,
			parse: (m) => {
				const monthIndex = monthIndexFromAbbr(m[2]);
				if (monthIndex === -1) return null;
				return new Date(
					Date.UTC(
						parseInt(m[3], 10),
						monthIndex,
						parseInt(m[1], 10),
						parseInt(m[4], 10),
						parseInt(m[5], 10),
						0,
					),
				);
			},
			format: formatShort24h,
		},
	];

	function localizeRaw(raw: string): string | null {
		for (const pattern of PATTERNS) {
			const match = pattern.regex.exec(raw);
			if (!match) continue;

			const date = pattern.parse(match);
			if (!date || Number.isNaN(date.getTime())) continue;

			const localized = pattern.format(date, timezone);
			return (
				raw.slice(0, match.index) +
				localized +
				raw.slice(match.index + match[0].length)
			);
		}
		return null;
	}

	let updatedAny = false;

	document
		.querySelectorAll<HTMLElement>('[data-bs-toggle="tooltip"]')
		.forEach((el) => {
			const raw =
				el.getAttribute("data-bs-original-title") ||
				el.getAttribute("data-bs-title") ||
				el.getAttribute("title");

			if (!raw) return;

			const localized = localizeRaw(raw);
			if (!localized) return;

			applyKilnDisclosureTitle(el, showDisclosures, localized);
			const finalTitle = el.title;

			el.setAttribute("data-bs-original-title", finalTitle);
			el.setAttribute("title", finalTitle);
			if (el.hasAttribute("data-bs-title")) {
				el.setAttribute("data-bs-title", finalTitle);
			}

			updatedAny = true;
		});

	if (updatedAny) {
		sendMessage("registerBootstrapElements");
	}
}

const OPAQUE_ALPHA_THRESHOLD = 0.85;
const STICKY_BG_ALPHA = 0.92;
const STICKY_BG_FALLBACK: [number, number, number] = [37, 37, 37];

function deTransparentize(el: HTMLElement) {
	const match = getComputedStyle(el).backgroundColor.match(
		/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/,
	);
	if (!match) return;

	const alpha = match[4] === undefined ? 1 : parseFloat(match[4]);
	if (alpha >= OPAQUE_ALPHA_THRESHOLD) return;

	const [r, g, b] =
		alpha === 0 && match[1] === "0" && match[2] === "0" && match[3] === "0"
			? STICKY_BG_FALLBACK
			: [match[1], match[2], match[3]];

	el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${STICKY_BG_ALPHA})`;
	el.style.backdropFilter = "blur(18px)";
	el.style.setProperty("-webkit-backdrop-filter", "blur(8px)");
}

function stickyNavbar() {
	const navbar = document.querySelector(
		".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-topbar",
	)! as HTMLElement;

	const secondaryNavbar = document.querySelector(
		".navbar.navbar-expand-lg.navbar-light.bg-navbar.nav-secondary",
	) as HTMLElement | null;

	const siteBanners = Array.from(
		document.querySelectorAll<HTMLElement>(".siteBannerCont"),
	);

	Object.assign(navbar.style, {
		position: "sticky",
		top: "0",
		zIndex: 2001,
	});

	if (secondaryNavbar) {
		Object.assign(secondaryNavbar.style, {
			position: "sticky",
			zIndex: 2000,
		});
	}

	deTransparentize(navbar);
	if (secondaryNavbar) deTransparentize(secondaryNavbar);

	const updateOffsets = () => {
		let offset = navbar.getBoundingClientRect().height;

		if (secondaryNavbar) {
			secondaryNavbar.style.top = `${offset}px`;
			offset += secondaryNavbar.getBoundingClientRect().height;
		}

		for (const banner of siteBanners) {
			banner.style.top = `${offset}px`;
			offset += banner.getBoundingClientRect().height;
		}
	};

	updateOffsets();

	const resizeObserver = new ResizeObserver(updateOffsets);
	resizeObserver.observe(navbar);
	if (secondaryNavbar) resizeObserver.observe(secondaryNavbar);
	for (const banner of siteBanners) resizeObserver.observe(banner);
}

function createSearchResultItem(user: {
	userId: number;
	username: string;
	thumbnailUrl: string | null;
	isStaff: boolean;
	userRoleClass: string | null;
}): HTMLElement {
	const item = document.createElement("div");
	item.className = "search-item highlight";
	item.tabIndex = 1;
	item.dataset.searchurl = `/users/${user.userId}`;

	const usernameClass = user.userRoleClass
		? `userlink-${user.userRoleClass}`
		: "";

	item.innerHTML = `
		<div class="row container">
			<div class="col-auto p-0">
				<img src="${escapeHtml(user.thumbnailUrl ?? errorIcon)}" class="rounded" height="48">
			</div>
			<div class="col">
				<div class="mt-1 ${usernameClass}" style="line-height:1.1;">${escapeHtml(user.username)}</div>
				<div class="text-muted"><small style="font-size:0.8em;">${user.isStaff ? "Staff" : "Player"}</small></div>
			</div>
		</div>
	`;

	item.addEventListener("click", () => {
		window.location.href = item.dataset.searchurl!;
	});

	return item;
}

function reenableSearch() {
	const input = document.getElementById("gsearch") as HTMLInputElement | null;
	if (!input) {
		console.warn("[Kiln] #gsearch not found");
		return;
	}

	const highlightSection = document.getElementById("search-highlight");
	const resultsContainer = document.getElementById("highlight-results");
	if (!highlightSection || !resultsContainer) {
		console.warn("[Kiln] search highlight elements not found");
		return;
	}

	const highlightLabel = highlightSection.querySelector("small.fw-bold");
	if (highlightLabel) {
		highlightLabel.textContent = "Quick Results (powered by Kiln)";
	}

	let requestId = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	const clearResults = () => {
		resultsContainer.innerHTML = "";
		highlightSection.classList.add("d-none");
	};

	input.addEventListener("input", () => {
		clearTimeout(debounceTimer);

		const query = input.value.trim();
		if (query.length < 2) {
			requestId++;
			clearResults();
			return;
		}

		debounceTimer = setTimeout(async () => {
			const thisRequest = ++requestId;

			resultsContainer.innerHTML =
				'<div class="text-center text-muted p-2"><span class="spinner-border spinner-border-sm"></span> Searching...</div>';
			highlightSection.classList.remove("d-none");

			const result = await sendMessage("searchUsersByActivity", query);
			if (thisRequest !== requestId) return;

			if (!result.ok || result.data.length === 0) {
				clearResults();
				return;
			}

			resultsContainer.innerHTML = "";
			for (const user of result.data) {
				resultsContainer.appendChild(createSearchResultItem(user));
			}
			highlightSection.classList.remove("d-none");
		}, 250);
	});
}

function linkForumSearchToAdvanced(): void {
	const forumSearchItem = document.querySelector<HTMLElement>(
		'.search-item[data-searchurl="/forum/search?q=%v"]',
	);
	if (!forumSearchItem) return;

	forumSearchItem.dataset.searchurl = "/forum/?kiln-adv-search&q=%v";
}

function streakFreezeDisplay(showDisclosures: boolean): void {
	const streakSpan = document.querySelector<HTMLElement>(
		".nav-link .text-streak",
	);
	const streakItem = streakSpan?.closest<HTMLElement>(
		'li[data-bs-toggle="tooltip"]',
	);
	if (!streakSpan || !streakItem) return;

	const raw =
		streakItem.getAttribute("data-bs-original-title") ||
		streakItem.getAttribute("data-bs-title") ||
		streakItem.getAttribute("title");

	(async () => {
		const result = await sendMessage("getStreakFreezeCount");
		if (!result.ok || result.data == null) return;

		const freezeCount = result.data;

		const freezeSmall = document.createElement("small");
		freezeSmall.className = "text-primary";
		Object.assign(freezeSmall.style, {
			marginLeft: "10px",
			whiteSpace: "nowrap",
		});
		freezeSmall.innerHTML = `<i class="fas fa-snowflake me-1"></i>${freezeCount}`;
		applyKilnDisclosureTitle(
			freezeSmall,
			showDisclosures,
			"Streak freezes remaining",
		);
		streakSpan.insertAdjacentElement("afterend", freezeSmall);

		if (!raw) return;

		const freezeText = `<p class="mb-0 mt-1"><i class="fas fa-snowflake me-1"></i>${freezeCount} streak freeze${freezeCount === 1 ? "" : "s"} left${kilnDisclosureBadgeHtml(showDisclosures)}</p>`;
		const updated = raw.replace(/<\/div>\s*$/, `${freezeText}</div>`);
		if (updated === raw) return;

		streakItem.setAttribute("data-bs-original-title", updated);
		streakItem.setAttribute("title", updated);
		if (streakItem.hasAttribute("data-bs-title")) {
			streakItem.setAttribute("data-bs-title", updated);
		}

		sendMessage("registerBootstrapElements");
	})();
}

const PAST_NOTIFICATIONS_LIMIT = 500;

const PAST_NOTIFICATION_TYPES = [
	{ id: "reply", label: "Replies", pattern: /replied to your post/i },
	{ id: "quote", label: "Quotes", pattern: /quoted your post/i },
	{
		id: "friend",
		label: "Friend requests",
		pattern: /friend request/i,
	},
	{
		id: "shout",
		label: "Guild shouts",
		pattern: /^A new shout has been posted/i,
	},
	{
		id: "wall",
		label: "Wall messages",
		pattern: /left a message on your wall/i,
	},
	{
		id: "message",
		label: "Private messages",
		pattern: /sent you a private message/i,
	},
	{ id: "trade", label: "Trades", pattern: /trade request/i },
] as const;

function getPastNotificationType(message: string): string {
	return (
		PAST_NOTIFICATION_TYPES.find((t) => t.pattern.test(message))?.id ?? "other"
	);
}

async function pastNotifications(
	userId: number,
	showDisclosures: boolean,
): Promise<void> {
	const popup = document.querySelector<HTMLElement>(".notifications-popup");
	if (!popup) return;

	injectPastNotificationsButton(popup, userId, showDisclosures);
	await recordPastNotifications(popup, userId);
}

async function recordPastNotifications(
	popup: HTMLElement,
	userId: number,
): Promise<void> {
	const all = await _pastNotifications.getValue();
	const stored = all[userId] ?? {};
	let changed = false;

	const unassigned = all[UNASSIGNED_PAST_NOTIFICATIONS];
	if (unassigned) {
		delete all[UNASSIGNED_PAST_NOTIFICATIONS];
		for (const notification of Object.values(unassigned)) {
			stored[notification.id] ??= notification;
		}
		changed = true;
	}

	for (const anchor of popup.querySelectorAll<HTMLAnchorElement>(
		':scope > a[href^="/my/notifications/"]',
	)) {
		const href = anchor.getAttribute("href")!;
		const idMatch = href.match(/^\/my\/notifications\/(\d+)\/?$/);
		if (!idMatch) continue;

		const id = Number(idMatch[1]);
		if (stored[id]) continue;

		const message = anchor
			.querySelector(".notification-item > div > div:first-child")
			?.textContent?.trim();
		if (!message) continue;

		const timeText =
			anchor.querySelector(".small.text-muted")?.textContent?.trim() ?? "";

		stored[id] = {
			id,
			message,
			url: href,
			avatarUrl: anchor.querySelector("img")?.getAttribute("src") ?? "",
			date: (
				parseNotificationRelativeTime(timeText) ?? new Date()
			).toISOString(),
		};
		changed = true;
	}

	if (!changed) return;

	const pruned = Object.values(stored)
		.sort((a, b) => b.id - a.id)
		.slice(0, PAST_NOTIFICATIONS_LIMIT);
	await _pastNotifications.setValue({
		...all,
		[userId]: Object.fromEntries(pruned.map((n) => [n.id, n])),
	});
}

function injectPastNotificationsButton(
	popup: HTMLElement,
	userId: number,
	showDisclosures: boolean,
): void {
	const header = popup.querySelector<HTMLElement>(":scope > div > .d-flex");
	if (!header || header.querySelector('[data-kiln="past-notifications"]'))
		return;

	const button = document.createElement("a");
	button.href = "#";
	button.className = "text-muted";
	button.dataset.kiln = "past-notifications";
	button.innerHTML =
		'<i class="fas fa-clock-rotate-left me-1"></i>Past Notifications';
	applyKilnDisclosureTitle(button, showDisclosures);
	header.prepend(button);

	let openModal: (() => Promise<void>) | null = null;
	button.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		openModal ??= createPastNotificationsModal(userId, showDisclosures);
		await openModal();
	});
}

function createPastNotificationsModal(
	userId: number,
	showDisclosures: boolean,
): () => Promise<void> {
	const modal = createModal("lg");
	modal.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-3">
			<h5 class="mb-0 text-white">
				<i class="fas fa-clock-rotate-left me-2"></i>Past Notifications${kilnDisclosureBadgeHtml(showDisclosures)}
			</h5>
			<button type="button" class="btn btn-sm btn-secondary" data-kiln="close-past-notifications">✕</button>
		</div>
		<div class="d-flex gap-2 mb-2">
			<input type="search" class="form-control form-control-sm" placeholder="Search notifications..." data-kiln="past-notifications-search">
			<select class="form-select form-select-sm w-auto flex-shrink-0" data-kiln="past-notifications-type">
				<option value="all">All types</option>
				${PAST_NOTIFICATION_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("")}
				<option value="other">Other</option>
			</select>
		</div>
		<div data-kiln="past-notifications-body" style="max-height: 60vh; overflow-y: auto;"></div>
		<div class="d-flex justify-content-between align-items-center mt-3">
			<small class="text-muted" data-kiln="past-notifications-count"></small>
			<button type="button" class="btn btn-sm btn-outline-danger" data-kiln="clear-past-notifications">
				<i class="fas fa-trash me-1"></i>Clear History
			</button>
		</div>
	`;

	const search = modal.querySelector<HTMLInputElement>(
		'[data-kiln="past-notifications-search"]',
	)!;
	const typeFilter = modal.querySelector<HTMLSelectElement>(
		'[data-kiln="past-notifications-type"]',
	)!;
	const body = modal.querySelector<HTMLElement>(
		'[data-kiln="past-notifications-body"]',
	)!;
	const count = modal.querySelector<HTMLElement>(
		'[data-kiln="past-notifications-count"]',
	)!;

	let notifications: PastNotification[] = [];

	const renderList = () => {
		const query = search.value.trim().toLowerCase();
		const type = typeFilter.value;
		const matches = notifications.filter(
			(n) =>
				(type === "all" || getPastNotificationType(n.message) === type) &&
				(!query || n.message.toLowerCase().includes(query)),
		);

		count.textContent = `${notifications.length} saved notification${notifications.length === 1 ? "" : "s"}`;
		body.innerHTML = "";

		if (matches.length === 0) {
			body.innerHTML = `<div class="text-center text-muted py-3">${
				notifications.length === 0
					? "No past notifications saved yet."
					: "No notifications match your search."
			}</div>`;
			return;
		}

		for (const notification of matches) {
			body.appendChild(renderPastNotificationEntry(notification));
		}
	};

	const load = async () => {
		const all = await _pastNotifications.getValue();
		notifications = Object.values(all[userId] ?? {}).sort(
			(a, b) => b.id - a.id,
		);
		renderList();
	};

	search.addEventListener("input", renderList);
	typeFilter.addEventListener("change", renderList);

	modal
		.querySelector<HTMLButtonElement>('[data-kiln="close-past-notifications"]')!
		.addEventListener("click", () => modal.close());

	modal
		.querySelector<HTMLButtonElement>('[data-kiln="clear-past-notifications"]')!
		.addEventListener("click", async () => {
			if (!confirm("Clear all saved past notifications?")) return;
			const all = await _pastNotifications.getValue();
			delete all[userId];
			await _pastNotifications.setValue(all);
			await load();
		});

	return async () => {
		search.value = "";
		typeFilter.value = "all";
		await load();
		modal.showModal();
	};
}

function renderPastNotificationEntry(
	notification: PastNotification,
): HTMLAnchorElement {
	const date = new Date(notification.date);

	const anchor = document.createElement("a");
	anchor.href = notification.url;
	anchor.className =
		"text-reset text-decoration-none d-flex align-items-center gap-3 p-2 border-bottom border-secondary";
	anchor.innerHTML = `
		<img src="${escapeHtml(notification.avatarUrl || errorIcon)}" class="rounded-circle border border-2 border-secondary flex-shrink-0" width="38" height="38">
		<div style="min-width: 0;">
			<div>${escapeHtml(notification.message)}</div>
			<div class="small text-muted" title="Approximately ${escapeHtml(date.toLocaleString())}">${formatNotificationRelativeTime(date)}</div>
		</div>
	`;
	return anchor;
}
