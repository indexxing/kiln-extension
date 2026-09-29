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
import { escapeHtml, safeHttpUrl } from "@/utils/escapeHtml";
import { sendMessage } from "@/utils/messaging";
import {
	applyProfileExtras,
	clearProfileExtras,
	extrasFromTheme,
	MAX_NOTES,
	MAX_STICKERS,
	PROFILE_SECTIONS,
	type ProfileAmbientType,
	type ProfileCardStyle,
	type ProfileNote,
	type ProfilePointerEffects,
	type ProfileSticker,
	type ProfileThemeExtras,
	stickerAnchorLabel,
	stickerPlacementAt,
} from "@/utils/profileThemeExtras";
import type { SavedTheme } from "@/utils/storage";
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
} from "@/utils/theme";
import {
	confirmPublishRulesSeen,
	formatEffectValue,
	friendlyApiError,
	publishRulesModalBody,
	readEffectValue,
	renderEffectValueInput,
	renderSelectorReference,
} from "@/utils/themeEditorShared";
import type { EffectType, ThemeEffect } from "@/utils/types";
import { getApiSession } from "@/utils/utilities";
import { createVisualCssEditor } from "@/utils/visualCssEditor";
import {
	AMBIENT_TYPES,
	CARD_PRESET_OPACITY,
	NO_POINTER_EFFECTS_ATTR,
} from "@/utils/visualEffects";

const SIDEBAR_ID = "kiln-pte-sidebar";
const DEFAULT_ACCENT = "#3bafff";
const DEFAULT_NAVBAR = "#1a1a1a";

export type ProfileThemeValues = {
	accentColor: string;
	navbarColor: string;
	fontFamily?: string;
	customCss?: string;
	backgroundImage?: string;
	backgroundOverlayColor?: string;
	backgroundOverlayOpacity?: number;
	effects?: ThemeEffect[];
	navbarIconColor?: string;
	cursorUrl?: string;
	colorTokens?: Record<string, string>;
} & ProfileThemeExtras;

type ServerTheme = ProfileThemeValues & {
	enabled: number;
	approvalStatus: string;
};

type ServerThemeSource = NonNullable<Extension.ProfileThemeApi["data"]>;

function mapServerTheme(t: ServerThemeSource): ServerTheme {
	return {
		accentColor: t.accentColor,
		navbarColor: t.navbarColor,
		fontFamily: t.fontFamily ?? undefined,
		customCss: t.customCss ?? undefined,
		backgroundImage: t.backgroundImage ?? undefined,
		backgroundOverlayColor: t.backgroundOverlayColor ?? undefined,
		backgroundOverlayOpacity: t.backgroundOverlayOpacity ?? undefined,
		effects: t.effects ?? undefined,
		navbarIconColor: t.navbarIconColor ?? undefined,
		cursorUrl: t.cursorUrl ?? undefined,
		colorTokens: t.colorTokens ?? undefined,
		...extrasFromTheme(t),
		enabled: t.enabled,
		approvalStatus: t.approvalStatus,
	};
}

let openPromise: Promise<void> | null = null;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

const CARD_STYLE_PRESETS = ["solid", "glass", "outline", "gradient"];
const CARD_STYLE_HOVER = ["none", "lift", "glow", "tilt"];
const POINTER_CLICK_OPTIONS = ["sparkles", "hearts", "ripples", "confetti"];
const POINTER_TRAIL_OPTIONS = ["sparkles", "dots", "hearts", "glow"];
const AMBIENT_TYPE_KEYS = AMBIENT_TYPES.map((t) => t.key) as string[];

function sanitizeImportedExtras(data: Record<string, any>): ProfileThemeExtras {
	const isObject = (v: unknown): v is Record<string, any> =>
		!!v && typeof v === "object" && !Array.isArray(v);

	const usernameStyle =
		isObject(data.usernameStyle) &&
		(data.usernameStyle.mode === "solid" ||
			data.usernameStyle.mode === "gradient") &&
		isValidHex(data.usernameStyle.color1)
			? {
					mode: data.usernameStyle.mode as "solid" | "gradient",
					color1: data.usernameStyle.color1 as string,
					color2: isValidHex(data.usernameStyle.color2)
						? (data.usernameStyle.color2 as string)
						: undefined,
					animated: data.usernameStyle.animated === true,
					glowColor: isValidHex(data.usernameStyle.glowColor)
						? (data.usernameStyle.glowColor as string)
						: undefined,
					glowSize:
						typeof data.usernameStyle.glowSize === "number"
							? clamp(data.usernameStyle.glowSize, 0, 24)
							: undefined,
					fontFamily:
						typeof data.usernameStyle.fontFamily === "string" &&
						data.usernameStyle.fontFamily in FONTS
							? (data.usernameStyle.fontFamily as string)
							: undefined,
				}
			: undefined;

	const banner =
		isObject(data.banner) &&
		typeof data.banner.url === "string" &&
		POLYTORIA_CDN_URL.test(data.banner.url)
			? {
					url: data.banner.url as string,
					height: clamp(
						typeof data.banner.height === "number" ? data.banner.height : 180,
						80,
						400,
					),
					position: (["top", "center", "bottom"].includes(data.banner.position)
						? data.banner.position
						: "center") as "top" | "center" | "bottom",
				}
			: undefined;

	const ambient =
		isObject(data.ambient) && AMBIENT_TYPE_KEYS.includes(data.ambient.type)
			? {
					type: data.ambient.type as ProfileAmbientType,
					density: clamp(
						typeof data.ambient.density === "number"
							? data.ambient.density
							: 30,
						1,
						100,
					),
					color: isValidHex(data.ambient.color)
						? (data.ambient.color as string)
						: undefined,
				}
			: undefined;

	const cardStyle: ProfileCardStyle | undefined =
		isObject(data.cardStyle) &&
		CARD_STYLE_PRESETS.includes(data.cardStyle.preset)
			? {
					preset: data.cardStyle.preset,
					tint: isValidHex(data.cardStyle.tint)
						? data.cardStyle.tint
						: undefined,
					opacity:
						typeof data.cardStyle.opacity === "number"
							? clamp(data.cardStyle.opacity, 0, 100)
							: undefined,
					radius:
						typeof data.cardStyle.radius === "number"
							? clamp(data.cardStyle.radius, 0, 32)
							: undefined,
					hover: CARD_STYLE_HOVER.includes(data.cardStyle.hover)
						? data.cardStyle.hover
						: undefined,
					liquidGlass: data.cardStyle.liquidGlass === true || undefined,
				}
			: undefined;

	const avatarBackdrop: ProfileThemeExtras["avatarBackdrop"] = isObject(
		data.avatarBackdrop,
	)
		? data.avatarBackdrop.type === "gradient" &&
			isValidHex(data.avatarBackdrop.color1) &&
			isValidHex(data.avatarBackdrop.color2)
			? {
					type: "gradient",
					color1: data.avatarBackdrop.color1,
					color2: data.avatarBackdrop.color2,
					angle: clamp(
						typeof data.avatarBackdrop.angle === "number"
							? data.avatarBackdrop.angle
							: 135,
						0,
						360,
					),
					opacity:
						typeof data.avatarBackdrop.opacity === "number"
							? clamp(data.avatarBackdrop.opacity, 0, 100)
							: undefined,
				}
			: data.avatarBackdrop.type === "image" &&
					typeof data.avatarBackdrop.url === "string" &&
					POLYTORIA_CDN_URL.test(data.avatarBackdrop.url)
				? {
						type: "image",
						url: data.avatarBackdrop.url,
						fit: data.avatarBackdrop.fit === "contain" ? "contain" : "cover",
						opacity:
							typeof data.avatarBackdrop.opacity === "number"
								? clamp(data.avatarBackdrop.opacity, 0, 100)
								: undefined,
					}
				: undefined
		: undefined;

	const pointerEffects: ProfilePointerEffects | undefined = isObject(
		data.pointerEffects,
	)
		? {
				click: POINTER_CLICK_OPTIONS.includes(data.pointerEffects.click)
					? data.pointerEffects.click
					: undefined,
				trail: POINTER_TRAIL_OPTIONS.includes(data.pointerEffects.trail)
					? data.pointerEffects.trail
					: undefined,
				color: isValidHex(data.pointerEffects.color)
					? data.pointerEffects.color
					: undefined,
			}
		: undefined;

	return {
		layout:
			isObject(data.layout) &&
			Array.isArray(data.layout.order) &&
			Array.isArray(data.layout.hidden)
				? {
						order: data.layout.order.filter(
							(x: unknown) => typeof x === "string",
						),
						hidden: data.layout.hidden.filter(
							(x: unknown) => typeof x === "string",
						),
					}
				: undefined,
		usernameStyle,
		banner,
		ambient,
		stickers: Array.isArray(data.stickers)
			? (data.stickers as Record<string, any>[])
					.filter((s) => isObject(s) && POLYTORIA_CDN_URL.test(s.url))
					.slice(0, MAX_STICKERS)
					.map(
						(s): ProfileSticker => ({
							id: typeof s.id === "string" && s.id ? s.id : crypto.randomUUID(),
							url: s.url,
							anchor: /^[a-z-]{1,32}$/.test(s.anchor) ? s.anchor : "page",
							x: typeof s.x === "number" ? s.x : 50,
							y: typeof s.y === "number" ? s.y : 50,
							size: clamp(typeof s.size === "number" ? s.size : 64, 16, 400),
							rotation:
								typeof s.rotation === "number"
									? clamp(s.rotation, -180, 180)
									: 0,
							layer: s.layer === "back" ? "back" : "front",
						}),
					)
			: undefined,
		notes: Array.isArray(data.notes)
			? (data.notes as ProfileNote[])
					.filter(
						(n) => isObject(n) && typeof n.text === "string" && n.text.trim(),
					)
					.slice(0, MAX_NOTES)
					.map((n) => ({
						id: typeof n.id === "string" && n.id ? n.id : crypto.randomUUID(),
						text: n.text.slice(0, 300),
						anchor: /^[a-z-]{1,32}$/.test(n.anchor) ? n.anchor : "page",
						x: typeof n.x === "number" ? n.x : 50,
						y: typeof n.y === "number" ? n.y : 50,
						size: clamp(typeof n.size === "number" ? n.size : 16, 10, 40),
						rotation:
							typeof n.rotation === "number" ? clamp(n.rotation, -180, 180) : 0,
						color: isValidHex(n.color) ? n.color : "#1a1a1a",
						background: isValidHex(n.background) ? n.background : "#fff9c4",
						layer: n.layer === "back" ? "back" : "front",
					}))
			: undefined,
		cardStyle,
		avatarBackdrop,
		pointerEffects,
	};
}

function sanitizeImportedEffects(data: unknown): ThemeEffect[] | undefined {
	if (!Array.isArray(data)) return undefined;
	const result: ThemeEffect[] = [];
	for (const raw of data) {
		if (!raw || typeof raw !== "object") continue;
		const r = raw as Record<string, unknown>;
		if (typeof r.slot !== "string" || !(r.slot in EFFECT_SLOTS)) continue;
		const slotConfig = EFFECT_SLOTS[r.slot as keyof typeof EFFECT_SLOTS];
		if (
			typeof r.type !== "string" ||
			!(slotConfig.types as string[]).includes(r.type)
		)
			continue;
		const config = EFFECT_TYPE_CONFIGS[r.type as EffectType];
		let value: string | number;
		switch (config.input.kind) {
			case "slider":
			case "number": {
				const n = Number(r.value);
				if (!Number.isFinite(n)) continue;
				value = clamp(n, config.input.min, config.input.max);
				break;
			}
			case "select": {
				const options = config.input.options.map((o) => o.value);
				value =
					typeof r.value === "string" && options.includes(r.value)
						? r.value
						: config.input.default;
				break;
			}
			case "color":
				value =
					typeof r.value === "string" && isValidHex(r.value)
						? r.value
						: config.input.default;
				break;
			case "color-alpha":
				value =
					typeof r.value === "string" &&
					/^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\))$/.test(r.value)
						? r.value
						: config.input.default;
				break;
			case "url":
				value = safeHttpUrl(r.value) || config.input.default;
				break;
			case "audio-volume":
				value = typeof r.value === "string" ? r.value : config.input.default;
				break;
			default:
				continue;
		}
		result.push({
			id: typeof r.id === "string" && r.id ? r.id : crypto.randomUUID(),
			slot: r.slot as ThemeEffect["slot"],
			type: r.type as EffectType,
			value,
		});
	}
	return result.length > 0 ? result : undefined;
}

export function openProfileThemeEditor(options: {
	userId: number;
	onRestore: () => void | Promise<void>;
	onPreview?: () => void;
}): Promise<void> {
	if (document.getElementById(SIDEBAR_ID)) return Promise.resolve();
	if (openPromise) return openPromise;
	openPromise = doOpenProfileThemeEditor(options).finally(() => {
		openPromise = null;
	});
	return openPromise;
}

async function doOpenProfileThemeEditor({
	userId,
	onRestore,
	onPreview,
}: {
	userId: number;
	onRestore: () => void | Promise<void>;
	onPreview?: () => void;
}): Promise<void> {
	const session = await getApiSession(userId);
	let verified = session?.state === "verified";

	let serverTheme: ServerTheme | null = null;
	let themeLoadFailed = false;
	if (verified) {
		const result = await sendMessage("getMyProfileTheme", userId);
		if (result.ok) {
			if (result.data.data) serverTheme = mapServerTheme(result.data.data);
		} else {
			themeLoadFailed = true;
		}
	}

	let workingAccent = serverTheme?.accentColor ?? DEFAULT_ACCENT;
	let workingNavbar = serverTheme?.navbarColor ?? DEFAULT_NAVBAR;
	let workingFont = serverTheme?.fontFamily ?? "default";
	let workingCss = serverTheme?.customCss ?? "";
	let workingBg = serverTheme?.backgroundImage ?? "";
	let workingOverlayColor = serverTheme?.backgroundOverlayColor ?? "#000000";
	let workingOverlayOpacity = serverTheme?.backgroundOverlayOpacity ?? 0;
	let workingEffects: ThemeEffect[] = serverTheme?.effects
		? [...serverTheme.effects]
		: [];
	let workingIconColor = serverTheme?.navbarIconColor ?? "";
	let workingCursor = serverTheme?.cursorUrl ?? "";
	let workingCursorSrc = "";
	let workingCursorScale = 32;
	let workingColorTokens: Record<string, string> = serverTheme?.colorTokens
		? { ...serverTheme.colorTokens }
		: {};

	let workingExtras: ProfileThemeExtras = serverTheme
		? structuredClone(extrasFromTheme(serverTheme))
		: {};

	function currentValues(): ProfileThemeValues {
		return {
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
			cursorUrl: workingCursor || undefined,
			colorTokens:
				Object.keys(workingColorTokens).length > 0
					? workingColorTokens
					: undefined,
			...extrasFromTheme(workingExtras),
		};
	}

	function getTokenDerivedValue(key: string): string {
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
			default:
				return workingAccent;
		}
	}

	const styleEl = document.createElement("style");
	styleEl.textContent = `
		#${SIDEBAR_ID} {
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
		#kiln-pte-content {
			flex: 1;
			overflow-y: auto;
			padding: 14px 14px 8px;
		}
		#kiln-pte-footer {
			flex-shrink: 0;
			padding: 12px 14px;
			border-top: 1px solid rgba(128,128,128,0.15);
		}
		#${SIDEBAR_ID} .kiln-te-color-picker {
			width: 34px;
			height: 28px;
			padding: 0;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			background: none;
			flex-shrink: 0;
		}
		#${SIDEBAR_ID} .kiln-te-hex-input {
			flex: 1;
			min-width: 0;
		}
		#kiln-pte-status:empty {
			display: none;
		}
		#kiln-pte-resize {
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			width: 6px;
			cursor: ew-resize;
			z-index: 1;
			transition: background 0.15s;
		}
		#kiln-pte-resize:hover, #kiln-pte-resize.kiln-pte-dragging {
			background: rgba(128,128,128,0.2);
		}
		.kiln-pte-fields-disabled {
			opacity: 0.5;
		}
		#${SIDEBAR_ID}.kiln-pte-floating {
			right: auto;
			bottom: auto;
			border-radius: 10px;
			box-shadow: 0 12px 48px rgba(0,0,0,0.8);
		}
		#${SIDEBAR_ID}.kiln-pte-floating #kiln-pte-header {
			cursor: move;
		}
	`;
	document.head.appendChild(styleEl);

	const sidebar = document.createElement("div");
	sidebar.id = SIDEBAR_ID;
	sidebar.setAttribute(NO_POINTER_EFFECTS_ATTR, "");
	sidebar.innerHTML = `
		<div id="kiln-pte-resize"></div>
		<div id="kiln-pte-content">
			<div id="kiln-pte-header" class="d-flex justify-content-between align-items-center mb-2">
				<div class="d-flex align-items-center gap-2">
					<span class="fw-bold" style="font-size:1rem;">Profile Theme</span>
				</div>
				<div class="d-flex align-items-center gap-1">
					<button id="kiln-pte-float-btn" title="Float as window"
					        style="background:rgba(128,128,128,0.15);border:1px solid rgba(128,128,128,0.3);border-radius:6px;padding:2px 8px;cursor:pointer;font-size:0.75rem;line-height:1.4;color:inherit;">
						<i class="fas fa-expand"></i>
					</button>
					<button id="kiln-pte-close" aria-label="Close"
					        style="background:rgba(128,128,128,0.15);border:1px solid rgba(128,128,128,0.3);border-radius:6px;padding:2px 8px;cursor:pointer;font-size:1rem;line-height:1.4;color:inherit;">✕</button>
				</div>
			</div>

			<p class="small text-muted mb-2">Design how your profile looks to everyone else using Kiln.</p>

			<span id="kiln-pte-state-badge" class="badge mb-2 w-100"></span>
			<div id="kiln-pte-verify-notice" class="alert alert-warning py-2 px-2 small mb-2" style="display:none;">
				<i class="fas fa-link me-1"></i>
				Connect your Kiln account to publish a profile theme.
				<a href="https://polytoria.com/my/settings/kiln?tab=sync" target="_blank" class="d-block mt-1">Connect account</a>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;" data-body="kiln-pte-colors-body">
					<span>Colors</span><i class="fas fa-chevron-up"></i>
				</div>
				<div class="card-body" id="kiln-pte-colors-body">
					<div class="row g-2 mb-2">
						<div class="col-6">
							<label class="form-label small text-muted mb-1">Accent Color</label>
							<div class="d-flex align-items-center gap-2">
								<input type="color" id="kiln-pte-accent-picker" class="kiln-te-color-picker" />
								<input type="text" id="kiln-pte-accent-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" />
							</div>
						</div>
						<div class="col-6">
							<label class="form-label small text-muted mb-1">Bg / Navbar</label>
							<div class="d-flex align-items-center gap-2">
								<input type="color" id="kiln-pte-navbar-picker" class="kiln-te-color-picker" />
								<input type="text" id="kiln-pte-navbar-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" />
							</div>
						</div>
					</div>
					<div class="mb-2">
						<label class="form-label small text-muted mb-1">Extract Accent from Image</label>
						<div class="d-flex gap-1 flex-wrap align-items-center">
							<label class="btn btn-outline-secondary btn-sm mb-0" style="cursor:pointer;">
								<i class="fas fa-image me-1"></i>File
								<input type="file" id="kiln-pte-image" accept="image/*" style="display:none;" />
							</label>
							<input type="text" id="kiln-pte-image-url" class="form-control form-control-sm flex-fill"
							       placeholder="…or image URL" style="min-width:0;" />
							<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-pte-image-url-btn">Extract</button>
						</div>
						<div id="kiln-pte-image-status" class="small text-muted mt-1" style="min-height:1.1em;"></div>
					</div>
					<div>
						<label class="form-label small text-muted mb-1">Background Image</label>
						<div class="d-flex gap-1 align-items-center">
							<input type="text" id="kiln-pte-bg-id" class="form-control form-control-sm flex-fill"
							       placeholder="Decal ID or store link…" style="min-width:0;" />
							<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-pte-bg-set">Set</button>
							<button class="btn btn-outline-danger btn-sm flex-shrink-0" id="kiln-pte-bg-clear" style="display:none;">Clear</button>
						</div>
						<div id="kiln-pte-bg-status" class="small text-muted mt-1" style="min-height:1.1em;"></div>
						<div id="kiln-pte-bg-overlay-row" class="mt-2" style="display:none;">
							<label class="form-label small text-muted mb-1">Overlay</label>
							<div class="d-flex align-items-center gap-2">
								<input type="color" id="kiln-pte-bg-overlay-color" class="kiln-te-color-picker" />
								<input type="range" id="kiln-pte-bg-overlay-opacity" min="0" max="100" step="1" class="flex-fill" style="min-width:0;" />
								<span id="kiln-pte-bg-overlay-label" class="small text-muted" style="min-width:2.5em;text-align:right;">0%</span>
							</div>
						</div>
					</div>
					<div class="mt-2">
						<label class="form-label small text-muted mb-1">Custom Cursor</label>
						<div class="d-flex gap-1 align-items-center">
							<input type="text" id="kiln-pte-cursor-id" class="form-control form-control-sm flex-fill"
							       placeholder="Decal ID or store link…" style="min-width:0;" />
							<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-pte-cursor-set">Set</button>
							<button class="btn btn-outline-danger btn-sm flex-shrink-0" id="kiln-pte-cursor-clear" style="display:none;">Clear</button>
						</div>
						<div id="kiln-pte-cursor-status" class="small text-muted mt-1" style="min-height:1.1em;"></div>
						<div id="kiln-pte-cursor-scale-row" class="d-flex align-items-center gap-2 mt-1" style="display:none;">
							<span class="small text-muted" style="min-width:3.2em;">Size</span>
							<input type="range" id="kiln-pte-cursor-scale" min="16" max="128" step="4" value="32" class="flex-fill" style="min-width:0;" />
							<span id="kiln-pte-cursor-scale-label" class="small text-muted" style="min-width:3em;text-align:right;">32px</span>
						</div>
					</div>
					<div class="mt-2">
						<div class="d-flex align-items-center mb-1">
							<label class="form-label small text-muted mb-0 flex-fill">Icon Color</label>
							<div class="form-check mb-0">
								<input type="checkbox" id="kiln-pte-icon-auto" class="form-check-input" checked />
								<label for="kiln-pte-icon-auto" class="form-check-label small text-muted">Auto</label>
							</div>
						</div>
						<div id="kiln-pte-icon-color-row" class="d-flex align-items-center gap-2" style="display:none!important;">
							<input type="color" id="kiln-pte-icon-picker" class="kiln-te-color-picker" />
							<input type="text" id="kiln-pte-icon-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" />
						</div>
					</div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-tokens-body">
					<span>Color Tokens</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-tokens-body" style="display:none;">
					<p class="small text-muted mb-2">Override specific derived colors. Default values are automatically derived from your accent and navbar values.</p>
					${Object.entries(COLOR_TOKENS)
						.map(
							([key, token]) => `
					<div class="mb-2">
						<label class="form-label small text-muted mb-1">${token.label}</label>
						<div class="d-flex align-items-center gap-2">
							<input type="color" id="kiln-pte-token-${key}-picker" class="kiln-te-color-picker" />
							<input type="text" id="kiln-pte-token-${key}-hex" class="form-control form-control-sm kiln-te-hex-input" maxlength="7" />
							<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-pte-token-${key}-clear" title="Reset to auto" style="display:none;padding:2px 6px;font-size:0.7rem;">Auto</button>
						</div>
					</div>`,
						)
						.join("")}
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-font-body">
					<span>Typography</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-font-body" style="display:none;">
					<label class="form-label small text-muted mb-1">Font</label>
					<select id="kiln-pte-font" class="form-select form-select-sm">
						${Object.entries(FONTS)
							.map(([key, f]) => `<option value="${key}">${f.name}</option>`)
							.join("")}
					</select>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-username-body">
					<span>Username</span>
					<div class="d-flex align-items-center gap-2">
						<div class="form-check form-switch mb-0">
							<input type="checkbox" id="kiln-pte-un-enabled" class="form-check-input" aria-label="Style my username" />
						</div>
						<i class="fas fa-chevron-down"></i>
					</div>
				</div>
				<div class="card-body" id="kiln-pte-username-body" style="display:none;">
					<div id="kiln-pte-un-fields">
						<div class="row g-2 mb-2">
							<div class="col-6">
								<label class="form-label small text-muted mb-1">Fill</label>
								<select id="kiln-pte-un-mode" class="form-select form-select-sm">
									<option value="solid">Solid</option>
									<option value="gradient">Gradient</option>
								</select>
							</div>
							<div class="col-6">
								<label class="form-label small text-muted mb-1">Colors</label>
								<div class="d-flex align-items-center gap-2">
									<input type="color" id="kiln-pte-un-color1" class="kiln-te-color-picker" />
									<input type="color" id="kiln-pte-un-color2" class="kiln-te-color-picker" />
								</div>
							</div>
						</div>
						<div class="form-check mb-2" id="kiln-pte-un-animated-row">
							<input type="checkbox" id="kiln-pte-un-animated" class="form-check-input" />
							<label for="kiln-pte-un-animated" class="form-check-label small text-muted">Animated shimmer</label>
						</div>
						<label class="form-label small text-muted mb-1">Glow</label>
						<div class="d-flex align-items-center gap-2 mb-2">
							<input type="color" id="kiln-pte-un-glow-color" class="kiln-te-color-picker" />
							<input type="range" id="kiln-pte-un-glow-size" min="0" max="24" step="1" class="flex-fill" style="min-width:0;" />
							<span id="kiln-pte-un-glow-label" class="small text-muted" style="min-width:2.5em;text-align:right;">Off</span>
						</div>
						<label class="form-label small text-muted mb-1">Font</label>
						<select id="kiln-pte-un-font" class="form-select form-select-sm">
							${Object.entries(FONTS)
								.map(([key, f]) => `<option value="${key}">${f.name}</option>`)
								.join("")}
						</select>
					</div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-banner-body">
					<span>Banner</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-banner-body" style="display:none;">
					<label class="form-label small text-muted mb-1">Polytoria Decal</label>
					<div class="d-flex gap-1 align-items-center">
						<input type="text" id="kiln-pte-banner-id" class="form-control form-control-sm flex-fill"
						       placeholder="Decal ID or store link…" style="min-width:0;" />
						<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-pte-banner-set">Use</button>
						<button class="btn btn-outline-danger btn-sm flex-shrink-0" id="kiln-pte-banner-clear" style="display:none;">Remove</button>
					</div>
					<div id="kiln-pte-banner-status" class="small text-muted mt-1" style="min-height:1.1em;"></div>
					<div id="kiln-pte-banner-fields" class="mt-1">
						<label class="form-label small text-muted mb-1">Height</label>
						<div class="d-flex align-items-center gap-2 mb-2">
							<input type="range" id="kiln-pte-banner-height" min="80" max="360" step="10" class="flex-fill" style="min-width:0;" />
							<span id="kiln-pte-banner-height-label" class="small text-muted" style="min-width:3em;text-align:right;"></span>
						</div>
						<label class="form-label small text-muted mb-1">Focus</label>
						<select id="kiln-pte-banner-position" class="form-select form-select-sm">
							<option value="top">Top</option>
							<option value="center">Center</option>
							<option value="bottom">Bottom</option>
						</select>
					</div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-stickers-body">
					<span>Stickers</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-stickers-body" style="display:none;">
					<p class="small text-muted mb-2">Add Polytoria decals as stickers, then drag them around on your profile to place them. Up to ${MAX_STICKERS}.</p>
					<div class="d-flex gap-1 align-items-center">
						<input type="text" id="kiln-pte-sticker-id" class="form-control form-control-sm flex-fill"
						       placeholder="Decal ID or store link…" style="min-width:0;" />
						<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-pte-sticker-add"><i class="fas fa-plus me-1"></i>Add</button>
					</div>
					<div id="kiln-pte-sticker-status" class="small text-muted mt-1 mb-2" style="min-height:1.1em;"></div>
					<div id="kiln-pte-sticker-list"></div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-notes-body">
					<span>Notes</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-notes-body" style="display:none;">
					<p class="small text-muted mb-2">Sticky notes of your own text, dragged anywhere on your profile. Up to ${MAX_NOTES}.</p>
					<div class="d-flex gap-1 align-items-center">
						<input type="text" id="kiln-pte-note-text" class="form-control form-control-sm flex-fill"
						       placeholder="Write something…" maxlength="300" style="min-width:0;" />
						<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-pte-note-add"><i class="fas fa-plus me-1"></i>Add</button>
					</div>
					<div id="kiln-pte-note-status" class="small text-muted mt-1 mb-2" style="min-height:1.1em;"></div>
					<div id="kiln-pte-note-list"></div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-ambient-body">
					<span>Ambient Effects</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-ambient-body" style="display:none;">
					<div class="row g-2 mb-2">
						<div class="col-6">
							<label class="form-label small text-muted mb-1">Effect</label>
							<select id="kiln-pte-ambient-type" class="form-select form-select-sm">
								<option value="">None</option>
								${AMBIENT_TYPES.map((t) => `<option value="${t.key}">${t.label}</option>`).join("")}
							</select>
						</div>
						<div class="col-6">
							<label class="form-label small text-muted mb-1">Density</label>
							<select id="kiln-pte-ambient-density" class="form-select form-select-sm">
								<option value="1">Light</option>
								<option value="2">Medium</option>
								<option value="3">Heavy</option>
							</select>
						</div>
					</div>
					<div class="d-flex align-items-center gap-2">
						<input type="color" id="kiln-pte-ambient-color" class="kiln-te-color-picker" />
						<div class="form-check mb-0">
							<input type="checkbox" id="kiln-pte-ambient-color-auto" class="form-check-input" />
							<label for="kiln-pte-ambient-color-auto" class="form-check-label small text-muted">Default color</label>
						</div>
					</div>
					<div class="small text-muted mt-2">Skipped for visitors whose system asks for reduced motion.</div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-cards-body">
					<span>Cards</span>
					<div class="d-flex align-items-center gap-2">
						<div class="form-check form-switch mb-0">
							<input type="checkbox" id="kiln-pte-cards-enabled" class="form-check-input" aria-label="Restyle my profile's cards" />
						</div>
						<i class="fas fa-chevron-down"></i>
					</div>
				</div>
				<div class="card-body" id="kiln-pte-cards-body" style="display:none;">
					<div id="kiln-pte-cards-fields">
						<div class="row g-2 mb-2">
							<div class="col-6">
								<label class="form-label small text-muted mb-1">Style</label>
								<select id="kiln-pte-cards-preset" class="form-select form-select-sm">
									<option value="solid">Solid</option>
									<option value="glass">Glass</option>
									<option value="outline">Outline</option>
									<option value="gradient">Gradient</option>
								</select>
							</div>
							<div class="col-6">
								<label class="form-label small text-muted mb-1">On Hover</label>
								<select id="kiln-pte-cards-hover" class="form-select form-select-sm">
									<option value="none">Nothing</option>
									<option value="lift">Lift</option>
									<option value="glow">Glow</option>
									<option value="tilt">Tilt</option>
								</select>
							</div>
						</div>
						<div class="form-check form-switch mb-2" id="kiln-pte-cards-liquid-row" style="display:none;">
							<input type="checkbox" id="kiln-pte-cards-liquid" class="form-check-input" />
							<label for="kiln-pte-cards-liquid" class="form-check-label small">
								Fancy liquid glass <span class="text-muted">(Chrome only)</span>
							</label>
						</div>
						<label class="form-label small text-muted mb-1">Tint</label>
						<div class="d-flex align-items-center gap-2 mb-2">
							<input type="color" id="kiln-pte-cards-tint" class="kiln-te-color-picker" />
							<div class="form-check mb-0">
								<input type="checkbox" id="kiln-pte-cards-tint-auto" class="form-check-input" />
								<label for="kiln-pte-cards-tint-auto" class="form-check-label small text-muted">Use theme colors</label>
							</div>
						</div>
						<label class="form-label small text-muted mb-1">Opacity</label>
						<div class="d-flex align-items-center gap-2 mb-2">
							<input type="range" id="kiln-pte-cards-opacity" min="0" max="100" step="1" class="flex-fill" style="min-width:0;" />
							<span id="kiln-pte-cards-opacity-label" class="small text-muted" style="min-width:2.5em;text-align:right;"></span>
						</div>
						<label class="form-label small text-muted mb-1">Corner Roundness</label>
						<div class="d-flex align-items-center gap-2">
							<input type="range" id="kiln-pte-cards-radius" min="0" max="32" step="1" class="flex-fill" style="min-width:0;" />
							<span id="kiln-pte-cards-radius-label" class="small text-muted" style="min-width:2.5em;text-align:right;"></span>
						</div>
					</div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-backdrop-body">
					<span>Avatar Backdrop</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-backdrop-body" style="display:none;">
					<label class="form-label small text-muted mb-1">Backdrop</label>
					<select id="kiln-pte-backdrop-type" class="form-select form-select-sm mb-2">
						<option value="">None</option>
						<option value="gradient">Gradient</option>
						<option value="image">Polytoria Decal</option>
					</select>
					<div id="kiln-pte-backdrop-gradient">
						<div class="d-flex align-items-center gap-2 mb-2">
							<input type="color" id="kiln-pte-backdrop-color1" class="kiln-te-color-picker" />
							<input type="color" id="kiln-pte-backdrop-color2" class="kiln-te-color-picker" />
							<input type="range" id="kiln-pte-backdrop-angle" min="0" max="360" step="5" class="flex-fill" style="min-width:0;" />
							<span id="kiln-pte-backdrop-angle-label" class="small text-muted" style="min-width:2.5em;text-align:right;"></span>
						</div>
					</div>
					<div id="kiln-pte-backdrop-image">
						<div class="d-flex gap-1 align-items-center">
							<input type="text" id="kiln-pte-backdrop-id" class="form-control form-control-sm flex-fill"
							       placeholder="Decal ID or store link…" style="min-width:0;" />
							<button class="btn btn-outline-secondary btn-sm flex-shrink-0" id="kiln-pte-backdrop-set">Use</button>
						</div>
						<div id="kiln-pte-backdrop-status" class="small text-muted mt-1" style="min-height:1.1em;"></div>
						<select id="kiln-pte-backdrop-fit" class="form-select form-select-sm mt-1">
							<option value="cover">Fill the frame</option>
							<option value="contain">Fit inside the frame</option>
						</select>
					</div>
					<div id="kiln-pte-backdrop-opacity-row" class="mt-2" style="display:none;">
						<label class="form-label small text-muted mb-1">Opacity</label>
						<div class="d-flex align-items-center gap-2">
							<input type="range" id="kiln-pte-backdrop-opacity" min="0" max="100" step="1" class="flex-fill" style="min-width:0;" />
							<span id="kiln-pte-backdrop-opacity-label" class="small text-muted" style="min-width:2.5em;text-align:right;"></span>
						</div>
					</div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-pointer-body">
					<span>Click &amp; Cursor Effects</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-pointer-body" style="display:none;">
					<div class="row g-2 mb-2">
						<div class="col-6">
							<label class="form-label small text-muted mb-1">On Click</label>
							<select id="kiln-pte-pointer-click" class="form-select form-select-sm">
								<option value="">Nothing</option>
								<option value="sparkles">Sparkles</option>
								<option value="hearts">Hearts</option>
								<option value="ripples">Ripples</option>
								<option value="confetti">Confetti</option>
							</select>
						</div>
						<div class="col-6">
							<label class="form-label small text-muted mb-1">Cursor Trail</label>
							<select id="kiln-pte-pointer-trail" class="form-select form-select-sm">
								<option value="">None</option>
								<option value="sparkles">Sparkles</option>
								<option value="dots">Dots</option>
								<option value="hearts">Hearts</option>
								<option value="glow">Glow</option>
							</select>
						</div>
					</div>
					<div class="d-flex align-items-center gap-2">
						<input type="color" id="kiln-pte-pointer-color" class="kiln-te-color-picker" />
						<div class="form-check mb-0">
							<input type="checkbox" id="kiln-pte-pointer-color-auto" class="form-check-input" />
							<label for="kiln-pte-pointer-color-auto" class="form-check-label small text-muted">Use accent color</label>
						</div>
					</div>
					<div class="small text-muted mt-2">Skipped for visitors whose system asks for reduced motion.</div>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-layout-body">
					<span>Profile Layout</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-layout-body" style="display:none;">
					<p class="small text-muted mb-2">Reorder or hide the sections of your profile. Sections stay in their own column.</p>
					<div class="small fw-semibold mb-1">Left Column</div>
					<div id="kiln-pte-layout-left" class="mb-2"></div>
					<div class="small fw-semibold mb-1">Right Column</div>
					<div id="kiln-pte-layout-right" class="mb-2"></div>
					<button class="btn btn-sm btn-outline-secondary w-100" id="kiln-pte-layout-reset">
						<i class="fas fa-rotate-left me-1"></i>Reset Layout
					</button>
				</div>
			</div>

			<div class="card mb-2">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-effects-body">
					<span>Effects</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-effects-body" style="display:none;">
					<div id="kiln-pte-effects-list"></div>
					<div id="kiln-pte-add-effect-form" style="display:none;">
						<div class="row g-2 mb-2">
							<div class="col-6">
								<label class="form-label small text-muted mb-1">Slot</label>
								<select id="kiln-pte-effect-slot" class="form-select form-select-sm"></select>
							</div>
							<div class="col-6">
								<label class="form-label small text-muted mb-1">Property</label>
								<select id="kiln-pte-effect-type" class="form-select form-select-sm"></select>
							</div>
						</div>
						<div id="kiln-pte-effect-value-row" class="mb-2"></div>
						<div class="d-flex gap-2">
							<button class="btn btn-sm btn-secondary flex-fill" id="kiln-pte-effect-cancel">Cancel</button>
							<button class="btn btn-sm btn-primary flex-fill" id="kiln-pte-effect-confirm">Add</button>
						</div>
					</div>
					<button class="btn btn-sm btn-outline-secondary w-100" id="kiln-pte-effect-new">
						<i class="fas fa-plus me-1"></i>Add Effect
					</button>
				</div>
			</div>

			<div class="card mb-0">
				<div class="card-header fw-semibold d-flex justify-content-between align-items-center kiln-pte-section-hdr" style="cursor:pointer;border-radius:inherit;border:none;" data-body="kiln-pte-css-body">
					<span>Custom CSS</span><i class="fas fa-chevron-down"></i>
				</div>
				<div class="card-body" id="kiln-pte-css-body" style="display:none;">
					<div id="kiln-pte-vce-mount" class="mb-2"></div>
					<textarea id="kiln-pte-custom-css" class="form-control form-control-sm mb-2" rows="5"
					          placeholder="/* e.g. #user-stats-card { border: 2px solid var(--bs-primary); } */"
					          style="font-family:monospace;font-size:0.75rem;resize:vertical;"></textarea>
					<button type="button" class="btn btn-outline-secondary btn-sm w-100" id="kiln-pte-selref-btn">
						<i class="fas fa-list me-1"></i>Selector Reference
					</button>
				</div>
			</div>
		</div>

		<div id="kiln-pte-footer">
			<div id="kiln-pte-status" class="small mb-2"></div>
			<div class="d-flex gap-1 mb-1">
				<button class="btn btn-sm btn-outline-secondary flex-fill" id="kiln-pte-export">
					<i class="fas fa-file-export me-1"></i>Export JSON
				</button>
				<label class="btn btn-sm btn-outline-secondary flex-fill mb-0" style="cursor:pointer;">
					<i class="fas fa-file-import me-1"></i>Import JSON
					<input type="file" id="kiln-pte-import" accept=".json,application/json" style="display:none;" />
				</label>
			</div>
			<div class="d-flex gap-1 mb-1">
				<button class="btn btn-sm btn-outline-secondary flex-fill" id="kiln-pte-visibility" style="display:none;"></button>
				<button class="btn btn-sm btn-outline-danger flex-fill" id="kiln-pte-delete" style="display:none;">
					<i class="fas fa-trash me-1"></i>Delete
				</button>
			</div>
			<button class="btn btn-primary btn-sm w-100" id="kiln-pte-save">
				<i class="fas fa-cloud-arrow-up me-1"></i>Save &amp; Publish
			</button>
		</div>

		<div id="kiln-pte-selref-overlay" style="display:none;position:absolute;inset:0;z-index:10;background:rgba(0,0,0,0.55);flex-direction:column;padding:16px;">
			<div style="background:var(--bs-body-bg,#212529);border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px;width:100%;height:100%;display:flex;flex-direction:column;min-height:0;">
				<div class="d-flex justify-content-between align-items-center mb-2 flex-shrink-0">
					<p class="fw-bold mb-0" style="font-size:0.95rem;">Selector Reference</p>
					<button class="btn-close" id="kiln-pte-selref-close" aria-label="Close"></button>
				</div>
				<p class="text-muted small mb-2 flex-shrink-0">Real Polytoria selectors you can target in Custom CSS. Click a row to copy it.</p>
				<input type="text" id="kiln-pte-selref-search" class="form-control form-control-sm mb-2 flex-shrink-0" placeholder="Filter…" />
				<div id="kiln-pte-selref-body" style="flex:1;overflow-y:auto;min-height:0;"></div>
			</div>
		</div>

		<div id="kiln-pte-delete-overlay" style="display:none;position:absolute;inset:0;z-index:10;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;padding:24px;">
			<div style="background:var(--bs-body-bg,#212529);border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px;width:100%;">
				<p class="fw-bold mb-2" style="font-size:0.95rem;">Delete Profile Theme</p>
				<p class="text-muted small mb-3">Your profile will go back to its normal appearance for everyone. This can't be undone.</p>
				<div class="d-flex gap-2 justify-content-end">
					<button class="btn btn-sm btn-secondary" id="kiln-pte-delete-cancel">Cancel</button>
					<button class="btn btn-sm btn-danger" id="kiln-pte-delete-confirm">
						<i class="fas fa-trash me-1"></i>Delete
					</button>
				</div>
			</div>
		</div>

		<div id="kiln-pte-publish-rules-overlay" style="display:none;position:absolute;inset:0;z-index:11;background:rgba(0,0,0,0.55);flex-direction:column;padding:16px;overflow-y:auto;">
			<div style="background:var(--bs-body-bg,#212529);border:1px solid rgba(128,128,128,0.3);border-radius:8px;padding:16px;width:100%;margin:auto;">
				${publishRulesModalBody()}
				<div class="d-flex gap-2 justify-content-end mt-3">
					<button class="btn btn-sm btn-secondary" id="kiln-pte-publish-rules-cancel">Cancel</button>
					<button class="btn btn-sm btn-primary" id="kiln-pte-publish-rules-continue">I Understand, Publish</button>
				</div>
			</div>
		</div>
	`;

	document.body.appendChild(sidebar);

	const el = <T extends HTMLElement>(id: string) =>
		sidebar.querySelector<T>(`#${id}`)!;

	const stateBadge = el("kiln-pte-state-badge");
	const verifyNotice = el("kiln-pte-verify-notice");
	const accentPicker = el<HTMLInputElement>("kiln-pte-accent-picker");
	const accentHex = el<HTMLInputElement>("kiln-pte-accent-hex");
	const navbarPicker = el<HTMLInputElement>("kiln-pte-navbar-picker");
	const navbarHex = el<HTMLInputElement>("kiln-pte-navbar-hex");
	const imageInput = el<HTMLInputElement>("kiln-pte-image");
	const imageUrlInput = el<HTMLInputElement>("kiln-pte-image-url");
	const imageUrlBtn = el<HTMLButtonElement>("kiln-pte-image-url-btn");
	const imageStatus = el("kiln-pte-image-status");
	const bgIdInput = el<HTMLInputElement>("kiln-pte-bg-id");
	const bgStatus = el("kiln-pte-bg-status");
	const bgSetBtn = el<HTMLButtonElement>("kiln-pte-bg-set");
	const bgClearBtn = el<HTMLButtonElement>("kiln-pte-bg-clear");
	const bgOverlayRow = el("kiln-pte-bg-overlay-row");
	const bgOverlayColor = el<HTMLInputElement>("kiln-pte-bg-overlay-color");
	const bgOverlayOpacity = el<HTMLInputElement>("kiln-pte-bg-overlay-opacity");
	const bgOverlayLabel = el("kiln-pte-bg-overlay-label");
	const cursorIdInput = el<HTMLInputElement>("kiln-pte-cursor-id");
	const cursorStatus = el("kiln-pte-cursor-status");
	const cursorSetBtn = el<HTMLButtonElement>("kiln-pte-cursor-set");
	const cursorClearBtn = el<HTMLButtonElement>("kiln-pte-cursor-clear");
	const cursorScaleRow = el("kiln-pte-cursor-scale-row");
	const cursorScaleInput = el<HTMLInputElement>("kiln-pte-cursor-scale");
	const cursorScaleLabel = el("kiln-pte-cursor-scale-label");
	const iconAutoCheck = el<HTMLInputElement>("kiln-pte-icon-auto");
	const iconColorRow = el("kiln-pte-icon-color-row");
	const iconPicker = el<HTMLInputElement>("kiln-pte-icon-picker");
	const iconHex = el<HTMLInputElement>("kiln-pte-icon-hex");
	const fontSelect = el<HTMLSelectElement>("kiln-pte-font");
	const cssTextarea = el<HTMLTextAreaElement>("kiln-pte-custom-css");
	const effectsList = el("kiln-pte-effects-list");
	const addEffectForm = el("kiln-pte-add-effect-form");
	const addEffectNewBtn = el<HTMLButtonElement>("kiln-pte-effect-new");
	const effectSlotSelect = el<HTMLSelectElement>("kiln-pte-effect-slot");
	const effectTypeSelect = el<HTMLSelectElement>("kiln-pte-effect-type");
	const effectValueRow = el("kiln-pte-effect-value-row");
	const statusEl = el("kiln-pte-status");
	const saveBtn = el<HTMLButtonElement>("kiln-pte-save");
	const visibilityBtn = el<HTMLButtonElement>("kiln-pte-visibility");
	const deleteBtn = el<HTMLButtonElement>("kiln-pte-delete");
	const exportBtn = el<HTMLButtonElement>("kiln-pte-export");
	const importInput = el<HTMLInputElement>("kiln-pte-import");
	const selRefOverlay = el("kiln-pte-selref-overlay");
	const selRefBody = el("kiln-pte-selref-body");
	const selRefSearch = el<HTMLInputElement>("kiln-pte-selref-search");
	const deleteOverlay = el("kiln-pte-delete-overlay");
	const publishRulesOverlay = el("kiln-pte-publish-rules-overlay");
	const publishRulesContinueBtn = el<HTMLButtonElement>(
		"kiln-pte-publish-rules-continue",
	);
	const publishRulesCancelBtn = el<HTMLButtonElement>(
		"kiln-pte-publish-rules-cancel",
	);

	const visualCss = createVisualCssEditor({
		mount: el("kiln-pte-vce-mount"),
		sidebar,
		idPrefix: "pte",
		getCss: () => workingCss,
		setCss: (css) => {
			workingCss = css;
			cssTextarea.value = css;
			refreshPreview();
		},
		onBlocked: (message) =>
			setStatus(
				message
					? `<span class="text-warning"><i class="fas fa-eye-slash me-1"></i>${message}</span>`
					: "",
			),
	});

	function refreshPreview() {
		const values = currentValues();
		applyKilnTheme({
			...values,
			ambient: undefined,
			cardStyle: undefined,
			pointerEffects: undefined,
		});
		applyProfileExtras(workingExtras, {
			editing: {
				ignoreWithin: sidebar,
				onStickerMove: (id, anchor, x, y) => {
					const sticker = workingExtras.stickers?.find((s) => s.id === id);
					if (!sticker) return;
					Object.assign(sticker, { anchor, x, y });
					renderStickerList();
					refreshPreview();
				},
				onNoteMove: (id, anchor, x, y) => {
					const note = workingExtras.notes?.find((n) => n.id === id);
					if (!note) return;
					Object.assign(note, { anchor, x, y });
					renderNoteList();
					refreshPreview();
				},
			},
		});
		onPreview?.();
	}

	function setRowVisible(row: HTMLElement, visible: boolean) {
		if (visible) row.style.removeProperty("display");
		else row.style.setProperty("display", "none", "important");
	}

	function setFieldsEnabled(container: HTMLElement, enabled: boolean) {
		container.classList.toggle("kiln-pte-fields-disabled", !enabled);
		for (const input of container.querySelectorAll<
			HTMLInputElement | HTMLSelectElement | HTMLButtonElement
		>("input, select, button"))
			input.disabled = !enabled;
	}

	function setStatus(html: string) {
		statusEl.innerHTML = html;
	}

	function updateStateBadge() {
		if (!serverTheme) {
			stateBadge.textContent = "Not published yet";
			stateBadge.className = "badge mb-2 w-100 bg-secondary";
		} else if (serverTheme.approvalStatus === "pending") {
			stateBadge.textContent = "Pending review";
			stateBadge.className = "badge mb-2 w-100 bg-warning text-dark";
		} else if (serverTheme.approvalStatus === "declined") {
			stateBadge.textContent = "Declined by moderation";
			stateBadge.className = "badge mb-2 w-100 bg-danger";
		} else if (!serverTheme.enabled) {
			stateBadge.textContent = "Hidden from other players";
			stateBadge.className = "badge mb-2 w-100 bg-secondary";
		} else {
			stateBadge.textContent = "Live on your profile";
			stateBadge.className = "badge mb-2 w-100 bg-primary";
		}

		visibilityBtn.style.display = serverTheme ? "" : "none";
		deleteBtn.style.display = serverTheme ? "" : "none";
		visibilityBtn.innerHTML = serverTheme?.enabled
			? '<i class="fas fa-eye-slash me-1"></i>Hide'
			: '<i class="fas fa-eye me-1"></i>Show';
	}

	async function recheckVerification() {
		const freshSession = await getApiSession(userId);
		verified = freshSession?.state === "verified";
		verifyNotice.style.display = verified ? "none" : "";
		return verified;
	}

	function showLoadError() {
		themeLoadFailed = true;
		saveBtn.disabled = true;
		setStatus(
			'<span class="text-danger">Couldn\'t load your current profile theme. Saving is disabled until this loads.</span> ' +
				'<button type="button" class="btn btn-sm btn-outline-light mt-1" id="kiln-pte-retry-load">Retry</button>',
		);
		el<HTMLButtonElement>("kiln-pte-retry-load").addEventListener(
			"click",
			retryLoad,
		);
	}

	async function retryLoad() {
		setStatus(
			'<span class="text-muted"><i class="fas fa-spinner fa-spin me-1"></i>Retrying…</span>',
		);
		const result = await sendMessage("getMyProfileTheme", userId);
		if (!result.ok) {
			showLoadError();
			return;
		}
		themeLoadFailed = false;
		saveBtn.disabled = false;
		if (result.data.data) {
			serverTheme = mapServerTheme(result.data.data);
			loadFrom(serverTheme, extrasFromTheme(serverTheme));
			syncInputs();
			refreshPreview();
		}
		updateStateBadge();
		setStatus("");
	}

	function loadFrom(
		theme: SavedTheme | ProfileThemeValues | null,
		extras?: ProfileThemeExtras,
	) {
		if (extras) workingExtras = structuredClone(extras);
		workingAccent = theme?.accentColor ?? DEFAULT_ACCENT;
		workingNavbar = theme?.navbarColor ?? DEFAULT_NAVBAR;
		workingFont = theme?.fontFamily ?? "default";
		workingCss = theme?.customCss ?? "";
		workingBg = theme?.backgroundImage ?? "";
		workingOverlayColor = theme?.backgroundOverlayColor ?? "#000000";
		workingOverlayOpacity = theme?.backgroundOverlayOpacity ?? 0;
		workingEffects = theme?.effects ? [...theme.effects] : [];
		workingIconColor = theme?.navbarIconColor ?? "";
		workingCursor = theme?.cursorUrl ?? "";
		workingCursorSrc = "";
		workingCursorScale = 32;
		workingColorTokens = theme?.colorTokens ? { ...theme.colorTokens } : {};
	}

	function renderEffectsList() {
		if (workingEffects.length === 0) {
			effectsList.innerHTML = "";
			return;
		}
		effectsList.innerHTML = workingEffects
			.map(
				(effect) => `
				<div class="d-flex align-items-center gap-2 mb-1">
					<span class="badge bg-secondary" style="font-size:0.65em;flex-shrink:0;">${EFFECT_SLOTS[effect.slot].label}</span>
					<span class="small flex-fill" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${EFFECT_TYPE_CONFIGS[effect.type].label}: <span class="text-muted">${formatEffectValue(effect)}</span></span>
					<button class="kiln-pte-effect-remove" data-id="${escapeHtml(effect.id)}"
					        style="background:none;border:none;padding:0 2px;cursor:pointer;color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1;flex-shrink:0;"
					        title="Remove">✕</button>
				</div>`,
			)
			.join("");
		for (const btn of effectsList.querySelectorAll<HTMLButtonElement>(
			".kiln-pte-effect-remove",
		)) {
			btn.addEventListener("click", () => {
				workingEffects = workingEffects.filter((e) => e.id !== btn.dataset.id);
				renderEffectsList();
				refreshPreview();
			});
		}
	}

	function syncInputs() {
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
		cursorIdInput.value = "";
		cursorStatus.textContent = !workingCursor
			? ""
			: workingCursor.startsWith("data:") ||
					POLYTORIA_CDN_URL.test(workingCursor)
				? "Cursor set."
				: "Using an older image URL. Replace it with a decal ID to change it.";
		cursorClearBtn.style.display = workingCursor ? "" : "none";
		cursorScaleRow.style.display = workingCursorSrc ? "flex" : "none";
		cursorScaleInput.value = String(workingCursorScale);
		cursorScaleLabel.textContent = `${workingCursorScale}px`;
		const hasIconColor = !!workingIconColor;
		iconAutoCheck.checked = !hasIconColor;
		setRowVisible(iconColorRow, hasIconColor);
		if (hasIconColor) {
			iconPicker.value = workingIconColor;
			iconHex.value = workingIconColor;
		}
		for (const key of Object.keys(COLOR_TOKENS)) {
			const display = workingColorTokens[key] ?? getTokenDerivedValue(key);
			el<HTMLInputElement>(`kiln-pte-token-${key}-picker`).value = display;
			el<HTMLInputElement>(`kiln-pte-token-${key}-hex`).value = display;
			el(`kiln-pte-token-${key}-clear`).style.display = workingColorTokens[key]
				? ""
				: "none";
		}
		imageStatus.textContent = "";
		renderEffectsList();
		closeAddEffectForm();
		syncExtrasInputs();
	}

	async function closeSidebar() {
		visualCss.destroy();
		document.removeEventListener("mousemove", onResizeMove);
		document.removeEventListener("mouseup", onResizeUp);
		document.removeEventListener("mousemove", onWindowDragMove);
		document.removeEventListener("mouseup", onWindowDragUp);
		window.removeEventListener("focus", recheckVerification);
		document.body.style.userSelect = "";
		sidebar.remove();
		styleEl.remove();
		const url = new URL(window.location.href);
		url.searchParams.delete("kiln-profile-theme");
		history.replaceState(null, "", url);
		await onRestore();
	}

	const resizeHandle = el("kiln-pte-resize");
	let isResizing = false;
	let resizeAnchorRight = 0;
	function onResizeMove(e: MouseEvent) {
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
		}
	}
	function onResizeUp() {
		if (!isResizing) return;
		isResizing = false;
		resizeHandle.classList.remove("kiln-pte-dragging");
		document.body.style.userSelect = "";
	}
	resizeHandle.addEventListener("mousedown", (e) => {
		isResizing = true;
		resizeHandle.classList.add("kiln-pte-dragging");
		document.body.style.userSelect = "none";
		if (isFloating)
			resizeAnchorRight =
				parseInt(sidebar.style.left, 10) + sidebar.offsetWidth;
		e.preventDefault();
	});
	document.addEventListener("mousemove", onResizeMove);
	document.addEventListener("mouseup", onResizeUp);

	const floatBtn = el<HTMLButtonElement>("kiln-pte-float-btn");
	const sidebarHeader = el("kiln-pte-header");
	let isFloating = false;
	let isWindowDragging = false;
	let winDragStartX = 0;
	let winDragStartY = 0;
	let winDragStartLeft = 0;
	let winDragStartTop = 0;

	function toggleFloat() {
		isFloating = !isFloating;
		if (isFloating) {
			const rect = sidebar.getBoundingClientRect();
			sidebar.classList.add("kiln-pte-floating");
			sidebar.style.left = `${rect.left}px`;
			sidebar.style.top = `${rect.top}px`;
			sidebar.style.height = `${Math.min(window.innerHeight * 0.85, 680)}px`;
			floatBtn.innerHTML = '<i class="fas fa-compress"></i>';
			floatBtn.title = "Dock to side";
		} else {
			sidebar.classList.remove("kiln-pte-floating");
			sidebar.style.left = "";
			sidebar.style.top = "";
			sidebar.style.height = "";
			sidebar.style.width = "";
			floatBtn.innerHTML = '<i class="fas fa-expand"></i>';
			floatBtn.title = "Float as window";
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

	el("kiln-pte-close").addEventListener("click", () => {
		void closeSidebar();
	});

	accentPicker.addEventListener("input", () => {
		workingAccent = accentPicker.value;
		accentHex.value = workingAccent;
		refreshPreview();
	});
	accentHex.addEventListener("change", () => {
		const v = accentHex.value.startsWith("#")
			? accentHex.value
			: `#${accentHex.value}`;
		if (!isValidHex(v)) {
			accentHex.value = workingAccent;
			return;
		}
		workingAccent = v;
		accentPicker.value = v;
		refreshPreview();
	});
	navbarPicker.addEventListener("input", () => {
		workingNavbar = navbarPicker.value;
		navbarHex.value = workingNavbar;
		refreshPreview();
	});
	navbarHex.addEventListener("change", () => {
		const v = navbarHex.value.startsWith("#")
			? navbarHex.value
			: `#${navbarHex.value}`;
		if (!isValidHex(v)) {
			navbarHex.value = workingNavbar;
			return;
		}
		workingNavbar = v;
		navbarPicker.value = v;
		refreshPreview();
	});
	fontSelect.addEventListener("change", () => {
		workingFont = fontSelect.value;
		refreshPreview();
	});
	cssTextarea.addEventListener("input", () => {
		workingCss = cssTextarea.value;
		visualCss.syncFromText();
		refreshPreview();
	});

	imageInput.addEventListener("change", async () => {
		const file = imageInput.files?.[0];
		if (!file) return;
		imageStatus.textContent = "Extracting…";
		const url = URL.createObjectURL(file);
		const color = await extractDominantColor(url);
		URL.revokeObjectURL(url);
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
	bgClearBtn.addEventListener("click", () => {
		workingBg = "";
		bgIdInput.value = "";
		bgStatus.textContent = "";
		bgClearBtn.style.display = "none";
		bgOverlayRow.style.display = "none";
		refreshPreview();
	});
	bgOverlayColor.addEventListener("input", () => {
		workingOverlayColor = bgOverlayColor.value;
		refreshPreview();
	});
	bgOverlayOpacity.addEventListener("input", () => {
		workingOverlayOpacity = Number(bgOverlayOpacity.value);
		bgOverlayLabel.textContent = `${workingOverlayOpacity}%`;
		refreshPreview();
	});

	async function applyScaledCursor() {
		if (!workingCursorSrc) {
			workingCursor = "";
			refreshPreview();
			return;
		}
		let source = workingCursorSrc;
		if (/^https?:\/\//i.test(source)) {
			const image = await sendMessage("fetchCdnImageDataUrl", source).catch(
				() => null,
			);
			if (!image?.ok) {
				cursorStatus.textContent = "Couldn't load that image. Try again.";
				return;
			}
			source = image.data;
		}
		const img = new Image();
		img.src = source;
		await new Promise<void>((resolve) => {
			if (img.complete) {
				resolve();
				return;
			}
			img.onload = () => resolve();
			img.onerror = () => resolve();
		});
		if (!img.naturalWidth) {
			cursorStatus.textContent =
				"Couldn't process that image. Try a different decal.";
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
			cursorStatus.textContent =
				"Couldn't process that image. Try a different decal.";
		}
		refreshPreview();
	}

	cursorSetBtn.addEventListener("click", async () => {
		cursorSetBtn.disabled = true;
		cursorStatus.textContent = "Looking up decal…";
		const url = await resolveDecalUrl(cursorIdInput.value);
		cursorSetBtn.disabled = false;
		if (!url) {
			cursorStatus.textContent =
				"Couldn't find that decal. Check the ID and try again.";
			return;
		}
		workingCursorSrc = url;
		cursorIdInput.value = "";
		cursorStatus.textContent = "Cursor set.";
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
		await applyScaledCursor();
	});
	cursorClearBtn.addEventListener("click", () => {
		workingCursor = "";
		workingCursorSrc = "";
		cursorIdInput.value = "";
		cursorStatus.textContent = "";
		cursorClearBtn.style.display = "none";
		cursorScaleRow.style.display = "none";
		refreshPreview();
	});

	iconAutoCheck.addEventListener("change", () => {
		if (iconAutoCheck.checked) {
			workingIconColor = "";
			setRowVisible(iconColorRow, false);
		} else {
			workingIconColor = workingIconColor || workingAccent;
			iconPicker.value = workingIconColor;
			iconHex.value = workingIconColor;
			setRowVisible(iconColorRow, true);
		}
		refreshPreview();
	});
	iconPicker.addEventListener("input", () => {
		workingIconColor = iconPicker.value;
		iconHex.value = workingIconColor;
		refreshPreview();
	});
	iconHex.addEventListener("change", () => {
		const v = iconHex.value.startsWith("#")
			? iconHex.value
			: `#${iconHex.value}`;
		if (!isValidHex(v)) {
			iconHex.value = workingIconColor;
			return;
		}
		workingIconColor = v;
		iconPicker.value = v;
		refreshPreview();
	});

	for (const key of Object.keys(COLOR_TOKENS)) {
		const pickerEl = el<HTMLInputElement>(`kiln-pte-token-${key}-picker`);
		const hexEl = el<HTMLInputElement>(`kiln-pte-token-${key}-hex`);
		const clearEl = el<HTMLButtonElement>(`kiln-pte-token-${key}-clear`);

		pickerEl.addEventListener("input", () => {
			workingColorTokens[key] = pickerEl.value;
			hexEl.value = pickerEl.value;
			clearEl.style.display = "";
			refreshPreview();
		});
		hexEl.addEventListener("change", () => {
			const v = hexEl.value.startsWith("#") ? hexEl.value : `#${hexEl.value}`;
			if (!isValidHex(v)) {
				hexEl.value = workingColorTokens[key] ?? getTokenDerivedValue(key);
				return;
			}
			workingColorTokens[key] = v;
			pickerEl.value = v;
			clearEl.style.display = "";
			refreshPreview();
		});
		clearEl.addEventListener("click", () => {
			delete workingColorTokens[key];
			const derived = getTokenDerivedValue(key);
			pickerEl.value = derived;
			hexEl.value = derived;
			clearEl.style.display = "none";
			refreshPreview();
		});
	}

	for (const [slot, cfg] of Object.entries(EFFECT_SLOTS))
		effectSlotSelect.add(new Option(cfg.label, slot));

	function populateEffectTypes() {
		const slot = effectSlotSelect.value as keyof typeof EFFECT_SLOTS;
		effectTypeSelect.innerHTML = "";
		for (const t of EFFECT_SLOTS[slot].types)
			effectTypeSelect.add(new Option(EFFECT_TYPE_CONFIGS[t].label, t));
		renderEffectValueInput(
			effectValueRow,
			effectTypeSelect.value as EffectType,
			"kiln-pte",
		);
	}

	function closeAddEffectForm() {
		addEffectForm.style.display = "none";
		addEffectNewBtn.style.display = "";
	}

	addEffectNewBtn.addEventListener("click", () => {
		effectSlotSelect.value = Object.keys(EFFECT_SLOTS)[0];
		populateEffectTypes();
		addEffectForm.style.display = "";
		addEffectNewBtn.style.display = "none";
	});
	effectSlotSelect.addEventListener("change", populateEffectTypes);
	effectTypeSelect.addEventListener("change", () =>
		renderEffectValueInput(
			effectValueRow,
			effectTypeSelect.value as EffectType,
			"kiln-pte",
		),
	);
	el("kiln-pte-effect-cancel").addEventListener("click", closeAddEffectForm);
	el("kiln-pte-effect-confirm").addEventListener("click", async () => {
		const slot = effectSlotSelect.value as ThemeEffect["slot"];
		const type = effectTypeSelect.value as EffectType;
		const value = await readEffectValue(effectValueRow, type, "kiln-pte");
		if (value === null) return;
		if (type === "clicking-sound" && Number(value) <= 0) return;
		if (type === "background-music" && !parseAssetVolume(value)) return;

		const existingIdx = workingEffects.findIndex(
			(e) => e.slot === slot && e.type === type,
		);
		const effect: ThemeEffect = {
			id:
				existingIdx >= 0 ? workingEffects[existingIdx].id : crypto.randomUUID(),
			slot,
			type,
			value,
		};
		if (existingIdx >= 0) workingEffects[existingIdx] = effect;
		else workingEffects.push(effect);
		renderEffectsList();
		refreshPreview();
		closeAddEffectForm();
	});

	for (const hdr of sidebar.querySelectorAll<HTMLElement>(
		".kiln-pte-section-hdr",
	)) {
		hdr.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).closest(".form-check")) return;
			const body = el(hdr.dataset.body!);
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

	el("kiln-pte-selref-btn").addEventListener("click", () => {
		selRefSearch.value = "";
		renderSelectorReference(selRefBody, "");
		selRefOverlay.style.display = "flex";
		selRefSearch.focus();
	});
	el("kiln-pte-selref-close").addEventListener("click", () => {
		selRefOverlay.style.display = "none";
	});
	selRefSearch.addEventListener("input", () =>
		renderSelectorReference(selRefBody, selRefSearch.value),
	);

	exportBtn.addEventListener("click", () => {
		const blob = new Blob([JSON.stringify(currentValues(), null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "profile-theme.json";
		a.click();
		URL.revokeObjectURL(url);
	});

	importInput.addEventListener("change", async () => {
		const file = importInput.files?.[0];
		if (!file) return;
		importInput.value = "";
		try {
			const data = JSON.parse(await file.text());
			if (!isValidHex(data.accentColor) || !isValidHex(data.navbarColor)) {
				setStatus(
					'<span class="text-danger">Invalid theme JSON: missing required color fields.</span>',
				);
				return;
			}
			loadFrom(
				{
					accentColor: data.accentColor,
					navbarColor: data.navbarColor,
					fontFamily:
						typeof data.fontFamily === "string" ? data.fontFamily : undefined,
					customCss:
						typeof data.customCss === "string" ? data.customCss : undefined,
					backgroundImage:
						typeof data.backgroundImage === "string"
							? data.backgroundImage
							: undefined,
					backgroundOverlayColor:
						typeof data.backgroundOverlayColor === "string"
							? data.backgroundOverlayColor
							: undefined,
					backgroundOverlayOpacity:
						typeof data.backgroundOverlayOpacity === "number"
							? data.backgroundOverlayOpacity
							: undefined,
					effects: sanitizeImportedEffects(data.effects),
					navbarIconColor:
						typeof data.navbarIconColor === "string"
							? data.navbarIconColor
							: undefined,
					cursorUrl:
						typeof data.cursorUrl === "string" ? data.cursorUrl : undefined,
					colorTokens:
						data.colorTokens &&
						typeof data.colorTokens === "object" &&
						!Array.isArray(data.colorTokens)
							? data.colorTokens
							: undefined,
				},
				sanitizeImportedExtras(data),
			);
			syncInputs();
			refreshPreview();
			setStatus("");
		} catch {
			setStatus('<span class="text-danger">Failed to parse JSON file.</span>');
		}
	});

	saveBtn.addEventListener("click", async () => {
		if (themeLoadFailed) return;
		await recheckVerification();
		if (!verified) {
			window.open("https://polytoria.com/my/settings/kiln?tab=sync", "_blank");
			setStatus(
				'<span class="text-info"><i class="fas fa-external-link-alt me-1"></i>Connect your account in the opened tab, then try again.</span>',
			);
			return;
		}

		if (!serverTheme) {
			const acknowledged = await confirmPublishRulesSeen(
				publishRulesOverlay,
				publishRulesContinueBtn,
				publishRulesCancelBtn,
			);
			if (!acknowledged) return;
		}

		const original = saveBtn.innerHTML;
		saveBtn.disabled = true;
		saveBtn.innerHTML =
			'<i class="fas fa-spinner fa-spin me-1"></i>Publishing…';

		const values = currentValues();
		const notes = values.notes?.filter((n) => n.text.trim());

		const result = await sendMessage("saveProfileTheme", {
			userId,
			...values,
			notes: notes && notes.length > 0 ? notes : undefined,
		});

		saveBtn.disabled = false;
		saveBtn.innerHTML = original;

		if (!result.ok) {
			setStatus(
				`<span class="text-danger">${friendlyApiError(
					result.message,
					"Couldn't save your profile theme. Please try again.",
				)}</span>`,
			);
			return;
		}

		const saved = result.data.data;
		if (!saved) {
			setStatus(
				'<span class="text-danger">Couldn\'t save your profile theme. Please try again.</span>',
			);
			return;
		}
		serverTheme = {
			...currentValues(),
			enabled: saved.enabled,
			approvalStatus: saved.approvalStatus,
		};
		updateStateBadge();
		setStatus(
			saved.approvalStatus === "pending"
				? '<span class="text-warning"><i class="fas fa-hourglass-half me-1"></i>Saved. Your background image or notes need a quick review before others see the theme.</span>'
				: '<span class="text-success"><i class="fas fa-check me-1"></i>Saved! Other Kiln users will see this on your profile.</span>',
		);
	});

	visibilityBtn.addEventListener("click", async () => {
		if (!serverTheme) return;
		const nextEnabled = !serverTheme.enabled;
		visibilityBtn.disabled = true;
		const result = await sendMessage("setProfileThemeEnabled", {
			userId,
			enabled: nextEnabled,
		});
		visibilityBtn.disabled = false;
		if (!result.ok) {
			setStatus(
				`<span class="text-danger">${friendlyApiError(result.message)}</span>`,
			);
			return;
		}
		serverTheme.enabled = nextEnabled ? 1 : 0;
		updateStateBadge();
		setStatus(
			nextEnabled
				? '<span class="text-success">Your theme is visible again.</span>'
				: '<span class="text-muted">Your theme is hidden from other players. It stays saved.</span>',
		);
	});

	deleteBtn.addEventListener("click", () => {
		deleteOverlay.style.display = "flex";
	});
	el("kiln-pte-delete-cancel").addEventListener("click", () => {
		deleteOverlay.style.display = "none";
	});
	el("kiln-pte-delete-confirm").addEventListener("click", async () => {
		const result = await sendMessage("deleteProfileTheme", userId);
		deleteOverlay.style.display = "none";
		if (!result.ok) {
			setStatus(
				`<span class="text-danger">${friendlyApiError(result.message)}</span>`,
			);
			return;
		}
		serverTheme = null;
		loadFrom(null, {});
		syncInputs();
		applyKilnTheme(null);
		clearProfileExtras();
		updateStateBadge();
		setStatus('<span class="text-muted">Profile theme deleted.</span>');
	});

	const unEnabled = el<HTMLInputElement>("kiln-pte-un-enabled");
	const unFields = el("kiln-pte-un-fields");
	const unMode = el<HTMLSelectElement>("kiln-pte-un-mode");
	const unColor1 = el<HTMLInputElement>("kiln-pte-un-color1");
	const unColor2 = el<HTMLInputElement>("kiln-pte-un-color2");
	const unAnimatedRow = el("kiln-pte-un-animated-row");
	const unAnimated = el<HTMLInputElement>("kiln-pte-un-animated");
	const unGlowColor = el<HTMLInputElement>("kiln-pte-un-glow-color");
	const unGlowSize = el<HTMLInputElement>("kiln-pte-un-glow-size");
	const unGlowLabel = el("kiln-pte-un-glow-label");
	const unFont = el<HTMLSelectElement>("kiln-pte-un-font");
	const bannerId = el<HTMLInputElement>("kiln-pte-banner-id");
	const bannerSet = el<HTMLButtonElement>("kiln-pte-banner-set");
	const bannerClear = el<HTMLButtonElement>("kiln-pte-banner-clear");
	const bannerStatus = el("kiln-pte-banner-status");
	const bannerFields = el("kiln-pte-banner-fields");
	const bannerHeight = el<HTMLInputElement>("kiln-pte-banner-height");
	const bannerHeightLabel = el("kiln-pte-banner-height-label");
	const bannerPosition = el<HTMLSelectElement>("kiln-pte-banner-position");
	const stickerId = el<HTMLInputElement>("kiln-pte-sticker-id");
	const stickerAdd = el<HTMLButtonElement>("kiln-pte-sticker-add");
	const stickerStatus = el("kiln-pte-sticker-status");
	const stickerList = el("kiln-pte-sticker-list");
	const noteText = el<HTMLInputElement>("kiln-pte-note-text");
	const noteAdd = el<HTMLButtonElement>("kiln-pte-note-add");
	const noteStatus = el("kiln-pte-note-status");
	const noteList = el("kiln-pte-note-list");
	const ambientType = el<HTMLSelectElement>("kiln-pte-ambient-type");
	const ambientDensity = el<HTMLSelectElement>("kiln-pte-ambient-density");
	const ambientColor = el<HTMLInputElement>("kiln-pte-ambient-color");
	const ambientColorAuto = el<HTMLInputElement>("kiln-pte-ambient-color-auto");
	const layoutLists = {
		left: el("kiln-pte-layout-left"),
		right: el("kiln-pte-layout-right"),
	};

	function syncExtrasInputs() {
		const un = workingExtras.usernameStyle;
		unEnabled.checked = !!un;
		setFieldsEnabled(unFields, !!un);
		unMode.value = un?.mode ?? "gradient";
		unColor1.value = un?.color1 ?? workingAccent;
		unColor2.value = un?.color2 ?? "#ffffff";
		unColor2.style.display = unMode.value === "gradient" ? "" : "none";
		unAnimatedRow.style.display = unMode.value === "gradient" ? "" : "none";
		unAnimated.checked = !!un?.animated;
		unGlowColor.value = un?.glowColor ?? workingAccent;
		unGlowSize.value = String(un?.glowSize ?? 0);
		unGlowLabel.textContent = un?.glowSize ? `${un.glowSize}px` : "Off";
		unFont.value = un?.fontFamily ?? "default";

		const banner = workingExtras.banner;
		bannerClear.style.display = banner ? "" : "none";
		bannerFields.style.display = banner ? "" : "none";
		bannerHeight.value = String(banner?.height ?? 180);
		bannerHeightLabel.textContent = `${banner?.height ?? 180}px`;
		bannerPosition.value = banner?.position ?? "center";
		bannerStatus.textContent = "";

		const ambient = workingExtras.ambient;
		ambientType.value = ambient?.type ?? "";
		ambientDensity.value = String(ambient?.density ?? 2);
		ambientColorAuto.checked = !ambient?.color;
		ambientColor.value =
			ambient?.color ??
			AMBIENT_TYPES.find((t) => t.key === ambient?.type)?.color ??
			"#ffffff";
		ambientColor.disabled = !ambient?.color;
		ambientDensity.disabled = !ambient;
		ambientColorAuto.disabled = !ambient;

		stickerStatus.textContent = "";
		renderStickerList();
		noteStatus.textContent = "";
		renderNoteList();
		renderLayoutLists();
		syncNewExtrasInputs();
	}

	function readUsernameStyle() {
		const glowSize = Number(unGlowSize.value);
		workingExtras.usernameStyle = {
			mode: unMode.value as "solid" | "gradient",
			color1: unColor1.value,
			...(unMode.value === "gradient"
				? { color2: unColor2.value, animated: unAnimated.checked }
				: {}),
			...(glowSize > 0 ? { glowColor: unGlowColor.value, glowSize } : {}),
			...(unFont.value !== "default" ? { fontFamily: unFont.value } : {}),
		};
		unColor2.style.display = unMode.value === "gradient" ? "" : "none";
		unAnimatedRow.style.display = unMode.value === "gradient" ? "" : "none";
		unGlowLabel.textContent = glowSize > 0 ? `${glowSize}px` : "Off";
		refreshPreview();
	}
	unEnabled.addEventListener("change", () => {
		setFieldsEnabled(unFields, unEnabled.checked);
		if (unEnabled.checked) readUsernameStyle();
		else {
			workingExtras.usernameStyle = undefined;
			refreshPreview();
		}
	});
	for (const input of [unMode, unAnimated, unFont])
		input.addEventListener("change", readUsernameStyle);
	for (const input of [unColor1, unColor2, unGlowColor, unGlowSize])
		input.addEventListener("input", readUsernameStyle);

	bannerSet.addEventListener("click", async () => {
		bannerSet.disabled = true;
		bannerStatus.textContent = "Looking up decal…";
		const url = await resolveDecalUrl(bannerId.value);
		bannerSet.disabled = false;
		if (!url) {
			bannerStatus.textContent =
				"Couldn't find that decal. Check the ID and try again.";
			return;
		}
		workingExtras.banner = {
			url,
			height: workingExtras.banner?.height ?? 180,
			position: workingExtras.banner?.position ?? "center",
		};
		bannerId.value = "";
		syncExtrasInputs();
		bannerStatus.textContent = "Banner set.";
		refreshPreview();
	});
	bannerId.addEventListener("keydown", (e) => {
		if (e.key === "Enter") bannerSet.click();
	});
	bannerClear.addEventListener("click", () => {
		workingExtras.banner = undefined;
		workingExtras.stickers = workingExtras.stickers?.filter(
			(s) => s.anchor !== "banner",
		);
		workingExtras.notes = workingExtras.notes?.filter(
			(n) => n.anchor !== "banner",
		);
		syncExtrasInputs();
		refreshPreview();
	});
	bannerHeight.addEventListener("input", () => {
		if (!workingExtras.banner) return;
		workingExtras.banner.height = Number(bannerHeight.value);
		bannerHeightLabel.textContent = `${bannerHeight.value}px`;
		refreshPreview();
	});
	bannerPosition.addEventListener("change", () => {
		if (!workingExtras.banner) return;
		workingExtras.banner.position = bannerPosition.value as
			| "top"
			| "center"
			| "bottom";
		refreshPreview();
	});

	function readAmbient() {
		const type = ambientType.value as ProfileAmbientType | "";
		workingExtras.ambient = type
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

	function renderStickerList() {
		const stickers = workingExtras.stickers ?? [];
		stickerAdd.disabled = stickers.length >= MAX_STICKERS;
		stickerList.innerHTML = stickers
			.map(
				(sticker, i) => `
			<div class="border rounded p-2 mb-2" style="border-color:rgba(128,128,128,0.25)!important;" data-index="${i}">
				<div class="d-flex align-items-center gap-2 mb-2">
					<img src="${escapeHtml(sticker.url)}" alt="" style="width:36px;height:36px;object-fit:contain;flex-shrink:0;" />
					<span class="small text-muted flex-fill" style="min-width:0;">
						<i class="fas fa-thumbtack me-1"></i>${escapeHtml(stickerAnchorLabel(sticker.anchor))}
					</span>
					<button class="kiln-pte-sticker-remove" title="Remove"
					        style="background:none;border:none;padding:0 2px;cursor:pointer;color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1;flex-shrink:0;">✕</button>
				</div>
				<div class="d-flex align-items-center gap-2 mb-1">
					<span class="small text-muted" style="min-width:4.5em;">Size</span>
					<input type="range" class="flex-fill kiln-pte-sticker-size" min="16" max="400" step="4" value="${clamp(Number(sticker.size) || 64, 16, 400)}" style="min-width:0;" />
				</div>
				<div class="d-flex align-items-center gap-2 mb-1">
					<span class="small text-muted" style="min-width:4.5em;">Rotation</span>
					<input type="range" class="flex-fill kiln-pte-sticker-rotation" min="-180" max="180" step="1" value="${clamp(Number(sticker.rotation) || 0, -180, 180)}" style="min-width:0;" />
				</div>
				<select class="form-select form-select-sm kiln-pte-sticker-layer">
					<option value="front"${sticker.layer === "front" ? " selected" : ""}>On top</option>
					<option value="back"${sticker.layer === "back" ? " selected" : ""}>Behind cards</option>
				</select>
			</div>`,
			)
			.join("");

		for (const row of stickerList.querySelectorAll<HTMLElement>(
			"[data-index]",
		)) {
			const sticker = stickers[Number(row.dataset.index)];
			const update = (patch: Partial<ProfileSticker>) => {
				Object.assign(sticker, patch);
				refreshPreview();
			};
			row
				.querySelector<HTMLInputElement>(".kiln-pte-sticker-size")!
				.addEventListener("input", (e) =>
					update({ size: Number((e.target as HTMLInputElement).value) }),
				);
			row
				.querySelector<HTMLInputElement>(".kiln-pte-sticker-rotation")!
				.addEventListener("input", (e) =>
					update({ rotation: Number((e.target as HTMLInputElement).value) }),
				);
			row
				.querySelector<HTMLSelectElement>(".kiln-pte-sticker-layer")!
				.addEventListener("change", (e) =>
					update({
						layer: (e.target as HTMLSelectElement).value as "front" | "back",
					}),
				);
			row
				.querySelector<HTMLButtonElement>(".kiln-pte-sticker-remove")!
				.addEventListener("click", () => {
					workingExtras.stickers = stickers.filter((s) => s !== sticker);
					renderStickerList();
					refreshPreview();
				});
		}
	}

	stickerAdd.addEventListener("click", async () => {
		if ((workingExtras.stickers?.length ?? 0) >= MAX_STICKERS) return;
		stickerAdd.disabled = true;
		stickerStatus.textContent = "Looking up decal…";
		const url = await resolveDecalUrl(stickerId.value);
		stickerAdd.disabled = false;
		if (!url) {
			stickerStatus.textContent =
				"Couldn't find that decal. Check the ID and try again.";
			return;
		}
		const placement = stickerPlacementAt(
			(window.innerWidth - sidebar.offsetWidth) / 2,
			window.innerHeight / 2,
		) ?? { anchor: "avatar-card", x: 50, y: 50 };
		workingExtras.stickers = [
			...(workingExtras.stickers ?? []),
			{
				id: crypto.randomUUID(),
				url,
				...placement,
				size: 96,
				rotation: 0,
				layer: "front",
			},
		];
		stickerId.value = "";
		stickerStatus.textContent = "Added. Drag it on the page to place it.";
		renderStickerList();
		refreshPreview();
	});
	stickerId.addEventListener("keydown", (e) => {
		if (e.key === "Enter") stickerAdd.click();
	});

	function renderNoteList() {
		const notes = workingExtras.notes ?? [];
		noteAdd.disabled = notes.length >= MAX_NOTES;
		noteList.innerHTML = notes
			.map(
				(note, i) => `
			<div class="border rounded p-2 mb-2" style="border-color:rgba(128,128,128,0.25)!important;" data-index="${i}">
				<div class="d-flex align-items-start gap-2 mb-2">
					<textarea class="form-control form-control-sm flex-fill kiln-pte-note-text" rows="2" maxlength="300" style="min-width:0;resize:vertical;"></textarea>
					<button class="kiln-pte-note-remove" title="Remove"
					        style="background:none;border:none;padding:0 2px;cursor:pointer;color:rgba(255,255,255,0.4);font-size:0.8rem;line-height:1;flex-shrink:0;">✕</button>
				</div>
				<div class="small text-muted mb-2"><i class="fas fa-thumbtack me-1"></i>${escapeHtml(stickerAnchorLabel(note.anchor))}</div>
				<div class="d-flex align-items-center gap-2 mb-1">
					<span class="small text-muted" style="min-width:4.5em;">Colors</span>
					<input type="color" class="kiln-te-color-picker kiln-pte-note-color" />
					<input type="color" class="kiln-te-color-picker kiln-pte-note-bg" />
				</div>
				<div class="d-flex align-items-center gap-2 mb-1">
					<span class="small text-muted" style="min-width:4.5em;">Text Size</span>
					<input type="range" class="flex-fill kiln-pte-note-size" min="10" max="40" step="1" value="${clamp(Number(note.size) || 16, 10, 40)}" style="min-width:0;" />
				</div>
				<div class="d-flex align-items-center gap-2 mb-1">
					<span class="small text-muted" style="min-width:4.5em;">Rotation</span>
					<input type="range" class="flex-fill kiln-pte-note-rotation" min="-180" max="180" step="1" value="${clamp(Number(note.rotation) || 0, -180, 180)}" style="min-width:0;" />
				</div>
				<select class="form-select form-select-sm kiln-pte-note-layer">
					<option value="front"${note.layer === "front" ? " selected" : ""}>On top</option>
					<option value="back"${note.layer === "back" ? " selected" : ""}>Behind cards</option>
				</select>
			</div>`,
			)
			.join("");

		for (const row of noteList.querySelectorAll<HTMLElement>("[data-index]")) {
			const note = notes[Number(row.dataset.index)];
			const update = (patch: Partial<ProfileNote>) => {
				Object.assign(note, patch);
				refreshPreview();
			};
			const textEl = row.querySelector<HTMLTextAreaElement>(
				".kiln-pte-note-text",
			)!;
			textEl.value = note.text;
			textEl.addEventListener("input", () => update({ text: textEl.value }));
			const colorEl = row.querySelector<HTMLInputElement>(
				".kiln-pte-note-color",
			)!;
			colorEl.value = note.color;
			colorEl.addEventListener("input", () => update({ color: colorEl.value }));
			const bgEl = row.querySelector<HTMLInputElement>(".kiln-pte-note-bg")!;
			bgEl.value = note.background;
			bgEl.addEventListener("input", () => update({ background: bgEl.value }));
			row
				.querySelector<HTMLInputElement>(".kiln-pte-note-size")!
				.addEventListener("input", (e) =>
					update({ size: Number((e.target as HTMLInputElement).value) }),
				);
			row
				.querySelector<HTMLInputElement>(".kiln-pte-note-rotation")!
				.addEventListener("input", (e) =>
					update({ rotation: Number((e.target as HTMLInputElement).value) }),
				);
			row
				.querySelector<HTMLSelectElement>(".kiln-pte-note-layer")!
				.addEventListener("change", (e) =>
					update({
						layer: (e.target as HTMLSelectElement).value as "front" | "back",
					}),
				);
			row
				.querySelector<HTMLButtonElement>(".kiln-pte-note-remove")!
				.addEventListener("click", () => {
					workingExtras.notes = notes.filter((n) => n !== note);
					renderNoteList();
					refreshPreview();
				});
		}
	}

	noteAdd.addEventListener("click", () => {
		const text = noteText.value.trim();
		if (!text) return;
		if ((workingExtras.notes?.length ?? 0) >= MAX_NOTES) return;
		const placement = stickerPlacementAt(
			(window.innerWidth - sidebar.offsetWidth) / 2,
			window.innerHeight / 2,
		) ?? { anchor: "avatar-card", x: 50, y: 50 };
		workingExtras.notes = [
			...(workingExtras.notes ?? []),
			{
				id: crypto.randomUUID(),
				text,
				...placement,
				size: 16,
				rotation: 0,
				color: "#1a1a1a",
				background: "#fff9c4",
				layer: "front",
			},
		];
		noteText.value = "";
		noteStatus.textContent = "Added. Drag it on the page to place it.";
		renderNoteList();
		refreshPreview();
	});
	noteText.addEventListener("keydown", (e) => {
		if (e.key === "Enter") noteAdd.click();
	});

	function layoutOrder(): string[] {
		const saved = workingExtras.layout?.order ?? [];
		const rest = PROFILE_SECTIONS.map((s) => s.key).filter(
			(k) => !saved.includes(k),
		);
		return [
			...saved.filter((k) => PROFILE_SECTIONS.some((s) => s.key === k)),
			...rest,
		];
	}

	function renderLayoutLists() {
		const order = layoutOrder();
		const hidden = new Set(workingExtras.layout?.hidden ?? []);
		for (const column of ["left", "right"] as const) {
			const keys = order.filter(
				(k) => PROFILE_SECTIONS.find((s) => s.key === k)?.column === column,
			);
			const list = layoutLists[column];
			list.innerHTML = keys
				.map((key, i) => {
					const section = PROFILE_SECTIONS.find((s) => s.key === key)!;
					const isHidden = hidden.has(key);
					return `
				<div class="d-flex align-items-center gap-1 mb-1 px-2 py-1 rounded" style="background:rgba(128,128,128,0.1);${isHidden ? "opacity:0.5;" : ""}">
					<span class="small flex-fill">${section.label}</span>
					<button class="btn btn-sm btn-link p-0 px-1 text-reset" data-move="${key}" data-dir="-1" ${i === 0 ? "disabled" : ""} title="Move up"><i class="fas fa-chevron-up"></i></button>
					<button class="btn btn-sm btn-link p-0 px-1 text-reset" data-move="${key}" data-dir="1" ${i === keys.length - 1 ? "disabled" : ""} title="Move down"><i class="fas fa-chevron-down"></i></button>
					<button class="btn btn-sm btn-link p-0 px-1 text-reset" data-toggle="${key}" title="${isHidden ? "Show" : "Hide"}"><i class="fas ${isHidden ? "fa-eye-slash" : "fa-eye"}"></i></button>
				</div>`;
				})
				.join("");
		}
	}

	for (const list of Object.values(layoutLists)) {
		list.addEventListener("click", (e) => {
			const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
				"button",
			);
			if (!btn || btn.disabled) return;
			const order = layoutOrder();
			const hidden = new Set(workingExtras.layout?.hidden ?? []);

			if (btn.dataset.move) {
				const key = btn.dataset.move;
				const column = PROFILE_SECTIONS.find((s) => s.key === key)!.column;
				const columnKeys = order.filter(
					(k) => PROFILE_SECTIONS.find((s) => s.key === k)?.column === column,
				);
				const from = columnKeys.indexOf(key);
				const to = from + Number(btn.dataset.dir);
				if (to < 0 || to >= columnKeys.length) return;
				const a = order.indexOf(columnKeys[from]);
				const b = order.indexOf(columnKeys[to]);
				[order[a], order[b]] = [order[b], order[a]];
			} else if (btn.dataset.toggle) {
				const key = btn.dataset.toggle;
				if (hidden.has(key)) hidden.delete(key);
				else hidden.add(key);
			}

			workingExtras.layout = { order, hidden: [...hidden] };
			renderLayoutLists();
			refreshPreview();
		});
	}
	el("kiln-pte-layout-reset").addEventListener("click", () => {
		workingExtras.layout = undefined;
		renderLayoutLists();
		refreshPreview();
	});

	const cardsEnabled = el<HTMLInputElement>("kiln-pte-cards-enabled");
	const cardsFields = el("kiln-pte-cards-fields");
	const cardsPreset = el<HTMLSelectElement>("kiln-pte-cards-preset");
	const cardsHover = el<HTMLSelectElement>("kiln-pte-cards-hover");
	const cardsLiquidRow = el("kiln-pte-cards-liquid-row");
	const cardsLiquid = el<HTMLInputElement>("kiln-pte-cards-liquid");
	const cardsTint = el<HTMLInputElement>("kiln-pte-cards-tint");
	const cardsTintAuto = el<HTMLInputElement>("kiln-pte-cards-tint-auto");
	const cardsOpacity = el<HTMLInputElement>("kiln-pte-cards-opacity");
	const cardsOpacityLabel = el("kiln-pte-cards-opacity-label");
	const cardsRadius = el<HTMLInputElement>("kiln-pte-cards-radius");
	const cardsRadiusLabel = el("kiln-pte-cards-radius-label");
	const backdropType = el<HTMLSelectElement>("kiln-pte-backdrop-type");
	const backdropGradient = el("kiln-pte-backdrop-gradient");
	const backdropImage = el("kiln-pte-backdrop-image");
	const backdropColor1 = el<HTMLInputElement>("kiln-pte-backdrop-color1");
	const backdropColor2 = el<HTMLInputElement>("kiln-pte-backdrop-color2");
	const backdropAngle = el<HTMLInputElement>("kiln-pte-backdrop-angle");
	const backdropAngleLabel = el("kiln-pte-backdrop-angle-label");
	const backdropId = el<HTMLInputElement>("kiln-pte-backdrop-id");
	const backdropSet = el<HTMLButtonElement>("kiln-pte-backdrop-set");
	const backdropStatus = el("kiln-pte-backdrop-status");
	const backdropFit = el<HTMLSelectElement>("kiln-pte-backdrop-fit");
	const backdropOpacityRow = el("kiln-pte-backdrop-opacity-row");
	const backdropOpacity = el<HTMLInputElement>("kiln-pte-backdrop-opacity");
	const backdropOpacityLabel = el("kiln-pte-backdrop-opacity-label");
	let backdropImageUrl =
		workingExtras.avatarBackdrop?.type === "image"
			? workingExtras.avatarBackdrop.url
			: "";
	const pointerClick = el<HTMLSelectElement>("kiln-pte-pointer-click");
	const pointerTrail = el<HTMLSelectElement>("kiln-pte-pointer-trail");
	const pointerColor = el<HTMLInputElement>("kiln-pte-pointer-color");
	const pointerColorAuto = el<HTMLInputElement>("kiln-pte-pointer-color-auto");

	function syncNewExtrasInputs() {
		const cards = workingExtras.cardStyle;
		cardsEnabled.checked = !!cards;
		setFieldsEnabled(cardsFields, !!cards);
		cardsPreset.value = cards?.preset ?? "glass";
		cardsHover.value = cards?.hover ?? "none";
		cardsLiquidRow.style.display = cardsPreset.value === "glass" ? "" : "none";
		cardsLiquid.checked = !!cards?.liquidGlass;
		cardsTintAuto.checked = !cards?.tint;
		cardsTint.value = cards?.tint ?? workingNavbar;
		cardsTint.disabled = !cards?.tint;
		const opacity =
			cards?.opacity ??
			CARD_PRESET_OPACITY[cardsPreset.value as ProfileCardStyle["preset"]];
		cardsOpacity.value = String(opacity);
		cardsOpacityLabel.textContent = `${opacity}%`;
		cardsRadius.value = String(cards?.radius ?? 12);
		cardsRadiusLabel.textContent = `${cards?.radius ?? 12}px`;

		const backdrop = workingExtras.avatarBackdrop;
		if (backdrop?.type === "image") backdropImageUrl = backdrop.url;
		backdropType.value = backdrop?.type ?? "";
		backdropGradient.style.display =
			backdrop?.type === "gradient" ? "" : "none";
		backdropImage.style.display = backdrop?.type === "image" ? "" : "none";
		backdropColor1.value =
			backdrop?.type === "gradient" ? backdrop.color1 : workingAccent;
		backdropColor2.value =
			backdrop?.type === "gradient" ? backdrop.color2 : workingNavbar;
		const angle = backdrop?.type === "gradient" ? backdrop.angle : 160;
		backdropAngle.value = String(angle);
		backdropAngleLabel.textContent = `${angle}°`;
		backdropFit.value = backdrop?.type === "image" ? backdrop.fit : "cover";
		backdropStatus.textContent = "";
		backdropOpacityRow.style.display = backdrop ? "" : "none";
		const backdropOpacityValue = backdrop?.opacity ?? 100;
		backdropOpacity.value = String(backdropOpacityValue);
		backdropOpacityLabel.textContent = `${backdropOpacityValue}%`;

		const pointer = workingExtras.pointerEffects;
		pointerClick.value = pointer?.click ?? "";
		pointerTrail.value = pointer?.trail ?? "";
		pointerColorAuto.checked = !pointer?.color;
		pointerColor.value = pointer?.color ?? workingAccent;
		pointerColor.disabled = !pointer?.color;
	}

	function readCardStyle() {
		setFieldsEnabled(cardsFields, cardsEnabled.checked);
		cardsTint.disabled = !cardsEnabled.checked || cardsTintAuto.checked;
		cardsOpacityLabel.textContent = `${cardsOpacity.value}%`;
		cardsRadiusLabel.textContent = `${cardsRadius.value}px`;
		const isGlass = cardsPreset.value === "glass";
		cardsLiquidRow.style.display = isGlass ? "" : "none";
		workingExtras.cardStyle = cardsEnabled.checked
			? {
					preset: cardsPreset.value as ProfileCardStyle["preset"],
					hover: cardsHover.value as ProfileCardStyle["hover"],
					opacity: Number(cardsOpacity.value),
					radius: Number(cardsRadius.value),
					...(cardsTintAuto.checked ? {} : { tint: cardsTint.value }),
					...(isGlass && cardsLiquid.checked ? { liquidGlass: true } : {}),
				}
			: undefined;
		refreshPreview();
	}
	cardsPreset.addEventListener("change", () => {
		const opacity =
			CARD_PRESET_OPACITY[cardsPreset.value as ProfileCardStyle["preset"]];
		cardsOpacity.value = String(opacity);
		readCardStyle();
	});
	for (const input of [cardsEnabled, cardsHover, cardsTintAuto, cardsLiquid])
		input.addEventListener("change", readCardStyle);
	for (const input of [cardsTint, cardsOpacity, cardsRadius])
		input.addEventListener("input", readCardStyle);

	function readBackdrop() {
		const type = backdropType.value;
		backdropGradient.style.display = type === "gradient" ? "" : "none";
		backdropImage.style.display = type === "image" ? "" : "none";
		backdropAngleLabel.textContent = `${backdropAngle.value}°`;
		backdropOpacityRow.style.display = type ? "" : "none";
		const opacity = Number(backdropOpacity.value);
		backdropOpacityLabel.textContent = `${opacity}%`;
		if (type === "gradient") {
			workingExtras.avatarBackdrop = {
				type,
				color1: backdropColor1.value,
				color2: backdropColor2.value,
				angle: Number(backdropAngle.value),
				...(opacity < 100 ? { opacity } : {}),
			};
		} else if (type === "image" && backdropImageUrl) {
			workingExtras.avatarBackdrop = {
				type,
				url: backdropImageUrl,
				fit: backdropFit.value as "cover" | "contain",
				...(opacity < 100 ? { opacity } : {}),
			};
		} else {
			workingExtras.avatarBackdrop = undefined;
		}
		refreshPreview();
	}
	for (const input of [backdropType, backdropFit])
		input.addEventListener("change", readBackdrop);
	for (const input of [
		backdropColor1,
		backdropColor2,
		backdropAngle,
		backdropOpacity,
	])
		input.addEventListener("input", readBackdrop);
	backdropSet.addEventListener("click", async () => {
		backdropSet.disabled = true;
		backdropStatus.textContent = "Looking up decal…";
		const url = await resolveDecalUrl(backdropId.value);
		backdropSet.disabled = false;
		if (!url) {
			backdropStatus.textContent =
				"Couldn't find that decal. Check the ID and try again.";
			return;
		}
		backdropImageUrl = url;
		backdropId.value = "";
		readBackdrop();
		backdropStatus.textContent = "Backdrop set.";
	});
	backdropId.addEventListener("keydown", (e) => {
		if (e.key === "Enter") backdropSet.click();
	});

	function readPointerEffects() {
		pointerColor.disabled = pointerColorAuto.checked;
		const effects: ProfilePointerEffects = {
			...(pointerClick.value
				? { click: pointerClick.value as ProfilePointerEffects["click"] }
				: {}),
			...(pointerTrail.value
				? { trail: pointerTrail.value as ProfilePointerEffects["trail"] }
				: {}),
			...(pointerColorAuto.checked ? {} : { color: pointerColor.value }),
		};
		workingExtras.pointerEffects =
			effects.click || effects.trail ? effects : undefined;
		refreshPreview();
	}
	for (const input of [pointerClick, pointerTrail, pointerColorAuto])
		input.addEventListener("change", readPointerEffects);
	pointerColor.addEventListener("input", readPointerEffects);

	window.addEventListener("focus", recheckVerification);

	verifyNotice.style.display = verified ? "none" : "";
	syncInputs();
	updateStateBadge();
	refreshPreview();
	if (themeLoadFailed) showLoadError();
}
