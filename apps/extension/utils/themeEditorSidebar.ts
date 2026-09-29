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
import { POLYTORIA_CDN_URL, resolveDecalUrl } from "@/utils/decal";
import { escapeHtml } from "@/utils/escapeHtml";
import { sendMessage } from "@/utils/messaging";
import { publishedThemeFields } from "@/utils/publishedTheme";
import { _savedThemes, apiSessions, preferences } from "@/utils/storage";
import {
	applyKilnTheme,
	COLOR_TOKENS,
	EFFECT_SLOTS,
	EFFECT_TYPE_CONFIGS,
	extractDominantColor,
	FONTS,
	isValidHex,
	lightenHex,
	parseAssetVolume,
	THEME_PRESETS,
} from "@/utils/theme";
import {
	confirmPublishRulesSeen,
	deleteSavedTheme,
	formatEffectValue,
	friendlyApiError,
	generateRandomThemeName,
	openNewThemeModal,
	openThemeGallery,
	parseColorAlpha as parseColorAlphaShared,
	publishRulesModalBody,
	readEffectValue,
	renderEffectValueInput as renderEffectValueInputShared,
	renderSelectorReference,
	showConfirmImport,
} from "@/utils/themeEditorShared";
import type { EffectType, ThemeEffect } from "@/utils/types";
import { getConfig, getUserDetails } from "@/utils/utilities";
import { createVisualCssEditor } from "@/utils/visualCssEditor";
import {
	AMBIENT_TYPES,
	type Ambient,
	type AmbientType,
	CARD_PRESET_OPACITY,
	type CardStyle,
	NO_POINTER_EFFECTS_ATTR,
	type PointerEffects,
} from "@/utils/visualEffects";

interface TeWindowState {
	isOpen?: boolean;
	isFloating?: boolean;
	floatLeft?: number;
	floatTop?: number;
	width?: number;
	height?: number;
}

const TE_STATE_KEY = "kiln-te-window-state";

function loadTeState(): TeWindowState {
	try {
		return JSON.parse(sessionStorage.getItem(TE_STATE_KEY) ?? "{}");
	} catch {
		return {};
	}
}

function saveTeState(state: TeWindowState) {
	try {
		sessionStorage.setItem(TE_STATE_KEY, JSON.stringify(state));
	} catch {}
}

export function restoreThemeEditorIfNeeded(): void {
	if (loadTeState().isOpen && !document.getElementById("kiln-te-sidebar")) {
		openThemeEditorSidebar();
	}
}

let sidebarOpenPromise: Promise<void> | null = null;

export function openThemeEditorSidebar(): Promise<void> {
	if (document.getElementById("kiln-te-sidebar")) return Promise.resolve();
	if (sidebarOpenPromise) return sidebarOpenPromise;
	sidebarOpenPromise = doOpenThemeEditorSidebar().finally(() => {
		sidebarOpenPromise = null;
	});
	return sidebarOpenPromise;
}

async function doOpenThemeEditorSidebar(): Promise<void> {
	saveTeState({ ...loadTeState(), isOpen: true });

	const values = await preferences.getPreferences();
	let savedThemes = await _savedThemes.getValue();

	const activeIdRaw =
		(values.config.themeCreator as any).activeThemeId ?? "default";
	const normalizeId = (id: string) => {
		if (id === "default") return "__default__";
		if (id in THEME_PRESETS) return `__preset__:${id}`;
		return id;
	};

	let currentId = normalizeId(activeIdRaw);
	let workingName = "";
	let workingAccent = "#3bafff";
	let workingNavbar = "#1a1a1a";
	let workingFont = "default";
	let workingCss = "";
	let workingBg = "";
	let workingOverlayColor = "#000000";
	let workingOverlayOpacity = 0;
	let workingEffects: ThemeEffect[] = [];
	let workingIconColor = "";
	let workingCursorSrc = "";
	let workingCursorScale = 32;
	let workingCursor = "";
	let workingColorTokens: Record<string, string> = {};
	let workingAmbient: Ambient | undefined;
	let workingCardStyle: CardStyle | undefined;
	let workingPointerEffects: PointerEffects | undefined;
	let clonePresetPromise: Promise<void> | null = null;

	function getCurrentSavedTheme() {
		if (currentId.startsWith("__")) return null;
		return savedThemes.find((t) => t.id === currentId) ?? null;
	}

	function isCustomTheme() {
		return !currentId.startsWith("__");
	}

	function isNew() {
		return currentId === "__new__";
	}

	function applyIdToState(id: string) {
		currentId = id;
		clonePresetPromise = null;
		if (id === "__default__") {
			workingName = "Default (Polytoria)";
			workingAccent = "#3bafff";
			workingNavbar = "#1a1a1a";
			workingFont = "default";
			workingCss = "";
			workingBg = "";
			workingOverlayColor = "#000000";
			workingOverlayOpacity = 0;
			workingEffects = [];
			workingIconColor = "";
			workingCursorSrc = "";
			workingCursorScale = 32;
			workingCursor = "";
			workingColorTokens = {};
			workingAmbient = undefined;
			workingCardStyle = undefined;
			workingPointerEffects = undefined;
		} else if (id.startsWith("__preset__:")) {
			const key = id.slice(11);
			const p = THEME_PRESETS[key];
			workingName = p?.name ?? key;
			workingAccent = p?.accentColor ?? "#3bafff";
			workingNavbar = p?.navbarColor ?? "#1a1a1a";
			workingFont = "default";
			workingCss = "";
			workingBg = "";
			workingOverlayColor = "#000000";
			workingOverlayOpacity = 0;
			workingEffects = [];
			workingIconColor = "";
			workingCursorSrc = "";
			workingCursorScale = 32;
			workingCursor = "";
			workingColorTokens = {};
			workingAmbient = undefined;
			workingCardStyle = undefined;
			workingPointerEffects = undefined;
		} else if (id === "__new__") {
			workingName = generateRandomThemeName();
			workingAccent = "#3bafff";
			workingNavbar = "#1a1a1a";
			workingFont = "default";
			workingCss = "";
			workingBg = "";
			workingOverlayColor = "#000000";
			workingOverlayOpacity = 0;
			workingEffects = [];
			workingIconColor = "";
			workingCursorSrc = "";
			workingCursorScale = 32;
			workingCursor = "";
			workingColorTokens = {};
			workingAmbient = undefined;
			workingCardStyle = undefined;
			workingPointerEffects = undefined;
		} else {
			const t = savedThemes.find((t) => t.id === id);
			workingName = t?.name ?? "";
			workingAccent = t?.accentColor ?? "#3bafff";
			workingNavbar = t?.navbarColor ?? "#1a1a1a";
			workingFont = t?.fontFamily ?? "default";
			workingCss = t?.customCss ?? "";
			workingBg = t?.backgroundImage ?? "";
			workingOverlayColor = t?.backgroundOverlayColor ?? "#000000";
			workingOverlayOpacity = t?.backgroundOverlayOpacity ?? 0;
			workingEffects = t?.effects ? [...t.effects] : [];
			workingIconColor = t?.navbarIconColor ?? "";
			workingCursorSrc = t?.cursorUrl ?? "";
			workingCursorScale = t?.cursorScale ?? 32;
			workingCursor = "";
			workingColorTokens = t?.colorTokens ? { ...t.colorTokens } : {};
			workingAmbient = t?.ambient;
			workingCardStyle = t?.cardStyle;
			workingPointerEffects = t?.pointerEffects;
		}
	}

	async function setActiveThemeId(id: string) {
		const raw = await preferences.getValue();
		raw.config = {
			...raw.config,
			themeCreator: { activeThemeId: id },
		} as any;
		await preferences.setValue(raw);
		(values.config as any).themeCreator = { activeThemeId: id };
	}

	applyIdToState(currentId);

	function getTokenDerivedValue(key: string): any {
		switch (key) {
			case "bodyBg":
				return workingNavbar;
			case "bodyText":
				return "#f6f6f6";
			case "cardBg":
				return lightenHex(workingNavbar, 7);
			case "linkColor":
				return workingAccent;
			case "mutedText":
				return "#888888";
			case "studsColor":
				return "#da8b51";
			case "bricksColor":
				return "#28a745";
		}
	}

	const styleEl = document.createElement("style");
	styleEl.textContent = `
		#kiln-te-sidebar {
			position: fixed;
			right: 0;
			top: 0;
			bottom: 0;
			width: 380px;
			background: var(--bs-body-bg, #212529);
			color: var(--bs-body-color, #fff);
			border-left: 1px solid rgba(128,128,128,0.2);
			box-shadow: -4px 0 32px rgba(0,0,0,0.55);
			z-index: 99999;
			font-size: 0.88rem;
			display: flex;
			flex-direction: column;
		}
		#kiln-te-sidebar-content {
			flex: 1;
			overflow-y: auto;
			padding: 14px 14px 8px;
		}
		#kiln-te-sidebar-footer {
			flex-shrink: 0;
			padding: 12px 14px;
			border-top: 1px solid rgba(128,128,128,0.15);
		}
		body.kiln-te-sidebar-open {
			margin-right: var(--kiln-te-width, 380px) !important;
		}
		#kiln-te-sidebar .kiln-te-color-picker {
			width: 34px;
			height: 28px;
			padding: 0;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			background: none;
			flex-shrink: 0;
		}
		#kiln-te-sidebar .kiln-te-hex-input {
			flex: 1;
			min-width: 0;
		}
		#kiln-te-publish-status:empty {
			display: none;
		}
		.kiln-te-fields-disabled {
			opacity: 0.5;
		}
		#kiln-te-resize-handle {
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			width: 6px;
			cursor: ew-resize;
			z-index: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background 0.15s;
		}
		#kiln-te-resize-handle:hover {
			background: rgba(128,128,128,0.15);
		}
		#kiln-te-resize-handle.kiln-te-dragging {
			background: rgba(128,128,128,0.25);
		}
		#kiln-te-resize-handle::after {
			content: '';
			width: 2px;
			height: 40px;
			background: rgba(128,128,128,0.35);
			border-radius: 1px;
			pointer-events: none;
		}
		#kiln-te-sidebar.kiln-te-floating {
			right: auto;
			bottom: auto;
			border-radius: 10px;
			box-shadow: 0 12px 48px rgba(0,0,0,0.8);
		}
		#kiln-te-sidebar.kiln-te-floating #kiln-te-sidebar-header {
			cursor: move;
		}
	`;
	document.head.appendChild(styleEl);

	const sidebar = document.createElement("div");
	sidebar.id = "kiln-te-sidebar";
	sidebar.setAttribute(NO_POINTER_EFFECTS_ATTR, "");
	sidebar.innerHTML = `
		<div id="kiln-te-resize-handle"></div>
		<div id="kiln-te-sidebar-content">
		<div id="kiln-te-sidebar-header" class="d-flex justify-content-between align-items-center mb-2">
			<div class="d-flex align-items-center gap-2">
				<span class="fw-bold" style="font-size:1rem;">Theme Editor</span>
			</div>
			<div class="d-flex align-items-center gap-1">
				<button id="kiln-te-float-btn" title="Float as window"
				        style="background:rgba(128,128,128,0.15);border:1px solid rgba(128,128,128,0.3);border-radius:6px;padding:2px 8px;cursor:pointer;font-size:0.75rem;line-height:1.4;color:inherit;">
					<i class="fas fa-expand"></i>
				</button>
				<button id="kiln-te-close" aria-label="Close"
				        style="background:rgba(128,128,128,0.15);border:1px solid rgba(128,128,128,0.3);border-radius:6px;padding:2px 8px;cursor:pointer;font-size:1rem;line-height:1.4;color:inherit;">✕</button>
			</div>
		</div>

		<div class="d-flex align-items-center gap-2 mb-2">
			<select id="kiln-te-theme-select" class="form-select form-select-sm flex-fill"></select>
			<button id="kiln-te-name-pencil" title="Rename theme"
			        style="display:none;background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.25);border-radius:5px;padding:4px 8px;cursor:pointer;color:inherit;flex-shrink:0;">
				<i class="fas fa-pencil" style="font-size:0.7rem;"></i>
			</button>
			<button id="kiln-te-new-btn" title="New theme"
			        style="background:rgba(128,128,128,0.12);border:1px solid rgba(128,128,128,0.25);border-radius:5px;padding:4px 8px;cursor:pointer;color:inherit;flex-shrink:0;">
				<i class="fas fa-plus" style="font-size:0.7rem;"></i>
			</button>
		</div>

		<span id="kiln-te-published-badge" class="badge mb-2 w-100" style="display:none;"></span>
		<div id="kiln-te-autoupdate-row" class="form-check mb-2" style="display:none;">
			<input type="checkbox" id="kiln-te-autoupdate" class="form-check-input" />
			<label for="kiln-te-autoupdate" class="form-check-label small text-muted">Auto-update from source</label>
		</div>
		<hr class="mt-1 mb-2" style="border-color:rgba(128,128,128,0.18);">

		<div class="card mb-2">
			<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-te-section-hdr" style="cursor:pointer;" data-body="kiln-te-colors-body">
				<span>Colors</span><i class="fas fa-chevron-up"></i>
			</div>
			<div class="card-body" id="kiln-te-colors-body">
				<div class="row g-2 mb-2">
					<div class="col-6">
						<label class="form-label small text-muted mb-1">Accent Color</label>
						<div class="d-flex align-items-center gap-2">
							<input type="color" id="kiln-te-accent-picker" class="kiln-te-color-picker" />
							<input type="text" id="kiln-te-accent-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" />
						</div>
					</div>
					<div class="col-6">
						<label class="form-label small text-muted mb-1">Bg / Navbar</label>
						<div class="d-flex align-items-center gap-2">
							<input type="color" id="kiln-te-navbar-picker" class="kiln-te-color-picker" />
							<input type="text" id="kiln-te-navbar-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" />
						</div>
					</div>
				</div>
				<div class="mb-2">
					<label class="form-label small text-muted mb-1">Extract Accent from Image</label>
					<div class="d-flex gap-1 flex-wrap align-items-center">
						<label class="btn btn-outline-secondary btn-sm mb-0" style="cursor:pointer;">
							<i class="fas fa-image me-1"></i>File
							<input type="file" id="kiln-te-image" accept="image/*" style="display:none;" />
						</label>
						<input type="text" id="kiln-te-image-url" class="form-control form-control-sm flex-fill"
						       placeholder="…or image URL" style="min-width:0;" />
						<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-te-image-url-btn">Extract</button>
					</div>
					<div id="kiln-te-image-status" class="small text-muted mt-1" style="min-height:1.1em;"></div>
				</div>
				<div>
					<label class="form-label small text-muted mb-1">Background Image</label>
					<div class="d-flex gap-1 align-items-center">
						<input type="text" id="kiln-te-bg-id" class="form-control form-control-sm flex-fill"
						       placeholder="Decal ID or store link…" style="min-width:0;" />
						<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-te-bg-set">Set</button>
						<button class="btn btn-outline-danger btn-sm flex-shrink-0" id="kiln-te-bg-clear" style="display:none;">Clear</button>
					</div>
					<div id="kiln-te-bg-status" class="small text-muted mt-1" style="min-height:1.1em;"></div>
					<div id="kiln-te-bg-overlay-row" class="mt-2" style="display:none;">
						<label class="form-label small text-muted mb-1">Overlay</label>
						<div class="d-flex align-items-center gap-2">
							<input type="color" id="kiln-te-bg-overlay-color" class="kiln-te-color-picker" />
							<input type="range" id="kiln-te-bg-overlay-opacity" min="0" max="100" step="1" class="flex-fill" style="min-width:0;" />
							<span id="kiln-te-bg-overlay-label" class="small text-muted" style="min-width:2.5em;text-align:right;">0%</span>
						</div>
					</div>
				</div>
				<div class="mt-2">
					<label class="form-label small text-muted mb-1">Custom Cursor</label>
					<div class="d-flex gap-1 align-items-center">
						<input type="text" id="kiln-te-cursor-id" class="form-control form-control-sm flex-fill"
						       placeholder="Decal ID or store link…" style="min-width:0;" />
						<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-te-cursor-set">Set</button>
						<button class="btn btn-outline-danger btn-sm flex-shrink-0" id="kiln-te-cursor-clear" style="display:none;">Clear</button>
					</div>
					<div id="kiln-te-cursor-name" class="small text-muted mt-1" style="min-height:1.1em;"></div>
					<div id="kiln-te-cursor-scale-row" class="d-flex align-items-center gap-2 mt-1" style="display:none!important;">
						<label class="form-label small text-muted mb-0" style="white-space:nowrap;">Size</label>
						<input type="range" id="kiln-te-cursor-scale" min="16" max="128" step="4" value="32" class="flex-fill" style="min-width:0;" />
						<span id="kiln-te-cursor-scale-label" class="small text-muted" style="min-width:3em;text-align:right;">32px</span>
					</div>
				</div>
				<div class="mt-2">
					<div class="d-flex align-items-center mb-1">
						<label class="form-label small text-muted mb-0 flex-fill">Icon Color</label>
						<div class="form-check mb-0">
							<input type="checkbox" id="kiln-te-icon-auto" class="form-check-input" checked />
							<label for="kiln-te-icon-auto" class="form-check-label small text-muted">Auto</label>
						</div>
					</div>
					<div id="kiln-te-icon-color-row" class="d-flex align-items-center gap-2" style="display:none!important;">
						<input type="color" id="kiln-te-icon-picker" class="kiln-te-color-picker" />
						<input type="text" id="kiln-te-icon-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" />
					</div>
				</div>
			</div>
		</div>

		<div class="card mb-2">
			<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-te-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-te-tokens-body">
				<span>Color Tokens</span><i class="fas fa-chevron-down"></i>
			</div>
			<div class="card-body" id="kiln-te-tokens-body" style="display:none;">
				<p class="small text-muted mb-2">Override specific derived colors. Default values are automatically derived from your accent and navbar values.</p>
				${Object.entries(COLOR_TOKENS)
					.map(
						([key, token]) => `
				<div class="mb-2">
					<label class="form-label small text-muted mb-1">${token.label}</label>
					<div class="d-flex align-items-center gap-2">
						<input type="color" id="kiln-te-token-${key}-picker" class="kiln-te-color-picker" />
						<input type="text" id="kiln-te-token-${key}-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" />
						<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-te-token-${key}-clear" title="Reset to auto" style="display:none;padding:2px 6px;font-size:0.7rem;">Auto</button>
					</div>
				</div>`,
					)
					.join("")}
			</div>
		</div>

		<div class="card mb-2">
			<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-te-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-te-font-body">
				<span>Typography</span><i class="fas fa-chevron-down"></i>
			</div>
			<div class="card-body" id="kiln-te-font-body" style="display:none;">
				<div>
					<label class="form-label small text-muted mb-1">Font</label>
					<select id="kiln-te-font" class="form-select form-select-sm">
						${Object.entries(FONTS)
							.map(([key, f]) => `<option value="${key}">${f.name}</option>`)
							.join("")}
					</select>
				</div>
			</div>
		</div>

		<div class="card mb-2">
			<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-te-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-te-ambient-body">
				<span>Ambient Effects</span><i class="fas fa-chevron-down"></i>
			</div>
			<div class="card-body" id="kiln-te-ambient-body" style="display:none;">
				<div class="row g-2 mb-2">
					<div class="col-6">
						<label class="form-label small text-muted mb-1">Effect</label>
						<select id="kiln-te-ambient-type" class="form-select form-select-sm">
							<option value="">None</option>
							${AMBIENT_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join("")}
						</select>
					</div>
					<div class="col-6">
						<label class="form-label small text-muted mb-1">Density</label>
						<select id="kiln-te-ambient-density" class="form-select form-select-sm">
							<option value="1">Light</option>
							<option value="2">Medium</option>
							<option value="3">Heavy</option>
						</select>
					</div>
				</div>
				<div class="d-flex align-items-center gap-2">
					<input type="color" id="kiln-te-ambient-color" class="kiln-te-color-picker" />
					<div class="form-check mb-0">
						<input type="checkbox" id="kiln-te-ambient-color-auto" class="form-check-input" />
						<label for="kiln-te-ambient-color-auto" class="form-check-label small text-muted">Default color</label>
					</div>
				</div>
				<div class="small text-muted mt-2">Skipped for visitors whose system asks for reduced motion.</div>
			</div>
		</div>

		<div class="card mb-2">
			<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-te-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-te-cards-body">
				<span>Cards</span>
				<div class="d-flex align-items-center gap-2">
					<div class="form-check form-switch mb-0">
						<input type="checkbox" id="kiln-te-cards-enabled" class="form-check-input" aria-label="Restyle cards sitewide" />
					</div>
					<i class="fas fa-chevron-down"></i>
				</div>
			</div>
			<div class="card-body" id="kiln-te-cards-body" style="display:none;">
				<div id="kiln-te-cards-fields">
					<div class="row g-2 mb-2">
						<div class="col-6">
							<label class="form-label small text-muted mb-1">Style</label>
							<select id="kiln-te-cards-preset" class="form-select form-select-sm">
								<option value="solid">Solid</option>
								<option value="glass">Glass</option>
								<option value="outline">Outline</option>
								<option value="gradient">Gradient</option>
							</select>
						</div>
						<div class="col-6">
							<label class="form-label small text-muted mb-1">On Hover</label>
							<select id="kiln-te-cards-hover" class="form-select form-select-sm">
								<option value="none">Nothing</option>
								<option value="lift">Lift</option>
								<option value="glow">Glow</option>
								<option value="tilt">Tilt</option>
							</select>
						</div>
					</div>
					<label class="form-label small text-muted mb-1">Tint</label>
					<div class="d-flex align-items-center gap-2 mb-2">
						<input type="color" id="kiln-te-cards-tint" class="kiln-te-color-picker" />
						<div class="form-check mb-0">
							<input type="checkbox" id="kiln-te-cards-tint-auto" class="form-check-input" />
							<label for="kiln-te-cards-tint-auto" class="form-check-label small text-muted">Use theme colors</label>
						</div>
					</div>
					<label class="form-label small text-muted mb-1">Opacity</label>
					<div class="d-flex align-items-center gap-2 mb-2">
						<input type="range" id="kiln-te-cards-opacity" min="0" max="100" step="1" class="flex-fill" style="min-width:0;" />
						<span id="kiln-te-cards-opacity-label" class="small text-muted" style="min-width:2.5em;text-align:right;"></span>
					</div>
					<label class="form-label small text-muted mb-1">Corner Roundness</label>
					<div class="d-flex align-items-center gap-2">
						<input type="range" id="kiln-te-cards-radius" min="0" max="32" step="1" class="flex-fill" style="min-width:0;" />
						<span id="kiln-te-cards-radius-label" class="small text-muted" style="min-width:2.5em;text-align:right;"></span>
					</div>
				</div>
			</div>
		</div>

		<div class="card mb-2">
			<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-te-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-te-pointer-body">
				<span>Click &amp; Cursor Effects</span><i class="fas fa-chevron-down"></i>
			</div>
			<div class="card-body" id="kiln-te-pointer-body" style="display:none;">
				<div class="row g-2 mb-2">
					<div class="col-6">
						<label class="form-label small text-muted mb-1">On Click</label>
						<select id="kiln-te-pointer-click" class="form-select form-select-sm">
							<option value="">Nothing</option>
							<option value="sparkles">Sparkles</option>
							<option value="hearts">Hearts</option>
							<option value="ripples">Ripples</option>
							<option value="confetti">Confetti</option>
						</select>
					</div>
					<div class="col-6">
						<label class="form-label small text-muted mb-1">Cursor Trail</label>
						<select id="kiln-te-pointer-trail" class="form-select form-select-sm">
							<option value="">None</option>
							<option value="sparkles">Sparkles</option>
							<option value="dots">Dots</option>
							<option value="hearts">Hearts</option>
							<option value="glow">Glow</option>
						</select>
					</div>
				</div>
				<div class="d-flex align-items-center gap-2">
					<input type="color" id="kiln-te-pointer-color" class="kiln-te-color-picker" />
					<div class="form-check mb-0">
						<input type="checkbox" id="kiln-te-pointer-color-auto" class="form-check-input" />
						<label for="kiln-te-pointer-color-auto" class="form-check-label small text-muted">Use accent color</label>
					</div>
				</div>
				<div class="small text-muted mt-2">Skipped for visitors whose system asks for reduced motion.</div>
			</div>
		</div>

		<div class="card mb-2">
			<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-te-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-te-effects-body">
				<span>Effects</span><i class="fas fa-chevron-down"></i>
			</div>
			<div class="card-body" id="kiln-te-effects-body" style="display:none;">
				<div id="kiln-te-effects-list"></div>
				<div id="kiln-te-add-effect-form" style="display:none;">
					<div class="row g-2 mb-2">
						<div class="col-6">
							<label class="form-label small text-muted mb-1">Slot</label>
							<select id="kiln-te-effect-slot" class="form-select form-select-sm"></select>
						</div>
						<div class="col-6">
							<label class="form-label small text-muted mb-1">Property</label>
							<select id="kiln-te-effect-type" class="form-select form-select-sm"></select>
						</div>
					</div>
					<div id="kiln-te-effect-value-row" class="mb-2"></div>
					<div class="d-flex gap-2">
						<button class="btn btn-sm btn-secondary flex-fill" id="kiln-te-effect-cancel">Cancel</button>
						<button class="btn btn-sm btn-primary flex-fill" id="kiln-te-effect-confirm">Add</button>
					</div>
				</div>
				<button class="btn btn-sm btn-outline-secondary w-100" id="kiln-te-effect-new">
					<i class="fas fa-plus me-1"></i>Add Effect
				</button>
			</div>
		</div>

		<div class="card mb-0">
			<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-te-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-te-css-body">
				<span>Custom CSS</span><i class="fas fa-chevron-down"></i>
			</div>
			<div class="card-body" id="kiln-te-css-body" style="display:none;">
				<div id="kiln-te-vce-mount" class="mb-2"></div>
				<textarea id="kiln-te-custom-css" class="form-control form-control-sm mb-2" rows="5"
				          placeholder="/* e.g. .navbar { border-bottom: 2px solid var(--bs-primary); } */"
				          style="font-family:monospace;font-size:0.75rem;resize:vertical;"></textarea>
				<button type="button" class="btn btn-outline-secondary btn-sm w-100" id="kiln-te-selector-ref-btn">
					<i class="fas fa-list me-1"></i>Selector Reference
				</button>
			</div>
		</div>
		</div>

		<div id="kiln-te-sidebar-footer">
			<div id="kiln-te-publish-status" class="small mb-2"></div>
			<div class="d-flex gap-1 mb-1">
				<button class="btn btn-sm btn-outline-secondary flex-fill" id="kiln-te-export-json">
					<i class="fas fa-file-export me-1"></i>Export JSON
				</button>
				<label class="btn btn-sm btn-outline-secondary flex-fill mb-0" style="cursor:pointer;">
					<i class="fas fa-file-import me-1"></i>Import JSON
					<input type="file" id="kiln-te-json-import-input" accept=".json,application/json" style="display:none;" />
				</label>
			</div>
			<div class="d-flex gap-1 mb-1" id="kiln-te-left-actions"></div>
			<div class="d-flex gap-1">
				<button class="btn btn-primary btn-sm flex-fill" id="kiln-te-save">
					<i class="fas fa-check me-1"></i>Save & Apply
				</button>
				<div class="dropup" id="kiln-te-more-wrap" style="display:none;">
					<button type="button" class="btn btn-outline-secondary btn-sm dropdown-toggle" id="kiln-te-more-btn" data-bs-toggle="dropdown" aria-expanded="false">
						...
					</button>
					<ul class="dropdown-menu dropdown-menu-end" id="kiln-te-more-menu"></ul>
				</div>
			</div>
		</div>

		<div id="kiln-te-rename-overlay" style="display:none;position:absolute;inset:0;z-index:10;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:24px;">
			<div style="background:var(--bs-body-bg,#212529);border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px;width:100%;">
				<p class="fw-bold mb-2" style="font-size:0.95rem;">Rename Theme</p>
				<input type="text" id="kiln-te-rename-input" class="form-control form-control-sm mb-3" maxlength="32" placeholder="Theme name…" />
				<div class="d-flex gap-2 justify-content-end">
					<button class="btn btn-sm btn-secondary" id="kiln-te-rename-cancel">Cancel</button>
					<button class="btn btn-sm btn-primary" id="kiln-te-rename-confirm">Rename</button>
				</div>
			</div>
		</div>

		<div id="kiln-te-import-overlay" style="display:none;position:absolute;inset:0;z-index:10;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:24px;">
			<div style="background:var(--bs-body-bg,#212529);border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px;width:100%;">
				<p class="fw-bold mb-1" style="font-size:0.95rem;">Import Theme</p>
				<p class="text-muted small mb-2">Paste a theme ID or URL to import a published theme.</p>
				<input type="text" id="kiln-te-import-input" class="form-control form-control-sm mb-2" placeholder="Theme ID or URL…" />
				<div id="kiln-te-import-status" class="small mb-2" style="min-height:1em;"></div>
				<div class="d-flex gap-2 justify-content-end">
					<button class="btn btn-sm btn-secondary" id="kiln-te-import-cancel">Cancel</button>
					<button class="btn btn-sm btn-primary" id="kiln-te-import-load">Import</button>
				</div>
			</div>
		</div>

		<div id="kiln-te-delete-overlay" style="display:none;position:absolute;inset:0;z-index:10;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:24px;">
			<div style="background:var(--bs-body-bg,#212529);border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px;width:100%;">
				<p class="fw-bold mb-2" style="font-size:0.95rem;">Delete Theme</p>
				<p class="text-muted small mb-3" id="kiln-te-delete-message"></p>
				<div class="d-flex gap-2 justify-content-end">
					<button class="btn btn-sm btn-secondary" id="kiln-te-delete-cancel">Cancel</button>
					<button class="btn btn-sm btn-danger" id="kiln-te-delete-confirm">
						<i class="fas fa-trash me-1"></i>Delete
					</button>
				</div>
			</div>
		</div>

		<div id="kiln-te-selref-overlay" style="display:none;position:absolute;inset:0;z-index:10;background:rgba(0,0,0,0.55);flex-direction:column;padding:16px;">
			<div style="background:var(--bs-body-bg,#212529);border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px;width:100%;height:100%;display:flex;flex-direction:column;min-height:0;">
				<div class="d-flex justify-content-between align-items-center mb-2 flex-shrink-0">
					<p class="fw-bold mb-0" style="font-size:0.95rem;">Selector Reference</p>
					<button class="btn-close" id="kiln-te-selref-close" aria-label="Close"></button>
				</div>
				<p class="text-muted small mb-2 flex-shrink-0">Real Polytoria selectors you can target in Custom CSS. Click a row to copy it.</p>
				<input type="text" id="kiln-te-selref-search" class="form-control form-control-sm mb-2 flex-shrink-0" placeholder="Filter…" />
				<div id="kiln-te-selref-body" style="flex:1;overflow-y:auto;min-height:0;"></div>
			</div>
		</div>

		<div id="kiln-te-publish-rules-overlay" style="display:none;position:absolute;inset:0;z-index:11;background:rgba(0,0,0,0.55);flex-direction:column;padding:16px;overflow-y:auto;">
			<div style="background:var(--bs-body-bg,#212529);border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px;width:100%;margin:auto;">
				${publishRulesModalBody()}
				<div class="d-flex gap-2 justify-content-end mt-3">
					<button class="btn btn-sm btn-secondary" id="kiln-te-publish-rules-cancel">Cancel</button>
					<button class="btn btn-sm btn-primary" id="kiln-te-publish-rules-continue">I Understand, Publish</button>
				</div>
			</div>
		</div>

	`;

	document.body.classList.add("kiln-te-sidebar-open");
	document.body.appendChild(sidebar);

	const resizeHandle = sidebar.querySelector<HTMLElement>(
		"#kiln-te-resize-handle",
	)!;
	let isResizing = false;
	let resizeAnchorRight = 0;

	function setSidebarWidthVar(px: number | null) {
		if (px === null)
			document.documentElement.style.removeProperty("--kiln-te-width");
		else
			document.documentElement.style.setProperty("--kiln-te-width", `${px}px`);
	}

	function onResizeMouseMove(e: MouseEvent) {
		if (!isResizing) return;
		if (isFloating) {
			const newWidth = Math.max(
				300,
				Math.min(window.innerWidth * 0.8, resizeAnchorRight - e.clientX),
			);
			sidebar.style.width = `${newWidth}px`;
			sidebar.style.left = `${resizeAnchorRight - newWidth}px`;
		} else {
			const newWidth = Math.max(
				300,
				Math.min(window.innerWidth * 0.8, window.innerWidth - e.clientX),
			);
			sidebar.style.width = `${newWidth}px`;
			setSidebarWidthVar(newWidth);
		}
	}
	function onResizeMouseUp() {
		if (!isResizing) return;
		isResizing = false;
		resizeHandle.classList.remove("kiln-te-dragging");
		document.body.style.userSelect = "";
		if (isFloating) {
			saveTeState({
				isOpen: true,
				isFloating: true,
				floatLeft: parseInt(sidebar.style.left, 10),
				floatTop: parseInt(sidebar.style.top, 10),
				width: sidebar.offsetWidth,
				height: parseInt(sidebar.style.height, 10),
			});
		} else {
			saveTeState({
				isOpen: true,
				isFloating: false,
				width: sidebar.offsetWidth,
			});
		}
	}

	resizeHandle.addEventListener("mousedown", (e) => {
		isResizing = true;
		resizeHandle.classList.add("kiln-te-dragging");
		document.body.style.userSelect = "none";
		if (isFloating) {
			resizeAnchorRight =
				parseInt(sidebar.style.left, 10) + sidebar.offsetWidth;
		}
		e.preventDefault();
	});
	document.addEventListener("mousemove", onResizeMouseMove);
	document.addEventListener("mouseup", onResizeMouseUp);

	const floatBtn =
		sidebar.querySelector<HTMLButtonElement>("#kiln-te-float-btn")!;
	const sidebarHeader = sidebar.querySelector<HTMLElement>(
		"#kiln-te-sidebar-header",
	)!;
	let isFloating = false;
	let isWindowDragging = false;
	let winDragStartX = 0,
		winDragStartY = 0;
	let winDragStartLeft = 0,
		winDragStartTop = 0;

	function toggleFloat() {
		isFloating = !isFloating;
		if (isFloating) {
			const rect = sidebar.getBoundingClientRect();
			sidebar.classList.add("kiln-te-floating");
			sidebar.style.left = `${rect.left}px`;
			sidebar.style.top = `${rect.top}px`;
			sidebar.style.height = `${Math.min(window.innerHeight * 0.85, 680)}px`;
			document.body.classList.remove("kiln-te-sidebar-open");
			setSidebarWidthVar(null);
			floatBtn.innerHTML = '<i class="fas fa-compress"></i>';
			floatBtn.title = "Dock to side";
			saveTeState({
				isOpen: true,
				isFloating: true,
				floatLeft: parseInt(sidebar.style.left, 10),
				floatTop: parseInt(sidebar.style.top, 10),
				width: sidebar.offsetWidth,
				height: parseInt(sidebar.style.height, 10),
			});
		} else {
			sidebar.classList.remove("kiln-te-floating");
			sidebar.style.left = "";
			sidebar.style.top = "";
			sidebar.style.height = "";
			sidebar.style.width = "";
			setSidebarWidthVar(null);
			document.body.classList.add("kiln-te-sidebar-open");
			floatBtn.innerHTML = '<i class="fas fa-expand"></i>';
			floatBtn.title = "Float as window";
			saveTeState({ isOpen: true, isFloating: false });
		}
	}

	function onWindowDragMove(e: MouseEvent) {
		if (!isWindowDragging) return;
		sidebar.style.left = `${winDragStartLeft + e.clientX - winDragStartX}px`;
		sidebar.style.top = `${winDragStartTop + e.clientY - winDragStartY}px`;
	}
	function onWindowDragUp() {
		if (!isWindowDragging) return;
		isWindowDragging = false;
		document.body.style.userSelect = "";
		saveTeState({
			isOpen: true,
			isFloating: true,
			floatLeft: parseInt(sidebar.style.left, 10),
			floatTop: parseInt(sidebar.style.top, 10),
			width: sidebar.offsetWidth,
			height: parseInt(sidebar.style.height, 10),
		});
	}

	sidebarHeader.addEventListener("mousedown", (e) => {
		if (!isFloating) return;
		if ((e.target as HTMLElement).closest("button")) return;
		isWindowDragging = true;
		winDragStartX = e.clientX;
		winDragStartY = e.clientY;
		winDragStartLeft = parseInt(sidebar.style.left, 10) || 0;
		winDragStartTop = parseInt(sidebar.style.top, 10) || 0;
		document.body.style.userSelect = "none";
		e.preventDefault();
	});
	document.addEventListener("mousemove", onWindowDragMove);
	document.addEventListener("mouseup", onWindowDragUp);
	floatBtn.addEventListener("click", toggleFloat);

	const themeSelect = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-theme-select",
	)!;
	const publishedBadge = sidebar.querySelector<HTMLElement>(
		"#kiln-te-published-badge",
	)!;
	const namePencil = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-name-pencil",
	)!;
	const autoUpdateRow = sidebar.querySelector<HTMLElement>(
		"#kiln-te-autoupdate-row",
	)!;
	const autoUpdateCheck = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-autoupdate",
	)!;
	const accentPicker = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-accent-picker",
	)!;
	const accentHex = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-accent-hex",
	)!;
	const navbarPicker = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-navbar-picker",
	)!;
	const navbarHex = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-navbar-hex",
	)!;
	const fontSelect = sidebar.querySelector<HTMLSelectElement>("#kiln-te-font")!;
	const cssTextarea = sidebar.querySelector<HTMLTextAreaElement>(
		"#kiln-te-custom-css",
	)!;
	const selectorRefBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-selector-ref-btn",
	)!;
	selectorRefBtn.addEventListener("click", () => openSelectorRefOverlay());

	let visualCssPending = "";
	let visualCssFlush: Promise<void> | null = null;
	const visualCss = createVisualCssEditor({
		mount: sidebar.querySelector<HTMLElement>("#kiln-te-vce-mount")!,
		sidebar,
		idPrefix: "te",
		getCss: () => workingCss,
		setCss: (css) => {
			visualCssPending = css;
			visualCssFlush ??= (async () => {
				await clonePresetIfNeeded();
				workingCss = visualCssPending;
				cssTextarea.value = workingCss;
				refreshPreview();
			})().finally(() => {
				visualCssFlush = null;
			});
			return visualCssFlush;
		},
	});
	const imageInput = sidebar.querySelector<HTMLInputElement>("#kiln-te-image")!;
	const imageUrlInput =
		sidebar.querySelector<HTMLInputElement>("#kiln-te-image-url")!;
	const imageUrlBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-image-url-btn",
	)!;
	const imageStatus = sidebar.querySelector<HTMLElement>(
		"#kiln-te-image-status",
	)!;
	const bgIdInput = sidebar.querySelector<HTMLInputElement>("#kiln-te-bg-id")!;
	const bgStatus = sidebar.querySelector<HTMLElement>("#kiln-te-bg-status")!;
	const bgSetBtn = sidebar.querySelector<HTMLButtonElement>("#kiln-te-bg-set")!;
	const bgClearBtn =
		sidebar.querySelector<HTMLButtonElement>("#kiln-te-bg-clear")!;
	const bgOverlayRow = sidebar.querySelector<HTMLElement>(
		"#kiln-te-bg-overlay-row",
	)!;
	const bgOverlayColor = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-bg-overlay-color",
	)!;
	const bgOverlayOpacity = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-bg-overlay-opacity",
	)!;
	const bgOverlayLabel = sidebar.querySelector<HTMLElement>(
		"#kiln-te-bg-overlay-label",
	)!;
	const cursorIdInput =
		sidebar.querySelector<HTMLInputElement>("#kiln-te-cursor-id")!;
	const cursorSetBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-cursor-set",
	)!;
	const cursorNameEl = sidebar.querySelector<HTMLElement>(
		"#kiln-te-cursor-name",
	)!;
	const cursorClearBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-cursor-clear",
	)!;
	const cursorScaleRow = sidebar.querySelector<HTMLElement>(
		"#kiln-te-cursor-scale-row",
	)!;
	const cursorScaleInput = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-cursor-scale",
	)!;
	const cursorScaleLabel = sidebar.querySelector<HTMLElement>(
		"#kiln-te-cursor-scale-label",
	)!;
	const iconAutoCheck =
		sidebar.querySelector<HTMLInputElement>("#kiln-te-icon-auto")!;
	const iconColorRow = sidebar.querySelector<HTMLElement>(
		"#kiln-te-icon-color-row",
	)!;
	const iconPicker = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-icon-picker",
	)!;
	const iconHex = sidebar.querySelector<HTMLInputElement>("#kiln-te-icon-hex")!;
	const ambientType = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-ambient-type",
	)!;
	const ambientDensity = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-ambient-density",
	)!;
	const ambientColor = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-ambient-color",
	)!;
	const ambientColorAuto = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-ambient-color-auto",
	)!;
	const cardsEnabled = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-cards-enabled",
	)!;
	const cardsFields = sidebar.querySelector<HTMLElement>(
		"#kiln-te-cards-fields",
	)!;
	const cardsPreset = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-cards-preset",
	)!;
	const cardsHover = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-cards-hover",
	)!;
	const cardsTint = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-cards-tint",
	)!;
	const cardsTintAuto = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-cards-tint-auto",
	)!;
	const cardsOpacity = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-cards-opacity",
	)!;
	const cardsOpacityLabel = sidebar.querySelector<HTMLElement>(
		"#kiln-te-cards-opacity-label",
	)!;
	const cardsRadius = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-cards-radius",
	)!;
	const cardsRadiusLabel = sidebar.querySelector<HTMLElement>(
		"#kiln-te-cards-radius-label",
	)!;
	const pointerClick = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-pointer-click",
	)!;
	const pointerTrail = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-pointer-trail",
	)!;
	const pointerColor = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-pointer-color",
	)!;
	const pointerColorAuto = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-pointer-color-auto",
	)!;
	const publishStatus = sidebar.querySelector<HTMLElement>(
		"#kiln-te-publish-status",
	)!;
	const leftActions = sidebar.querySelector<HTMLElement>(
		"#kiln-te-left-actions",
	)!;
	const moreWrap = sidebar.querySelector<HTMLElement>("#kiln-te-more-wrap")!;
	const moreMenu = sidebar.querySelector<HTMLElement>("#kiln-te-more-menu")!;
	const saveBtn = sidebar.querySelector<HTMLButtonElement>("#kiln-te-save")!;
	const exportJsonBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-export-json",
	)!;
	const jsonImportInput = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-json-import-input",
	)!;

	function closeSidebar() {
		const activeId =
			(values.config.themeCreator as any).activeThemeId ?? "default";
		if (activeId === "default") applyKilnTheme(null);
		else if (activeId in THEME_PRESETS) applyKilnTheme(THEME_PRESETS[activeId]);
		else applyKilnTheme(savedThemes.find((t) => t.id === activeId) ?? null);
		visualCss.destroy();
		document.removeEventListener("mousemove", onResizeMouseMove);
		document.removeEventListener("mouseup", onResizeMouseUp);
		document.removeEventListener("mousemove", onWindowDragMove);
		document.removeEventListener("mouseup", onWindowDragUp);
		setSidebarWidthVar(null);
		document.body.style.userSelect = "";
		saveTeState({ isOpen: false });
		sidebar.remove();
		styleEl.remove();
		document.body.classList.remove("kiln-te-sidebar-open");
		const url = new URL(window.location.href);
		url.searchParams.delete("kiln-theme-editor");
		history.replaceState(null, "", url);
	}

	function buildSelect() {
		themeSelect.innerHTML = "";
		themeSelect.add(new Option("Default (Polytoria)", "__default__"));
		const presetGroup = document.createElement("optgroup");
		presetGroup.label = "Built-in Presets";
		for (const [key, p] of Object.entries(THEME_PRESETS))
			presetGroup.appendChild(new Option(p.name, `__preset__:${key}`));
		themeSelect.add(presetGroup);
		if (savedThemes.length > 0) {
			const myGroup = document.createElement("optgroup");
			myGroup.label = "My Themes";
			for (const t of savedThemes)
				myGroup.appendChild(new Option(t.name, t.id));
			themeSelect.add(myGroup);
		}
		if (isNew()) themeSelect.add(new Option(workingName, "__new__"));
		themeSelect.value = currentId;
	}

	function refreshPreview() {
		if (currentId === "__default__") {
			applyKilnTheme(null);
			return;
		}
		if (
			isNew() &&
			workingAccent === "#3bafff" &&
			workingNavbar === "#1a1a1a" &&
			workingFont === "default" &&
			!workingCss &&
			!workingBg &&
			!workingCursorSrc &&
			!workingIconColor &&
			workingEffects.length === 0 &&
			Object.keys(workingColorTokens).length === 0 &&
			!workingAmbient &&
			!workingCardStyle &&
			!workingPointerEffects
		) {
			applyKilnTheme(null);
			return;
		}
		applyKilnTheme({
			accentColor: workingAccent,
			navbarColor: workingNavbar,
			fontFamily: workingFont,
			customCss: workingCss,
			backgroundImage: workingBg,
			backgroundOverlayColor: workingOverlayColor,
			backgroundOverlayOpacity: workingOverlayOpacity,
			effects: workingEffects,
			navbarIconColor: workingIconColor || undefined,
			cursorUrl: workingCursor || undefined,
			cursorScale: workingCursorScale,
			colorTokens:
				Object.keys(workingColorTokens).length > 0
					? workingColorTokens
					: undefined,
			ambient: workingAmbient,
			cardStyle: workingCardStyle,
			pointerEffects: workingPointerEffects,
		});
	}

	function renderEffectsList() {
		const list = sidebar.querySelector<HTMLElement>("#kiln-te-effects-list")!;
		if (workingEffects.length === 0) {
			list.innerHTML = "";
			return;
		}
		list.innerHTML = workingEffects
			.map((effect) => {
				const slotLabel = EFFECT_SLOTS[effect.slot]?.label ?? effect.slot;
				const typeCfg = EFFECT_TYPE_CONFIGS[effect.type];
				const typeLabel = typeCfg?.label ?? effect.type;
				const value = typeCfg
					? formatEffectValue(effect)
					: String(effect.value);
				return `
				<div class="d-flex align-items-center gap-2 mb-1" data-effect-id="${escapeHtml(effect.id)}">
					<span class="badge bg-secondary" style="font-size:0.65em;flex-shrink:0;">${escapeHtml(slotLabel)}</span>
					<span class="small flex-fill" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(typeLabel)}: <span class="text-muted">${escapeHtml(value)}</span></span>
					<button class="kiln-te-effect-remove" data-id="${escapeHtml(effect.id)}"
					        style="background:none;border:none;padding:0 2px;cursor:pointer;color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1;flex-shrink:0;"
					        title="Remove">✕</button>
				</div>`;
			})
			.join("");
		list
			.querySelectorAll<HTMLButtonElement>(".kiln-te-effect-remove")
			.forEach((btn) => {
				btn.addEventListener("click", async () => {
					await clonePresetIfNeeded();
					workingEffects = workingEffects.filter(
						(e) => e.id !== btn.dataset.id,
					);
					renderEffectsList();
					refreshPreview();
				});
			});
	}

	function syncInputsToState() {
		accentPicker.value = workingAccent;
		accentHex.value = workingAccent;
		navbarPicker.value = workingNavbar;
		navbarHex.value = workingNavbar;
		fontSelect.value = workingFont;
		cssTextarea.value = workingCss;
		visualCss.syncFromText();
		bgIdInput.value = "";
		bgStatus.textContent = !workingBg
			? ""
			: POLYTORIA_CDN_URL.test(workingBg)
				? "Background set."
				: "Using an older image URL. Replace it with a decal ID to change it.";
		bgClearBtn.style.display = workingBg ? "" : "none";
		bgOverlayRow.style.display = workingBg ? "" : "none";
		bgOverlayColor.value = workingOverlayColor;
		bgOverlayOpacity.value = String(workingOverlayOpacity);
		bgOverlayLabel.textContent = `${workingOverlayOpacity}%`;
		cursorNameEl.textContent = workingCursorSrc ? "Custom cursor set" : "";
		cursorClearBtn.style.display = workingCursorSrc ? "" : "none";
		cursorScaleRow.style.display = workingCursorSrc ? "flex" : "none";
		cursorScaleInput.value = String(workingCursorScale);
		cursorScaleLabel.textContent = `${workingCursorScale}px`;
		const hasIconColor = !!workingIconColor;
		iconAutoCheck.checked = !hasIconColor;
		iconColorRow.style.display = hasIconColor ? "" : "none";
		if (hasIconColor) {
			iconPicker.value = workingIconColor;
			iconHex.value = workingIconColor;
		}
		for (const key of Object.keys(COLOR_TOKENS)) {
			const derived = getTokenDerivedValue(key);
			const override = workingColorTokens[key];
			const display = override ?? derived;
			const picker = sidebar.querySelector<HTMLInputElement>(
				`#kiln-te-token-${key}-picker`,
			);
			const hexInput = sidebar.querySelector<HTMLInputElement>(
				`#kiln-te-token-${key}-hex`,
			);
			const clearBtn = sidebar.querySelector<HTMLButtonElement>(
				`#kiln-te-token-${key}-clear`,
			);
			if (picker) picker.value = display;
			if (hexInput) hexInput.value = display;
			if (clearBtn) clearBtn.style.display = override ? "" : "none";
		}
		imageStatus.textContent = "";
		renderEffectsList();
		closeAddEffectForm();
		syncVisualEffectsInputs();
	}

	function setFieldsEnabled(container: HTMLElement, enabled: boolean) {
		container.classList.toggle("kiln-te-fields-disabled", !enabled);
		for (const input of container.querySelectorAll<
			HTMLInputElement | HTMLSelectElement | HTMLButtonElement
		>("input, select, button"))
			input.disabled = !enabled;
	}

	function syncVisualEffectsInputs() {
		ambientType.value = workingAmbient?.type ?? "";
		ambientDensity.value = String(workingAmbient?.density ?? 2);
		ambientColorAuto.checked = !workingAmbient?.color;
		ambientColor.value =
			workingAmbient?.color ??
			AMBIENT_TYPES.find((t) => t.key === workingAmbient?.type)?.color ??
			"#ffffff";
		ambientColor.disabled = !workingAmbient?.color;
		ambientDensity.disabled = !workingAmbient;
		ambientColorAuto.disabled = !workingAmbient;

		cardsEnabled.checked = !!workingCardStyle;
		setFieldsEnabled(cardsFields, !!workingCardStyle);
		cardsPreset.value = workingCardStyle?.preset ?? "glass";
		cardsHover.value = workingCardStyle?.hover ?? "none";
		cardsTintAuto.checked = !workingCardStyle?.tint;
		cardsTint.value = workingCardStyle?.tint ?? workingNavbar;
		cardsTint.disabled = !workingCardStyle?.tint;
		const opacity =
			workingCardStyle?.opacity ??
			CARD_PRESET_OPACITY[cardsPreset.value as CardStyle["preset"]];
		cardsOpacity.value = String(opacity);
		cardsOpacityLabel.textContent = `${opacity}%`;
		cardsRadius.value = String(workingCardStyle?.radius ?? 12);
		cardsRadiusLabel.textContent = `${workingCardStyle?.radius ?? 12}px`;

		pointerClick.value = workingPointerEffects?.click ?? "";
		pointerTrail.value = workingPointerEffects?.trail ?? "";
		pointerColorAuto.checked = !workingPointerEffects?.color;
		pointerColor.value = workingPointerEffects?.color ?? workingAccent;
		pointerColor.disabled = !workingPointerEffects?.color;
	}

	function updateNameUI() {
		const canRename = isCustomTheme() || isNew();
		const savedTheme = getCurrentSavedTheme();
		autoUpdateRow.style.display = "none";
		if (savedTheme) {
			publishedBadge.style.display = "";
			if (savedTheme.importedSlug) {
				publishedBadge.textContent = "Imported";
				publishedBadge.className = "badge mb-2 w-100 bg-info text-dark";
				autoUpdateRow.style.display = "";
				autoUpdateCheck.checked = !!savedTheme.autoUpdate;
			} else {
				publishedBadge.textContent = savedTheme.publishedSlug
					? "Published"
					: "Unpublished";
				publishedBadge.className = `badge mb-2 w-100 ${savedTheme.publishedSlug ? "bg-primary" : "bg-secondary"}`;
			}
		} else if (isNew()) {
			publishedBadge.style.display = "";
			publishedBadge.textContent = "Unsaved";
			publishedBadge.className = "badge mb-2 w-100 bg-warning text-dark";
		} else if (currentId.startsWith("__preset__:")) {
			publishedBadge.style.display = "";
			publishedBadge.textContent = "Preset (edit to make a copy)";
			publishedBadge.className = "badge mb-2 w-100 bg-secondary";
		} else {
			publishedBadge.style.display = "none";
		}
		namePencil.style.display = canRename ? "" : "none";
	}

	let pendingConflictRetry: (() => void) | null = null;

	function classifyPublishError(message: string): {
		text: string;
		offerRename: boolean;
	} {
		if (message.includes("A theme with that name already exists"))
			return {
				text: "A theme with that name already exists.",
				offerRename: true,
			};
		if (message.includes("identical theme has already been published"))
			return {
				text: "An identical theme has already been published.",
				offerRename: false,
			};
		if (message.includes("publish at most"))
			return {
				text: "You've reached your publish limit.",
				offerRename: false,
			};
		return {
			text: friendlyApiError(message, "Failed to publish. Please try again."),
			offerRename: false,
		};
	}

	function renderPublishError(message: string, retry: () => void) {
		const { text, offerRename } = classifyPublishError(message);
		if (!offerRename) {
			publishStatus.textContent = text;
			return;
		}
		publishStatus.innerHTML = `<span class="text-danger">${text}</span> <button class="btn btn-sm btn-outline-secondary py-0 ms-1" id="kiln-te-conflict-rename">Rename &amp; Retry</button>`;
		publishStatus
			.querySelector<HTMLButtonElement>("#kiln-te-conflict-rename")!
			.addEventListener("click", () => {
				pendingConflictRetry = retry;
				openRenameOverlay();
			});
	}

	async function findVerifiedSession() {
		const sessions = await apiSessions.getValue();
		const currentUser = await getUserDetails();
		return sessions.find(
			(s) =>
				s.state === "verified" &&
				s.accessToken &&
				(!currentUser || s.userId === currentUser.userId),
		);
	}

	async function attemptPublish(
		savedTheme: NonNullable<ReturnType<typeof getCurrentSavedTheme>>,
		mode: "publish" | "update",
		button: HTMLButtonElement,
	) {
		const verified =
			(await findVerifiedSession()) ?? (await showVerificationModal());
		if (!verified) return;

		if (mode === "publish") {
			const acknowledged = await confirmPublishRulesSeen(
				publishRulesOverlay,
				publishRulesContinueBtn,
				publishRulesCancelBtn,
			);
			if (!acknowledged) return;

			const publishedCount = savedThemes.filter((t) => t.publishedSlug).length;
			const cfg = await getConfig();
			if (publishedCount >= cfg.limits.maxPublishedThemes) {
				publishStatus.textContent = `You can only publish up to ${cfg.limits.maxPublishedThemes} theme${cfg.limits.maxPublishedThemes === 1 ? "" : "s"}.`;
				return;
			}
		}

		const existingId =
			mode === "update"
				? savedTheme.publishedSlug
				: savedTheme.previousPublishedSlug;
		const name = workingName || "My Theme";
		button.disabled = true;
		publishStatus.textContent =
			mode === "update" ? "Syncing published version…" : "Publishing…";

		const result = await sendMessage("publishTheme", {
			userId: verified.userId,
			name,
			accentColor: workingAccent,
			navbarColor: workingNavbar,
			...(workingFont !== "default" ? { fontFamily: workingFont } : {}),
			...(workingCss ? { customCss: workingCss } : {}),
			...(workingBg ? { backgroundImage: workingBg } : {}),
			...(workingBg && workingOverlayOpacity > 0
				? {
						backgroundOverlayColor: workingOverlayColor,
						backgroundOverlayOpacity: workingOverlayOpacity,
					}
				: {}),
			...(workingCursor ? { cursorUrl: workingCursor } : {}),
			...(workingEffects.length ? { effects: workingEffects } : {}),
			...(workingIconColor ? { navbarIconColor: workingIconColor } : {}),
			...(Object.keys(workingColorTokens).length
				? { colorTokens: workingColorTokens }
				: {}),
			...(workingAmbient ? { ambient: workingAmbient } : {}),
			...(workingCardStyle ? { cardStyle: workingCardStyle } : {}),
			...(workingPointerEffects
				? { pointerEffects: workingPointerEffects }
				: {}),
			...(existingId ? { existingId } : {}),
		});

		if (result.ok) {
			const publishedId = result.data.data.id;
			const isPending = result.data.data.approvalStatus === "pending";

			const current = await _savedThemes.getValue();
			const idx = current.findIndex((t) => t.id === savedTheme.id);
			if (idx >= 0) {
				const { previousPublishedSlug: _drop, ...rest } = current[idx];
				current[idx] = { ...rest, publishedSlug: publishedId };
				await _savedThemes.setValue(current);
				savedThemes = await _savedThemes.getValue();
			}
			buildSelect();
			updateNameUI();
			refreshLeftActions();

			if (mode === "update") {
				publishStatus.innerHTML = isPending
					? `<span class="text-warning"><i class="fas fa-clock me-1"></i>Submitted for re-review</span><div class="text-muted small mt-1">This theme needs approval before going live again.</div>`
					: `<span class="text-success"><i class="fas fa-check me-1"></i>Published version updated!</span>`;
			} else {
				publishStatus.innerHTML = isPending
					? `<div><span class="text-warning"><i class="fas fa-clock me-1"></i>Submitted for review</span><code class="ms-2" style="font-size:0.8em;">${publishedId}</code><button class="btn btn-sm btn-outline-secondary py-0 ms-1" id="kiln-te-copy-id"><i class="fas fa-copy me-1"></i>Copy ID</button></div><div class="text-muted small mt-1">Your theme includes content that must be approved before others can import it.</div>`
					: `<span class="text-success me-2"><i class="fas fa-check me-1"></i>Published!</span><code class="me-2" style="font-size:0.8em;">${publishedId}</code><button class="btn btn-sm btn-outline-secondary py-0" id="kiln-te-copy-id"><i class="fas fa-copy me-1"></i>Copy ID</button>`;
				publishStatus
					.querySelector("#kiln-te-copy-id")!
					.addEventListener("click", () => {
						navigator.clipboard.writeText(publishedId);
						const btn =
							publishStatus.querySelector<HTMLButtonElement>(
								"#kiln-te-copy-id",
							)!;
						btn.innerHTML = '<i class="fas fa-check me-1"></i>Copied!';
						setTimeout(() => {
							btn.innerHTML = '<i class="fas fa-copy me-1"></i>Copy ID';
						}, 2000);
					});
			}
		} else {
			renderPublishError(result.message, () =>
				attemptPublish(savedTheme, mode, button),
			);
		}
		button.disabled = false;
	}

	function addMenuItem(
		label: string,
		iconClass: string,
		extraClass = "",
	): HTMLButtonElement {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `dropdown-item ${extraClass}`.trim();
		btn.innerHTML = `<i class="${iconClass} me-1"></i>${label}`;
		li.appendChild(btn);
		moreMenu.appendChild(li);
		return btn;
	}

	function refreshLeftActions() {
		publishStatus.innerHTML = "";
		leftActions.innerHTML = "";
		moreMenu.innerHTML = "";
		const savedTheme = getCurrentSavedTheme();

		const newBtn = addMenuItem("New", "fas fa-plus", "text-primary");
		newBtn.addEventListener("click", () => startNewTheme());

		if (savedTheme) {
			const deleteBtn = addMenuItem("Delete", "fas fa-trash", "text-danger");
			deleteBtn.addEventListener("click", () => {
				openDeleteOverlay(savedTheme);
			});

			if (!savedTheme.importedSlug && savedTheme.publishedSlug) {
				const unpublishBtn = addMenuItem(
					"Unpublish",
					"fas fa-cloud-arrow-down",
					"text-warning",
				);
				unpublishBtn.addEventListener("click", async () => {
					const verified =
						(await findVerifiedSession()) ?? (await showVerificationModal());
					if (!verified) return;
					unpublishBtn.disabled = true;
					publishStatus.textContent = "Unpublishing…";
					const result = await sendMessage("unpublishTheme", {
						userId: verified.userId,
						id: savedTheme.publishedSlug!,
					});
					if (result.ok) {
						const current = await _savedThemes.getValue();
						const idx = current.findIndex((t) => t.id === savedTheme.id);
						if (idx >= 0) {
							const { publishedSlug, ...rest } = current[idx];
							current[idx] = { ...rest, previousPublishedSlug: publishedSlug };
							await _savedThemes.setValue(current);
						}
						savedThemes = await _savedThemes.getValue();
						buildSelect();
						updateNameUI();
						refreshLeftActions();
						publishStatus.innerHTML =
							'<span class="text-success"><i class="fas fa-check me-1"></i>Unpublished.</span>';
					} else {
						publishStatus.textContent = friendlyApiError(
							result.message,
							"Failed to unpublish. Please try again.",
						);
						unpublishBtn.disabled = false;
					}
				});

				const updateBtn = addMenuItem(
					"Update Published",
					"fas fa-arrows-rotate",
					"text-primary",
				);
				updateBtn.addEventListener("click", () =>
					attemptPublish(savedTheme, "update", updateBtn),
				);
			} else if (!savedTheme.importedSlug) {
				const publishBtn = document.createElement("button");
				publishBtn.className = "btn btn-sm btn-outline-secondary flex-fill";
				publishBtn.innerHTML = '<i class="fas fa-upload me-1"></i>Publish';
				leftActions.appendChild(publishBtn);
				publishBtn.addEventListener("click", () =>
					attemptPublish(savedTheme, "publish", publishBtn),
				);
			}
		} else {
			const importBtn = document.createElement("button");
			importBtn.className = "btn btn-sm btn-outline-secondary flex-fill";
			importBtn.innerHTML = '<i class="fas fa-download me-1"></i>Import';
			leftActions.appendChild(importBtn);
			importBtn.addEventListener("click", () => showImportFlow());

			const galleryBtn = document.createElement("button");
			galleryBtn.className = "btn btn-sm btn-outline-secondary flex-fill";
			galleryBtn.innerHTML = '<i class="fas fa-store me-1"></i>Gallery';
			leftActions.appendChild(galleryBtn);
			galleryBtn.addEventListener("click", () =>
				openThemeGallery(handleImported),
			);
		}

		moreWrap.style.display = moreMenu.children.length > 0 ? "" : "none";
	}

	async function handleImported(localId: string) {
		savedThemes = await _savedThemes.getValue();
		switchTheme(localId);
	}

	function startNewTheme() {
		openNewThemeModal(async (create) => {
			const theme = await create();
			savedThemes = await _savedThemes.getValue();
			switchTheme(theme.id);
		});
	}

	function switchTheme(id: string) {
		applyIdToState(id);
		buildSelect();
		syncInputsToState();
		updateNameUI();
		refreshLeftActions();
		void applyScaledCursor();
	}

	async function applyScaledCursor() {
		if (!workingCursorSrc) {
			workingCursor = "";
			refreshPreview();
			return;
		}
		const img = new Image();
		const loaded = await new Promise<boolean>((resolve) => {
			img.onload = () => resolve(true);
			img.onerror = () => resolve(false);
			img.src = workingCursorSrc;
			if (img.complete && img.naturalWidth > 0) resolve(true);
		});
		if (!loaded) {
			cursorNameEl.textContent = "Couldn't load that image. Try again.";
			refreshPreview();
			return;
		}
		try {
			const canvas = document.createElement("canvas");
			canvas.width = workingCursorScale;
			canvas.height = workingCursorScale;
			canvas
				.getContext("2d")!
				.drawImage(img, 0, 0, workingCursorScale, workingCursorScale);
			workingCursor = canvas.toDataURL("image/png");
		} catch {
			cursorNameEl.textContent = "Couldn't process that image. Try again.";
		}
		refreshPreview();
	}

	function clonePresetIfNeeded(): Promise<void> {
		if (!currentId.startsWith("__preset__:"))
			return clonePresetPromise ?? Promise.resolve();
		if (clonePresetPromise) return clonePresetPromise;
		const themeId = crypto.randomUUID();
		currentId = themeId;
		clonePresetPromise = (async () => {
			const current = await _savedThemes.getValue();
			current.push({
				id: themeId,
				name: workingName,
				accentColor: workingAccent,
				navbarColor: workingNavbar,
				fontFamily: workingFont !== "default" ? workingFont : undefined,
				customCss: workingCss || undefined,
				backgroundImage: workingBg || undefined,
				backgroundOverlayColor:
					workingOverlayOpacity > 0 ? workingOverlayColor : undefined,
				backgroundOverlayOpacity:
					workingOverlayOpacity > 0 ? workingOverlayOpacity : undefined,
				effects: workingEffects.length > 0 ? workingEffects : undefined,
				navbarIconColor: workingIconColor || undefined,
				cursorUrl: workingCursorSrc || undefined,
				cursorScale: workingCursorSrc ? workingCursorScale : undefined,
				colorTokens:
					Object.keys(workingColorTokens).length > 0
						? workingColorTokens
						: undefined,
				ambient: workingAmbient,
				cardStyle: workingCardStyle,
				pointerEffects: workingPointerEffects,
			});
			await _savedThemes.setValue(current);
			savedThemes = current;
			buildSelect();
			updateNameUI();
			refreshLeftActions();
		})().finally(() => {
			clonePresetPromise = null;
		});
		return clonePresetPromise;
	}

	const renameOverlay = sidebar.querySelector<HTMLElement>(
		"#kiln-te-rename-overlay",
	)!;
	const renameInput = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-rename-input",
	)!;

	function openRenameOverlay() {
		renameInput.value = workingName;
		renameOverlay.style.display = "flex";
		renameInput.focus();
		renameInput.select();
	}
	function closeRenameOverlay() {
		renameOverlay.style.display = "none";
	}
	function confirmRename() {
		const typed = renameInput.value.trim();
		if (typed) {
			workingName = typed;
			const opt = themeSelect.querySelector<HTMLOptionElement>(
				`option[value="${currentId}"]`,
			);
			if (opt) opt.textContent = typed;
		}
		closeRenameOverlay();
		if (pendingConflictRetry) {
			const retry = pendingConflictRetry;
			pendingConflictRetry = null;
			retry();
		}
	}

	sidebar
		.querySelector("#kiln-te-new-btn")!
		.addEventListener("click", () => startNewTheme());
	namePencil.addEventListener("click", () => {
		if (!isCustomTheme() && !isNew()) return;
		openRenameOverlay();
	});
	autoUpdateCheck.addEventListener("change", async () => {
		const savedTheme = getCurrentSavedTheme();
		if (!savedTheme) return;
		const current = await _savedThemes.getValue();
		const idx = current.findIndex((t) => t.id === savedTheme.id);
		if (idx >= 0) {
			current[idx] = { ...current[idx], autoUpdate: autoUpdateCheck.checked };
			await _savedThemes.setValue(current);
			savedThemes = await _savedThemes.getValue();
		}
	});
	function cancelRename() {
		pendingConflictRetry = null;
		closeRenameOverlay();
	}
	sidebar
		.querySelector("#kiln-te-rename-cancel")!
		.addEventListener("click", cancelRename);
	sidebar
		.querySelector("#kiln-te-rename-confirm")!
		.addEventListener("click", confirmRename);
	renameInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") confirmRename();
		if (e.key === "Escape") cancelRename();
	});

	const importOverlay = sidebar.querySelector<HTMLElement>(
		"#kiln-te-import-overlay",
	)!;
	const importInput = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-import-input",
	)!;
	const importStatus = sidebar.querySelector<HTMLElement>(
		"#kiln-te-import-status",
	)!;
	const importLoadBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-import-load",
	)!;

	function openImportOverlay() {
		importInput.value = "";
		importStatus.textContent = "";
		importStatus.className = "small mb-2";
		importLoadBtn.disabled = false;
		importOverlay.style.display = "flex";
		importInput.focus();
	}
	function closeImportOverlay() {
		importOverlay.style.display = "none";
	}

	sidebar
		.querySelector("#kiln-te-import-cancel")!
		.addEventListener("click", closeImportOverlay);
	importInput.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeImportOverlay();
	});
	importLoadBtn.addEventListener("click", async () => {
		const raw = importInput.value.trim();
		if (!raw) return;
		const id = raw.split("/").pop()!;
		importLoadBtn.disabled = true;
		importStatus.textContent = "Loading…";
		importStatus.className = "small text-muted mb-2";

		const result = await sendMessage("getPublishedTheme", id);
		if (!result.ok) {
			importStatus.textContent = result.message.includes("404")
				? "Theme not found."
				: friendlyApiError(
						result.message,
						"Failed to import theme. Please try again.",
					);
			importStatus.className = "small text-danger mb-2";
			importLoadBtn.disabled = false;
			return;
		}

		const fetched = result.data.data;
		const userResult = await sendMessage("getUser", fetched.userId);
		const creatorName = userResult.ok
			? userResult.data.username
			: `User #${fetched.userId}`;

		closeImportOverlay();
		await showConfirmImport(
			fetched,
			creatorName,
			undefined,
			undefined,
			handleImported,
		);
		importLoadBtn.disabled = false;
	});

	const deleteOverlay = sidebar.querySelector<HTMLElement>(
		"#kiln-te-delete-overlay",
	)!;
	const deleteMessage = sidebar.querySelector<HTMLElement>(
		"#kiln-te-delete-message",
	)!;
	const deleteConfirmBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-delete-confirm",
	)!;
	let themeToDelete: NonNullable<
		ReturnType<typeof getCurrentSavedTheme>
	> | null = null;

	function openDeleteOverlay(
		savedTheme: NonNullable<ReturnType<typeof getCurrentSavedTheme>>,
	) {
		themeToDelete = savedTheme;
		deleteMessage.textContent = `Are you sure you want to delete "${savedTheme.name}"? This cannot be undone.`;
		deleteOverlay.style.display = "flex";
	}
	function closeDeleteOverlay() {
		deleteOverlay.style.display = "none";
		themeToDelete = null;
	}

	sidebar
		.querySelector("#kiln-te-delete-cancel")!
		.addEventListener("click", closeDeleteOverlay);
	deleteConfirmBtn.addEventListener("click", async () => {
		const savedTheme = themeToDelete;
		if (!savedTheme) return;

		await deleteSavedTheme(savedTheme);
		const activeId = (values.config.themeCreator as any).activeThemeId;
		if (activeId === savedTheme.id) {
			await setActiveThemeId("default");
			applyKilnTheme(null);
		}
		savedThemes = await _savedThemes.getValue();
		applyIdToState("__default__");
		buildSelect();
		syncInputsToState();
		updateNameUI();
		refreshLeftActions();
		refreshPreview();

		closeDeleteOverlay();
	});

	themeSelect.addEventListener("change", () => switchTheme(themeSelect.value));

	accentPicker.addEventListener("input", async () => {
		await clonePresetIfNeeded();
		workingAccent = accentPicker.value;
		accentHex.value = workingAccent;
		refreshPreview();
	});
	accentHex.addEventListener("change", async () => {
		const v = accentHex.value.startsWith("#")
			? accentHex.value
			: `#${accentHex.value}`;
		if (!isValidHex(v)) {
			accentHex.value = workingAccent;
			return;
		}
		await clonePresetIfNeeded();
		workingAccent = v;
		accentPicker.value = v;
		refreshPreview();
	});
	navbarPicker.addEventListener("input", async () => {
		await clonePresetIfNeeded();
		workingNavbar = navbarPicker.value;
		navbarHex.value = workingNavbar;
		refreshPreview();
	});
	navbarHex.addEventListener("change", async () => {
		const v = navbarHex.value.startsWith("#")
			? navbarHex.value
			: `#${navbarHex.value}`;
		if (!isValidHex(v)) {
			navbarHex.value = workingNavbar;
			return;
		}
		await clonePresetIfNeeded();
		workingNavbar = v;
		navbarPicker.value = v;
		refreshPreview();
	});
	fontSelect.addEventListener("change", async () => {
		await clonePresetIfNeeded();
		workingFont = fontSelect.value;
		refreshPreview();
	});
	cssTextarea.addEventListener("input", async () => {
		await clonePresetIfNeeded();
		workingCss = cssTextarea.value;
		visualCss.syncFromText();
		refreshPreview();
	});
	bgSetBtn.addEventListener("click", async () => {
		bgSetBtn.disabled = true;
		bgStatus.textContent = "Looking up decal…";
		const url = await resolveDecalUrl(bgIdInput.value);
		bgSetBtn.disabled = false;
		if (!url) {
			bgStatus.textContent =
				"Couldn't find that decal. Check the ID and try again.";
			return;
		}
		await clonePresetIfNeeded();
		workingBg = url;
		bgIdInput.value = "";
		bgStatus.textContent = "Background set.";
		bgClearBtn.style.display = "";
		bgOverlayRow.style.display = "";
		refreshPreview();
	});
	bgIdInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") bgSetBtn.click();
	});
	bgClearBtn.addEventListener("click", async () => {
		await clonePresetIfNeeded();
		workingBg = "";
		bgIdInput.value = "";
		bgStatus.textContent = "";
		bgClearBtn.style.display = "none";
		bgOverlayRow.style.display = "none";
		refreshPreview();
	});
	cursorSetBtn.addEventListener("click", async () => {
		cursorSetBtn.disabled = true;
		cursorNameEl.textContent = "Looking up decal…";
		try {
			const url = await resolveDecalUrl(cursorIdInput.value);
			if (!url) {
				cursorNameEl.textContent =
					"Couldn't find that decal. Check the ID and try again.";
				return;
			}
			const image = await sendMessage("fetchCdnImageDataUrl", url).catch(
				() => null,
			);
			if (!image?.ok) {
				cursorNameEl.textContent = "Couldn't load that image. Try again.";
				return;
			}
			const img = new Image();
			img.src = image.data;
			await img.decode();
			await clonePresetIfNeeded();
			const srcCanvas = document.createElement("canvas");
			srcCanvas.width = 128;
			srcCanvas.height = 128;
			srcCanvas.getContext("2d")!.drawImage(img, 0, 0, 128, 128);
			workingCursorSrc = srcCanvas.toDataURL("image/png");
		} catch {
			cursorNameEl.textContent = "Couldn't load that image. Try again.";
			return;
		} finally {
			cursorSetBtn.disabled = false;
		}
		cursorIdInput.value = "";
		cursorNameEl.textContent = "Custom cursor set";
		cursorClearBtn.style.display = "";
		cursorScaleRow.style.display = "flex";
		await applyScaledCursor();
	});
	cursorIdInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") cursorSetBtn.click();
	});
	cursorScaleInput.addEventListener("input", async () => {
		workingCursorScale = Number(cursorScaleInput.value);
		cursorScaleLabel.textContent = `${workingCursorScale}px`;
		await clonePresetIfNeeded();
		await applyScaledCursor();
	});
	cursorClearBtn.addEventListener("click", async () => {
		await clonePresetIfNeeded();
		workingCursorSrc = "";
		workingCursorScale = 32;
		workingCursor = "";
		cursorIdInput.value = "";
		cursorNameEl.textContent = "";
		cursorClearBtn.style.display = "none";
		cursorScaleRow.style.display = "none";
		refreshPreview();
	});
	bgOverlayColor.addEventListener("input", async () => {
		await clonePresetIfNeeded();
		workingOverlayColor = bgOverlayColor.value;
		refreshPreview();
	});
	bgOverlayOpacity.addEventListener("input", async () => {
		await clonePresetIfNeeded();
		workingOverlayOpacity = Number(bgOverlayOpacity.value);
		bgOverlayLabel.textContent = `${workingOverlayOpacity}%`;
		refreshPreview();
	});
	iconAutoCheck.addEventListener("change", async () => {
		if (iconAutoCheck.checked) {
			await clonePresetIfNeeded();
			workingIconColor = "";
			iconColorRow.style.display = "none";
			refreshPreview();
		} else {
			const initial = workingIconColor || workingAccent;
			workingIconColor = initial;
			iconPicker.value = initial;
			iconHex.value = initial;
			iconColorRow.style.display = "";
			refreshPreview();
		}
	});
	iconPicker.addEventListener("input", async () => {
		await clonePresetIfNeeded();
		workingIconColor = iconPicker.value;
		iconHex.value = workingIconColor;
		refreshPreview();
	});
	iconHex.addEventListener("change", async () => {
		const v = iconHex.value.startsWith("#")
			? iconHex.value
			: `#${iconHex.value}`;
		if (!isValidHex(v)) {
			iconHex.value = workingIconColor;
			return;
		}
		await clonePresetIfNeeded();
		workingIconColor = v;
		iconPicker.value = v;
		refreshPreview();
	});

	for (const key of Object.keys(COLOR_TOKENS)) {
		const pickerEl = sidebar.querySelector<HTMLInputElement>(
			`#kiln-te-token-${key}-picker`,
		)!;
		const hexEl = sidebar.querySelector<HTMLInputElement>(
			`#kiln-te-token-${key}-hex`,
		)!;
		const clearBtnEl = sidebar.querySelector<HTMLButtonElement>(
			`#kiln-te-token-${key}-clear`,
		)!;

		pickerEl.addEventListener("input", async () => {
			await clonePresetIfNeeded();
			workingColorTokens[key] = pickerEl.value;
			hexEl.value = pickerEl.value;
			clearBtnEl.style.display = "";
			refreshPreview();
		});
		hexEl.addEventListener("change", async () => {
			const v = hexEl.value.startsWith("#") ? hexEl.value : `#${hexEl.value}`;
			if (!isValidHex(v)) {
				hexEl.value = workingColorTokens[key] ?? getTokenDerivedValue(key);
				return;
			}
			await clonePresetIfNeeded();
			workingColorTokens[key] = v;
			pickerEl.value = v;
			clearBtnEl.style.display = "";
			refreshPreview();
		});
		clearBtnEl.addEventListener("click", async () => {
			await clonePresetIfNeeded();
			delete workingColorTokens[key];
			const derived = getTokenDerivedValue(key);
			pickerEl.value = derived;
			hexEl.value = derived;
			clearBtnEl.style.display = "none";
			refreshPreview();
		});
	}

	async function readAmbient() {
		const type = ambientType.value as AmbientType | "";
		await clonePresetIfNeeded();
		workingAmbient = type
			? {
					type,
					density: Number(ambientDensity.value),
					...(ambientColorAuto.checked ? {} : { color: ambientColor.value }),
				}
			: undefined;
		if (ambientColorAuto.checked)
			ambientColor.value =
				AMBIENT_TYPES.find((t) => t.key === type)?.color ?? "#ffffff";
		ambientColor.disabled = !type || ambientColorAuto.checked;
		ambientDensity.disabled = !type;
		ambientColorAuto.disabled = !type;
		refreshPreview();
	}
	for (const input of [ambientType, ambientDensity, ambientColorAuto])
		input.addEventListener("change", readAmbient);
	ambientColor.addEventListener("input", readAmbient);

	async function readCardStyle() {
		setFieldsEnabled(cardsFields, cardsEnabled.checked);
		cardsTint.disabled = !cardsEnabled.checked || cardsTintAuto.checked;
		cardsOpacityLabel.textContent = `${cardsOpacity.value}%`;
		cardsRadiusLabel.textContent = `${cardsRadius.value}px`;
		await clonePresetIfNeeded();
		workingCardStyle = cardsEnabled.checked
			? {
					preset: cardsPreset.value as CardStyle["preset"],
					hover: cardsHover.value as CardStyle["hover"],
					opacity: Number(cardsOpacity.value),
					radius: Number(cardsRadius.value),
					...(cardsTintAuto.checked ? {} : { tint: cardsTint.value }),
				}
			: undefined;
		refreshPreview();
	}
	cardsPreset.addEventListener("change", () => {
		const opacity =
			CARD_PRESET_OPACITY[cardsPreset.value as CardStyle["preset"]];
		cardsOpacity.value = String(opacity);
		void readCardStyle();
	});
	for (const input of [cardsEnabled, cardsHover, cardsTintAuto])
		input.addEventListener("change", readCardStyle);
	for (const input of [cardsTint, cardsOpacity, cardsRadius])
		input.addEventListener("input", readCardStyle);

	async function readPointerEffects() {
		pointerColor.disabled = pointerColorAuto.checked;
		const effects: PointerEffects = {
			...(pointerClick.value
				? { click: pointerClick.value as PointerEffects["click"] }
				: {}),
			...(pointerTrail.value
				? { trail: pointerTrail.value as PointerEffects["trail"] }
				: {}),
			...(pointerColorAuto.checked ? {} : { color: pointerColor.value }),
		};
		await clonePresetIfNeeded();
		workingPointerEffects =
			effects.click || effects.trail ? effects : undefined;
		refreshPreview();
	}
	for (const input of [pointerClick, pointerTrail, pointerColorAuto])
		input.addEventListener("change", readPointerEffects);
	pointerColor.addEventListener("input", readPointerEffects);

	exportJsonBtn.addEventListener("click", () => {
		const data: Record<string, unknown> = {
			name: workingName,
			accentColor: workingAccent,
			navbarColor: workingNavbar,
		};
		if (workingFont !== "default") data.fontFamily = workingFont;
		if (workingCss) data.customCss = workingCss;
		if (workingBg) data.backgroundImage = workingBg;
		if (workingOverlayOpacity > 0) {
			data.backgroundOverlayColor = workingOverlayColor;
			data.backgroundOverlayOpacity = workingOverlayOpacity;
		}
		if (workingEffects.length > 0) data.effects = workingEffects;
		if (workingIconColor) data.navbarIconColor = workingIconColor;
		if (workingCursorSrc) {
			data.cursorUrl = workingCursorSrc;
			data.cursorScale = workingCursorScale;
		}
		if (Object.keys(workingColorTokens).length > 0)
			data.colorTokens = workingColorTokens;
		if (workingAmbient) data.ambient = workingAmbient;
		if (workingCardStyle) data.cardStyle = workingCardStyle;
		if (workingPointerEffects) data.pointerEffects = workingPointerEffects;
		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${(workingName || "theme").replace(/[^a-z0-9]/gi, "_")}.json`;
		a.click();
		URL.revokeObjectURL(url);
	});

	function sanitizeImportedEffects(raw: unknown): ThemeEffect[] {
		if (!Array.isArray(raw)) return [];
		const result: ThemeEffect[] = [];
		for (const item of raw) {
			if (!item || typeof item !== "object") continue;
			const slot = (item as any).slot;
			const type = (item as any).type;
			if (typeof slot !== "string" || !(slot in EFFECT_SLOTS)) continue;
			const slotCfg = EFFECT_SLOTS[slot as keyof typeof EFFECT_SLOTS];
			if (
				typeof type !== "string" ||
				!slotCfg.types.includes(type as EffectType)
			)
				continue;
			const cfg = EFFECT_TYPE_CONFIGS[type as EffectType].input;
			const rawValue = (item as any).value;
			let value: string | number | null = null;
			if (cfg.kind === "slider" || cfg.kind === "number") {
				const n = Number(rawValue);
				if (!Number.isFinite(n)) continue;
				value = Math.min(cfg.max, Math.max(cfg.min, n));
			} else if (cfg.kind === "select") {
				if (
					typeof rawValue !== "string" ||
					!cfg.options.some((o) => o.value === rawValue)
				)
					continue;
				value = rawValue;
			} else if (cfg.kind === "color") {
				if (typeof rawValue !== "string" || !isValidHex(rawValue)) continue;
				value = rawValue;
			} else if (cfg.kind === "color-alpha") {
				if (typeof rawValue !== "string") continue;
				const [hex, alpha] = parseColorAlphaShared(rawValue);
				const [r, g, b] = hexToRgb(hex);
				value = `rgba(${r},${g},${b},${(alpha / 100).toFixed(2)})`;
			} else if (cfg.kind === "url") {
				if (typeof rawValue !== "string" || rawValue.length > 2000) continue;
				value = rawValue;
			} else if (cfg.kind === "audio-volume") {
				if (typeof rawValue !== "string" || !parseAssetVolume(rawValue))
					continue;
				value = rawValue;
			}
			if (value === null) continue;
			const rawId = (item as any).id;
			const id =
				typeof rawId === "string" && rawId ? rawId : crypto.randomUUID();
			result.push({
				id,
				slot: slot as ThemeEffect["slot"],
				type: type as EffectType,
				value,
			});
		}
		return result;
	}

	function sanitizeImportedAmbient(raw: unknown): Ambient | undefined {
		if (!raw || typeof raw !== "object") return undefined;
		const type = (raw as any).type;
		if (typeof type !== "string" || !AMBIENT_TYPES.some((t) => t.key === type))
			return undefined;
		const density = Number((raw as any).density);
		const color = (raw as any).color;
		return {
			type: type as AmbientType,
			density: Number.isFinite(density) ? Math.min(3, Math.max(1, density)) : 2,
			...(typeof color === "string" && isValidHex(color) ? { color } : {}),
		};
	}

	function sanitizeImportedCardStyle(raw: unknown): CardStyle | undefined {
		if (!raw || typeof raw !== "object") return undefined;
		const preset = (raw as any).preset;
		if (typeof preset !== "string" || !(preset in CARD_PRESET_OPACITY))
			return undefined;
		const hover = (raw as any).hover;
		const tint = (raw as any).tint;
		const opacity = Number((raw as any).opacity);
		const radius = Number((raw as any).radius);
		return {
			preset: preset as CardStyle["preset"],
			...(["none", "lift", "glow", "tilt"].includes(hover) ? { hover } : {}),
			...(typeof tint === "string" && isValidHex(tint) ? { tint } : {}),
			...(Number.isFinite(opacity)
				? { opacity: Math.min(100, Math.max(0, opacity)) }
				: {}),
			...(Number.isFinite(radius)
				? { radius: Math.min(32, Math.max(0, radius)) }
				: {}),
			...(typeof (raw as any).liquidGlass === "boolean"
				? { liquidGlass: (raw as any).liquidGlass }
				: {}),
		};
	}

	function sanitizeImportedPointerEffects(
		raw: unknown,
	): PointerEffects | undefined {
		if (!raw || typeof raw !== "object") return undefined;
		const click = (raw as any).click;
		const trail = (raw as any).trail;
		const color = (raw as any).color;
		const validClick = ["sparkles", "hearts", "ripples", "confetti"];
		const validTrail = ["sparkles", "dots", "hearts", "glow"];
		const result: PointerEffects = {};
		if (typeof click === "string" && validClick.includes(click))
			result.click = click as PointerEffects["click"];
		if (typeof trail === "string" && validTrail.includes(trail))
			result.trail = trail as PointerEffects["trail"];
		if (typeof color === "string" && isValidHex(color)) result.color = color;
		return result.click || result.trail ? result : undefined;
	}

	jsonImportInput.addEventListener("change", async () => {
		const file = jsonImportInput.files?.[0];
		if (!file) return;
		jsonImportInput.value = "";
		try {
			const data = JSON.parse(await file.text());
			if (
				typeof data.accentColor !== "string" ||
				typeof data.navbarColor !== "string"
			) {
				publishStatus.textContent =
					"Invalid theme JSON: missing required color fields.";
				return;
			}
			currentId = "__new__";
			workingName =
				typeof data.name === "string" ? data.name : generateRandomThemeName();
			workingAccent = isValidHex(data.accentColor)
				? data.accentColor
				: "#3bafff";
			workingNavbar = isValidHex(data.navbarColor)
				? data.navbarColor
				: "#1a1a1a";
			workingFont =
				typeof data.fontFamily === "string" ? data.fontFamily : "default";
			workingCss = typeof data.customCss === "string" ? data.customCss : "";
			workingBg =
				typeof data.backgroundImage === "string" ? data.backgroundImage : "";
			workingOverlayColor =
				typeof data.backgroundOverlayColor === "string" &&
				isValidHex(data.backgroundOverlayColor)
					? data.backgroundOverlayColor
					: "#000000";
			workingOverlayOpacity =
				typeof data.backgroundOverlayOpacity === "number"
					? Math.min(100, Math.max(0, data.backgroundOverlayOpacity))
					: 0;
			workingEffects = sanitizeImportedEffects(data.effects);
			const droppedEffects = Array.isArray(data.effects)
				? data.effects.length - workingEffects.length
				: 0;
			workingIconColor =
				typeof data.navbarIconColor === "string" &&
				isValidHex(data.navbarIconColor)
					? data.navbarIconColor
					: "";
			workingCursorSrc =
				typeof data.cursorUrl === "string" ? data.cursorUrl : "";
			workingCursorScale =
				typeof data.cursorScale === "number"
					? Math.min(128, Math.max(16, data.cursorScale))
					: 32;
			workingCursor = "";
			workingColorTokens =
				data.colorTokens &&
				typeof data.colorTokens === "object" &&
				!Array.isArray(data.colorTokens)
					? (Object.fromEntries(
							Object.entries(data.colorTokens).filter(
								(entry): entry is [string, string] =>
									typeof entry[1] === "string" && isValidHex(entry[1]),
							),
						) as Record<string, string>)
					: {};
			workingAmbient = sanitizeImportedAmbient(data.ambient);
			workingCardStyle = sanitizeImportedCardStyle(data.cardStyle);
			workingPointerEffects = sanitizeImportedPointerEffects(
				data.pointerEffects,
			);
			buildSelect();
			syncInputsToState();
			updateNameUI();
			refreshLeftActions();
			await applyScaledCursor();
			publishStatus.textContent =
				droppedEffects > 0
					? `Imported. ${droppedEffects} invalid effect${droppedEffects === 1 ? "" : "s"} were skipped.`
					: "";
		} catch {
			publishStatus.textContent = "Failed to parse JSON file.";
		}
	});

	imageInput.addEventListener("change", async () => {
		const file = imageInput.files?.[0];
		if (!file) return;
		imageStatus.textContent = "Extracting…";
		const url = URL.createObjectURL(file);
		const color = await extractDominantColor(url);
		URL.revokeObjectURL(url);
		await clonePresetIfNeeded();
		workingAccent = color;
		accentPicker.value = color;
		accentHex.value = color;
		refreshPreview();
		imageStatus.textContent = `Extracted: ${color}`;
	});
	imageUrlBtn.addEventListener("click", async () => {
		const url = imageUrlInput.value.trim();
		if (!url) return;
		imageStatus.textContent = "Extracting…";
		imageUrlBtn.disabled = true;
		try {
			const color = await extractDominantColor(url);
			await clonePresetIfNeeded();
			workingAccent = color;
			accentPicker.value = color;
			accentHex.value = color;
			refreshPreview();
			imageStatus.textContent = `Extracted: ${color}`;
		} catch {
			imageStatus.textContent =
				"Failed to load image. Try downloading it first.";
		}
		imageUrlBtn.disabled = false;
	});

	saveBtn.addEventListener("click", async () => {
		if (currentId === "__default__") {
			await setActiveThemeId("default");
			applyKilnTheme(null);
		} else if (currentId.startsWith("__preset__:")) {
			const key = currentId.slice(11);
			await setActiveThemeId(key);
			applyKilnTheme(THEME_PRESETS[key]);
		} else {
			const name = workingName || "My Theme";
			const current = await _savedThemes.getValue();
			let themeId: string;
			if (isNew()) {
				themeId = crypto.randomUUID();
				current.push({
					id: themeId,
					name,
					accentColor: workingAccent,
					navbarColor: workingNavbar,
					fontFamily: workingFont !== "default" ? workingFont : undefined,
					customCss: workingCss || undefined,
					backgroundImage: workingBg || undefined,
					backgroundOverlayColor:
						workingOverlayOpacity > 0 ? workingOverlayColor : undefined,
					backgroundOverlayOpacity:
						workingOverlayOpacity > 0 ? workingOverlayOpacity : undefined,
					effects: workingEffects.length > 0 ? workingEffects : undefined,
					navbarIconColor: workingIconColor || undefined,
					cursorUrl: workingCursorSrc || undefined,
					cursorScale: workingCursorSrc ? workingCursorScale : undefined,
					colorTokens:
						Object.keys(workingColorTokens).length > 0
							? workingColorTokens
							: undefined,
					ambient: workingAmbient,
					cardStyle: workingCardStyle,
					pointerEffects: workingPointerEffects,
				});
			} else {
				themeId = currentId;
				const idx = current.findIndex((t) => t.id === themeId);
				if (idx >= 0)
					current[idx] = {
						...current[idx],
						name,
						accentColor: workingAccent,
						navbarColor: workingNavbar,
						fontFamily: workingFont !== "default" ? workingFont : undefined,
						customCss: workingCss || undefined,
						backgroundImage: workingBg || undefined,
						backgroundOverlayColor:
							workingOverlayOpacity > 0 ? workingOverlayColor : undefined,
						backgroundOverlayOpacity:
							workingOverlayOpacity > 0 ? workingOverlayOpacity : undefined,
						effects: workingEffects.length > 0 ? workingEffects : undefined,
						navbarIconColor: workingIconColor || undefined,
						cursorUrl: workingCursorSrc || undefined,
						cursorScale: workingCursorSrc ? workingCursorScale : undefined,
						colorTokens:
							Object.keys(workingColorTokens).length > 0
								? workingColorTokens
								: undefined,
						ambient: workingAmbient,
						cardStyle: workingCardStyle,
						pointerEffects: workingPointerEffects,
					};
			}
			await _savedThemes.setValue(current);
			await setActiveThemeId(themeId);
			applyKilnTheme({
				accentColor: workingAccent,
				navbarColor: workingNavbar,
				fontFamily: workingFont,
				customCss: workingCss,
				backgroundImage: workingBg,
				backgroundOverlayColor: workingOverlayColor,
				backgroundOverlayOpacity: workingOverlayOpacity,
				effects: workingEffects,
				navbarIconColor: workingIconColor || undefined,
				cursorUrl: workingCursor || undefined,
				cursorScale: workingCursorScale,
				colorTokens:
					Object.keys(workingColorTokens).length > 0
						? workingColorTokens
						: undefined,
				ambient: workingAmbient,
				cardStyle: workingCardStyle,
				pointerEffects: workingPointerEffects,
			});

			if (isNew()) {
				savedThemes = await _savedThemes.getValue();
				currentId = themeId;
				workingName = name;
				buildSelect();
				updateNameUI();
				refreshLeftActions();
			} else {
				savedThemes = await _savedThemes.getValue();
				buildSelect();
			}
		}

		const origHtml = saveBtn.innerHTML;
		saveBtn.innerHTML = '<i class="fas fa-check me-1"></i>Applied!';
		saveBtn.disabled = true;
		setTimeout(() => {
			saveBtn.innerHTML = origHtml;
			saveBtn.disabled = false;
		}, 1500);
	});

	sidebar
		.querySelector<HTMLButtonElement>("#kiln-te-close")!
		.addEventListener("click", closeSidebar);

	function showVerificationModal(): Promise<{
		userId: number;
		accessToken: string;
	} | null> {
		window.open("https://polytoria.com/my/settings/kiln?tab=sync", "_blank");
		publishStatus.innerHTML =
			'<span class="text-info"><i class="fas fa-external-link-alt me-1"></i>Connect your account in the opened tab, then try again.</span>';
		return Promise.resolve(null);
	}

	const selRefOverlay = sidebar.querySelector<HTMLElement>(
		"#kiln-te-selref-overlay",
	)!;
	const selRefBody = sidebar.querySelector<HTMLElement>(
		"#kiln-te-selref-body",
	)!;
	const selRefSearch = sidebar.querySelector<HTMLInputElement>(
		"#kiln-te-selref-search",
	)!;

	const publishRulesOverlay = sidebar.querySelector<HTMLElement>(
		"#kiln-te-publish-rules-overlay",
	)!;
	const publishRulesContinueBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-publish-rules-continue",
	)!;
	const publishRulesCancelBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-publish-rules-cancel",
	)!;

	function openSelectorRefOverlay() {
		selRefSearch.value = "";
		renderSelectorRef("");
		selRefOverlay.style.display = "flex";
		selRefSearch.focus();
	}
	function closeSelectorRefOverlay() {
		selRefOverlay.style.display = "none";
	}
	sidebar
		.querySelector("#kiln-te-selref-close")!
		.addEventListener("click", closeSelectorRefOverlay);
	selRefSearch.addEventListener("input", () =>
		renderSelectorRef(selRefSearch.value),
	);

	function renderSelectorRef(filter: string) {
		renderSelectorReference(selRefBody, filter);
	}

	function showImportFlow() {
		openImportOverlay();
	}

	const addEffectForm = sidebar.querySelector<HTMLElement>(
		"#kiln-te-add-effect-form",
	)!;
	const addEffectNewBtn = sidebar.querySelector<HTMLButtonElement>(
		"#kiln-te-effect-new",
	)!;
	const effectSlotSelect = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-effect-slot",
	)!;
	const effectTypeSelect = sidebar.querySelector<HTMLSelectElement>(
		"#kiln-te-effect-type",
	)!;
	const effectValueRow = sidebar.querySelector<HTMLElement>(
		"#kiln-te-effect-value-row",
	)!;

	for (const [key, slot] of Object.entries(EFFECT_SLOTS))
		effectSlotSelect.add(new Option(slot.label, key));

	function populateEffectTypes() {
		const slot = effectSlotSelect.value as keyof typeof EFFECT_SLOTS;
		const allowed = EFFECT_SLOTS[slot].types;
		effectTypeSelect.innerHTML = "";
		for (const t of allowed)
			effectTypeSelect.add(new Option(EFFECT_TYPE_CONFIGS[t].label, t));
		renderEffectValueInput();
	}

	function renderEffectValueInput() {
		renderEffectValueInputShared(
			effectValueRow,
			effectTypeSelect.value as EffectType,
			"kiln-te",
		);
	}

	function getEffectFormValue(): Promise<string | number | null> {
		return readEffectValue(
			effectValueRow,
			effectTypeSelect.value as EffectType,
			"kiln-te",
		);
	}

	function closeAddEffectForm() {
		addEffectForm.style.display = "none";
		addEffectNewBtn.style.display = "";
	}

	function openAddEffectForm() {
		effectSlotSelect.value = Object.keys(EFFECT_SLOTS)[0];
		populateEffectTypes();
		addEffectForm.style.display = "";
		addEffectNewBtn.style.display = "none";
	}

	addEffectNewBtn.addEventListener("click", openAddEffectForm);
	effectSlotSelect.addEventListener("change", populateEffectTypes);
	effectTypeSelect.addEventListener("change", renderEffectValueInput);

	sidebar
		.querySelector("#kiln-te-effect-cancel")!
		.addEventListener("click", closeAddEffectForm);

	sidebar
		.querySelector("#kiln-te-effect-confirm")!
		.addEventListener("click", async () => {
			const slot = effectSlotSelect.value as keyof typeof EFFECT_SLOTS;
			const type = effectTypeSelect.value as keyof typeof EFFECT_TYPE_CONFIGS;
			const value = await getEffectFormValue();
			if (value === null) return;
			if (type === "clicking-sound" && Number(value) <= 0) return;
			if (type === "background-music" && !parseAssetVolume(value)) return;
			await clonePresetIfNeeded();
			const existingIdx = workingEffects.findIndex(
				(e) => e.slot === slot && e.type === type,
			);
			const newEffect: ThemeEffect = {
				id:
					existingIdx >= 0
						? workingEffects[existingIdx].id
						: crypto.randomUUID(),
				slot,
				type,
				value,
			};
			if (existingIdx >= 0) workingEffects[existingIdx] = newEffect;
			else workingEffects.push(newEffect);
			renderEffectsList();
			refreshPreview();
			closeAddEffectForm();
		});

	for (const hdr of sidebar.querySelectorAll<HTMLElement>(
		".kiln-te-section-hdr",
	)) {
		hdr.addEventListener("click", () => {
			const body = document.getElementById(hdr.dataset.body!)!;
			const opening = body.style.display === "none";
			body.style.display = opening ? "" : "none";
			hdr.querySelector("i")!.className =
				`fas fa-chevron-${opening ? "up" : "down"}`;
			if (opening) {
				hdr.style.borderRadius = "";
				hdr.style.border = "";
			} else {
				hdr.style.borderRadius = "inherit";
				hdr.style.border = "none";
			}
		});
	}

	async function syncImportedThemes() {
		const targets = savedThemes.filter((t) => t.importedSlug && t.autoUpdate);
		if (targets.length === 0) return;
		const fetched = new Map<string, Extension.GetPublishedThemeApi["data"]>();
		for (const t of targets) {
			const result = await sendMessage("getPublishedTheme", t.importedSlug!);
			if (result.ok) fetched.set(t.id, result.data.data);
		}
		if (fetched.size === 0) return;

		const current = await _savedThemes.getValue();
		let changed = false;
		for (const [id, data] of fetched) {
			const idx = current.findIndex((x) => x.id === id);
			if (idx < 0) continue;
			const updatedEntry = { ...current[idx], ...publishedThemeFields(data) };
			if (JSON.stringify(updatedEntry) !== JSON.stringify(current[idx])) {
				current[idx] = updatedEntry;
				changed = true;
			}
		}
		if (!changed) return;
		await _savedThemes.setValue(current);
		savedThemes = await _savedThemes.getValue();
		buildSelect();
	}

	buildSelect();
	syncInputsToState();
	updateNameUI();
	refreshLeftActions();
	void applyScaledCursor();
	void syncImportedThemes();

	const savedState = loadTeState();
	if (savedState.isFloating) {
		toggleFloat();
		if (savedState.floatLeft !== undefined)
			sidebar.style.left = `${savedState.floatLeft}px`;
		if (savedState.floatTop !== undefined)
			sidebar.style.top = `${savedState.floatTop}px`;
		if (savedState.width !== undefined)
			sidebar.style.width = `${savedState.width}px`;
		if (savedState.height !== undefined)
			sidebar.style.height = `${savedState.height}px`;
	} else if (savedState.width !== undefined) {
		sidebar.style.width = `${savedState.width}px`;
		document.body.style.marginRight = `${savedState.width}px`;
	}
}
