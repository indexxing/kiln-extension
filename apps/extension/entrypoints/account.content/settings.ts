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

import errorIcon from "@/assets/error.svg";
import data from "@/public/preferences.json";
import { escapeHtml } from "@/utils/escapeHtml";
import type { FeatureId } from "@/utils/featureIds.generated";
import { sendMessage } from "@/utils/messaging";
import {
	_condensedTabBars,
	_errorLog,
	_forumFeedbackRedirectBanner,
	_kilnUpdatesCategory,
	_savedThemes,
	_showKilnDisclosures,
	_textTruncateFix,
	apiSessions,
	cache,
	dismissedNotices,
	isChrome,
	isMobileDevice,
	migrateImportedPreferences,
	PREFERENCES_VERSION,
	PreferencesVersionError,
	preferences,
} from "@/utils/storage";
import { applyKilnTheme, THEME_PRESETS } from "@/utils/theme";
import {
	createModal,
	getApiSession,
	getConfig,
	getFlag,
	getUserDetails,
	pullCache,
	renderMarkdownLinks,
	updateApiSession,
} from "@/utils/utilities";
import { initThemeManager } from "./themeManager";

const KILN_ID_REGEX =
	/(?<![A-Za-z0-9_-])kiln:[A-Za-z0-9_-]{10}(?![A-Za-z0-9_-])/;
const KILN_ID_REGEX_GLOBAL = new RegExp(KILN_ID_REGEX.source, "g");

type Tags =
	| "all"
	| "utility"
	| "social"
	| "economy"
	| "development"
	| "expression"
	| "experimental"
	| "new"
	| "deprecated";

type NoteType = "warning" | "info" | "secondary";

type CategoryData = {
	id: Tags;
	name: string;
	description: string;
	icon: string;
};

type SettingData = {
	name: string;
	desc: string;
	id: FeatureId;
	requiresSync?: boolean;
	notes?: Array<{ type: NoteType; text: string }>;
	config?: Array<{
		type: "select" | "check" | "searchable-select";
		subsetting: string;
		label?: string;
		default?: string | boolean;
		options?: Array<{ value: string; label: string }>;
		hide?: boolean;
	}>;
	tags: Array<Tags>;
	hide?: boolean;
	desktopOnly?: boolean;
	chromeOnly?: boolean;
};

function isNewerVersion(latest: string, current: string): boolean {
	const parse = (v: string) => v.split(".").map(Number);
	const [lMaj, lMin, lPat] = parse(latest);
	const [cMaj, cMin, cPat] = parse(current);
	if (lMaj !== cMaj) return lMaj > cMaj;
	if (lMin !== cMin) return lMin > cMin;
	return lPat > cPat;
}

export function injectKilnTab() {
	const nav = document.querySelector("nav.nav.nav-pills.flex-column");
	if (!nav) return;

	const isActive =
		window.location.pathname.includes("kiln") &&
		!window.location.pathname.includes("kiln-debug");

	const link = document.createElement("a");
	link.className = `nav-link${isActive ? " active" : ""}`;
	link.href = "/my/settings/kiln";
	link.innerHTML =
		'<i class="fas fa-fire me-1"></i> <span class="pilltitle">Kiln</span>';

	const hr = nav.querySelector("hr");
	if (hr) nav.insertBefore(link, hr);
	else nav.appendChild(link);
}

export async function kilnSettings() {
	const content = document.getElementsByClassName(
		"col-lg-10",
	)[0] as HTMLElement;
	const version = browser.runtime.getManifest().version;
	const showDebug =
		import.meta.env.MODE == "development" ||
		new URLSearchParams(window.location.search).has("kiln-debug");

	const sessions = await apiSessions.getValue();
	const adminSession = sessions.find(
		(s) => s.state === "verified" && s.userId === 2782 && s.accessToken,
	);
	const showAdmin = !!adminSession;

	content.innerHTML = `
		<div class="d-flex gap-2 w-100 mb-2">
			<button type="button" class="btn btn-primary flex-grow-1" id="kiln-tab-about">About</button>
			<button type="button" class="btn btn-secondary flex-grow-1" id="kiln-tab-prefs">Preferences</button>
			<button type="button" class="btn btn-secondary flex-grow-1" id="kiln-tab-changelog">Changelog</button>
			<button type="button" class="btn btn-secondary flex-grow-1" id="kiln-tab-sync">Sync</button>
			${showAdmin ? '<button type="button" class="btn btn-secondary flex-grow-1" id="kiln-tab-admin">Admin</button>' : ""}
			${showDebug ? '<button type="button" class="btn btn-secondary flex-grow-1" id="kiln-tab-debug">Debug</button>' : ""}
		</div>
		<div>
			<div id="kiln-about-notices" class="mb-2"></div>
			<div id="kiln-about"></div>
			<div id="kiln-prefs" style="display:none;">
				<div id="kiln-prefs-inner"></div>
				<div class="mt-3 d-flex gap-2 d-none">
					<button id="kiln-reset-btn" class="btn btn-warning btn-sm">Reset to Defaults</button>
					<button id="kiln-sessions-btn" class="btn btn-secondary btn-sm">API Sessions</button>
				</div>
			</div>
			<div id="kiln-changelog" style="display:none;"></div>
			<div id="kiln-sync" style="display:none;"></div>
			${showAdmin ? '<div id="kiln-admin" style="display:none;"><div id="kiln-admin-inner"></div></div>' : ""}
			${showDebug ? '<div id="kiln-debug" style="display:none;"><div id="kiln-debug-inner" class="row g-3"></div></div>' : ""}
		</div>
	`;

	const panels: Record<string, HTMLElement> = {
		about: document.getElementById("kiln-about")!,
		prefs: document.getElementById("kiln-prefs")!,
		changelog: document.getElementById("kiln-changelog")!,
		sync: document.getElementById("kiln-sync")!,
		...(showAdmin ? { admin: document.getElementById("kiln-admin")! } : {}),
		...(showDebug ? { debug: document.getElementById("kiln-debug")! } : {}),
	};
	const tabBtns: Record<string, HTMLElement> = {
		about: document.getElementById("kiln-tab-about")!,
		prefs: document.getElementById("kiln-tab-prefs")!,
		changelog: document.getElementById("kiln-tab-changelog")!,
		sync: document.getElementById("kiln-tab-sync")!,
		...(showAdmin ? { admin: document.getElementById("kiln-tab-admin")! } : {}),
		...(showDebug ? { debug: document.getElementById("kiln-tab-debug")! } : {}),
	};

	function switchTab(name: string) {
		for (const [key, panel] of Object.entries(panels)) {
			panel.style.display = key === name ? "" : "none";
		}
		for (const [key, btn] of Object.entries(tabBtns)) {
			btn.className = `btn flex-grow-1 ${key === name ? "btn-primary" : "btn-secondary"}`;
		}
		const url = new URL(window.location.href);
		url.searchParams.set("tab", name);
		history.replaceState(null, "", url);
	}

	for (const [name, btn] of Object.entries(tabBtns)) {
		btn.addEventListener("click", () => switchTab(name));
	}

	if (showAdmin) {
		initAdminTab(adminSession!.userId);
	}
	if (showDebug) {
		initDebugTab(document.getElementById("kiln-debug-inner") as HTMLElement);
	}
	initSessionsDialog();
	initWhatsNewTab();
	initSyncTab();
	initAboutTab();

	async function initAboutTab() {
		const container = document.getElementById("kiln-about")!;
		const config = await getConfig();
		const showFutureOfKiln = getFlag(
			config.flags,
			"general.futureOfKilnNotice.visible",
			false,
		);
		container.innerHTML = `
			<div class="card mb-2">
				<div class="card-body">
					<h4 class="mb-1">Kiln</h4>
					<p class="text-muted small mb-3">v${version} &middot; Made by <a href="https://polytoria.com/u/Index" target="_blank">Index</a></p>
					<p class="mb-3">50+ features. Everything Polytoria should have built in.</p>
					<div class="d-flex flex-column gap-2">
						<a href="https://discord.gg/dczBuRDKPX" target="_blank" class="btn btn-primary btn-sm align-self-start"
						data-bs-toggle="tooltip" data-bs-title="Join the Discord to get the latest news on Kiln and participate in polls to shape the extension! Discord is 13+.">
							<i class="fab fa-discord me-1"></i> Join the Discord
						</a>

						<div class="d-flex gap-3 small">
							<a href="https://kiln.indexx.dev" target="_blank" class="text-muted text-decoration-none">
								<i class="fa-solid fa-globe me-1"></i>Website
							</a>
							<!--
							<a href="#" target="_blank" class="text-muted text-decoration-none">
								<i class="fa-solid fa-list-timeline me-1"></i>Roadmap
							</a>
							-->
							<a href="https://github.com/indexxing/kiln-extension" target="_blank" class="text-muted text-decoration-none">
								<i class="fab fa-github me-1"></i>Github
							</a>
							<a href="https://kiln.indexx.dev/privacy" target="_blank" class="text-muted text-decoration-none">
								Privacy Policy
							</a>
							<a href="https://kiln.indexx.dev/terms" target="_blank" class="text-muted text-decoration-none">
								Terms of Service
							</a>
						</div>
					</div>
				</div>
			</div>
			${
				showFutureOfKiln
					? `
			<div class="card mb-2">
				<div class="card-header">
					<h5 class="mb-0">The Future of Kiln</h5>
				</div>
				<div class="card-body">
					<p class="mb-3">v2.13.0 is the last feature-packed update for now. Future updates will be mostly bug fixes until Polytoria's new site comes out, which then Kiln might return.</p>

					<p class="mb-3">As some may already know, Polytoria is in the process of remaking the website from scratch, which will make most of Kiln redundant (if they chose to copy its features). That and it'd require significant refactoring to work with the new page layouts.</p>

					<p class="mb-3">Features that depend on my API will still work for the foreseeable future. Don't worry about that (though I'm sure nobody is).</p>

					<p class="mb-3">Making Kiln has been so much fun, and it was awesome to see so many people install it &lt;3</p>

					<hr class="my-3">

					<p class="mb-0 text-muted">Index</p>
				</div>
			</div>
			`
					: ""
			}
			<div class="card mb-2 d-none">
				<div class="card-header small fw-semibold d-flex justify-content-between align-items-center">
					<h5 class="mb-0">Support the Extension</h5>
				</div>
				<div class="card-body text-center">
					<p class="text-muted mb-3">Support the extension's development with bricks! Donations don't grant you any special perks. The extension will always remain free for everyone <3</p>
					<div class="row justify-content-center">
						<div class="col">
							<a href="/store/" class="text-reset">
								<div class="card bg-dark" style="border-color: #333;">
									<div class="card-body">
										<img src="" class="img-fluid rounded" alt="Small Donation" width="100" height="100">
										<h6 class="text-truncate mb-0 mt-1">
											Small Donation
										</h6>
									</div>
								</div>
							</a>
						</div>
						<div class="col">
							<a href="/store/" class="text-reset">
								<div class="card bg-dark" style="border-color: #333;">
									<div class="card-body">
										<img src="" class="img-fluid rounded" alt="Small Donation" width="100" height="100">
										<h6 class="text-truncate mb-0 mt-1">
											Small Donation
										</h6>
									</div>
								</div>
							</a>
						</div>
						<div class="col">
							<a href="/store/" class="text-reset">
								<div class="card bg-dark" style="border-color: #333;">
									<div class="card-body">
										<img src="" class="img-fluid rounded" alt="Small Donation" width="100" height="100">
										<h6 class="text-truncate mb-0 mt-1">
											Small Donation
										</h6>
									</div>
								</div>
							</a>
						</div>
					</div>
				</div>
			</div>
			<div class="card mb-2">
				<div class="card-header small fw-semibold d-flex justify-content-between align-items-center">
					<h5 class="mb-0">System Status</h5>
					<button id="kiln-status-refresh" class="btn btn-sm btn-outline-secondary py-0 px-2" title="Refresh">
						<i class="fas fa-sync-alt" style="font-size:0.75rem;"></i>
					</button>
				</div>
				<div class="card-body p-0" id="kiln-status-list"></div>
			</div>
			<div class="card">
				<div class="card-header small fw-semibold"><h5 class="mb-0">Send Feedback</h5></div>
				<div class="card-body">
					<p class="text-muted small mb-2">Have a suggestion, ran into a bug, or just want to say something? Send it directly to me! :D</p>
					<div class="alert border-secondary small py-2 mb-2">
						<i class="fas fa-info-circle me-1"></i>
						Please keep feedback related to Kiln, not Polytoria.
					</div>
					<div class="d-flex gap-2 mb-2" id="kiln-feedback-type-group">
						<button type="button" class="btn btn-primary btn-sm flex-grow-1" data-type="general">General</button>
						<button type="button" class="btn btn-secondary btn-sm flex-grow-1" data-type="feature">Suggestion</button>
						<button type="button" class="btn btn-secondary btn-sm flex-grow-1" data-type="bug">Bug Report</button>
					</div>
					<div>
						<textarea id="kiln-feedback-message" class="form-control form-control-sm bg-dark" rows="5" maxlength="2000" placeholder="Describe your suggestion, feedback, or bug..."></textarea>
						<div class="text-muted small text-end mt-1"><span id="kiln-feedback-chars">0</span>/2000</div>
					</div>
					<div class="d-flex align-items-center gap-2">
						<button id="kiln-feedback-submit" class="btn btn-primary btn-sm">Submit</button>
						<span id="kiln-feedback-status" class="small"></span>
						<div id="kiln-feedback-bug-notice" class="alert border-danger small py-1 px-2 mb-0 d-none">
							<i class="fas fa-info-circle me-1"></i>Includes minimal, non-invasive diagnostic info (whether you're on Firefox & recent errors by the extension) to track down the issue.
						</div>
					</div>
					<hr class="my-3">
					<div class="d-flex justify-content-between align-items-center" id="kiln-my-feedback-header" style="cursor:pointer;">
						<span class="small fw-semibold">
							My Feedback
							<span class="badge bg-secondary ms-1 d-none" id="kiln-my-feedback-count"></span>
						</span>
						<i class="fas fa-chevron-down text-muted" id="kiln-my-feedback-chevron" style="font-size:0.75rem;transition:transform 200ms;"></i>
					</div>
					<div id="kiln-my-feedback-body" class="mt-2" style="display:none;"></div>
				</div>
			</div>
			<div class="card mt-2">
				<div class="card-header small fw-semibold"><h5 class="mb-0">Misc. Preferences</h5></div>
				<div class="card-body py-2">
					<div class="form-check form-switch mb-0">
						<input class="form-check-input" type="checkbox" id="kiln-update-notices-toggle">
						<label class="form-check-label small" for="kiln-update-notices-toggle">Show update available banners</label>
					</div>
					<div class="form-check form-switch mb-0 mt-2">
						<input class="form-check-input" type="checkbox" id="kiln-post-update-notices-toggle">
						<label class="form-check-label small" for="kiln-post-update-notices-toggle">Show "Kiln has updated" banners</label>
					</div>
					<div class="form-check form-switch mb-0 mt-2">
						<input class="form-check-input" type="checkbox" id="kiln-show-disclosures-toggle">
						<label class="form-check-label small" for="kiln-show-disclosures-toggle">Clearly label every feature as added by Kiln</label>
					</div>
					<div class="form-check form-switch mb-0 mt-2">
						<input class="form-check-input" type="checkbox" id="kiln-condensed-tab-bars-toggle">
						<label class="form-check-label small" for="kiln-condensed-tab-bars-toggle">Condense tab bars (World Reviews & User Creations Tab)</label>
					</div>
					<div class="form-check form-switch mb-0 mt-2">
						<input class="form-check-input" type="checkbox" id="kiln-text-truncate-fix-toggle">
						<label class="form-check-label small" for="kiln-text-truncate-fix-toggle">Always show ellipses on truncated text</label>
					</div>
					<div class="form-check form-switch mb-0 mt-2">
						<input class="form-check-input" type="checkbox" id="kiln-forum-feedback-banner-toggle">
						<label class="form-check-label small" for="kiln-forum-feedback-banner-toggle">Suggest the feedback form when writing a Kiln-related forum post</label>
					</div>
					<div class="form-check form-switch mb-0 mt-2">
						<input class="form-check-input" type="checkbox" id="kiln-updates-category-toggle">
						<label class="form-check-label small" for="kiln-updates-category-toggle">Show the "Kiln Updates" forum category</label>
					</div>
				</div>
			</div>
		`;

		sendMessage("registerBootstrapElements");

		const services = [
			{ name: "Polytoria API", url: "https://api.polytoria.com/v1/users/2782" },
			{ name: "Kiln API", url: "https://kiln-api.indexx.dev/" },
			{
				name: "Polytoria.Trade API",
				url: "https://polytoria.trade/api/trpc/getItemWithTags,getItemGraph?batch=1&input=%7B%220%22%3A149925%2C%221%22%3A149925%7D",
			},
			{
				name: "Polytrack",
				url: "https://polytrack.top/users/2782?view=stats&_data=routes%2Fusers.%24id",
			},
		];

		async function checkStatus(force = false) {
			const list = document.getElementById("kiln-status-list")!;
			const refreshBtn = document.getElementById(
				"kiln-status-refresh",
			) as HTMLButtonElement;
			refreshBtn.disabled = true;

			list.innerHTML = services
				.map(
					(s, i) => `
					<div class="d-flex align-items-center gap-2 px-3 py-2${i < services.length - 1 ? " border-bottom border-secondary" : ""}" data-status-service="${s.name}">
						<span class="spinner-border spinner-border-sm text-muted" style="width:0.7rem;height:0.7rem;border-width:2px;" role="status"></span>
						<span class="flex-grow-1 small">${s.name}</span>
						<code class="text-muted" style="font-size:0.7rem;">${new URL(s.url).hostname}</code>
					</div>
				`,
				)
				.join("");

			const results = (await pullCache(
				"statusCheck",
				async () =>
					Promise.all(
						services.map(async (service) => {
							const start = Date.now();
							try {
								const controller = new AbortController();
								const timeoutId = setTimeout(() => controller.abort(), 6000);
								await fetch(service.url, {
									method: "GET",
									mode: "no-cors",
									cache: "no-store",
									signal: controller.signal,
								});
								clearTimeout(timeoutId);
								return {
									name: service.name,
									ok: true,
									label: `${Date.now() - start}ms`,
								};
							} catch (e) {
								return {
									name: service.name,
									ok: false,
									label:
										(e as Error).name === "AbortError"
											? "Timed out"
											: "Unreachable",
								};
							}
						}),
					),
				5 * 60 * 1000,
				force,
			)) as Array<{ name: string; ok: boolean; label: string }>;

			for (const result of results) {
				const row = list.querySelector<HTMLElement>(
					`[data-status-service="${result.name}"]`,
				)!;
				row.innerHTML = `
					<i class="fas fa-circle ${result.ok ? "text-success" : "text-danger"}" style="font-size:0.55rem;"></i>
					<span class="flex-grow-1 small">${result.name}</span>
					<span class="${result.ok ? "text-muted" : "text-danger"}" style="font-size:0.72rem;">${result.label}</span>
				`;
			}

			refreshBtn.disabled = false;
		}

		checkStatus();
		document
			.getElementById("kiln-status-refresh")!
			.addEventListener("click", () => checkStatus(true));

		initFeedbackTab();

		const toggle = document.getElementById(
			"kiln-update-notices-toggle",
		) as HTMLInputElement;
		const currentDismissed = await dismissedNotices.getValue();
		toggle.checked = !currentDismissed.includes("update-notices-disabled");
		toggle.addEventListener("change", async () => {
			const dismissed = await dismissedNotices.getValue();
			if (toggle.checked) {
				await dismissedNotices.setValue(
					dismissed.filter((id) => id !== "update-notices-disabled"),
				);
			} else {
				if (!dismissed.includes("update-notices-disabled")) {
					await dismissedNotices.setValue([
						...dismissed,
						"update-notices-disabled",
					]);
				}
			}
		});

		const postUpdateToggle = document.getElementById(
			"kiln-post-update-notices-toggle",
		) as HTMLInputElement;
		postUpdateToggle.checked = !currentDismissed.includes(
			"post-update-notices-disabled",
		);
		postUpdateToggle.addEventListener("change", async () => {
			const dismissed = await dismissedNotices.getValue();
			if (postUpdateToggle.checked) {
				await dismissedNotices.setValue(
					dismissed.filter((id) => id !== "post-update-notices-disabled"),
				);
			} else {
				if (!dismissed.includes("post-update-notices-disabled")) {
					await dismissedNotices.setValue([
						...dismissed,
						"post-update-notices-disabled",
					]);
				}
			}
		});

		const showDisclosuresToggle = document.getElementById(
			"kiln-show-disclosures-toggle",
		) as HTMLInputElement;
		showDisclosuresToggle.checked = await _showKilnDisclosures.getValue();
		showDisclosuresToggle.addEventListener("change", async () => {
			await _showKilnDisclosures.setValue(showDisclosuresToggle.checked);
		});

		const condensedTabBarsToggle = document.getElementById(
			"kiln-condensed-tab-bars-toggle",
		) as HTMLInputElement;
		condensedTabBarsToggle.checked = await _condensedTabBars.getValue();
		condensedTabBarsToggle.addEventListener("change", async () => {
			await _condensedTabBars.setValue(condensedTabBarsToggle.checked);
		});

		const textTruncateFixToggle = document.getElementById(
			"kiln-text-truncate-fix-toggle",
		) as HTMLInputElement;
		textTruncateFixToggle.checked = await _textTruncateFix.getValue();
		textTruncateFixToggle.addEventListener("change", async () => {
			await _textTruncateFix.setValue(textTruncateFixToggle.checked);
		});

		const forumFeedbackBannerToggle = document.getElementById(
			"kiln-forum-feedback-banner-toggle",
		) as HTMLInputElement;
		forumFeedbackBannerToggle.checked =
			await _forumFeedbackRedirectBanner.getValue();
		forumFeedbackBannerToggle.addEventListener("change", async () => {
			await _forumFeedbackRedirectBanner.setValue(
				forumFeedbackBannerToggle.checked,
			);
		});

		const updatesCategoryToggle = document.getElementById(
			"kiln-updates-category-toggle",
		) as HTMLInputElement;
		updatesCategoryToggle.checked = await _kilnUpdatesCategory.getValue();
		updatesCategoryToggle.addEventListener("change", async () => {
			await _kilnUpdatesCategory.setValue(updatesCategoryToggle.checked);
		});

		const notesContainer = document.getElementById("kiln-about-notices")!;
		notesContainer.innerHTML = "";
		if (
			isNewerVersion(
				config.latestVersion,
				browser.runtime.getManifest().version,
			)
		) {
			const el = document.createElement("div");
			el.className = "alert border-warning mb-0";
			el.innerHTML = `<b>Update available!</b> Kiln ${config.latestVersion} is out. Check for updates in your browser's extension manager.`;
			notesContainer.appendChild(el);
		}
		for (const notice of config.notices) {
			const el = document.createElement("div");
			el.className = `alert border-${notice.type === "info" ? "primary" : "warning"} mb-0`;
			el.innerHTML = renderMarkdownLinks(notice.message, "alert-link");
			notesContainer.appendChild(el);
		}
	}

	async function initPrefsTab() {
		const inner = document.getElementById("kiln-prefs-inner")!;
		inner.innerHTML = `
			<div class="mb-2 d-flex align-items-center gap-2">
				<input id="kiln-search" type="text" class="form-control form-control-sm" placeholder="Search preferences..." />
				<button id="kiln-export-btn" class="btn btn-secondary btn-sm w-25">Export</button>
				<button id="kiln-import-btn" class="btn btn-secondary btn-sm w-25">Import</button>
			</div>
			<div id="kiln-config-notes"></div>
			<div id="kiln-settings-list"></div>
		`;

		const values = await preferences.getPreferences();
		const config = await getConfig();
		const settingsList = document.getElementById("kiln-settings-list")!;
		const mobile = isMobileDevice();
		const chrome = isChrome();

		const MODIFIER_TAGS = new Set(["experimental"]);
		const categories = data.categories as CategoryData[];
		const usedTags = new Set(
			(data.preferences as SettingData[]).flatMap((s) =>
				s.hide || (mobile && s.desktopOnly)
					? []
					: s.tags.filter((t) => !MODIFIER_TAGS.has(t)),
			),
		);
		const groupOrder = categories
			.filter((c) => usedTags.has(c.id))
			.map((c) => c.id);
		const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

		const groupBodies: Record<string, HTMLElement> = {};
		const newGroupBodies: Record<string, HTMLElement> = {};
		const hiddenStore = document.createElement("div");
		hiddenStore.style.display = "none";
		settingsList.appendChild(hiddenStore);
		for (const tag of groupOrder) {
			const body = document.createElement("div");
			body.className = "card-body";
			hiddenStore.appendChild(body);
			groupBodies[tag] = body;

			const newBody = document.createElement("div");
			newBody.className = "card-body";
			hiddenStore.appendChild(newBody);
			newGroupBodies[tag] = newBody;
		}

		function getState(id: FeatureId) {
			return values.enabled.includes(id);
		}

		function updateRowState(row: HTMLElement, state: boolean) {
			row.querySelector<HTMLInputElement>(".toggle-btn")!.checked = state;
		}

		function setConfigDisabled(row: HTMLElement, disabled: boolean) {
			for (const el of Array.from(
				row.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
					"input:not(.toggle-btn), select",
				),
			)) {
				el.disabled = disabled;
			}
		}

		const sortKey = (name: string) =>
			name.replace(/^[^A-Za-z]+/, "").toLowerCase();
		const sortedPreferences = [...(data.preferences as SettingData[])].sort(
			(a, b) => {
				const aIsNew = a.tags.includes("new");
				const bIsNew = b.tags.includes("new");
				if (aIsNew !== bIsNew) return aIsNew ? -1 : 1;
				return sortKey(a.name).localeCompare(sortKey(b.name));
			},
		);

		for (const setting of sortedPreferences) {
			if (setting.hide || (mobile && setting.desktopOnly)) continue;

			const primaryTags = setting.tags.filter((t) => !MODIFIER_TAGS.has(t));
			if (primaryTags.length === 0) continue;
			const isNew = setting.tags.includes("new");

			const state = getState(setting.id);
			const remotelyDisabled =
				config.flags[`features.${setting.id}.enabled`] === false;
			const chromeOnlyUnavailable = setting.chromeOnly && !chrome;

			const tagBadges = [...setting.tags]
				.sort((a, b) => {
					const p = (t: string) =>
						t === "experimental" || t === "new" || t === "deprecated" ? -1 : 1;
					return p(a) - p(b);
				})
				.map((tag) => {
					const cls =
						tag === "experimental"
							? "bg-warning text-dark"
							: tag === "new"
								? "bg-success"
								: tag === "deprecated"
									? "bg-danger"
									: "bg-secondary";
					return `<span class="badge ${cls} me-1">${tag.charAt(0).toUpperCase() + tag.slice(1)}</span>`;
				})
				.join("");

			const allNotes = [
				...(chromeOnlyUnavailable
					? [
							{
								type: "warning" as NoteType,
								text: "Unavailable on Firefox.",
							},
						]
					: []),
				...(setting.requiresSync
					? [
							{
								type: "info" as NoteType,
								text: "Requires a linked Kiln account.",
							},
						]
					: []),
				...(setting.notes ?? []),
			];
			const noteHtml = allNotes
				.map((note) => {
					const cls =
						note.type === "warning"
							? "text-warning"
							: note.type === "info"
								? "text-info"
								: "text-secondary";
					const icon =
						note.type === "warning"
							? '<i class="fas fa-exclamation-triangle me-1"></i>'
							: note.type === "info"
								? '<i class="fas fa-info-circle me-1"></i>'
								: "* ";
					return `<span class="${cls} small d-block">${icon}${note.text}</span>`;
				})
				.join("");

			const cardInnerHtml = `
				<div class="d-flex justify-content-between align-items-start">
					<div class="flex-grow-1 me-3">
						<div class="fw-semibold mb-1">${setting.name}</div>
						<div class="mb-1">${tagBadges}</div>
						<div class="text-muted small mb-1">${setting.desc}</div>
						${noteHtml}
						${remotelyDisabled ? '<span class="text-danger small d-block">* This feature is currently unavailable.</span>' : ""}
					</div>
					<div class="form-check form-switch" style="transform:scale(1.5);transform-origin:right center;">
						<input class="form-check-input toggle-btn" type="checkbox" role="switch" ${state ? "checked" : ""} ${remotelyDisabled || chromeOnlyUnavailable ? "disabled" : ""} />
					</div>
				</div>
				<div class="kiln-config mt-1"></div>
			`;

			const settingCards: HTMLElement[] = [];

			for (const primaryTag of primaryTags) {
				const body =
					primaryTag === "new"
						? groupBodies[primaryTag]
						: isNew
							? newGroupBodies[primaryTag]
							: groupBodies[primaryTag];
				if (!body) continue;

				const isFirst = body.children.length === 0;
				const card = document.createElement("div");
				card.id =
					settingCards.length === 0
						? setting.id
						: `${setting.id}-${primaryTag}`;
				card.dataset.settingId = setting.id;
				card.dataset.new = isNew ? "true" : undefined!;
				card.className = `${isFirst ? "pb-2" : "py-2"} border-bottom border-secondary`;
				card.innerHTML = cardInnerHtml;

				body.appendChild(card);
				settingCards.push(card);

				const configContainer = card.querySelector(
					".kiln-config",
				) as HTMLElement;
				setConfigDisabled(card, !state);

				if (setting.config) {
					const configValues = () =>
						(values.config[setting.id as keyof typeof values.config] as Record<
							string,
							any
						>) ?? {};

					const writeConfig = (subsetting: string, value: boolean) => {
						if (!values.config[setting.id as keyof typeof values.config])
							(values.config as Record<string, any>)[setting.id] = {};
						(
							values.config[setting.id as keyof typeof values.config] as Record<
								string,
								any
							>
						)[subsetting] = value;
						preferences.setValue(values);
					};

					const renderCheck = (
						container: HTMLElement,
						sub: NonNullable<SettingData["config"]>[number],
						idSuffix: string,
					) => {
						const span = document.createElement("span");
						span.className = "form-check form-switch";
						const checkId = `check-${setting.id}-${sub.subsetting}-${idSuffix}`;
						span.innerHTML = `
								<input class="form-check-input" type="checkbox" role="switch" id="${checkId}" />
								<label class="form-check-label" for="${checkId}">${sub.label}</label>
							`;
						const checkbox =
							span.querySelector<HTMLInputElement>(".form-check-input")!;
						checkbox.checked =
							configValues()[sub.subsetting] ??
							(sub.default as boolean) ??
							false;
						checkbox.addEventListener("change", () =>
							writeConfig(sub.subsetting, checkbox.checked),
						);
						container.appendChild(span);
					};

					const isThemeConfig = setting.id === "customProfileThemes";
					const themeEffectSubs = isThemeConfig
						? setting.config.filter(
								(s) => !s.hide && s.subsetting !== "viewOthers",
							)
						: [];

					for (const sub of setting.config) {
						if (sub.hide) continue;
						if (isThemeConfig && sub.subsetting !== "viewOthers") continue;

						if (sub.type === "select") {
							const select = document.createElement("select");
							select.className = "form-select form-select-sm mb-2";
							select.style.maxWidth = "350px";
							for (const opt of sub.options ?? []) {
								const option = document.createElement("option");
								option.value = opt.value;
								option.textContent = opt.label;
								select.appendChild(option);
							}
							const saved = (
								values.config[
									setting.id as keyof typeof values.config
								] as Record<string, any>
							)?.[sub.subsetting];
							select.value = saved ?? (sub.default as string) ?? "";
							select.addEventListener("change", () => {
								if (!values.config[setting.id as keyof typeof values.config])
									(values.config as Record<string, any>)[setting.id] = {};
								(
									values.config[
										setting.id as keyof typeof values.config
									] as Record<string, any>
								)[sub.subsetting] = select.options[select.selectedIndex].value;
								preferences.setValue(values);
							});
							configContainer.appendChild(select);
						} else if (sub.type === "searchable-select") {
							const wrapper = document.createElement("div");
							wrapper.className = "mb-2";
							wrapper.style.maxWidth = "350px";

							const input = document.createElement("input");
							input.type = "text";
							input.className = "form-control form-control-sm";
							const listId = `datalist-${setting.id}-${sub.subsetting}-${primaryTag}`;
							input.setAttribute("list", listId);
							input.autocomplete = "off";
							input.placeholder = "Search currencies…";

							const datalist = document.createElement("datalist");
							datalist.id = listId;
							for (const opt of sub.options ?? []) {
								const option = document.createElement("option");
								option.value = opt.label;
								datalist.appendChild(option);
							}

							const savedCode =
								(
									values.config[
										setting.id as keyof typeof values.config
									] as Record<string, any>
								)?.[sub.subsetting] ??
								(sub.default as string) ??
								"";
							const savedOption = sub.options?.find(
								(o) => o.value === savedCode,
							);
							input.value = savedOption?.label ?? savedCode;

							input.addEventListener("change", () => {
								const match = input.value.match(/\(([^)]+)\)$/);
								if (match) {
									const code = match[1];
									if (sub.options?.some((o) => o.value === code)) {
										if (
											!values.config[setting.id as keyof typeof values.config]
										)
											(values.config as Record<string, any>)[setting.id] = {};
										(
											values.config[
												setting.id as keyof typeof values.config
											] as Record<string, any>
										)[sub.subsetting] = code;
										preferences.setValue(values);
										return;
									}
								}
								const cur = (
									values.config[
										setting.id as keyof typeof values.config
									] as Record<string, any>
								)?.[sub.subsetting];
								const curOpt = sub.options?.find((o) => o.value === cur);
								input.value = curOpt?.label ?? cur ?? "";
							});

							wrapper.appendChild(input);
							wrapper.appendChild(datalist);
							configContainer.appendChild(wrapper);
						} else if (sub.type === "check") {
							renderCheck(configContainer, sub, primaryTag);
						}
					}

					if (themeEffectSubs.length > 0) {
						const button = document.createElement("button");
						button.type = "button";
						button.className = "btn btn-sm btn-outline-primary";
						button.innerHTML =
							'<i class="fas fa-sliders me-1"></i>Customize Allowed Effects';
						button.addEventListener("click", () =>
							openProfileThemeEffectsModal(
								themeEffectSubs,
								(subsetting) => configValues()[subsetting],
								writeConfig,
							),
						);
						configContainer.appendChild(button);
					}
				}
			}

			if (settingCards.length === 0) continue;

			if (setting.id === "themeCreator") {
				const card = settingCards[0];
				const configContainer = card.querySelector(
					".kiln-config",
				) as HTMLElement;
				const themeManager = initThemeManager(configContainer, values, state);

				if (!remotelyDisabled && !chromeOnlyUnavailable) {
					card
						.querySelector<HTMLInputElement>(".toggle-btn")!
						.addEventListener("change", async () => {
							const newState = !getState(setting.id);
							if (!newState) {
								values.enabled = values.enabled.filter((x) => x !== setting.id);
								if (!values.disabled.includes(setting.id))
									values.disabled.push(setting.id);
								applyKilnTheme(null);
							} else {
								values.enabled.push(setting.id);
								values.disabled = values.disabled.filter(
									(x) => x !== setting.id,
								);
								const saved = await _savedThemes.getValue();
								const activeId =
									(values.config.themeCreator as any).activeThemeId ||
									"default";
								if (activeId !== "default") {
									const colors =
										activeId in THEME_PRESETS
											? THEME_PRESETS[activeId]
											: (saved.find((t) => t.id === activeId) ?? null);
									applyKilnTheme(colors);
								}
							}
							updateRowState(card, newState);
							themeManager.setEnabled(newState);
							await preferences.setValue(values);
						});
				}
				continue;
			}

			if (!remotelyDisabled) {
				for (const card of settingCards) {
					const toggle = card.querySelector<HTMLInputElement>(".toggle-btn")!;
					toggle.addEventListener("change", async () => {
						const newState = !getState(setting.id);
						if (!newState) {
							values.enabled = values.enabled.filter((x) => x !== setting.id);
							if (!values.disabled.includes(setting.id))
								values.disabled.push(setting.id);
						} else {
							values.enabled.push(setting.id);
							values.disabled = values.disabled.filter((x) => x !== setting.id);
						}
						for (const c of settingCards) {
							updateRowState(c, newState);
							setConfigDisabled(c, !newState);
						}
						await preferences.setValue(values);
					});
				}
			}
		}

		const categoryListEl = document.createElement("div");
		settingsList.appendChild(categoryListEl);
		const detailViewEl = document.createElement("div");
		detailViewEl.style.display = "none";
		settingsList.appendChild(detailViewEl);

		const searchInput = document.getElementById(
			"kiln-search",
		) as HTMLInputElement;

		let currentTag: Tags | null = null;

		function updateBorders(container: HTMLElement) {
			const visible = Array.from(container.children).filter(
				(r) => (r as HTMLElement).style.display !== "none",
			) as HTMLElement[];
			for (let i = 0; i < visible.length; i++) {
				const last = i === visible.length - 1;
				visible[i].classList.toggle("border-bottom", !last);
				visible[i].classList.toggle("border-secondary", !last);
				visible[i].style.paddingBottom = last ? "0" : "";
			}
		}

		function showSearchResults(q: string) {
			let flat = document.getElementById("kiln-search-results");
			if (!flat) {
				flat = document.createElement("div");
				flat.id = "kiln-search-results";
				const seenSettingIds = new Set<string>();
				for (const tag of groupOrder) {
					for (const row of Array.from(
						newGroupBodies[tag].children,
					) as HTMLElement[]) {
						const sid = row.dataset.settingId || row.id;
						if (seenSettingIds.has(sid)) continue;
						seenSettingIds.add(sid);
						row.dataset.tag = tag;
						flat.appendChild(row);
					}
					for (const row of Array.from(
						groupBodies[tag].children,
					) as HTMLElement[]) {
						const sid = row.dataset.settingId || row.id;
						if (seenSettingIds.has(sid)) continue;
						seenSettingIds.add(sid);
						row.dataset.tag = tag;
						flat.appendChild(row);
					}
				}
				const noResults = document.createElement("div");
				noResults.id = "kiln-search-no-results";
				noResults.className = "text-center p-3";
				noResults.style.display = "none";
				noResults.innerHTML = `
					<img src="${errorIcon}" width="80" height="80" class="mb-2">
					<p class="text-muted small mb-0">No preferences found.</p>
				`;
				const cardBody = document.createElement("div");
				cardBody.className = "card-body";
				cardBody.appendChild(flat);
				cardBody.appendChild(noResults);
				const card = document.createElement("div");
				card.className = "card";
				card.style.opacity = "0";
				card.style.transform = "translateY(-6px)";
				card.style.transition = "opacity 250ms ease, transform 250ms ease";
				card.appendChild(cardBody);
				categoryListEl.innerHTML = "";
				categoryListEl.appendChild(card);
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						card.style.opacity = "1";
						card.style.transform = "translateY(0)";
					}),
				);
			}
			for (const row of Array.from(flat.children) as HTMLElement[]) {
				const sid = row.dataset.settingId || row.id;
				const setting = (data.preferences as SettingData[]).find(
					(s) => s.id === sid,
				);
				row.style.display =
					setting &&
					(setting.name.toLowerCase().includes(q) ||
						(q.length > 4 && setting.desc.toLowerCase().includes(q)))
						? ""
						: "none";
			}
			updateBorders(flat);
			const noResultsEl = document.getElementById("kiln-search-no-results");
			if (noResultsEl) {
				const anyVisible = Array.from(flat.children).some(
					(r) => (r as HTMLElement).style.display !== "none",
				);
				noResultsEl.style.display = anyVisible ? "none" : "";
			}
		}

		function hideSearchResults() {
			const flat = document.getElementById("kiln-search-results");
			if (!flat) return;
			for (const row of Array.from(flat.children) as HTMLElement[]) {
				const tag = row.dataset.tag as Tags;
				row.style.display = "";
				if (tag) {
					const target =
						row.dataset.new === "true" ? newGroupBodies[tag] : groupBodies[tag];
					if (target) target.appendChild(row);
				}
			}
		}

		function renderCategoryTiles() {
			categoryListEl.innerHTML = "";
			for (const tag of groupOrder) {
				const cat = categoryMap[tag];
				const rows = [
					...Array.from(newGroupBodies[tag].children),
					...Array.from(groupBodies[tag].children),
				] as HTMLElement[];
				const tile = document.createElement("div");
				tile.className = "card mb-2";
				tile.style.cursor = "pointer";
				tile.dataset.tag = tag;
				tile.innerHTML = `
					<div class="card-body d-flex justify-content-between align-items-center">
						<div class="d-flex align-items-center gap-3">
							<i class="${cat.icon} fa-fw text-muted" style="font-size:1.2rem;"></i>
							<div>
								<div class="fw-semibold">${cat.name}</div>
								<div class="text-muted small">${cat.description}</div>
							</div>
						</div>
						<div class="d-flex align-items-center gap-2 flex-shrink-0">
							<span class="text-muted small fw-light">${rows.length} feature${rows.length !== 1 ? "s" : ""}</span>
							<i class="fas fa-chevron-right text-muted"></i>
						</div>
					</div>
				`;
				tile.addEventListener("click", () => renderCategoryDetail(tag as Tags));
				categoryListEl.appendChild(tile);
			}
		}

		function renderCategoryList() {
			for (const tag of groupOrder) {
				for (const body of [newGroupBodies[tag], groupBodies[tag]]) {
					if (body.parentElement !== hiddenStore) {
						for (const row of Array.from(body.children) as HTMLElement[]) {
							row.style.display = "";
						}
						hiddenStore.appendChild(body);
					}
				}
			}
			currentTag = null;
			detailViewEl.innerHTML = "";
			categoryListEl.style.display = "";
			detailViewEl.style.display = "none";

			const q = searchInput.value.toLowerCase();
			if (q) {
				showSearchResults(q);
			} else {
				hideSearchResults();
				renderCategoryTiles();
			}
		}

		function renderCategoryDetail(tag: Tags) {
			currentTag = tag;
			categoryListEl.style.display = "none";
			detailViewEl.style.display = "";
			detailViewEl.innerHTML = "";

			const header = document.createElement("div");
			header.className = "d-flex align-items-center gap-2 mb-2";
			const cat = categoryMap[tag];
			header.innerHTML = `
				<button class="btn btn-outline-secondary btn-sm kiln-back-btn">
					<i class="fas fa-arrow-left me-1"></i> Back
				</button>
				<i class="${cat.icon} fa-fw text-muted"></i>
				<span class="fw-semibold">${cat.name}</span>
			`;
			header
				.querySelector<HTMLButtonElement>(".kiln-back-btn")!
				.addEventListener("click", () => {
					searchInput.value = "";
					renderCategoryList();
				});
			detailViewEl.appendChild(header);

			if (newGroupBodies[tag].children.length > 0) {
				const newCard = document.createElement("div");
				newCard.className = "card mb-2";
				const newCardHeader = document.createElement("div");
				newCardHeader.className =
					"card-header small fw-semibold text-success d-flex justify-content-between align-items-center";
				newCardHeader.style.cursor = "pointer";
				newCardHeader.innerHTML = `<span>New</span><i class="fas fa-chevron-down" style="font-size:0.75rem;transition:transform 200ms;"></i>`;
				const newBody = newGroupBodies[tag];
				newCardHeader.querySelector("i")!.style.transform = "rotate(180deg)";
				newCardHeader.addEventListener("click", () => {
					const collapsed = newBody.style.display === "none";
					newBody.style.display = collapsed ? "" : "none";
					newCardHeader.querySelector("i")!.style.transform = collapsed
						? "rotate(180deg)"
						: "";
					newCardHeader.style.borderRadius = collapsed ? "" : "inherit";
					newCardHeader.style.borderBottom = collapsed ? "" : "none";
					if (collapsed) updateBorders(newBody);
				});
				newCard.appendChild(newCardHeader);
				newCard.appendChild(newBody);
				detailViewEl.appendChild(newCard);
				updateBorders(newBody);
			}

			const card = document.createElement("div");
			card.className = "card";
			card.appendChild(groupBodies[tag]);
			detailViewEl.appendChild(card);
			updateBorders(groupBodies[tag]);
		}

		let searchDebounce: ReturnType<typeof setTimeout> | null = null;
		searchInput.oninput = () => {
			if (searchDebounce) clearTimeout(searchDebounce);
			searchDebounce = setTimeout(() => {
				const q = searchInput.value.toLowerCase();
				if (currentTag) {
					renderCategoryList();
				} else if (q) {
					showSearchResults(q);
				} else {
					hideSearchResults();
					renderCategoryTiles();
				}
			}, 150);
		};
		renderCategoryList();

		const categoryParam = new URLSearchParams(window.location.search).get(
			"category",
		);
		if (categoryParam && (groupOrder as string[]).includes(categoryParam)) {
			renderCategoryDetail(categoryParam as Tags);
		}

		document
			.getElementById("kiln-export-btn")!
			.addEventListener("click", () => {
				const json = JSON.stringify(
					{ version: PREFERENCES_VERSION, ...values },
					null,
					2,
				);
				const blob = new Blob([json], { type: "application/json" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "kiln-preferences.json";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			});

		document
			.getElementById("kiln-import-btn")!
			.addEventListener("click", () => {
				const fileInput = document.createElement("input");
				fileInput.type = "file";
				fileInput.accept = ".json,application/json";
				fileInput.addEventListener("change", async () => {
					const file = fileInput.files?.[0];
					if (!file) return;
					try {
						const text = await file.text();
						const imported = JSON.parse(text);
						if (
							!Array.isArray(imported?.enabled) ||
							!Array.isArray(imported?.disabled)
						) {
							throw new Error("Invalid format");
						}
						await preferences.setValue(migrateImportedPreferences(imported));
						await initPrefsTab();
					} catch (error) {
						alert(
							error instanceof PreferencesVersionError
								? error.message
								: "Failed to import: invalid or corrupted preferences file.",
						);
					}
				});
				fileInput.click();
			});
	}

	document
		.getElementById("kiln-reset-btn")!
		.addEventListener("click", async () => {
			await preferences.setValue(preferences.fallback);
			await initPrefsTab();
		});

	await initPrefsTab();

	const tabParam = new URLSearchParams(window.location.search).get("tab");
	switchTab(tabParam && tabParam in panels ? tabParam : "about");
}

function initAdminGeneralTab(userId: number, panel: HTMLElement) {
	panel.innerHTML = `<p class="text-muted small">Loading…</p>`;
	load();

	async function load() {
		const [result, config] = await Promise.all([
			sendMessage("adminGetStats", userId),
			getConfig(),
		]);
		if (!result.ok) {
			panel.innerHTML = `<p class="text-danger small">Failed to load: ${result.message}</p>`;
			return;
		}

		const { totalVerifiedUsers, pendingFeedback, versions } = result.data.data;
		const latestVersion = config.latestVersion;

		const sorted = [...versions]
			.filter((v): v is { version: string; users: number } => !!v.version)
			.sort((a, b) => {
				if (isNewerVersion(a.version, b.version)) return -1;
				if (isNewerVersion(b.version, a.version)) return 1;
				return 0;
			});

		const latestUsers =
			sorted.find((v) => v.version === latestVersion)?.users ?? 0;
		const onLatestPct = totalVerifiedUsers
			? Math.round((latestUsers / totalVerifiedUsers) * 100)
			: 0;
		const maxUsers = Math.max(...sorted.map((v) => v.users), 1);

		const statTile = (
			label: string,
			value: string,
			sub: string,
			icon: string,
			tone: string,
		) => `
			<div class="col-sm-4">
				<div class="card h-100">
					<div class="card-body py-2">
						<div class="d-flex align-items-center gap-2 text-muted small mb-1">
							<i class="fas fa-${icon} fa-fw"></i>${label}
						</div>
						<div class="fs-4 fw-semibold ${tone}">${value}</div>
						<div class="text-muted" style="font-size:0.72rem;">${sub}</div>
					</div>
				</div>
			</div>
		`;

		const bars = sorted.length
			? sorted
					.map((v) => {
						const isLatest = v.version === latestVersion;
						const pct = totalVerifiedUsers
							? Math.round((v.users / totalVerifiedUsers) * 100)
							: 0;
						const width = Math.max(2, Math.round((v.users / maxUsers) * 100));
						return `
							<div class="mb-2">
								<div class="d-flex justify-content-between align-items-center small">
									<span>
										<code>v${escapeHtml(v.version)}</code>
										${isLatest ? '<span class="badge bg-success ms-1">Latest</span>' : ""}
									</span>
									<span class="text-muted">${v.users.toLocaleString()} user${v.users !== 1 ? "s" : ""} · ${pct}%</span>
								</div>
								<div class="progress mt-1" style="height:8px;">
									<div class="progress-bar ${isLatest ? "bg-success" : "bg-primary"}" style="width:${width}%;"></div>
								</div>
							</div>
						`;
					})
					.join("")
			: '<p class="text-muted small mb-0">No version data yet.</p>';

		panel.innerHTML = `
			<div class="row g-2 mb-2">
				${statTile("Verified Users", totalVerifiedUsers.toLocaleString(), "Linked Kiln accounts", "user-check", "")}
				${statTile("Pending Feedback", pendingFeedback.toLocaleString(), "Open, unresolved submissions", "inbox", pendingFeedback > 0 ? "text-warning" : "")}
				${statTile("On Latest Version", `${onLatestPct}%`, `v${escapeHtml(latestVersion)} · ${latestUsers.toLocaleString()} users`, "arrow-up", "text-success")}
			</div>
			<div class="card">
				<div class="card-header small fw-semibold d-flex justify-content-between align-items-center">
					<span>Version Migration</span>
					<button id="kadmin-general-refresh" class="btn btn-sm btn-outline-secondary py-0 px-2" title="Refresh">
						<i class="fas fa-sync-alt" style="font-size:0.75rem;"></i>
					</button>
				</div>
				<div class="card-body">
					<p class="text-muted small mb-2">Linked users by the extension version they last reported.</p>
					${bars}
				</div>
			</div>
		`;

		document
			.getElementById("kadmin-general-refresh")
			?.addEventListener("click", load);
	}
}

function initAdminTab(userId: number) {
	const inner = document.getElementById("kiln-admin-inner") as HTMLElement;

	inner.innerHTML = `
		<div class="d-flex gap-2 mb-3">
			<button class="btn btn-primary flex-grow-1" id="kadmin-tab-general">General</button>
			<button class="btn btn-secondary flex-grow-1" id="kadmin-tab-themes">Themes</button>
			<button class="btn btn-secondary flex-grow-1" id="kadmin-tab-profile-themes">Profile Themes</button>
			<button class="btn btn-secondary flex-grow-1" id="kadmin-tab-feedback">Feedback</button>
		</div>
		<div id="kadmin-general"></div>
		<div id="kadmin-themes" style="display:none;"></div>
		<div id="kadmin-profile-themes" style="display:none;"></div>
		<div id="kadmin-feedback" style="display:none;"></div>
	`;

	const generalPanel = document.getElementById("kadmin-general")!;
	const themesPanel = document.getElementById("kadmin-themes")!;
	const profileThemesPanel = document.getElementById("kadmin-profile-themes")!;
	const feedbackPanel = document.getElementById("kadmin-feedback")!;

	const adminPanels: Record<string, HTMLElement> = {
		general: generalPanel,
		themes: themesPanel,
		"profile-themes": profileThemesPanel,
		feedback: feedbackPanel,
	};
	const adminTabBtns: Record<string, HTMLElement> = {
		general: document.getElementById("kadmin-tab-general")!,
		themes: document.getElementById("kadmin-tab-themes")!,
		"profile-themes": document.getElementById("kadmin-tab-profile-themes")!,
		feedback: document.getElementById("kadmin-tab-feedback")!,
	};

	let themesLoaded = false;
	let feedbackLoaded = false;
	let profileThemesLoaded = false;
	for (const [name, btn] of Object.entries(adminTabBtns)) {
		btn.addEventListener("click", () => {
			for (const [key, panel] of Object.entries(adminPanels)) {
				panel.style.display = key === name ? "" : "none";
			}
			for (const [key, b] of Object.entries(adminTabBtns)) {
				b.className = `btn flex-grow-1 ${key === name ? "btn-primary" : "btn-secondary"}`;
			}
			if (name === "themes" && !themesLoaded) {
				themesLoaded = true;
				renderPendingThemes();
			}
			if (name === "feedback" && !feedbackLoaded) {
				feedbackLoaded = true;
				initAdminFeedbackTab(userId, feedbackPanel);
			}
			if (name === "profile-themes" && !profileThemesLoaded) {
				profileThemesLoaded = true;
				initAdminProfileThemesTab(userId, profileThemesPanel);
			}
		});
	}

	initAdminGeneralTab(userId, generalPanel);

	async function renderPendingThemes() {
		themesPanel.innerHTML = `<p class="text-muted small">Loading…</p>`;
		const result = await sendMessage("adminGetPendingThemes", userId);
		if (!result.ok) {
			themesPanel.innerHTML = `<p class="text-danger small">Failed to load: ${result.message}</p>`;
			return;
		}
		const themes = result.data.data;

		const deleteForm = `
			<div class="card mb-3">
				<div class="card-body py-2">
					<div class="d-flex gap-2 align-items-center">
						<input id="kadmin-delete-id" type="text" class="form-control form-control-sm" style="max-width:200px;" placeholder="Theme ID…" />
						<button id="kadmin-delete-btn" class="btn btn-danger btn-sm">Delete</button>
						<span id="kadmin-delete-status" class="small"></span>
					</div>
				</div>
			</div>
		`;

		if (themes.length === 0) {
			themesPanel.innerHTML = `${deleteForm}<p class="text-muted small">No pending themes.</p>`;
		} else {
			themesPanel.innerHTML =
				deleteForm +
				themes
					.map(
						(t) => `
				<div class="card mb-3" data-theme-id="${t.id}">
					<div class="card-body">
						<div class="d-flex align-items-start gap-3">
							<div class="d-flex gap-1 flex-shrink-0">
								<div style="width:32px;height:32px;border-radius:6px;background:${escapeHtml(t.accentColor)};" title="Accent"></div>
								<div style="width:32px;height:32px;border-radius:6px;background:${escapeHtml(t.navbarColor)};" title="Navbar"></div>
							</div>
							<div class="flex-grow-1 min-w-0">
								<div class="fw-semibold">${escapeHtml(t.name)}</div>
								<div class="text-muted small">ID: <code>${t.id}</code> &middot; User ID: ${t.userId}${t.fontFamily ? ` &middot; Font: ${escapeHtml(t.fontFamily)}` : ""}</div>
								${
									t.customCss
										? `<pre id="css-pre-${t.id}" class="mt-2 mb-1 p-2 rounded bg-black text-success" style="font-size:0.7rem;max-height:120px;overflow:hidden;white-space:pre-wrap;">${t.customCss.replace(/</g, "&lt;").slice(0, 500)}${t.customCss.length > 500 ? "\n…" : ""}</pre><button class="btn btn-link btn-sm p-0 text-secondary" style="font-size:0.75rem;" data-expand="${t.id}">View full CSS (${t.customCss.length} chars)</button>`
										: ""
								}
							</div>
							<div class="d-flex gap-2 flex-shrink-0">
								<button class="btn btn-success btn-sm" data-action="approve" data-id="${t.id}">Approve</button>
								<button class="btn btn-danger btn-sm" data-action="decline" data-id="${t.id}">Decline</button>
								<button class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${t.id}">Delete</button>
							</div>
						</div>
					</div>
				</div>
			`,
					)
					.join("");

			for (const t of themes) {
				if (!t.customCss) continue;
				const expandBtn = themesPanel.querySelector<HTMLButtonElement>(
					`[data-expand="${t.id}"]`,
				);
				const pre = document.getElementById(`css-pre-${t.id}`);
				if (!expandBtn || !pre) continue;
				expandBtn.addEventListener("click", () => {
					pre.textContent = t.customCss!;
					pre.style.maxHeight = "none";
					expandBtn.remove();
				});
			}

			for (const btn of themesPanel.querySelectorAll<HTMLButtonElement>(
				"[data-action]",
			)) {
				btn.addEventListener("click", async () => {
					const id = btn.dataset.id!;
					const action = btn.dataset.action as "approve" | "decline" | "delete";
					btn.disabled = true;
					if (action === "delete") {
						const result = await sendMessage("adminDeleteTheme", {
							userId,
							id,
						});
						if (result.ok) {
							await renderPendingThemes();
						} else {
							btn.disabled = false;
							btn.insertAdjacentHTML(
								"afterend",
								`<span class="text-danger small ms-2">Failed: ${result.message}</span>`,
							);
						}
					} else {
						const result = await sendMessage("adminReviewTheme", {
							userId,
							id,
							action,
						});
						if (result.ok) {
							await renderPendingThemes();
						} else {
							btn.disabled = false;
							btn.insertAdjacentHTML(
								"afterend",
								`<span class="text-danger small ms-2">Failed: ${result.message}</span>`,
							);
						}
					}
				});
			}
		}

		const deleteBtn = document.getElementById(
			"kadmin-delete-btn",
		) as HTMLButtonElement;
		const deleteInput = document.getElementById(
			"kadmin-delete-id",
		) as HTMLInputElement;
		const deleteStatus = document.getElementById(
			"kadmin-delete-status",
		) as HTMLElement;
		deleteBtn.addEventListener("click", async () => {
			const id = deleteInput.value.trim();
			if (!id) return;
			deleteBtn.disabled = true;
			deleteStatus.textContent = "Deleting…";
			deleteStatus.className = "small text-muted";
			const result = await sendMessage("adminDeleteTheme", { userId, id });
			if (result.ok) {
				deleteInput.value = "";
				deleteStatus.textContent = "Deleted.";
				deleteStatus.className = "small text-success";
				await renderPendingThemes();
			} else {
				deleteStatus.textContent = `Failed: ${result.message}`;
				deleteStatus.className = "small text-danger";
				deleteBtn.disabled = false;
			}
		});
	}
}

const POLYTORIA_CDN_PREFIX = "https://cdn.polytoria.com/";

function safeColor(value: string | null | undefined, fallback: string): string {
	return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function safeUrl(value: string): string | null {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" || parsed.protocol === "http:"
			? value
			: null;
	} catch {
		return null;
	}
}

function initAdminProfileThemesTab(userId: number, panel: HTMLElement) {
	renderPendingProfileThemes();

	async function renderPendingProfileThemes() {
		panel.innerHTML = `<p class="text-muted small">Loading…</p>`;
		const result = await sendMessage("adminGetPendingProfileThemes", userId);
		if (!result.ok) {
			panel.innerHTML = `<p class="text-danger small">Failed to load: ${result.message}</p>`;
			return;
		}
		const themes = result.data.data;

		const manualForm = `
			<div class="card mb-3">
				<div class="card-body py-2">
					<div class="d-flex gap-2 align-items-center flex-wrap">
						<input id="kadmin-pt-id" type="text" class="form-control form-control-sm" style="max-width:200px;" placeholder="User ID…" />
						<button id="kadmin-pt-decline" class="btn btn-danger btn-sm">Decline</button>
						<button id="kadmin-pt-delete" class="btn btn-outline-danger btn-sm">Delete</button>
						<span id="kadmin-pt-status" class="small"></span>
					</div>
				</div>
			</div>
		`;

		if (themes.length === 0) {
			panel.innerHTML = `${manualForm}<p class="text-muted small">No pending profile themes.</p>`;
		} else {
			panel.innerHTML =
				manualForm +
				themes
					.map((t) => {
						const notes = t.notes ?? [];
						const reviewed = t.updatedAt || t.createdAt;
						const imageBlock = (
							url: string | null | undefined,
							label: string,
							maxHeight: number,
						) => {
							if (!url) return "";
							const external = !url.startsWith(POLYTORIA_CDN_PREFIX);
							const safe = safeUrl(url);
							const badge = `<span class="badge ${safe ? (external ? "bg-warning text-dark" : "bg-secondary") : "bg-danger"}">${label}${safe ? (external ? " (external)" : " (CDN)") : " (unsupported scheme)"}</span>`;
							if (!safe) {
								return `
								<div class="mt-2">
									<div class="d-flex align-items-center gap-2 mb-1">
										${badge}
										<code class="small" style="max-width:320px;overflow-wrap:anywhere;">${escapeHtml(url)}</code>
									</div>
								</div>
							`;
							}
							return `
								<div class="mt-2">
									<div class="d-flex align-items-center gap-2 mb-1">
										${badge}
										<a class="small text-truncate" href="${escapeHtml(safe)}" target="_blank" rel="noreferrer noopener" style="max-width:320px;">${escapeHtml(safe)}</a>
									</div>
									<img src="${escapeHtml(safe)}" alt="" style="max-height:${maxHeight}px;max-width:100%;border-radius:6px;" />
								</div>
							`;
						};

						return `
				<div class="card mb-3" data-pt-card="${t.userId}">
					<div class="card-body">
						<div class="d-flex align-items-start gap-3">
							<div class="d-flex gap-1 flex-shrink-0">
								<div style="width:32px;height:32px;border-radius:6px;background:${safeColor(t.accentColor, "#888888")};" title="Accent"></div>
								<div style="width:32px;height:32px;border-radius:6px;background:${safeColor(t.navbarColor, "#888888")};" title="Navbar"></div>
							</div>
							<div class="flex-grow-1 min-w-0">
								<div class="fw-semibold"><a href="https://polytoria.com/users/${t.userId}" target="_blank" rel="noreferrer noopener">User ${t.userId}</a></div>
								<div class="text-muted small">${reviewed ? `Submitted ${new Date(reviewed).toLocaleString()}` : ""}${t.fontFamily ? ` &middot; Font: ${escapeHtml(t.fontFamily)}` : ""}${t.enabled ? "" : " &middot; hidden by owner"}</div>
								${imageBlock(t.backgroundImage, "Background", 140)}
								${imageBlock(t.cursorUrl, "Cursor", 48)}
								${
									notes.length
										? `<div class="mt-2">
												<div class="text-muted" style="font-size:0.7rem;">Notes (${notes.length})</div>
												<div class="d-flex flex-column gap-1 mt-1">
													${notes
														.map(
															(n) =>
																`<div class="small px-2 py-1 rounded" style="color:${safeColor(n.color, "#000000")};background:${safeColor(n.background, "#ffff88")};white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(n.text)}</div>`,
														)
														.join("")}
												</div>
											</div>`
										: ""
								}
								${
									t.customCss
										? `<pre id="pt-css-pre-${t.userId}" class="mt-2 mb-1 p-2 rounded bg-black text-success" style="font-size:0.7rem;max-height:120px;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(t.customCss.slice(0, 500))}${t.customCss.length > 500 ? "\n…" : ""}</pre><button class="btn btn-link btn-sm p-0 text-secondary" style="font-size:0.75rem;" data-pt-expand="${t.userId}">View full CSS (${t.customCss.length} chars)</button>`
										: ""
								}
							</div>
							<div class="d-flex gap-2 flex-shrink-0">
								<button class="btn btn-success btn-sm" data-pt-action="approve" data-pt-user="${t.userId}">Approve</button>
								<button class="btn btn-danger btn-sm" data-pt-action="decline" data-pt-user="${t.userId}">Decline</button>
								<button class="btn btn-outline-danger btn-sm" data-pt-action="delete" data-pt-user="${t.userId}">Delete</button>
							</div>
						</div>
					</div>
				</div>
			`;
					})
					.join("");

			for (const t of themes) {
				if (!t.customCss) continue;
				const expandBtn = panel.querySelector<HTMLButtonElement>(
					`[data-pt-expand="${t.userId}"]`,
				);
				const pre = document.getElementById(`pt-css-pre-${t.userId}`);
				if (!expandBtn || !pre) continue;
				expandBtn.addEventListener("click", () => {
					pre.textContent = t.customCss!;
					pre.style.maxHeight = "none";
					expandBtn.remove();
				});
			}

			for (const btn of panel.querySelectorAll<HTMLButtonElement>(
				"[data-pt-action]",
			)) {
				btn.addEventListener("click", async () => {
					const targetUserId = Number(btn.dataset.ptUser);
					const action = btn.dataset.ptAction as
						| "approve"
						| "decline"
						| "delete";
					btn.disabled = true;
					const result =
						action === "delete"
							? await sendMessage("adminDeleteProfileTheme", {
									userId,
									targetUserId,
								})
							: await sendMessage("adminReviewProfileTheme", {
									userId,
									targetUserId,
									action,
								});
					if (result.ok) {
						await renderPendingProfileThemes();
					} else {
						btn.disabled = false;
						btn.insertAdjacentHTML(
							"afterend",
							`<span class="text-danger small ms-2">Failed: ${result.message}</span>`,
						);
					}
				});
			}
		}

		const manualInput = document.getElementById(
			"kadmin-pt-id",
		) as HTMLInputElement;
		const manualStatus = document.getElementById(
			"kadmin-pt-status",
		) as HTMLElement;
		const manualBtns: [HTMLButtonElement, "decline" | "delete"][] = [
			[
				document.getElementById("kadmin-pt-decline") as HTMLButtonElement,
				"decline",
			],
			[
				document.getElementById("kadmin-pt-delete") as HTMLButtonElement,
				"delete",
			],
		];
		for (const [btn, action] of manualBtns) {
			btn.addEventListener("click", async () => {
				const targetUserId = Number(manualInput.value.trim());
				if (!targetUserId) return;
				for (const [b] of manualBtns) b.disabled = true;
				manualStatus.textContent =
					action === "delete" ? "Deleting…" : "Declining…";
				manualStatus.className = "small text-muted";
				const result =
					action === "delete"
						? await sendMessage("adminDeleteProfileTheme", {
								userId,
								targetUserId,
							})
						: await sendMessage("adminReviewProfileTheme", {
								userId,
								targetUserId,
								action,
							});
				if (result.ok) {
					await renderPendingProfileThemes();
					const freshStatus = document.getElementById("kadmin-pt-status");
					if (freshStatus) {
						freshStatus.textContent =
							action === "delete" ? "Deleted." : "Declined.";
						freshStatus.className = "small text-success";
					}
				} else {
					manualStatus.textContent = `Failed: ${result.message}`;
					manualStatus.className = "small text-danger";
					for (const [b] of manualBtns) b.disabled = false;
				}
			});
		}
	}
}

const FEEDBACK_TYPE_LABELS = {
	general: "General",
	feature: "Suggestion",
	bug: "Bug Report",
} as const;

function initAdminFeedbackTab(userId: number, panel: HTMLElement) {
	panel.innerHTML = `
		<div class="d-flex gap-2 mb-2 flex-wrap">
			<input id="kadmin-fb-search" type="text" class="form-control form-control-sm" style="max-width:220px;" placeholder="Search message or username…" />
			<select id="kadmin-fb-type" class="form-select form-select-sm" style="max-width:150px;">
				<option value="">All types</option>
				<option value="general">General</option>
				<option value="feature">Suggestion</option>
				<option value="bug">Bug Report</option>
			</select>
			<select id="kadmin-fb-status" class="form-select form-select-sm" style="max-width:150px;">
				<option value="">All statuses</option>
				<option value="open">Open</option>
				<option value="resolved">Resolved</option>
			</select>
			<div class="form-check align-self-center">
				<input class="form-check-input" type="checkbox" id="kadmin-fb-unanswered">
				<label class="form-check-label small" for="kadmin-fb-unanswered">No response yet</label>
			</div>
		</div>
		<div id="kadmin-fb-list"></div>
		<div id="kadmin-fb-pagination" class="d-flex justify-content-between align-items-center mt-2"></div>
	`;

	const searchInput = document.getElementById(
		"kadmin-fb-search",
	) as HTMLInputElement;
	const typeSelect = document.getElementById(
		"kadmin-fb-type",
	) as HTMLSelectElement;
	const statusSelect = document.getElementById(
		"kadmin-fb-status",
	) as HTMLSelectElement;
	const unansweredCheck = document.getElementById(
		"kadmin-fb-unanswered",
	) as HTMLInputElement;
	const list = document.getElementById("kadmin-fb-list")!;
	const pagination = document.getElementById("kadmin-fb-pagination")!;

	let page = 1;

	async function load() {
		list.innerHTML = `<p class="text-muted small">Loading…</p>`;
		pagination.innerHTML = "";

		const result = await sendMessage("adminGetFeedback", {
			userId,
			type: (typeSelect.value || undefined) as
				| "feature"
				| "general"
				| "bug"
				| undefined,
			status: (statusSelect.value || undefined) as
				| "open"
				| "resolved"
				| undefined,
			unanswered: unansweredCheck.checked,
			search: searchInput.value.trim() || undefined,
			page,
		});

		if (!result.ok) {
			list.innerHTML = `<p class="text-danger small">Failed to load: ${result.message}</p>`;
			return;
		}

		const { data: items, meta } = result.data;
		if (items.length === 0) {
			list.innerHTML = `<p class="text-muted small">No feedback matches these filters.</p>`;
			return;
		}

		list.innerHTML = items
			.map((item) => {
				const statusBadge =
					item.status === "resolved"
						? '<span class="badge bg-success">Resolved</span>'
						: '<span class="badge bg-secondary">Open</span>';
				const noResponseBadge = !item.response
					? '<span class="badge bg-warning text-dark">No response</span>'
					: "";
				const metaLine = [
					item.username && `From ${item.username}`,
					item.version && `Kiln v${item.version}`,
					new Date(item.createdAt).toLocaleString(),
				]
					.filter(Boolean)
					.join(" · ");

				return `
					<div class="card mb-2${!item.response ? " border-warning" : ""}" data-feedback-id="${item.id}">
						<div class="card-body">
							<div class="d-flex justify-content-between align-items-start gap-2 mb-1">
								<div class="d-flex gap-1 flex-wrap">
									<span class="badge bg-primary">${FEEDBACK_TYPE_LABELS[item.type as keyof typeof FEEDBACK_TYPE_LABELS]}</span>
									${statusBadge}
									${noResponseBadge}
								</div>
								<div class="d-flex gap-2 flex-shrink-0">
									<button class="btn btn-outline-secondary btn-sm" data-action="toggle-status" data-id="${item.id}">${item.status === "resolved" ? "Reopen" : "Resolve"}</button>
									<button class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${item.id}">Delete</button>
								</div>
							</div>
							<div class="text-muted mb-2" style="font-size:0.72rem;">${metaLine}</div>
							<div class="small mb-2">${item.message.replace(/</g, "&lt;")}</div>
							${
								item.response
									? `<div class="alert border-secondary small py-2 px-2 mb-2"><strong>Your response:</strong> ${item.response.replace(/</g, "&lt;")}</div>`
									: ""
							}
							<div class="d-flex gap-2">
								<input type="text" class="form-control form-control-sm kadmin-fb-response-input" data-id="${item.id}" placeholder="${item.response ? "Revise response…" : "Write a response…"}" value="${item.response ? item.response.replace(/"/g, "&quot;") : ""}" />
								<button class="btn btn-primary btn-sm flex-shrink-0" data-action="respond" data-id="${item.id}">Send</button>
							</div>
						</div>
					</div>
				`;
			})
			.join("");

		pagination.innerHTML = `
			<button class="btn btn-outline-secondary btn-sm" id="kadmin-fb-prev" ${meta.currentPage <= 1 ? "disabled" : ""}>← Prev</button>
			<span class="text-muted small">Page ${meta.currentPage} of ${meta.totalPages} (${meta.totalCount} total)</span>
			<button class="btn btn-outline-secondary btn-sm" id="kadmin-fb-next" ${meta.currentPage >= meta.totalPages ? "disabled" : ""}>Next →</button>
		`;
		document.getElementById("kadmin-fb-prev")?.addEventListener("click", () => {
			page = Math.max(1, page - 1);
			load();
		});
		document.getElementById("kadmin-fb-next")?.addEventListener("click", () => {
			page += 1;
			load();
		});

		for (const btn of list.querySelectorAll<HTMLButtonElement>(
			"[data-action]",
		)) {
			btn.addEventListener("click", async () => {
				const id = btn.dataset.id!;
				const action = btn.dataset.action as
					| "toggle-status"
					| "delete"
					| "respond";
				btn.disabled = true;

				if (action === "delete") {
					const result = await sendMessage("adminDeleteFeedback", {
						userId,
						id,
					});
					if (result.ok) await load();
					else btn.disabled = false;
					return;
				}

				if (action === "toggle-status") {
					const item = items.find((i) => i.id === id)!;
					const result = await sendMessage(
						item.status === "resolved"
							? "adminReopenFeedback"
							: "adminResolveFeedback",
						{ userId, id },
					);
					if (result.ok) await load();
					else btn.disabled = false;
					return;
				}

				if (action === "respond") {
					const input = list.querySelector<HTMLInputElement>(
						`.kadmin-fb-response-input[data-id="${id}"]`,
					)!;
					const response = input.value.trim();
					if (!response) {
						btn.disabled = false;
						return;
					}
					const result = await sendMessage("adminRespondFeedback", {
						userId,
						id,
						response,
					});
					if (result.ok) await load();
					else btn.disabled = false;
				}
			});
		}
	}

	let searchDebounce: ReturnType<typeof setTimeout> | null = null;
	searchInput.addEventListener("input", () => {
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => {
			page = 1;
			load();
		}, 250);
	});
	for (const el of [typeSelect, statusSelect, unansweredCheck]) {
		el.addEventListener("change", () => {
			page = 1;
			load();
		});
	}

	load();
}

function renderInline(text: string): string {
	return text
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
			const url = src.startsWith("/")
				? browser.runtime.getURL(src.slice(1))
				: src;
			return `<img src="${url}" alt="${alt}" style="max-width:100%;border-radius:4px;" />`;
		})
		.replace(/\{([^|}]+)\|([^}]+)\}/g, '<span class="badge bg-$2">$1</span>')
		.replace(/\{([^}]+)\}/g, '<span class="badge bg-secondary">$1</span>')
		.replace(/~~(.+?)~~/g, "<s>$1</s>")
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>")
		.replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderChangelogMd(md: string): string {
	return md.split("\n").reduce(
		(acc, line) => {
			if (line.startsWith("## ")) {
				if (acc.inList) {
					acc.html += "</ul>";
					acc.inList = false;
				}
				const mt = acc.first ? "" : " mt-3";
				acc.first = false;
				acc.html += `<h5 class="${mt}mb-1">${renderInline(line.slice(3))}</h5>`;
			} else if (line.startsWith("### ")) {
				if (acc.inList) {
					acc.html += "</ul>";
					acc.inList = false;
				}
				acc.html += `<h6 class="text-muted mt-2 mb-1">${renderInline(line.slice(4))}</h6>`;
			} else if (line.startsWith("- ")) {
				if (!acc.inList) {
					acc.html += "<ul>";
					acc.inList = true;
				}
				acc.html += `<li class="small">${renderInline(line.slice(2))}</li>`;
			} else if (line.trim() === "") {
				if (acc.inList) {
					acc.html += "</ul>";
					acc.inList = false;
				}
			} else {
				if (acc.inList) {
					acc.html += "</ul>";
					acc.inList = false;
				}
				acc.html += `<p class="small mb-1">${renderInline(line)}</p>`;
			}
			return acc;
		},
		{ html: "", inList: false, first: true } as {
			html: string;
			inList: boolean;
			first: boolean;
		},
	).html;
}

function initReviewMigration(userId: number) {
	const migrateBtn = document.getElementById(
		"kiln-migrate-btn",
	) as HTMLButtonElement | null;
	if (!migrateBtn) return;

	const thresholdInput = document.getElementById(
		"kiln-migrate-threshold",
	) as HTMLInputElement;
	const fallbackInput = document.getElementById(
		"kiln-migrate-fallback",
	) as HTMLInputElement;
	const statusEl = document.getElementById("kiln-migrate-status")!;
	const progressWrap = document.getElementById("kiln-migrate-progress-wrap")!;
	const progressBar = document.getElementById("kiln-migrate-progress")!;
	const logEl = document.getElementById("kiln-migrate-log")!;

	const setStatus = (text: string, tone: "muted" | "danger" = "muted") => {
		statusEl.textContent = text;
		statusEl.className = `small text-${tone}`;
	};

	const appendLog = (html: string) => {
		logEl.insertAdjacentHTML("beforeend", `<div>${html}</div>`);
		logEl.scrollTop = logEl.scrollHeight;
	};

	migrateBtn.addEventListener("click", async () => {
		const threshold = Math.min(
			5,
			Math.max(1, Math.round(Number(thresholdInput.value) || 4)),
		);
		thresholdInput.value = String(threshold);
		const fallback = fallbackInput.value.trim();

		migrateBtn.disabled = true;
		thresholdInput.disabled = true;
		fallbackInput.disabled = true;
		progressWrap.classList.remove("d-none");
		progressBar.style.width = "0%";
		logEl.innerHTML = "";
		setStatus("Loading your reviews…");

		const listResult = await sendMessage("getMigratablePlaceReviews", userId);
		if (!listResult.ok) {
			setStatus(`Failed to load reviews: ${listResult.message}`, "danger");
			migrateBtn.disabled = false;
			thresholdInput.disabled = false;
			fallbackInput.disabled = false;
			return;
		}

		const pending = listResult.data.data.filter((r) => !r.migrated);
		const total = pending.length;
		if (total === 0) {
			setStatus("No more reviews to migrate.");
			migrateBtn.disabled = false;
			thresholdInput.disabled = false;
			fallbackInput.disabled = false;
			return;
		}

		let done = 0;
		let migrated = 0;
		let skipped = 0;
		let failed = 0;

		const updateProgress = () => {
			progressBar.style.width = `${Math.round((done / total) * 100)}%`;
			setStatus(
				`${done}/${total} processed · ${migrated} migrated · ${skipped} skipped · ${failed} failed`,
			);
		};
		updateProgress();

		for (const review of pending) {
			const world = escapeHtml(review.placeName ?? `World #${review.placeId}`);

			if (review.approvalStatus === "declined") {
				skipped++;
				appendLog(
					`<span class="text-muted">${world}: skipped (hidden by Kiln moderation)</span>`,
				);
				done++;
				updateProgress();
				continue;
			}

			const content = (review.body ?? "").trim() || fallback;
			if (!content) {
				skipped++;
				appendLog(
					`<span class="text-muted">${world}: skipped (no review text)</span>`,
				);
				done++;
				updateProgress();
				continue;
			}

			const created = await sendMessage("createPolytoriaPlaceReview", {
				placeId: review.placeId,
				value: review.rating >= threshold ? "like" : "dislike",
				content,
			});

			if (!created.ok) {
				failed++;
				appendLog(
					`<span class="text-danger">${world}: ${escapeHtml(created.message)}</span>`,
				);
				done++;
				updateProgress();
				continue;
			}

			const marked = await sendMessage("markPlaceReviewMigrated", {
				userId,
				reviewId: review.id,
			});

			if (!marked.ok) {
				failed++;
				appendLog(
					`<span class="text-danger">${world}: posted to Polytoria but failed to mark as migrated (${escapeHtml(marked.message)})</span>`,
				);
			} else {
				migrated++;
				appendLog(
					`<span class="text-success">${world}: migrated as ${review.rating >= threshold ? "upvote" : "downvote"}</span>`,
				);
			}

			done++;
			updateProgress();
			await new Promise((resolve) => setTimeout(resolve, 400));
		}

		setStatus(
			`Done! ${migrated} migrated${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} failed` : ""}.`,
			failed ? "danger" : "muted",
		);
		migrateBtn.disabled = false;
		thresholdInput.disabled = false;
		fallbackInput.disabled = false;
	});
}

async function initSyncTab() {
	const container = document.getElementById("kiln-sync")!;
	container.innerHTML = `<div class="text-muted small">Loading…</div>`;

	const [user, sessions] = await Promise.all([
		getUserDetails(),
		apiSessions.getValue(),
	]);

	const isLinked =
		!!user &&
		sessions.some((s) => s.userId === user.userId && s.state === "verified");

	const linkedFeatures = (data.preferences as SettingData[]).filter(
		(s) => !s.hide && s.requiresSync,
	);

	const featureListHtml = linkedFeatures
		.map(
			(f, i) => `
		<div class="d-flex align-items-start gap-2 px-3 py-2${i < linkedFeatures.length - 1 ? " border-bottom border-secondary" : ""}">
			<i class="fas fa-${isLinked ? "check-circle text-success" : "lock text-muted"}" style="font-size:0.75rem;flex-shrink:0;margin-top:3px;"></i>
			<div>
				<div class="small fw-semibold">${f.name}</div>
				<div class="text-muted" style="font-size:0.75rem;">${f.desc}</div>
			</div>
		</div>
	`,
		)
		.join("");

	const statusIcon = isLinked
		? `<i class="fas fa-check-circle text-success" style="font-size:1.4rem;flex-shrink:0;"></i>`
		: `<i class="fas fa-times-circle text-danger" style="font-size:1.4rem;flex-shrink:0;"></i>`;
	const statusName = user ? user.username : "Not logged in";
	const statusDesc = isLinked
		? "Linked to Kiln! Sync features are available."
		: "Not linked to Kiln. Link your account to unlock additional features.";
	const statusBtn = isLinked
		? `<button id="kiln-sync-action-btn" class="btn btn-outline-secondary btn-sm flex-shrink-0">Manage Linked Accounts</button>`
		: `<button id="kiln-sync-action-btn" class="btn btn-primary btn-sm flex-shrink-0">Link Account</button>`;

	const featuresHeader = isLinked
		? "Unlocked Features"
		: "Features Requiring a Linked Account";

	container.innerHTML = `
		<div class="card mb-2">
			<div class="card-body d-flex align-items-center gap-3">
				${statusIcon}
				<div class="flex-grow-1">
					<div class="fw-semibold">${statusName}</div>
					<div class="text-muted small">${statusDesc}</div>
				</div>
				${user ? statusBtn : ""}
			</div>
		</div>
		<div class="card mb-2">
			<div class="card-header small fw-semibold">${featuresHeader}</div>
			<div class="card-body p-0">${featureListHtml}</div>
		</div>
		${
			isLinked
				? `
		<div class="card">
			<div class="card-header small fw-semibold d-flex justify-content-between align-items-center" id="kiln-sync-sessions-header" style="cursor:pointer;">
				<span>Active Sessions</span>
				<i class="fas fa-chevron-down text-muted" id="kiln-sync-sessions-chevron" style="font-size:0.75rem;transition:transform 200ms;"></i>
			</div>
			<div id="kiln-sync-sessions-body" style="display:none;">
				<div class="card-body p-0" id="kiln-sync-sessions-list"></div>
			</div>
		</div>
		<div class="card mt-2">
			<div class="card-body d-flex align-items-center justify-content-between gap-3">
				<div>
					<div class="fw-semibold small">Download My Data</div>
					<div class="text-muted" style="font-size:0.75rem;">Export everything Kiln has stored for your linked account as a JSON file.</div>
				</div>
				<button id="kiln-export-data-btn" class="btn btn-outline-secondary btn-sm flex-shrink-0">Download</button>
			</div>
		</div>
		<div class="card mt-2">
			<div class="card-body">
				<div class="fw-semibold small">Migrate World Reviews to Polytoria</div>
				<div class="text-muted mb-2" style="font-size:0.75rem;">
					Polytoria now has native world reviews (upvote/downvote). This recreates each of your Kiln reviews on Polytoria. For now, all migrated world reviews will still show up in Kiln's review tab until the feature is fully deprecated.
				</div>
				<div class="d-flex align-items-center gap-2 flex-wrap">
					<label class="small mb-0" for="kiln-migrate-threshold">Treat ratings of</label>
					<input id="kiln-migrate-threshold" type="number" min="1" max="5" step="1" value="4" class="form-control form-control-sm" style="max-width:70px;">
					<label class="small mb-0" for="kiln-migrate-threshold">stars or higher as an upvote <i class="fas fa-thumbs-up text-success"></i> (everything below becomes a downvote <i class="fas fa-thumbs-down text-danger"></i>)</label>
				</div>
				<div class="mt-2">
					<label class="small mb-0" for="kiln-migrate-fallback">Comment for reviews with no text (optional)</label>
					<input id="kiln-migrate-fallback" type="text" maxlength="500" class="form-control form-control-sm mt-1" placeholder="Leave blank to skip reviews without any text">
				</div>
				<div class="d-flex align-items-center gap-2 mt-2">
					<button id="kiln-migrate-btn" class="btn btn-primary btn-sm">Start Migration</button>
					<span id="kiln-migrate-status" class="small text-muted"></span>
				</div>
				<div id="kiln-migrate-progress-wrap" class="mt-2 d-none">
					<div class="progress" style="height:6px;"><div id="kiln-migrate-progress" class="progress-bar" style="width:0%"></div></div>
					<div id="kiln-migrate-log" class="text-muted mt-1" style="font-size:0.72rem;max-height:150px;overflow-y:auto;"></div>
				</div>
			</div>
		</div>
		`
				: ""
		}
		<div class="text-muted text-center mt-3" style="font-size:0.75rem;">
			By ${isLinked ? "using" : "linking"} your account with Kiln, you agree to the
			<a href="https://kiln.indexx.dev/terms" target="_blank" class="text-muted">Terms of Service</a>
			and
			<a href="https://kiln.indexx.dev/privacy" target="_blank" class="text-muted">Privacy Policy</a>.
		</div>
	`;

	document
		.getElementById("kiln-export-data-btn")
		?.addEventListener("click", async () => {
			const btn = document.getElementById(
				"kiln-export-data-btn",
			) as HTMLButtonElement;
			btn.disabled = true;
			const originalText = btn.textContent;
			btn.textContent = "Preparing…";

			const result = await sendMessage("exportUserData", user!.userId);

			if (!result.ok) {
				btn.disabled = false;
				btn.textContent = originalText;
				alert(`Failed to export data: ${result.message}`);
				return;
			}

			const json = JSON.stringify(result.data.data, null, 2);
			const blob = new Blob([json], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `kiln-data-export-${user!.userId}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			btn.disabled = false;
			btn.textContent = originalText;
		});

	if (user && isLinked) initReviewMigration(user.userId);

	document
		.getElementById("kiln-sync-action-btn")
		?.addEventListener("click", () => {
			if (isLinked) {
				document.getElementById("kiln-sessions-btn")!.click();
			} else if (user) {
				openVerificationFlowModal(user.userId);
			}
		});

	if (isLinked) {
		let sessionsLoaded = false;

		const localSession = sessions.find(
			(s) => s.userId === user!.userId && s.state === "verified",
		);
		let currentSessionId: string | null = null;
		if (localSession?.refreshToken) {
			try {
				const payload = JSON.parse(
					atob(localSession.refreshToken.split(".")[1]!),
				);
				currentSessionId = payload.refreshId ?? null;
			} catch {}
		}

		async function renderKilnSessions() {
			const listEl = document.getElementById("kiln-sync-sessions-list")!;
			listEl.innerHTML = `<div class="px-3 py-2 text-muted small">Loading…</div>`;

			const result = await sendMessage("getKilnSessions", user!.userId);
			if (!result.ok) {
				listEl.innerHTML = `<div class="px-3 py-2 text-danger small">Failed to load sessions.</div>`;
				return;
			}

			const serverSessions = result.data.data;
			if (serverSessions.length === 0) {
				listEl.innerHTML = `<div class="px-3 py-2 text-muted small">No active sessions.</div>`;
				return;
			}

			listEl.innerHTML = serverSessions
				.map(
					(s, i) => `
				<div class="d-flex align-items-center gap-2 px-3 py-2${i < serverSessions.length - 1 ? " border-bottom border-secondary" : ""}" data-session-id="${s.id}">
					<i class="fas fa-${s.browser?.toLowerCase().includes("chrome") ? "chrome" : s.browser?.toLowerCase().includes("firefox") ? "firefox" : "globe"} text-muted" style="font-size:0.9rem;flex-shrink:0;"></i>
					<div class="flex-grow-1 min-w-0">
						<div class="small d-flex align-items-center gap-2">
							${[s.browser, s.os].filter(Boolean).join(" · ") || "Unknown device"}
							${s.id === currentSessionId ? '<span class="badge bg-primary" style="font-size:0.65rem;">This device</span>' : ""}
						</div>
						<div class="text-muted" style="font-size:0.72rem;">
							${s.lastUsedAt ? `Last active ${new Date(s.lastUsedAt).toLocaleDateString()}` : `Created ${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "unknown"}`}
						</div>
					</div>
					<button class="btn btn-outline-danger btn-sm py-0 kiln-session-revoke-btn" data-session-id="${s.id}" style="font-size:0.75rem;">Revoke</button>
				</div>
			`,
				)
				.join("");

			for (const btn of listEl.querySelectorAll<HTMLButtonElement>(
				".kiln-session-revoke-btn",
			)) {
				btn.addEventListener("click", async () => {
					btn.disabled = true;
					btn.textContent = "Revoking…";
					const sessionId = btn.dataset.sessionId!;
					const res = await sendMessage("terminateKilnSessionById", {
						userId: user!.userId,
						sessionId,
					});
					if (res.ok) {
						await renderKilnSessions();
					} else {
						btn.disabled = false;
						btn.textContent = "Revoke";
						btn.insertAdjacentHTML(
							"afterend",
							`<span class="text-danger small ms-1" style="font-size:0.72rem;">Failed</span>`,
						);
					}
				});
			}
		}

		const sessionsHeader = document.getElementById(
			"kiln-sync-sessions-header",
		)!;
		const sessionsBody = document.getElementById("kiln-sync-sessions-body")!;
		const sessionsChevron = document.getElementById(
			"kiln-sync-sessions-chevron",
		)!;

		sessionsHeader.style.borderRadius = "inherit";
		sessionsHeader.style.borderBottom = "none";

		sessionsHeader.addEventListener("click", () => {
			const collapsed = sessionsBody.style.display === "none";
			sessionsBody.style.display = collapsed ? "" : "none";
			sessionsChevron.style.transform = collapsed ? "rotate(180deg)" : "";
			sessionsHeader.style.borderRadius = collapsed ? "" : "inherit";
			sessionsHeader.style.borderBottom = collapsed ? "" : "none";
			if (collapsed && !sessionsLoaded) {
				sessionsLoaded = true;
				renderKilnSessions();
			}
		});
	}
}

async function initWhatsNewTab() {
	const container = document.getElementById("kiln-changelog")!;
	container.innerHTML = `<div class="card"><div class="card-body text-muted small">Loading changelog…</div></div>`;

	const result = await sendMessage("getChangelog");
	if (!result.ok) {
		container.innerHTML = `<div class="card"><div class="card-body text-danger small">Failed to load changelog.</div></div>`;
		return;
	}

	const md = result.data as string;
	const sections: { label: string; content: string }[] = [];
	for (const part of md.split(/(?=^## Kiln v)/m)) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const match = trimmed.match(/^## Kiln (v[\d.]+)/);
		if (match) sections.push({ label: match[1], content: trimmed });
	}

	if (sections.length <= 1) {
		container.innerHTML = `<div class="card"><div class="card-body">${renderChangelogMd(md)}</div></div>`;
		return;
	}

	container.innerHTML = `
		<div class="mb-2">
			<select id="kiln-changelog-version" class="form-select form-select-sm" style="max-width:220px;">
				${sections.map((s, i) => `<option value="${i}">${s.label}${i === 0 ? " (Latest)" : ""}</option>`).join("")}
			</select>
		</div>
		<div class="card">
			<div class="card-body" id="kiln-changelog-content">${renderChangelogMd(sections[0].content)}</div>
		</div>
	`;

	document
		.getElementById("kiln-changelog-version")!
		.addEventListener("change", (e) => {
			const idx = Number((e.target as HTMLSelectElement).value);
			document.getElementById("kiln-changelog-content")!.innerHTML =
				renderChangelogMd(sections[idx].content);
		});
}

async function initFeedbackTab() {
	const textarea = document.getElementById(
		"kiln-feedback-message",
	) as HTMLTextAreaElement;
	const chars = document.getElementById("kiln-feedback-chars") as HTMLElement;
	const submitBtn = document.getElementById(
		"kiln-feedback-submit",
	) as HTMLButtonElement;
	const status = document.getElementById("kiln-feedback-status") as HTMLElement;

	const user = await getUserDetails();

	const typeButtons = Array.from(
		document.querySelectorAll<HTMLButtonElement>(
			"#kiln-feedback-type-group [data-type]",
		),
	);
	const bugNotice = document.getElementById(
		"kiln-feedback-bug-notice",
	) as HTMLElement;
	let feedbackType: "feature" | "general" | "bug" = "general";

	function updateTypeButtons() {
		for (const btn of typeButtons) {
			const isActive = btn.dataset.type === feedbackType;
			btn.className = `btn btn-sm flex-grow-1 ${isActive ? "btn-primary" : "btn-secondary"}`;
		}
		bugNotice.classList.toggle("d-none", feedbackType !== "bug");
	}
	updateTypeButtons();

	for (const btn of typeButtons) {
		btn.addEventListener("click", () => {
			feedbackType = btn.dataset.type as "feature" | "general" | "bug";
			updateTypeButtons();
		});
	}

	textarea.addEventListener("input", () => {
		chars.textContent = String(textarea.value.length);
	});

	submitBtn.addEventListener("click", async () => {
		const type = feedbackType;
		const message = textarea.value.trim();

		if (!message) {
			status.textContent = "Please enter a message.";
			status.className = "small text-warning";
			return;
		}

		submitBtn.disabled = true;
		status.textContent = "Sending…";
		status.className = "small text-muted";

		const version = browser.runtime.getManifest().version;
		const result = await sendMessage("submitFeedback", {
			type,
			message,
			version,
			username: user?.username ?? "",
			userId: user?.userId,
		});

		if (result.ok) {
			status.textContent = "Feedback sent! Thanks.";
			status.className = "small text-success";
			textarea.value = "";
			chars.textContent = "0";
			setTimeout(() => {
				status.textContent = "";
			}, 4000);
			if (myFeedbackLoaded) renderMyFeedback();
		} else {
			status.textContent =
				result.code === "RATE_LIMITED"
					? "Slow down. Try again in a minute."
					: "Something went wrong. Try again later.";
			status.className = "small text-danger";
		}

		submitBtn.disabled = false;
	});

	let myFeedbackLoaded = false;

	async function renderMyFeedback() {
		const body = document.getElementById("kiln-my-feedback-body")!;
		const countBadge = document.getElementById("kiln-my-feedback-count")!;
		body.innerHTML = `<p class="text-muted small mb-0">Loading…</p>`;

		const result = await sendMessage("getMyFeedback", user?.userId);
		if (!result.ok) {
			body.innerHTML = `<p class="text-danger small mb-0">Failed to load your feedback.</p>`;
			return;
		}

		const items = result.data.data;
		countBadge.classList.toggle("d-none", items.length === 0);
		countBadge.textContent = String(items.length);

		if (items.length === 0) {
			body.innerHTML = `<p class="text-muted small mb-0">You haven't submitted any feedback yet.</p>`;
			return;
		}

		body.innerHTML = items
			.map((item, i) => {
				const statusBadge =
					item.status === "resolved"
						? '<span class="badge bg-success">Resolved</span>'
						: '<span class="badge bg-secondary">Open</span>';
				return `
					<div class="card${i < items.length - 1 ? " mb-2" : ""}">
						<div class="card-body p-2">
							<div class="d-flex justify-content-between align-items-center gap-2 mb-2">
								<div class="d-flex gap-1 flex-wrap">
									<span class="badge bg-primary">${FEEDBACK_TYPE_LABELS[item.type as keyof typeof FEEDBACK_TYPE_LABELS]}</span>
									${statusBadge}
								</div>
								<span class="text-muted flex-shrink-0" style="font-size:0.72rem;">${new Date(item.createdAt).toLocaleString()}</span>
							</div>
							<div class="small mb-0" style="white-space:pre-wrap;">${item.message.replace(/</g, "&lt;")}</div>
							${
								item.response
									? `<div class="alert border-secondary small py-2 px-2 mt-2 mb-0" style="white-space:pre-wrap;"><strong>Response:</strong> ${item.response.replace(/</g, "&lt;")}</div>`
									: '<div class="text-muted small mt-2"><i class="fas fa-clock me-1"></i>Awaiting a response</div>'
							}
						</div>
					</div>
				`;
			})
			.join("");
	}

	const myFeedbackHeader = document.getElementById("kiln-my-feedback-header")!;
	const myFeedbackChevron = document.getElementById(
		"kiln-my-feedback-chevron",
	)!;
	myFeedbackHeader.addEventListener("click", () => {
		const body = document.getElementById("kiln-my-feedback-body")!;
		const collapsed = body.style.display === "none";
		body.style.display = collapsed ? "" : "none";
		myFeedbackChevron.style.transform = collapsed ? "rotate(180deg)" : "";
		if (collapsed && !myFeedbackLoaded) {
			myFeedbackLoaded = true;
			renderMyFeedback();
		}
	});
}

function initDebugTab(container: HTMLElement) {
	const SYNC_KEYS = [
		"preferences",
		"favoritedPlaces",
		"bestFriends",
		"avatarSandboxOutfits",
		"savedThemes",
	] as const;
	const LOCAL_KEYS = [
		"cache",
		"savedThemes",
		"kilnSessions",
		"seenTradeIds",
		"dismissedNotices",
		"errorLog",
	] as const;
	const SYNC_QUOTA = 102400;
	const LOCAL_QUOTA = 10485760;

	function formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	container.innerHTML = `
		<div class="col-12">
			<div class="card border-secondary">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center">
					<span>Storage</span>
					<button id="kd-refresh-storage" class="btn btn-sm btn-outline-secondary py-0 px-2" title="Refresh sizes">
						<i class="fas fa-sync-alt" style="font-size:0.75rem;"></i>
					</button>
				</div>
				<div class="card-body pb-2" id="kd-storage-body">
					<p class="text-muted small mb-0">Loading…</p>
				</div>
			</div>
		</div>
		<div class="col-12">
			<div class="card border-secondary">
				<div class="card-header fw-semibold">Remote Config</div>
				<div class="card-body d-flex gap-2 flex-wrap">
					<button id="kd-view-config" class="btn btn-sm btn-outline-secondary">Fetch &amp; View</button>
				</div>
				<pre id="kd-config-out" class="mx-3 mb-3 p-2 rounded bg-black text-success" style="display:none;max-height:220px;overflow:auto;font-size:0.72rem;"></pre>
			</div>
		</div>
		<div class="col-12">
			<div class="card border-secondary">
				<div class="card-header fw-semibold">Cache</div>
				<div class="card-body d-flex gap-2 flex-wrap">
					<button id="kd-view-cache-meta" class="btn btn-sm btn-outline-secondary">View Meta</button>
					<button id="kd-clear-cache" class="btn btn-sm btn-outline-danger">Clear</button>
				</div>
				<pre id="kd-cache-out" class="mx-3 mb-3 p-2 rounded bg-black text-success" style="display:none;max-height:220px;overflow:auto;font-size:0.72rem;"></pre>
			</div>
		</div>
		<div class="col-12">
			<div class="card border-secondary">
				<div class="card-header fw-semibold">Sessions</div>
				<div class="card-body d-flex gap-2 flex-wrap">
					<button id="kd-view-sessions" class="btn btn-sm btn-outline-secondary">View</button>
					<button id="kd-clear-sessions" class="btn btn-sm btn-outline-danger">Clear</button>
				</div>
				<pre id="kd-sessions-out" class="mx-3 mb-3 p-2 rounded bg-black text-success" style="display:none;max-height:220px;overflow:auto;font-size:0.72rem;"></pre>
			</div>
		</div>
		<div class="col-12">
			<div class="card border-secondary">
				<div class="card-header fw-semibold">Preferences</div>
				<div class="card-body d-flex gap-2 flex-wrap">
					<button id="kd-view-prefs" class="btn btn-sm btn-outline-secondary">View</button>
					<button id="kd-reset-prefs" class="btn btn-sm btn-outline-danger">Reset to Defaults</button>
				</div>
				<pre id="kd-prefs-out" class="mx-3 mb-3 p-2 rounded bg-black text-success" style="display:none;max-height:220px;overflow:auto;font-size:0.72rem;"></pre>
			</div>
		</div>
		<div class="col-12">
			<div class="card border-secondary">
				<div class="card-header fw-semibold">Dismissed Notices</div>
				<div class="card-body d-flex gap-2 flex-wrap">
					<button id="kd-view-dismissed" class="btn btn-sm btn-outline-secondary">View</button>
					<button id="kd-reset-dismissed" class="btn btn-sm btn-outline-warning">Reset</button>
				</div>
				<pre id="kd-dismissed-out" class="mx-3 mb-3 p-2 rounded bg-black text-success" style="display:none;max-height:220px;overflow:auto;font-size:0.72rem;"></pre>
			</div>
		</div>
		<div class="col-12">
			<div class="card border-secondary">
				<div class="card-header fw-semibold">Error Log</div>
				<div class="card-body d-flex gap-2 flex-wrap">
					<button id="kd-view-errors" class="btn btn-sm btn-outline-secondary">View</button>
					<button id="kd-clear-errors" class="btn btn-sm btn-outline-danger">Clear</button>
					<button id="kd-throw-test-error" class="btn btn-sm btn-outline-warning">Throw Test Error</button>
				</div>
				<pre id="kd-errors-out" class="mx-3 mb-3 p-2 rounded bg-black text-success" style="display:none;max-height:220px;overflow:auto;font-size:0.72rem;"></pre>
			</div>
		</div>
	`;

	async function loadStorageOverview() {
		const body = document.getElementById("kd-storage-body")!;
		const refreshBtn = document.getElementById(
			"kd-refresh-storage",
		) as HTMLButtonElement;
		refreshBtn.disabled = true;
		body.innerHTML = '<p class="text-muted small mb-0">Loading…</p>';

		try {
			const [syncTotal, localTotal] = await Promise.all([
				browser.storage.sync.getBytesInUse(null as any),
				browser.storage.local.getBytesInUse(null as any),
			]);

			const syncSizes = await Promise.all(
				SYNC_KEYS.map((k) =>
					browser.storage.sync.getBytesInUse(k).then((b) => [k, b] as const),
				),
			);
			const localSizes = await Promise.all(
				LOCAL_KEYS.map((k) =>
					browser.storage.local.getBytesInUse(k).then((b) => [k, b] as const),
				),
			);

			const syncPct = Math.min(100, Math.round((syncTotal / SYNC_QUOTA) * 100));
			const localPct = Math.min(
				100,
				Math.round((localTotal / LOCAL_QUOTA) * 100),
			);
			const barCls = (pct: number) =>
				pct > 80 ? "bg-danger" : pct > 50 ? "bg-warning" : "bg-primary";
			const pctLabel = (pct: number, total: number) =>
				total === 0 ? "0%" : pct < 1 ? "<1%" : `${pct}%`;

			const maxSync = Math.max(...syncSizes.map(([, b]) => b), 1);
			const maxLocal = Math.max(...localSizes.map(([, b]) => b), 1);

			const rowHtml = (
				key: string,
				size: number,
				store: "sync" | "local",
				maxSize: number,
			) => {
				const barW = Math.round((size / maxSize) * 100);
				const storeBadge =
					store === "sync"
						? '<span class="badge bg-primary" style="font-size:0.65rem;min-width:38px;">sync</span>'
						: '<span class="badge bg-secondary" style="font-size:0.65rem;min-width:38px;">local</span>';
				return `
					<tr>
						<td style="font-size:0.8rem;"><code>${key}</code></td>
						<td>${storeBadge}</td>
						<td>
							<div class="d-flex align-items-center gap-2">
								<div style="flex:1;min-width:48px;">
									<div class="progress" style="height:4px;">
										<div class="progress-bar ${barCls(barW)}" style="width:${barW}%;"></div>
									</div>
								</div>
								<span class="text-muted text-end" style="min-width:48px;font-size:0.78rem;">${formatBytes(size)}</span>
							</div>
						</td>
					</tr>
				`;
			};

			body.innerHTML = `
				<div class="row g-3 mb-3">
					<div class="col-sm-6">
						<div class="d-flex justify-content-between align-items-baseline mb-1">
							<span class="small text-muted">Sync</span>
							<span style="font-size:0.8rem;">${formatBytes(syncTotal)} <span class="text-muted">/ ${formatBytes(SYNC_QUOTA)}</span></span>
						</div>
						<div class="progress mb-1" style="height:6px;">
							<div class="progress-bar ${barCls(syncPct)}" style="width:${syncPct}%;"></div>
						</div>
						<div class="text-muted text-end" style="font-size:0.72rem;">${pctLabel(syncPct, syncTotal)} used</div>
					</div>
					<div class="col-sm-6">
						<div class="d-flex justify-content-between align-items-baseline mb-1">
							<span class="small text-muted">Local</span>
							<span style="font-size:0.8rem;">${formatBytes(localTotal)} <span class="text-muted">/ ${formatBytes(LOCAL_QUOTA)}</span></span>
						</div>
						<div class="progress mb-1" style="height:6px;">
							<div class="progress-bar ${barCls(localPct)}" style="width:${localPct}%;"></div>
						</div>
						<div class="text-muted text-end" style="font-size:0.72rem;">${pctLabel(localPct, localTotal)} used</div>
					</div>
				</div>
				<table class="table table-sm mb-0">
					<thead>
						<tr class="text-muted" style="font-size:0.72rem;">
							<th class="fw-normal">Key</th>
							<th class="fw-normal">Store</th>
							<th class="fw-normal">Size</th>
						</tr>
					</thead>
					<tbody>
						${syncSizes.map(([k, b]) => rowHtml(k, b, "sync", maxSync)).join("")}
						${localSizes.map(([k, b]) => rowHtml(k, b, "local", maxLocal)).join("")}
					</tbody>
				</table>
			`;
		} catch (e) {
			body.innerHTML = `<p class="text-danger small mb-0">Failed to load storage info: ${e}</p>`;
		} finally {
			refreshBtn.disabled = false;
		}
	}

	loadStorageOverview();
	document
		.getElementById("kd-refresh-storage")!
		.addEventListener("click", loadStorageOverview);

	function toggle(preId: string, json: unknown) {
		const el = document.getElementById(preId)!;
		if (el.style.display === "none") {
			el.textContent = JSON.stringify(json, null, 2);
			el.style.display = "block";
		} else {
			el.style.display = "none";
		}
	}

	function flash(btn: HTMLElement, label: string) {
		const orig = btn.innerHTML;
		btn.innerHTML = label;
		btn.setAttribute("disabled", "");
		setTimeout(() => {
			btn.innerHTML = orig;
			btn.removeAttribute("disabled");
		}, 1500);
	}

	document
		.getElementById("kd-clear-cache")!
		.addEventListener("click", async (e) => {
			await cache.setValue(cache.fallback);
			await cache.removeMeta();
			flash(e.currentTarget as HTMLElement, "Cleared!");
			loadStorageOverview();
		});

	document
		.getElementById("kd-view-cache-meta")!
		.addEventListener("click", async () => {
			toggle(
				"kd-cache-out",
				(await cache.getMeta()) as Record<string, unknown>,
			);
		});

	document
		.getElementById("kd-view-sessions")!
		.addEventListener("click", async () => {
			const sessions = await apiSessions.getValue();
			const masked = sessions.map((s) => ({
				...s,
				accessToken: s.accessToken
					? `${s.accessToken.slice(0, 8)}…`
					: undefined,
				refreshToken: s.refreshToken
					? `${s.refreshToken.slice(0, 8)}…`
					: undefined,
				verificationToken: s.verificationToken
					? `${s.verificationToken.slice(0, 8)}…`
					: undefined,
			}));
			toggle("kd-sessions-out", masked);
		});

	document
		.getElementById("kd-clear-sessions")!
		.addEventListener("click", async (e) => {
			await apiSessions.setValue([]);
			flash(e.currentTarget as HTMLElement, "Cleared!");
			loadStorageOverview();
		});

	document
		.getElementById("kd-view-prefs")!
		.addEventListener("click", async () => {
			toggle("kd-prefs-out", await preferences.getPreferences());
		});

	document
		.getElementById("kd-reset-prefs")!
		.addEventListener("click", async (e) => {
			await preferences.setValue(preferences.fallback);
			flash(e.currentTarget as HTMLElement, "Reset!");
			loadStorageOverview();
		});

	document
		.getElementById("kd-view-dismissed")!
		.addEventListener("click", async () => {
			toggle("kd-dismissed-out", await dismissedNotices.getValue());
		});

	document
		.getElementById("kd-reset-dismissed")!
		.addEventListener("click", async (e) => {
			await dismissedNotices.setValue([]);
			flash(e.currentTarget as HTMLElement, "Reset!");
			loadStorageOverview();
		});

	document
		.getElementById("kd-view-config")!
		.addEventListener("click", async () => {
			toggle("kd-config-out", await getConfig());
		});

	document
		.getElementById("kd-view-errors")!
		.addEventListener("click", async () => {
			toggle("kd-errors-out", await _errorLog.getValue());
		});

	document
		.getElementById("kd-clear-errors")!
		.addEventListener("click", async (e) => {
			await _errorLog.setValue([]);
			flash(e.currentTarget as HTMLElement, "Cleared!");
			loadStorageOverview();
		});

	document
		.getElementById("kd-throw-test-error")!
		.addEventListener("click", (e) => {
			flash(e.currentTarget as HTMLElement, "Thrown!");
			setTimeout(() => {
				throw new Error("[Kiln] Debug test error");
			}, 0);
		});
}

function openProfileThemeEffectsModal(
	subs: NonNullable<SettingData["config"]>,
	getValue: (subsetting: string) => unknown,
	setValue: (subsetting: string, value: boolean) => void,
) {
	const modal = createModal();
	modal.style.maxHeight = "85vh";
	modal.style.overflowY = "auto";
	modal.addEventListener("close", () => modal.remove());
	modal.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-2">
			<h5 class="mb-0">Allowed Profile Theme Effects</h5>
			<button class="btn-close" data-close aria-label="Close"></button>
		</div>
		<p class="text-muted small mb-3">Choose which parts of other users' custom profile themes are allowed to load.</p>
		<div data-body></div>
		<div class="d-flex justify-content-end mt-3">
			<button class="btn btn-sm btn-primary" data-close>Done</button>
		</div>
	`;
	const body = modal.querySelector("[data-body]") as HTMLElement;
	for (const sub of subs) {
		const span = document.createElement("span");
		span.className = "form-check form-switch d-block mb-1";
		const id = `kiln-pte-opt-${sub.subsetting}`;
		span.innerHTML = `<input class="form-check-input" type="checkbox" role="switch" id="${id}" /><label class="form-check-label" for="${id}">${sub.label}</label>`;
		const checkbox = span.querySelector<HTMLInputElement>(".form-check-input")!;
		checkbox.checked = (getValue(sub.subsetting) ??
			sub.default ??
			false) as boolean;
		checkbox.addEventListener("change", () =>
			setValue(sub.subsetting, checkbox.checked),
		);
		body.appendChild(span);
	}
	for (const el of modal.querySelectorAll("[data-close]")) {
		el.addEventListener("click", () => modal.close());
	}
	modal.showModal();
}

async function openVerificationFlowModal(userId: number) {
	const modal = createModal();

	function setContent(html: string) {
		modal.innerHTML = html;
	}

	function addCloseBtn() {
		modal
			.querySelector<HTMLButtonElement>("#kvf-close")
			?.addEventListener("click", () => modal.close());
	}

	function renderRules() {
		setContent(`
			<div class="d-flex justify-content-between align-items-center mb-3">
				<h5 class="mb-0">Before you link...</h5>
				<button class="btn btn-sm btn-secondary" id="kvf-close">✕</button>
			</div>
			<p class="small text-muted mb-2">Just a few things to keep Kiln inclusive to everyone, the following rules apply to content you post via Kiln (such as published Kiln themes):</p>
			<ul class="small mb-3">
				<li>Be respectful. No hate speech, harassment, or discrimination of any kind will be tolerated.</li>
				<li>Don't upload inappropriate, explicit, or offensive content.</li>
				<li>Don't try to exploit or abuse Kiln's features.</li>
				<li>Don't impersonate other users.</li>
				<li>Common sense and Polytoria site rules apply.</li>
			</ul>
			<div class="alert border-secondary small mb-2">
				<i class="fas fa-info-circle me-1"></i>
				<strong>How linking works:</strong> You complete an action that Kiln can verify, such as putting a short code in your bio, to prove you own the account. Kiln only reads your public Polytoria profile to verify you. Kiln has no access to your Polytoria account, your password, settings, or anything private.
			</div>
			<div class="text-muted mb-3" style="font-size:0.75rem;">
				By clicking Agree, you agree to the
				<a href="https://kiln.indexx.dev/terms" target="_blank" class="text-muted">Terms of Service</a>
				and
				<a href="https://kiln.indexx.dev/privacy" target="_blank" class="text-muted">Privacy Policy</a>.
			</div>
			<div class="d-flex justify-content-end gap-2">
				<button class="btn btn-secondary btn-sm" id="kvf-close-2">Cancel</button>
				<button class="btn btn-primary btn-sm" id="kvf-rules-next">Agree</button>
			</div>
		`);
		addCloseBtn();
		modal
			.querySelector("#kvf-close-2")
			?.addEventListener("click", () => modal.close());
		modal
			.querySelector("#kvf-rules-next")
			?.addEventListener("click", renderMethodSelect);
	}

	function renderMethodSelect() {
		setContent(`
			<div class="d-flex justify-content-between align-items-center mb-3">
				<h5 class="mb-0">Choose Verification Method</h5>
				<button class="btn btn-sm btn-secondary" id="kvf-close">✕</button>
			</div>
			<p class="small text-muted mb-3">Select how you'd like to verify your Polytoria account.</p>
			<div class="d-flex flex-column gap-2 mb-3">
				<button class="btn btn-outline-secondary text-start p-3" id="kvf-method-manual">
					<div class="fw-semibold mb-1"><i class="fas fa-code me-2"></i>Manual Code Verification</div>
					<div class="text-muted small">Paste a code into your Polytoria bio to prove account ownership.</div>
				</button>
				<button class="btn btn-outline-secondary text-start p-3" id="kvf-method-auto">
					<div class="fw-semibold mb-1">
						<i class="fas fa-bolt me-2"></i>Automatic Code Verification
					</div>
					<div class="text-muted small">Automatically verify using a code in your bio, but without you having to do anything.</div>
				</button>
				<button class="btn btn-outline-secondary text-start p-3" id="kvf-method-ingame" disabled>
					<div class="fw-semibold mb-1">
						<i class="fas fa-gamepad me-2"></i>In-Game Verification
						<span class="badge bg-secondary ms-1" style="font-size:0.7rem;">Coming Soon</span>
					</div>
					<div class="text-muted small">Verify by joining a Polytoria world.</div>
				</button>
			</div>
			<div class="text-end">
				<button class="btn btn-secondary btn-sm" id="kvf-back">← Back</button>
			</div>
		`);
		addCloseBtn();
		modal.querySelector("#kvf-back")?.addEventListener("click", renderRules);
		modal
			.querySelector("#kvf-method-manual")
			?.addEventListener("click", renderManualCode);
		modal
			.querySelector("#kvf-method-auto")
			?.addEventListener("click", renderAutoCode);
	}

	function isJwtExpired(token: string): boolean {
		try {
			const payload = JSON.parse(atob(token.split(".")[1]));
			return Date.now() >= payload.exp * 1000;
		} catch {
			return true;
		}
	}

	async function getVerificationPhrase(): Promise<
		{ ok: true; phrase: string } | { ok: false; message: string }
	> {
		const sessions = await apiSessions.getValue();
		const existing = sessions.find(
			(s) =>
				s.userId === userId &&
				s.state === "pending" &&
				s.phrase &&
				s.verificationToken,
		);

		if (existing?.phrase && !isJwtExpired(existing.verificationToken!)) {
			return { ok: true, phrase: existing.phrase };
		}

		const startResult = await sendMessage("startKilnVerification", userId);
		if (!startResult.ok) {
			return {
				ok: false,
				message: "Failed to start verification. Please try again later.",
			};
		}
		const { phrase, token } = startResult.data.data;

		const fresh = await apiSessions.getValue();
		const withoutExisting = fresh.filter((s) => s.userId !== userId);
		withoutExisting.push({
			userId,
			state: "pending",
			verificationToken: token,
			phrase,
		});
		await apiSessions.setValue(withoutExisting);

		return { ok: true, phrase };
	}

	async function renderManualCode() {
		setContent(`
			<div class="d-flex justify-content-between align-items-center mb-3">
				<h5 class="mb-0">Manual Code Verification</h5>
				<button class="btn btn-sm btn-secondary" id="kvf-close">✕</button>
			</div>
			<div id="kvf-manual-body">
				<p class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Starting verification…</p>
			</div>
		`);
		addCloseBtn();

		const body = modal.querySelector("#kvf-manual-body") as HTMLElement;

		function renderManualError(message: string) {
			body.innerHTML = `
				<p class="text-danger small mb-3">${message}</p>
				<button class="btn btn-secondary btn-sm" id="kvf-err-back">← Back</button>
			`;
			body
				.querySelector("#kvf-err-back")
				?.addEventListener("click", renderMethodSelect);
		}

		const phraseResult = await getVerificationPhrase();
		if (!phraseResult.ok) {
			renderManualError(phraseResult.message);
			return;
		}
		const { phrase } = phraseResult;

		body.innerHTML = `
			<p class="small text-muted mb-2">
				Add this code anywhere in your
				<a href="https://polytoria.com/my/settings/profile" target="_blank" class="text-muted" style="text-decoration:underline;">Polytoria bio</a>.
				Kiln will detect it automatically. You can remove it from your bio once verified.
			</p>
			<div class="d-flex align-items-center gap-2 mb-3">
				<code id="kvf-phrase" class="flex-fill p-2" style="background:rgba(255,255,255,0.08);border-radius:4px;font-size:0.85em;word-break:break-all;"></code>
				<button class="btn btn-sm btn-outline-secondary flex-shrink-0" id="kvf-copy"><i class="fas fa-copy"></i></button>
			</div>
			<div class="d-flex gap-2">
				<button class="btn btn-secondary btn-sm" id="kvf-manual-back">← Back</button>
				<button class="btn btn-primary btn-sm" id="kvf-manual-done">Got it</button>
			</div>
		`;

		(body.querySelector("#kvf-phrase") as HTMLElement).textContent = phrase;

		const copyBtn = body.querySelector<HTMLButtonElement>("#kvf-copy")!;
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(phrase);
			copyBtn.innerHTML = '<i class="fas fa-check"></i>';
			setTimeout(() => {
				copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
			}, 1500);
		});

		body
			.querySelector("#kvf-manual-back")
			?.addEventListener("click", renderRules);
		body
			.querySelector("#kvf-manual-done")
			?.addEventListener("click", () => modal.close());
	}

	async function renderAutoCode() {
		setContent(`
			<div class="d-flex justify-content-between align-items-center mb-3">
				<h5 class="mb-0">Automatic Code Verification</h5>
				<button class="btn btn-sm btn-secondary" id="kvf-close">✕</button>
			</div>
			<div id="kvf-auto-body">
				<p class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Starting verification…</p>
			</div>
		`);
		addCloseBtn();

		const body = modal.querySelector("#kvf-auto-body") as HTMLElement;

		function setStatus(message: string) {
			body.innerHTML = `<p class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>${message}</p>`;
		}

		function renderAutoError(message: string) {
			body.innerHTML = `
				<p class="text-danger small mb-3">${message}</p>
				<button class="btn btn-secondary btn-sm" id="kvf-err-back">← Back</button>
			`;
			body
				.querySelector("#kvf-err-back")
				?.addEventListener("click", renderMethodSelect);
		}

		async function fetchProfileBio(): Promise<string | null> {
			const result = await sendMessage("getProfileBio");
			return result.ok ? result.data : null;
		}

		async function submitProfileBio(description: string): Promise<boolean> {
			const result = await sendMessage("updateProfileBio", description);
			return result.ok;
		}

		const phraseResult = await getVerificationPhrase();
		if (!phraseResult.ok) {
			renderAutoError(phraseResult.message);
			return;
		}
		const { phrase } = phraseResult;

		setStatus("Updating your bio…");

		const currentBio = await fetchProfileBio();
		if (currentBio === null) {
			renderAutoError(
				"Couldn't find your profile bio field. Please try the manual method instead.",
			);
			return;
		}

		const cleanBio = currentBio
			.replace(KILN_ID_REGEX_GLOBAL, "")
			.replace(/[ \t]*\n[ \t]*\n+/g, "\n")
			.trim();

		if (
			!(await submitProfileBio(cleanBio ? `${cleanBio}\n${phrase}` : phrase))
		) {
			renderAutoError("Failed to update your bio. Please try again later.");
			return;
		}

		setStatus("Confirming verification…");

		const verificationResult = await sendMessage(
			"finishKilnVerification",
			userId,
		);
		if (!verificationResult.ok || !verificationResult.data.data.userId) {
			renderAutoError(
				"Your bio was updated, but verification failed. Please try again in a moment.",
			);
			return;
		}
		const verification = verificationResult.data;

		await updateApiSession(userId, (session) => {
			session.state = "verified";
			session.accessToken = verification.data.accessToken;
			session.refreshToken = verification.data.refreshToken;
			delete session.verificationToken;
		});

		setStatus("Cleaning up…");

		await submitProfileBio(cleanBio);

		window.location.reload();
	}

	renderRules();
	modal.showModal();
}

function initSessionsDialog() {
	const dialog = createModal();
	dialog.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-2">
			<h5 class="mb-0" style="color: #fff;">API Sessions</h5>
			<button class="btn btn-sm btn-secondary" id="kiln-sessions-close">✕</button>
		</div>
		<div id="kiln-sessions-list"></div>
	`;

	dialog
		.querySelector<HTMLButtonElement>("#kiln-sessions-close")!
		.addEventListener("click", () => dialog.close());

	document
		.getElementById("kiln-sessions-btn")!
		.addEventListener("click", async () => {
			await renderSessionsList();
			dialog.showModal();
		});
}

async function renderSessionsList() {
	const list = document.getElementById("kiln-sessions-list") as HTMLElement;
	const sessions = await apiSessions.getValue();

	if (sessions.length === 0) {
		list.innerHTML = `<p class="text-muted mb-0 small">No linked accounts.</p>`;
		return;
	}

	list.innerHTML = `
		<table class="table table-sm mb-0">
			<thead>
				<tr><th>User ID</th><th>State</th><th></th></tr>
			</thead>
			<tbody>
				${sessions
					.map(
						(s) => `
					<tr>
						<td>${s.userId}</td>
						<td>
							<span class="badge ${s.state === "verified" ? "bg-success" : "bg-warning text-dark"}">${s.state}</span>
							${s.state === "pending" && s.phrase ? `<br/><code style="font-size:0.8em;">${s.phrase}</code>` : ""}
						</td>
						<td><button class="btn btn-outline-danger btn-sm" data-remove-session="${s.userId}">Remove</button></td>
					</tr>
				`,
					)
					.join("")}
			</tbody>
		</table>
	`;

	for (const btn of list.querySelectorAll<HTMLButtonElement>(
		"[data-remove-session]",
	)) {
		btn.addEventListener("click", async () => {
			const userId = parseInt(btn.dataset.removeSession!, 10);
			const current = await apiSessions.getValue();
			await apiSessions.setValue(current.filter((s) => s.userId !== userId));
			await renderSessionsList();
		});
	}
}

export async function kilnDebug() {
	const content = document.getElementsByClassName(
		"col-lg-10",
	)[0] as HTMLElement;
	content.innerHTML = `<div class="row g-3" id="kd-root"></div>`;
	initDebugTab(document.getElementById("kd-root") as HTMLElement);
}

export async function checkForVerificationCode(userId: number) {
	const descriptionTextbox = document.getElementById("description");
	if (!descriptionTextbox) return;

	const session = await getApiSession(userId);

	if (
		session &&
		session.state != "verified" &&
		descriptionTextbox.textContent
	) {
		const match = descriptionTextbox.textContent.match(KILN_ID_REGEX);

		if (match) {
			const verificationResult = await sendMessage(
				"finishKilnVerification",
				userId,
			);
			if (!verificationResult.ok || !verificationResult.data.data.userId)
				return;
			const verification = verificationResult.data;

			if (verification.data.userId) {
				const modal = createModal();
				modal.style.overflow = "hidden";

				modal.innerHTML = `
                <div class="row text-muted mb-2" style="font-size: 0.8rem;">
                    <div class="col">
                        <h5 class="mb-0" style="color: #fff;">Kiln Verification</h5>
                        You're verified!
                    </div>
                    <div class="col-md-2">
                        <button class="btn btn-info w-100 mx-auto" onclick="this.parentElement.parentElement.parentElement.close();">X</button>
                    </div>
                    </div>
                </div>
                <div class="modal-body text-center text-light">
                    <p class="mt-4 mb-3">Verification is done! You've unlocked sharing character sandbox outfits, sharing favorited worlds, time played, and more!</p>
                </div>
                `;

				await updateApiSession(userId, (session) => {
					session.state = "verified";
					session.accessToken = verification.data.accessToken;
					session.refreshToken = verification.data.refreshToken;
					delete session.verificationToken;
				});

				modal.showModal();
			}
		}
	}
}

export async function securityKeyRenaming() {
	let renames = await _securityKeyNames.getValue();
	const securityKeys = document.querySelectorAll(".card.mcard.mt-2");

	securityKeys.forEach((keyCard) => {
		const deleteButton = keyCard.querySelector(
			'button[onclick^="deleteSecurityKey"]',
		);
		const keyId = Number(
			deleteButton?.getAttribute("onclick")?.match(/'(\d+)'/)?.[1],
		);

		const nameElement = keyCard.querySelector(".fw-bold");
		if (nameElement) {
			if (keyId && renames[keyId as keyof typeof renames]) {
				nameElement.textContent = renames[keyId as keyof typeof renames];
			}

			if (deleteButton) {
				const existingRenameButton = deleteButton.parentElement?.querySelector(
					".btn-outline-secondary",
				);
				if (!existingRenameButton) {
					const renameButton = document.createElement("button");
					renameButton.type = "button";
					renameButton.className = "btn btn-outline-secondary me-2";
					renameButton.innerHTML = '<i class="fas fa-pen me-1"></i> Rename';

					renameButton.addEventListener("click", async () => {
						const currentName =
							renames[keyId as keyof typeof renames] || nameElement.textContent;
						const result = await sendMessage("showSecurityKeyRenamePrompt", {
							currentName,
						});
						if (!result?.ok || !result.data?.trim()) return;
						const trimmed = result.data.trim();
						nameElement.textContent = trimmed;
						renames[keyId as keyof typeof renames] = trimmed;
						_securityKeyNames.setValue(renames);
					});

					deleteButton.parentElement?.insertBefore(renameButton, deleteButton);
				}
			}
		}
	});

	_securityKeyNames.watch((newValue) => {
		renames = newValue ?? {};
	});
}
