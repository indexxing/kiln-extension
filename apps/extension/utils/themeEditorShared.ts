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
import { resolveDecalUrl } from "@/utils/decal";
import { escapeHtml, safeHttpUrl } from "@/utils/escapeHtml";
import { sendMessage } from "@/utils/messaging";
import { publishedThemeFields } from "@/utils/publishedTheme";
import {
	_hasShownPublishRulesModal,
	_savedThemes,
	apiSessions,
	preferences,
	type SavedTheme,
} from "@/utils/storage";
import {
	applyKilnTheme,
	EFFECT_TYPE_CONFIGS,
	hexToRgb,
	isValidHex,
	parseAssetVolume,
	rgbToHex,
	SELECTOR_REFERENCE,
	THEME_PRESETS,
} from "@/utils/theme";
import type { EffectType, ThemeEffect } from "@/utils/types";
import { createModal } from "@/utils/utilities";

const RANDOM_ADJECTIVES = [
	"Solar",
	"Lunar",
	"Crimson",
	"Azure",
	"Ember",
	"Frost",
	"Golden",
	"Cobalt",
	"Scarlet",
	"Jade",
	"Violet",
	"Onyx",
	"Ivory",
	"Amber",
	"Slate",
	"Coral",
	"Sage",
	"Midnight",
	"Dawn",
	"Dusk",
	"Neon",
	"Pastel",
	"Misty",
	"Velvet",
];
const RANDOM_NOUNS = [
	"Harbor",
	"Prism",
	"Drift",
	"Bloom",
	"Forge",
	"Haven",
	"Ridge",
	"Shore",
	"Glow",
	"Crest",
	"Vale",
	"Peak",
	"Void",
	"Spark",
	"Haze",
	"Pulse",
	"Echo",
	"Surge",
	"Wave",
	"Dune",
	"Ash",
	"Mist",
	"Stone",
	"Flare",
];
export function generateRandomThemeName(): string {
	const adj =
		RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)];
	const noun = RANDOM_NOUNS[Math.floor(Math.random() * RANDOM_NOUNS.length)];
	return `${adj} ${noun}`;
}

const DEFAULT_ACCENT = "#3bafff";
const DEFAULT_NAVBAR = "#1a1a1a";

export function publishRulesModalBody(): string {
	return `
		<p class="fw-bold mb-2" style="font-size:0.95rem;">
			<i class="fas fa-triangle-exclamation me-1 text-warning"></i>Before Publishing...
		</p>
		<p class="small text-muted mb-2">
			Publishing shares this theme with every Kiln user. The same rules you agreed to when linking your account still apply:
		</p>
		<ul class="small mb-2" style="padding-left:1.1em;">
			<li>No impersonation, hateful, sexual, or illegal content.</li>
			<li>Published themes are reviewed and can be removed or reported.</li>
			<li>Don't use Kiln to harass or deceive other players.</li>
		</ul>
		<p class="small fw-semibold mb-1">Custom CSS may not:</p>
		<ul class="small mb-0" style="padding-left:1.1em;">
			<li>Target or hide Kiln's own UI.</li>
			<li>Hide the account dropdown, navbar, or "Report" actions.</li>
			<li>Hide or blank the entire page.</li>
			<li>Import anything other than Google Fonts / Bunny Fonts.</li>
			<li>Use <code>expression()</code>, a <code>javascript:</code> url, <code>-moz-binding</code>, or <code>behavior: url(...)</code>.</li>
		</ul>
		<p class="small text-muted mb-0 mt-2">Themes that break these rules are rejected automatically or removed after review.</p>
	`;
}

export function confirmPublishRulesSeen(
	overlay: HTMLElement,
	continueBtn: HTMLButtonElement,
	cancelBtn: HTMLButtonElement,
): Promise<boolean> {
	return _hasShownPublishRulesModal.getValue().then((seen) => {
		if (seen) return true;
		overlay.style.display = "flex";
		return new Promise<boolean>((resolve) => {
			const finish = (result: boolean) => {
				overlay.style.display = "none";
				continueBtn.removeEventListener("click", onContinue);
				cancelBtn.removeEventListener("click", onCancel);
				if (result) void _hasShownPublishRulesModal.setValue(true);
				resolve(result);
			};
			const onContinue = () => finish(true);
			const onCancel = () => finish(false);
			continueBtn.addEventListener("click", onContinue);
			cancelBtn.addEventListener("click", onCancel);
		});
	});
}

export function applyThemeById(id: string, saved: SavedTheme[]): void {
	if (id === "default") applyKilnTheme(null);
	else if (id in THEME_PRESETS) applyKilnTheme(THEME_PRESETS[id]);
	else applyKilnTheme(saved.find((t) => t.id === id) ?? null);
}

export async function setActiveTheme(id: string): Promise<void> {
	const values = await preferences.getPreferences();
	(values.config as any).themeCreator = { activeThemeId: id };
	await preferences.setValue(values);
	applyThemeById(id, await _savedThemes.getValue());
}

async function createSavedTheme(
	seed: Pick<SavedTheme, "name" | "accentColor" | "navbarColor">,
): Promise<SavedTheme> {
	const theme: SavedTheme = { id: crypto.randomUUID(), ...seed };
	await _savedThemes.setValue([...(await _savedThemes.getValue()), theme]);
	return theme;
}

export function forkPreset(key: string): Promise<SavedTheme> {
	const preset = THEME_PRESETS[key];
	return createSavedTheme({
		name: `${preset.name} (Copy)`,
		accentColor: preset.accentColor,
		navbarColor: preset.navbarColor,
	});
}

export function createBlankTheme(): Promise<SavedTheme> {
	return createSavedTheme({
		name: generateRandomThemeName(),
		accentColor: DEFAULT_ACCENT,
		navbarColor: DEFAULT_NAVBAR,
	});
}

export async function deleteSavedTheme(theme: SavedTheme): Promise<void> {
	const apiSlug = theme.publishedSlug ?? theme.previousPublishedSlug;
	if (apiSlug) {
		const sessions = await apiSessions.getValue();
		const verified = sessions.find(
			(s) => s.state === "verified" && s.accessToken,
		);
		if (verified) {
			await sendMessage("deletePublishedTheme", {
				userId: verified.userId,
				id: apiSlug,
			});
		}
	}
	const current = await _savedThemes.getValue();
	await _savedThemes.setValue(current.filter((t) => t.id !== theme.id));
}

export function openNewThemeModal(
	onPick: (create: () => Promise<SavedTheme>) => Promise<void>,
) {
	const modal = createModal();
	modal.addEventListener("close", () => modal.remove());
	modal.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-3">
			<h5 class="mb-0 fw-bold">New Theme</h5>
			<button class="btn-close" data-close aria-label="Close"></button>
		</div>
		<button type="button" class="btn btn-outline-primary w-100 mb-3" data-scratch>
			<i class="fas fa-file me-1"></i>Start from scratch
		</button>
		<div class="small text-muted mb-2">Or start from a preset</div>
		<div class="row g-2" data-presets></div>
	`;

	const pick = (create: () => Promise<SavedTheme>) => {
		for (const b of modal.querySelectorAll("button"))
			(b as HTMLButtonElement).disabled = true;
		void onPick(create).finally(() => modal.close());
	};

	for (const el of modal.querySelectorAll("[data-close]"))
		el.addEventListener("click", () => modal.close());
	modal
		.querySelector("[data-scratch]")!
		.addEventListener("click", () => pick(createBlankTheme));

	const grid = modal.querySelector("[data-presets]")!;
	for (const [key, preset] of Object.entries(THEME_PRESETS)) {
		const col = document.createElement("div");
		col.className = "col-6";
		col.innerHTML = `
			<button type="button" class="btn btn-outline-secondary w-100 d-flex align-items-center gap-2 text-start">
				<span class="d-flex flex-shrink-0" style="border-radius:4px;overflow:hidden;">
					<span style="width:14px;height:22px;background:${preset.navbarColor};"></span>
					<span style="width:14px;height:22px;background:${preset.accentColor};"></span>
				</span>
				<span class="small text-truncate"></span>
			</button>
		`;
		col.querySelector(".text-truncate")!.textContent = preset.name;
		col
			.querySelector("button")!
			.addEventListener("click", () => pick(() => forkPreset(key)));
		grid.appendChild(col);
	}

	modal.showModal();
}

export async function showConfirmImport(
	fetched: Extension.GetPublishedThemeApi["data"],
	creatorName: string,
	thumbnailUrl: string | null | undefined,
	onCancel: (() => void) | undefined,
	onImported: (localId: string) => void | Promise<void>,
) {
	const confirmModal = createModal();
	confirmModal.addEventListener("close", () => confirmModal.remove());
	const safeThumbnail = safeHttpUrl(thumbnailUrl);
	const safeNavbarColor = isValidHex(fetched.navbarColor)
		? fetched.navbarColor
		: "#1a1a1a";
	const safeAccentColor = isValidHex(fetched.accentColor)
		? fetched.accentColor
		: "#3bafff";
	const thumbnailHtml = safeThumbnail
		? `<img src="${escapeHtml(safeThumbnail)}" style="width:100%;height:100%;object-fit:cover;" />`
		: `<div style="width:100%;height:50%;background:${safeNavbarColor};"></div>
			<div style="width:100%;height:50%;background:${safeAccentColor};"></div>`;
	const hasClickingSound = (fetched.effects ?? []).some(
		(e) => e.slot === "global" && e.type === "clicking-sound",
	);
	const hasBackgroundMusic = (fetched.effects ?? []).some(
		(e) => e.slot === "global" && e.type === "background-music",
	);
	const notices = [
		hasClickingSound
			? { icon: "fa-volume-high", label: "Has a clicking sound" }
			: null,
		hasBackgroundMusic
			? { icon: "fa-music", label: "Has background music" }
			: null,
		fetched.customCss ? { icon: "fa-code", label: "Uses custom CSS" } : null,
	].filter((n): n is { icon: string; label: string } => n !== null);
	confirmModal.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-3">
			<h5 class="mb-0 fw-bold">Import Theme</h5>
			<button class="btn-close" id="kiln-confirm-close" aria-label="Close"></button>
		</div>
		<div style="width:100%;height:180px;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
			${thumbnailHtml}
		</div>
		<div class="mt-2 mb-3">
			<div class="fw-semibold">${escapeHtml(fetched.name)}</div>
			<div class="text-muted small">by ${escapeHtml(creatorName)}</div>
			${
				notices.length > 0
					? `<div class="d-flex gap-1 flex-wrap mt-2">
				${notices
					.map(
						(n) =>
							`<span class="badge bg-secondary"><i class="fas ${n.icon} me-1"></i>${n.label}</span>`,
					)
					.join("")}
			</div>`
					: ""
			}
		</div>
		<div class="d-flex gap-2 justify-content-end">
			<button class="btn btn-sm btn-secondary" id="kiln-confirm-cancel">Cancel</button>
			<button class="btn btn-sm btn-primary" id="kiln-confirm-import">
				<i class="fas fa-download me-1"></i>Import
			</button>
		</div>
	`;

	confirmModal
		.querySelector("#kiln-confirm-close")!
		.addEventListener("click", () => confirmModal.close());
	confirmModal
		.querySelector("#kiln-confirm-cancel")!
		.addEventListener("click", () => {
			confirmModal.close();
			onCancel?.();
		});

	confirmModal
		.querySelector<HTMLButtonElement>("#kiln-confirm-import")!
		.addEventListener("click", async (e) => {
			const importBtn = e.currentTarget as HTMLButtonElement;
			if (importBtn.disabled) return;
			importBtn.disabled = true;
			try {
				const current = await _savedThemes.getValue();
				const alreadyImported = current.find(
					(t) => t.importedSlug === fetched.id,
				);
				const localId = alreadyImported?.id ?? crypto.randomUUID();

				if (!alreadyImported) {
					current.push({
						id: localId,
						...publishedThemeFields(fetched),
						importedSlug: fetched.id,
					});
					await _savedThemes.setValue(current);
				}

				await setActiveTheme(localId);
				confirmModal.close();
				await onImported(localId);
			} finally {
				importBtn.disabled = false;
			}
		});

	confirmModal.showModal();
}

export function openThemeGallery(
	onImported: (localId: string) => void | Promise<void>,
) {
	let galleryPage = 1;
	let galleryTotalPages = 1;

	const galleryModal = createModal("lg");
	galleryModal.addEventListener("close", () => galleryModal.remove());

	function renderGalleryShell() {
		galleryModal.innerHTML = `
			<div class="d-flex justify-content-between align-items-center mb-3">
				<h5 class="mb-0 fw-bold">Theme Gallery</h5>
				<button class="btn-close" id="kiln-gallery-close" aria-label="Close"></button>
			</div>
			<div id="kiln-gallery-body"></div>
			<div class="d-flex justify-content-between align-items-center mt-3">
				<button class="btn btn-sm btn-outline-secondary" id="kiln-gallery-prev" disabled>‹ Prev</button>
				<span id="kiln-gallery-page" class="small text-muted"></span>
				<button class="btn btn-sm btn-outline-secondary" id="kiln-gallery-next" disabled>Next ›</button>
			</div>
		`;
		galleryModal
			.querySelector("#kiln-gallery-close")!
			.addEventListener("click", () => galleryModal.close());
		galleryModal
			.querySelector("#kiln-gallery-prev")!
			.addEventListener("click", () => {
				if (galleryPage > 1) loadGalleryPage(galleryPage - 1);
			});
		galleryModal
			.querySelector("#kiln-gallery-next")!
			.addEventListener("click", () => {
				if (galleryPage < galleryTotalPages) loadGalleryPage(galleryPage + 1);
			});
	}

	async function loadGalleryPage(page: number) {
		const body = galleryModal.querySelector<HTMLElement>("#kiln-gallery-body")!;
		const prevBtn =
			galleryModal.querySelector<HTMLButtonElement>("#kiln-gallery-prev")!;
		const nextBtn =
			galleryModal.querySelector<HTMLButtonElement>("#kiln-gallery-next")!;
		const pageLabel =
			galleryModal.querySelector<HTMLElement>("#kiln-gallery-page")!;

		body.innerHTML = `<p class="text-muted small text-center py-4">Loading…</p>`;
		prevBtn.disabled = true;
		nextBtn.disabled = true;

		const result = await sendMessage("getThemeGallery", page);
		if (!result.ok) {
			body.innerHTML = `<p class="text-danger small text-center py-4">Failed to load gallery.</p>`;
			return;
		}

		galleryPage = result.data.meta.currentPage;
		galleryTotalPages = result.data.meta.totalPages;
		pageLabel.textContent = `Page ${galleryPage} of ${galleryTotalPages}`;
		prevBtn.disabled = galleryPage <= 1;
		nextBtn.disabled = galleryPage >= galleryTotalPages;

		const themes = result.data.data;
		if (themes.length === 0) {
			body.innerHTML = `<p class="text-muted small text-center py-4">No themes yet.</p>`;
			return;
		}

		const uniqueUserIds = [...new Set(themes.map((t) => t.userId))];
		const userResults = await Promise.all(
			uniqueUserIds.map((id) => sendMessage("getUser", id)),
		);
		const usernameMap: Record<number, string> = {};
		for (let i = 0; i < uniqueUserIds.length; i++) {
			const r = userResults[i];
			usernameMap[uniqueUserIds[i]] = r.ok
				? r.data.username
				: `User #${uniqueUserIds[i]}`;
		}

		body.innerHTML = `<div class="row g-2" id="kiln-gallery-grid"></div>`;
		const grid = body.querySelector("#kiln-gallery-grid")!;
		for (const theme of themes) {
			const creatorName = usernameMap[theme.userId];
			const safeThumbnail = safeHttpUrl(theme.thumbnailUrl);
			const safeNavbarColor = isValidHex(theme.navbarColor)
				? theme.navbarColor
				: "#1a1a1a";
			const safeAccentColor = isValidHex(theme.accentColor)
				? theme.accentColor
				: "#3bafff";
			const col = document.createElement("div");
			col.className = "col-6 col-md-4 col-lg-3";
			col.innerHTML = `
				<div class="card h-100" style="cursor:pointer;" data-theme-id="${escapeHtml(theme.id)}">
					${
						safeThumbnail
							? `<img src="${escapeHtml(safeThumbnail)}" loading="lazy" style="height:96px;width:100%;object-fit:cover;border-radius:var(--bs-card-border-radius) var(--bs-card-border-radius) 0 0;" />`
							: `<div style="height:48px;display:flex;border-radius:var(--bs-card-border-radius) var(--bs-card-border-radius) 0 0;overflow:hidden;">
						<div style="flex:1;background:${safeNavbarColor};"></div>
						<div style="flex:1;background:${safeAccentColor};"></div>
					</div>`
					}
					<div class="card-body py-2 px-2">
						<div class="fw-semibold small text-truncate">${escapeHtml(theme.name)}</div>
						<div class="d-flex align-items-center justify-content-between mt-1">
							<div class="text-muted text-truncate" style="font-size:0.75em;">by ${escapeHtml(creatorName)}</div>
							<button class="kiln-gallery-report btn btn-link p-0 text-muted" title="Report theme" style="font-size:0.7em;flex-shrink:0;line-height:1;">
								<i class="fas fa-flag"></i>
							</button>
						</div>
					</div>
				</div>
			`;
			col.querySelector(".card")!.addEventListener("click", async (e) => {
				if ((e.target as HTMLElement).closest(".kiln-gallery-report")) return;
				const fetchResult = await sendMessage("getPublishedTheme", theme.id);
				if (!fetchResult.ok) return;
				const fetched = fetchResult.data.data;
				galleryModal.close();
				await showConfirmImport(
					fetched,
					creatorName,
					theme.thumbnailUrl,
					() => galleryModal.showModal(),
					onImported,
				);
			});
			col
				.querySelector(".kiln-gallery-report")!
				.addEventListener("click", (e) => {
					e.stopPropagation();
					const reportModal = createModal();
					reportModal.addEventListener("close", () => reportModal.remove());
					reportModal.innerHTML = `
					<div class="d-flex justify-content-between align-items-center mb-3">
						<h5 class="mb-0 fw-bold">Report Theme</h5>
						<button class="btn-close" id="kiln-report-close" aria-label="Close"></button>
					</div>
					<p class="small text-muted mb-2">Describe the issue with <strong>${escapeHtml(theme.name)}</strong>:</p>
					<textarea id="kiln-report-reason" class="form-control form-control-sm mb-3" rows="3" maxlength="500" placeholder="e.g. hides page content, inappropriate imagery…"></textarea>
					<div id="kiln-report-status" class="small text-danger mb-2" style="min-height:1em;"></div>
					<div class="d-flex gap-2 justify-content-end">
						<button class="btn btn-sm btn-secondary" id="kiln-report-cancel">Cancel</button>
						<button class="btn btn-sm btn-danger" id="kiln-report-submit">
							<i class="fas fa-flag me-1"></i>Report
						</button>
					</div>
				`;
					reportModal
						.querySelector("#kiln-report-close")!
						.addEventListener("click", () => reportModal.close());
					reportModal
						.querySelector("#kiln-report-cancel")!
						.addEventListener("click", () => reportModal.close());
					reportModal
						.querySelector("#kiln-report-submit")!
						.addEventListener("click", async () => {
							const reason = reportModal
								.querySelector<HTMLTextAreaElement>("#kiln-report-reason")!
								.value.trim();
							const status = reportModal.querySelector<HTMLElement>(
								"#kiln-report-status",
							)!;
							const submitBtn = reportModal.querySelector<HTMLButtonElement>(
								"#kiln-report-submit",
							)!;
							if (!reason) {
								status.textContent =
									"Please describe the issue before submitting.";
								return;
							}
							submitBtn.disabled = true;
							const result = await sendMessage("reportTheme", {
								id: theme.id,
								reason,
							});
							if (result.ok) {
								reportModal.innerHTML = `
							<p class="fw-bold mb-1">Report submitted</p>
							<p class="text-muted small mb-3">Thank you for your report. This theme will be reviewed shortly.</p>
							<div class="d-flex justify-content-end">
								<button class="btn btn-sm btn-secondary" id="kiln-report-done">Close</button>
							</div>
						`;
								reportModal
									.querySelector("#kiln-report-done")!
									.addEventListener("click", () => reportModal.close());
							} else {
								status.textContent =
									"Failed to submit report. Please try again.";
								submitBtn.disabled = false;
							}
						});
					reportModal.showModal();
				});
			grid.appendChild(col);
		}
	}

	renderGalleryShell();
	galleryModal.showModal();
	loadGalleryPage(1);
}

const GENERIC_API_ERROR = /^\[Kiln\] API Error: (\d{3})\b/;
const NO_SESSION_MESSAGE = "[Kiln] No verified session found for user";

export function friendlyApiError(
	message: string,
	fallback = "Something went wrong. Please try again.",
): string {
	const trimmed = message.trim();
	if (trimmed === NO_SESSION_MESSAGE)
		return "Your session has expired. Reconnect your account and try again.";
	const genericMatch = trimmed.match(GENERIC_API_ERROR);
	if (!genericMatch) return trimmed || fallback;
	switch (genericMatch[1]) {
		case "401":
			return "Your session has expired. Reconnect your account and try again.";
		case "403":
			return "You don't have permission to do this.";
		case "404":
			return "The requested resource was not found.";
		case "409":
			return "A conflict occurred. This name may already be taken.";
		case "422":
			return "The theme data is invalid. Check your colors and settings.";
		case "429":
			return "Too many requests. Please wait a moment and try again.";
		case "500":
		case "503":
			return "Server error. Please try again later.";
		default:
			return fallback;
	}
}

export function parseColorAlpha(value: string | number): [string, number] {
	const s = String(value);
	const m = s.match(
		/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/,
	);
	if (m) {
		const hex = rgbToHex(
			parseInt(m[1], 10),
			parseInt(m[2], 10),
			parseInt(m[3], 10),
		);
		const alpha = Math.round(parseFloat(m[4]) * 100);
		return [hex, alpha];
	}
	if (isValidHex(s)) return [s, 100];
	return ["#1a1a1a", 100];
}

export function formatEffectValue(effect: ThemeEffect): string {
	const cfg = EFFECT_TYPE_CONFIGS[effect.type];
	if (cfg.input.kind === "slider") return `${effect.value}${cfg.input.unit}`;
	if (cfg.input.kind === "select") {
		return (
			cfg.input.options.find((o) => o.value === effect.value)?.label ??
			String(effect.value)
		);
	}
	if (cfg.input.kind === "url") return effect.value ? "Custom frame" : "(none)";
	if (cfg.input.kind === "number")
		return effect.value ? `Asset ${effect.value}` : "(none)";
	if (cfg.input.kind === "audio-volume") {
		const parsed = parseAssetVolume(effect.value);
		return parsed ? `Asset ${parsed.assetId} @ ${parsed.volume}%` : "(none)";
	}
	if (cfg.input.kind === "color-alpha") {
		const [hex, alpha] = parseColorAlpha(effect.value);
		return alpha < 100 ? `${hex} (${alpha}%)` : hex;
	}
	return String(effect.value);
}

export function renderEffectValueInput(
	row: HTMLElement,
	type: EffectType,
	prefix: string,
): void {
	const cfg = EFFECT_TYPE_CONFIGS[type]?.input;
	if (!cfg) {
		row.innerHTML = "";
		return;
	}
	if (cfg.kind === "slider") {
		row.innerHTML = `
			<label class="form-label small text-muted mb-1">Value</label>
			<div class="d-flex align-items-center gap-2">
				<input type="range" id="${prefix}-efv-slider" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${cfg.default}" class="flex-fill" style="min-width:0;" />
				<span id="${prefix}-efv-label" class="small text-muted" style="min-width:3em;text-align:right;">${cfg.default}${cfg.unit}</span>
			</div>`;
		const slider = row.querySelector<HTMLInputElement>(
			`#${prefix}-efv-slider`,
		)!;
		const label = row.querySelector<HTMLElement>(`#${prefix}-efv-label`)!;
		slider.addEventListener("input", () => {
			label.textContent = `${slider.value}${cfg.unit}`;
		});
	} else if (cfg.kind === "select") {
		row.innerHTML = `
			<label class="form-label small text-muted mb-1">Value</label>
			<select id="${prefix}-efv-select" class="form-select form-select-sm">
				${cfg.options.map((o) => `<option value="${o.value}"${o.value === cfg.default ? " selected" : ""}>${o.label}</option>`).join("")}
			</select>`;
	} else if (cfg.kind === "url") {
		row.innerHTML = `
			<label class="form-label small text-muted mb-1">Polytoria Decal</label>
			<input type="text" id="${prefix}-efv-url" class="form-control form-control-sm"
			       placeholder="Decal ID or store link…" />
			<div id="${prefix}-efv-url-status" class="small text-muted mt-1" style="min-height:1.1em;"></div>
			<div class="small text-muted mt-1">Use a PNG with a transparent center. The image will be overlaid on top of the avatar.</div>`;
	} else if (cfg.kind === "number") {
		row.innerHTML = `
			<label class="form-label small text-muted mb-1">Polytoria Audio Asset ID</label>
			<input type="number" id="${prefix}-efv-number" class="form-control form-control-sm"
			       min="${cfg.min}" max="${cfg.max}" step="1" placeholder="e.g. 43589" value="${cfg.default || ""}" />
			<div class="small text-muted mt-1">The numeric ID from the audio's Polytoria store page (polytoria.com/store/<b>&lt;id&gt;</b>). Plays whenever you click anywhere on the page.</div>`;
	} else if (cfg.kind === "audio-volume") {
		const [defId, defVolume] = cfg.default.split(":");
		row.innerHTML = `
			<label class="form-label small text-muted mb-1">Polytoria Audio Asset ID</label>
			<input type="number" id="${prefix}-efv-audio-id" class="form-control form-control-sm mb-2"
			       min="${cfg.min}" max="${cfg.max}" step="1" placeholder="e.g. 43589" value="${defId === "0" ? "" : defId}" />
			<div class="d-flex align-items-center gap-2">
				<span class="small text-muted" style="white-space:nowrap;min-width:4.5em;">Volume</span>
				<input type="range" id="${prefix}-efv-audio-volume" min="0" max="100" step="1" value="${defVolume}" class="flex-fill" style="min-width:0;" />
				<span id="${prefix}-efv-audio-volume-label" class="small text-muted" style="min-width:2.5em;text-align:right;">${defVolume}%</span>
			</div>
			<div class="small text-muted mt-1">Loops in the background. Autoplay may not start until the visitor's first click.</div>`;
		const volumeSlider = row.querySelector<HTMLInputElement>(
			`#${prefix}-efv-audio-volume`,
		)!;
		const volumeLabel = row.querySelector<HTMLElement>(
			`#${prefix}-efv-audio-volume-label`,
		)!;
		volumeSlider.addEventListener("input", () => {
			volumeLabel.textContent = `${volumeSlider.value}%`;
		});
	} else if (cfg.kind === "color-alpha") {
		const [initHex, initAlpha] = parseColorAlpha(cfg.default);
		row.innerHTML = `
			<label class="form-label small text-muted mb-1">Color</label>
			<div class="d-flex align-items-center gap-2 mb-2">
				<input type="color" id="${prefix}-efv-color" class="kiln-te-color-picker" value="${initHex}" />
				<input type="text" id="${prefix}-efv-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" value="${initHex}" />
			</div>
			<div class="d-flex align-items-center gap-2">
				<span class="small text-muted" style="white-space:nowrap;min-width:4.5em;">Opacity</span>
				<input type="range" id="${prefix}-efv-alpha" min="0" max="100" step="1" value="${initAlpha}" class="flex-fill" style="min-width:0;" />
				<span id="${prefix}-efv-alpha-label" class="small text-muted" style="min-width:2.5em;text-align:right;">${initAlpha}%</span>
			</div>`;
		const colorPicker = row.querySelector<HTMLInputElement>(
			`#${prefix}-efv-color`,
		)!;
		const hexInput = row.querySelector<HTMLInputElement>(`#${prefix}-efv-hex`)!;
		const alphaSlider = row.querySelector<HTMLInputElement>(
			`#${prefix}-efv-alpha`,
		)!;
		const alphaLabel = row.querySelector<HTMLElement>(
			`#${prefix}-efv-alpha-label`,
		)!;
		colorPicker.addEventListener("input", () => {
			hexInput.value = colorPicker.value;
		});
		hexInput.addEventListener("change", () => {
			const v = hexInput.value.startsWith("#")
				? hexInput.value
				: `#${hexInput.value}`;
			if (isValidHex(v)) {
				colorPicker.value = v;
				hexInput.value = v;
			} else hexInput.value = colorPicker.value;
		});
		alphaSlider.addEventListener("input", () => {
			alphaLabel.textContent = `${alphaSlider.value}%`;
		});
	} else {
		row.innerHTML = `
			<label class="form-label small text-muted mb-1">Value</label>
			<div class="d-flex align-items-center gap-2">
				<input type="color" id="${prefix}-efv-color" class="kiln-te-color-picker" value="${cfg.default}" />
				<input type="text" id="${prefix}-efv-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" value="${cfg.default}" />
			</div>`;
		const colorPicker = row.querySelector<HTMLInputElement>(
			`#${prefix}-efv-color`,
		)!;
		const hexInput = row.querySelector<HTMLInputElement>(`#${prefix}-efv-hex`)!;
		colorPicker.addEventListener("input", () => {
			hexInput.value = colorPicker.value;
		});
		hexInput.addEventListener("change", () => {
			const v = hexInput.value.startsWith("#")
				? hexInput.value
				: `#${hexInput.value}`;
			if (isValidHex(v)) {
				colorPicker.value = v;
				hexInput.value = v;
			} else hexInput.value = colorPicker.value;
		});
	}
}

export async function readEffectValue(
	row: HTMLElement,
	type: EffectType,
	prefix: string,
): Promise<string | number | null> {
	const cfg = EFFECT_TYPE_CONFIGS[type]?.input;
	if (!cfg) return "";
	if (cfg.kind === "slider") {
		return Number(
			row.querySelector<HTMLInputElement>(`#${prefix}-efv-slider`)!.value,
		);
	} else if (cfg.kind === "select") {
		return row.querySelector<HTMLSelectElement>(`#${prefix}-efv-select`)!.value;
	} else if (cfg.kind === "url") {
		const status = row.querySelector(`#${prefix}-efv-url-status`);
		if (status) status.textContent = "Looking up decal…";
		const url = await resolveDecalUrl(
			row.querySelector<HTMLInputElement>(`#${prefix}-efv-url`)!.value,
		);
		if (!url) {
			if (status)
				status.textContent =
					"Couldn't find that decal. Check the ID and try again.";
			return null;
		}
		return url;
	} else if (cfg.kind === "number") {
		return Number(
			row.querySelector<HTMLInputElement>(`#${prefix}-efv-number`)!.value,
		);
	} else if (cfg.kind === "audio-volume") {
		const id = row.querySelector<HTMLInputElement>(
			`#${prefix}-efv-audio-id`,
		)!.value;
		const volume = row.querySelector<HTMLInputElement>(
			`#${prefix}-efv-audio-volume`,
		)!.value;
		return `${id}:${volume}`;
	} else if (cfg.kind === "color-alpha") {
		const color = row.querySelector<HTMLInputElement>(
			`#${prefix}-efv-color`,
		)!.value;
		const alpha = Number(
			row.querySelector<HTMLInputElement>(`#${prefix}-efv-alpha`)!.value,
		);
		const [r, g, b] = hexToRgb(color);
		return `rgba(${r},${g},${b},${(alpha / 100).toFixed(2)})`;
	} else {
		return row.querySelector<HTMLInputElement>(`#${prefix}-efv-color`)!.value;
	}
}

export function renderSelectorReference(
	body: HTMLElement,
	filter: string,
): void {
	const needle = filter.trim().toLowerCase();
	const groups = SELECTOR_REFERENCE.map((group) => ({
		category: group.category,
		items: group.items.filter(
			(item) =>
				!needle ||
				item.label.toLowerCase().includes(needle) ||
				item.selector.toLowerCase().includes(needle),
		),
	})).filter((group) => group.items.length > 0);

	if (groups.length === 0) {
		body.innerHTML = `<p class="text-muted small text-center py-4">No selectors match your search.</p>`;
		return;
	}

	const expandAll = needle.length > 0;
	body.innerHTML = groups
		.map(
			(group, i) => `
		<div class="card mb-2">
			<div class="card-header small fw-semibold d-flex justify-content-between align-items-center kiln-selref-cat-hdr" style="cursor:pointer;${expandAll ? "" : "border-radius:inherit;border:none;"}" data-cat="${i}">
				<span>${group.category} <span class="text-muted fw-normal">(${group.items.length})</span></span>
				<i class="fas fa-chevron-down" style="font-size:0.75rem;transition:transform 200ms;${expandAll ? "transform:rotate(180deg);" : ""}"></i>
			</div>
			<div class="card-body py-2 kiln-selref-cat" data-cat="${i}" style="display:${expandAll ? "" : "none"};">
				${group.items
					.map(
						(item) => `
				<div class="d-flex align-items-center gap-2 mb-1 kiln-selref-row" data-selector="${item.selector.replace(/"/g, "&quot;")}" title="${item.selector.replace(/"/g, "&quot;")}" style="cursor:pointer;padding:4px 6px;border-radius:4px;">
					<div class="flex-fill" style="min-width:0;">
						<div class="small">${item.label}</div>
						${item.note ? `<div class="small text-muted">${item.note}</div>` : ""}
					</div>
					<i class="fas fa-copy small text-muted flex-shrink-0"></i>
				</div>`,
					)
					.join("")}
			</div>
		</div>`,
		)
		.join("");

	for (const hdr of body.querySelectorAll<HTMLElement>(
		".kiln-selref-cat-hdr",
	)) {
		hdr.addEventListener("click", () => {
			const catBody = body.querySelector<HTMLElement>(
				`.kiln-selref-cat[data-cat="${hdr.dataset.cat}"]`,
			)!;
			const opening = catBody.style.display === "none";
			catBody.style.display = opening ? "" : "none";
			hdr.querySelector<HTMLElement>("i")!.style.transform = opening
				? "rotate(180deg)"
				: "";
			if (opening) {
				hdr.style.borderRadius = "";
				hdr.style.border = "";
			} else {
				hdr.style.borderRadius = "inherit";
				hdr.style.border = "none";
			}
		});
	}

	for (const row of body.querySelectorAll<HTMLElement>(".kiln-selref-row")) {
		row.addEventListener("mouseenter", () => {
			row.style.background = "rgba(128,128,128,0.12)";
		});
		row.addEventListener("mouseleave", () => {
			row.style.background = "";
		});
		row.addEventListener("click", (e) => {
			e.stopPropagation();
			navigator.clipboard.writeText(row.dataset.selector!);
			const icon = row.querySelector("i")!;
			icon.className = "fas fa-check small text-success flex-shrink-0";
			setTimeout(() => {
				icon.className = "fas fa-copy small text-muted flex-shrink-0";
			}, 1200);
		});
	}
}
