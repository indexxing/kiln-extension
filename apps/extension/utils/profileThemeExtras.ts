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
import { POLYTORIA_CDN_URL } from "@/utils/decal";
import { FONTS, hexToRgb, isValidHex } from "@/utils/theme";
import {
	applyAmbient as sharedApplyAmbient,
	applyCardStyle as sharedApplyCardStyle,
	applyPointerEffects as sharedApplyPointerEffects,
} from "@/utils/visualEffects";

export type ProfileLayout = Extension.ProfileLayout;
export type ProfileUsernameStyle = Extension.ProfileUsernameStyle;
export type ProfileBanner = Extension.ProfileBanner;
export type ProfileAmbient = Extension.ProfileAmbient;
export type ProfileSticker = Extension.ProfileSticker;
export type ProfileNote = Extension.ProfileNote;
export type ProfileCardStyle = Extension.ProfileCardStyle;
export type ProfileAvatarBackdrop = Extension.ProfileAvatarBackdrop;
export type ProfilePointerEffects = Extension.ProfilePointerEffects;
export type ProfileAmbientType = ProfileAmbient["type"];

export type ProfileThemeExtras = {
	layout?: ProfileLayout;
	usernameStyle?: ProfileUsernameStyle;
	banner?: ProfileBanner;
	ambient?: ProfileAmbient;
	stickers?: ProfileSticker[];
	notes?: ProfileNote[];
	cardStyle?: ProfileCardStyle;
	avatarBackdrop?: ProfileAvatarBackdrop;
	pointerEffects?: ProfilePointerEffects;
};

export const MAX_STICKERS = 10;
export const MAX_NOTES = 10;

export type ProfileSectionKey =
	| "info"
	| "streak"
	| "records"
	| "rankings"
	| "divide"
	| "avatar"
	| "about"
	| "achievements"
	| "creations"
	| "images"
	| "tabs";

export const PROFILE_SECTIONS: {
	key: ProfileSectionKey;
	label: string;
	column: "left" | "right";
}[] = [
	{ key: "info", label: "Info", column: "left" },
	{ key: "streak", label: "Streak", column: "left" },
	{ key: "records", label: "Historical Records", column: "left" },
	{ key: "rankings", label: "Ranking Positions", column: "left" },
	{ key: "divide", label: "The Great Divide", column: "left" },
	{ key: "avatar", label: "Avatar", column: "right" },
	{ key: "about", label: "About", column: "right" },
	{ key: "achievements", label: "Pinned Achievements", column: "right" },
	{ key: "creations", label: "Creations", column: "right" },
	{ key: "images", label: "Images", column: "right" },
	{ key: "tabs", label: "Friends / Guilds / Wall", column: "right" },
];

export function stickerAnchorLabel(key: string): string {
	if (key === "banner") return "Banner";
	if (key === "avatar-card") return "Avatar Card";
	if (key === PAGE_ANCHOR) return "Profile";
	return PROFILE_SECTIONS.find((s) => s.key === key)?.label ?? key;
}

const BASE_STYLE_ID = "kiln-pt-base";
const USERNAME_STYLE_ID = "kiln-pt-username";
const USERNAME_FONT_ID = "kiln-pt-username-font";
const BANNER_ID = "kiln-pt-banner";
const AMBIENT_ID = "kiln-pt-ambient";
const HIDDEN_CLASS = "kiln-pt-hidden";
const STICKER_CLASS = "kiln-pt-sticker";
const STICKER_LAYER_ID = "kiln-pt-stickers";
const NOTE_CLASS = "kiln-pt-note";
const NOTE_LAYER_ID = "kiln-pt-notes";
const PAGE_ANCHOR = "page";

const SECTION_TITLE_ICONS: [string, ProfileSectionKey][] = [
	["fa-user-circle", "info"],
	["fa-ranking-star", "rankings"],
	["fa-swords", "divide"],
	["fa-star", "records"],
	["fa-user-crown", "avatar"],
	["fa-info-circle", "about"],
	["fa-trophy", "achievements"],
	["fa-pen-ruler", "creations"],
	["fa-image", "images"],
];

type StickerEditing = {
	onStickerMove: (id: string, anchor: string, x: number, y: number) => void;
	onNoteMove?: (id: string, anchor: string, x: number, y: number) => void;
	ignoreWithin?: HTMLElement;
};

let current: ProfileThemeExtras | null = null;
let editing: StickerEditing | null = null;
let layoutTouched = false;
let columnObserver: MutationObserver | null = null;

function ensureBaseStyle() {
	if (document.getElementById(BASE_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = BASE_STYLE_ID;
	style.textContent = `
		.${HIDDEN_CLASS} { display: none !important; }
		.${STICKER_CLASS} {
			position: absolute;
			pointer-events: none;
			user-select: none;
			-webkit-user-drag: none;
			max-width: none !important;
		}
		.${NOTE_CLASS} {
			position: absolute;
			pointer-events: none;
			user-select: none;
			width: max-content;
			max-width: 220px;
			padding: 10px 12px;
			border-radius: 6px;
			box-shadow: 0 4px 14px rgba(0,0,0,0.35);
			line-height: 1.3;
			white-space: pre-wrap;
			word-break: break-word;
			text-align: left;
		}
		.${STICKER_CLASS}.kiln-pt-sticker-editable,
		.${NOTE_CLASS}.kiln-pt-sticker-editable {
			outline: 1px dashed rgba(255,255,255,0.45);
			outline-offset: 2px;
		}
		html.kiln-pt-grab, html.kiln-pt-grab * { cursor: grab !important; }
		html.kiln-pt-grabbing, html.kiln-pt-grabbing * {
			cursor: grabbing !important;
			user-select: none !important;
		}
		@keyframes kiln-pt-shimmer {
			from { background-position: 0% center; }
			to { background-position: 200% center; }
		}
	`;
	document.head.appendChild(style);
}

function getColumns(): { left: HTMLElement | null; right: HTMLElement | null } {
	const left = document.querySelector<HTMLElement>(".user-right");
	const right =
		left?.parentElement?.querySelector<HTMLElement>(":scope > .col-8") ?? null;
	return { left, right };
}

function sectionKeyOf(el: Element): ProfileSectionKey | null {
	if (el.id === "user-streak-card") return "streak";
	if (el.querySelector("#user-menu-tabs-card")) return "tabs";
	const title = el.matches("h6.section-title")
		? el
		: el.querySelector(":scope > h6.section-title");
	const icon = title?.querySelector("i");
	if (!icon) return null;
	for (const [cls, key] of SECTION_TITLE_ICONS)
		if (icon.classList.contains(cls)) return key;
	return null;
}

type SectionGroup = { key: ProfileSectionKey | null; els: HTMLElement[] };

function groupColumn(column: HTMLElement): SectionGroup[] {
	const groups: SectionGroup[] = [];
	for (const child of Array.from(column.children) as HTMLElement[]) {
		const key = sectionKeyOf(child);
		if (key || groups.length === 0) groups.push({ key, els: [child] });
		else groups[groups.length - 1].els.push(child);
	}
	return groups;
}

function findSectionGroup(key: string): SectionGroup | null {
	const { left, right } = getColumns();
	for (const column of [left, right]) {
		if (!column) continue;
		const group = groupColumn(column).find((g) => g.key === key);
		if (group) return group;
	}
	return null;
}

function applyLayout(layout: ProfileLayout | undefined) {
	if (!layout && !layoutTouched) return;
	layoutTouched = !!layout;

	const order = layout?.order ?? [];
	const hidden = new Set(layout?.hidden ?? []);
	const defaultRank = (key: string) =>
		1000 + PROFILE_SECTIONS.findIndex((s) => s.key === key);
	const rank = (key: string) => {
		const i = order.indexOf(key);
		return i === -1 ? defaultRank(key) : i;
	};

	for (const column of Object.values(getColumns())) {
		if (!column) continue;
		const groups = groupColumn(column);

		for (const group of groups) {
			const hide = !!group.key && hidden.has(group.key);
			for (const el of group.els) el.classList.toggle(HIDDEN_CLASS, hide);
		}

		const pinned = groups.filter((g) => !g.key);
		const sorted = groups
			.filter((g) => g.key)
			.sort((a, b) => rank(a.key!) - rank(b.key!));
		const desired = [...pinned, ...sorted].flatMap((g) => g.els);
		const actual = Array.from(column.children);
		if (desired.every((el, i) => actual[i] === el)) continue;
		for (const el of desired) column.appendChild(el);
	}
}

function watchColumns() {
	if (columnObserver) return;
	columnObserver = new MutationObserver(() => {
		columnObserver?.disconnect();
		applyLayout(current?.layout);
		renderStickers();
		renderNotes();
		observeColumns();
	});
	observeColumns();
}

function observeColumns() {
	if (!columnObserver) return;
	for (const column of Object.values(getColumns()))
		if (column) columnObserver.observe(column, { childList: true });
}

function applyUsernameStyle(style: ProfileUsernameStyle | undefined) {
	document.getElementById(USERNAME_STYLE_ID)?.remove();
	const fontLink = document.getElementById(USERNAME_FONT_ID);
	if (!style) {
		fontLink?.remove();
		return;
	}

	const color1 = isValidHex(style.color1) ? style.color1 : "#ffffff";
	const color2 =
		style.color2 && isValidHex(style.color2) ? style.color2 : color1;

	const rules: string[] = [];
	if (style.mode === "gradient") {
		const stops = style.animated
			? `${color1}, ${color2}, ${color1}`
			: `${color1}, ${color2}`;
		rules.push(
			`background-image: linear-gradient(90deg, ${stops}) !important`,
			"-webkit-background-clip: text !important",
			"background-clip: text !important",
			"color: transparent !important",
			"-webkit-text-fill-color: transparent !important",
		);
		if (style.animated)
			rules.push(
				"background-size: 200% auto !important",
				"animation: kiln-pt-shimmer 3s linear infinite",
			);
	} else {
		rules.push(
			`color: ${color1} !important`,
			`-webkit-text-fill-color: ${color1} !important`,
		);
	}

	const glowSize = style.glowSize
		? Math.min(24, Math.max(0, style.glowSize))
		: 0;
	if (style.glowColor && isValidHex(style.glowColor) && glowSize > 0)
		rules.push(`filter: drop-shadow(0 0 ${glowSize}px ${style.glowColor})`);

	const font =
		style.fontFamily && style.fontFamily !== "default"
			? FONTS[style.fontFamily]
			: null;
	let fontFace = "";
	if (font?.googleFamily) {
		if (fontLink?.getAttribute("data-family") !== font.googleFamily) {
			fontLink?.remove();
			const link = document.createElement("link");
			link.id = USERNAME_FONT_ID;
			link.rel = "stylesheet";
			link.href = `https://fonts.googleapis.com/css2?family=${font.googleFamily}&display=swap`;
			link.setAttribute("data-family", font.googleFamily);
			document.head.appendChild(link);
		}
	} else {
		fontLink?.remove();
	}
	if (font?.localFile) {
		const fontName = font.stack.match(/^'([^']+)'/)?.[1] ?? "KilnUsernameFont";
		fontFace = `@font-face { font-family: '${fontName}'; src: url('${browser.runtime.getURL(font.localFile as any)}') format('truetype'); }\n`;
	}
	if (font?.stack) rules.push(`font-family: ${font.stack} !important`);

	const el = document.createElement("style");
	el.id = USERNAME_STYLE_ID;
	el.textContent = `${fontFace}.user-right h4.text-themeglow > [class^="userlink-"] { ${rules.join("; ")}; }`;
	document.head.appendChild(el);
}

function applyBanner(banner: ProfileBanner | undefined) {
	let el = document.getElementById(BANNER_ID);
	if (!banner || !POLYTORIA_CDN_URL.test(banner.url)) {
		el?.remove();
		return;
	}

	const container = document
		.querySelector(".user-right")
		?.closest<HTMLElement>(".container");
	if (!container) return;

	if (!el) {
		el = document.createElement("div");
		el.id = BANNER_ID;
		Object.assign(el.style, {
			position: "relative",
			width: "100%",
			marginBottom: "1rem",
			borderRadius: "var(--bs-border-radius-lg, 12px)",
			backgroundSize: "cover",
			backgroundRepeat: "no-repeat",
		});
		container.prepend(el);
	}
	el.style.height = `${banner.height}px`;
	el.style.backgroundImage = `url(${JSON.stringify(banner.url)})`;
	el.style.backgroundPosition = `center ${banner.position}`;
}

function applyAmbient(ambient: ProfileAmbient | undefined) {
	sharedApplyAmbient(AMBIENT_ID, ambient);
}

function stickerAnchors(): Map<HTMLElement, string> {
	const anchors = new Map<HTMLElement, string>();
	const banner = document.getElementById(BANNER_ID);
	if (banner) anchors.set(banner, "banner");
	const avatarCard = document.getElementById("user-avatar-card");
	if (avatarCard) anchors.set(avatarCard, "avatar-card");
	for (const { key } of PROFILE_SECTIONS) {
		const card = findSectionGroup(key)
			?.els.map((el) =>
				el.classList.contains("card")
					? el
					: el.querySelector<HTMLElement>(".card"),
			)
			.find(Boolean);
		if (card) anchors.set(card, key);
	}
	const page =
		document.querySelector<HTMLElement>(".user-right")?.parentElement;
	if (page) anchors.set(page, PAGE_ANCHOR);
	return anchors;
}

function stickerLayer(): HTMLElement {
	let layer = document.getElementById(STICKER_LAYER_ID);
	if (!layer) {
		layer = document.createElement("div");
		layer.id = STICKER_LAYER_ID;
		Object.assign(layer.style, {
			position: "absolute",
			top: "0",
			left: "0",
			width: "0",
			height: "0",
		});
		document.body.appendChild(layer);
	}
	return layer;
}

function noteLayer(): HTMLElement {
	let layer = document.getElementById(NOTE_LAYER_ID);
	if (!layer) {
		layer = document.createElement("div");
		layer.id = NOTE_LAYER_ID;
		Object.assign(layer.style, {
			position: "absolute",
			top: "0",
			left: "0",
			width: "0",
			height: "0",
		});
		document.body.appendChild(layer);
	}
	return layer;
}

let dragging: {
	el: HTMLElement;
	offsetX: number;
	offsetY: number;
	moved: boolean;
} | null = null;

function positionPinLayer(
	layerId: string,
	pins: { id: string; anchor: string; x: number; y: number }[],
) {
	const layer = document.getElementById(layerId);
	if (!layer) return;
	const byKey = new Map<string, HTMLElement>();
	for (const [el, key] of stickerAnchors()) byKey.set(key, el);

	for (const node of Array.from(layer.children) as HTMLElement[]) {
		if (node === dragging?.el) continue;
		const pin = pins.find((p) => p.id === node.dataset.pinId);
		const rect = pin && byKey.get(pin.anchor)?.getBoundingClientRect();
		if (!pin || !rect || (!rect.width && !rect.height)) {
			node.style.display = "none";
			continue;
		}
		node.style.display = "";
		node.style.left = `${rect.left + window.scrollX + (rect.width * pin.x) / 100}px`;
		node.style.top = `${rect.top + window.scrollY + (rect.height * pin.y) / 100}px`;
	}
}

function positionStickers() {
	positionPinLayer(STICKER_LAYER_ID, current?.stickers ?? []);
}

function positionNotes() {
	positionPinLayer(NOTE_LAYER_ID, current?.notes ?? []);
}

let positionFrame = 0;
function schedulePositionPins() {
	if (positionFrame) return;
	positionFrame = requestAnimationFrame(() => {
		positionFrame = 0;
		positionStickers();
		positionNotes();
	});
}

let pinResizeObserver: ResizeObserver | null = null;

function syncPinLifecycle() {
	const active = !!(current?.stickers?.length || current?.notes?.length);
	if (active && !pinResizeObserver) {
		pinResizeObserver = new ResizeObserver(schedulePositionPins);
		pinResizeObserver.observe(document.body);
		window.addEventListener("resize", schedulePositionPins);
	} else if (!active && pinResizeObserver) {
		pinResizeObserver.disconnect();
		pinResizeObserver = null;
		window.removeEventListener("resize", schedulePositionPins);
	}
}

function renderStickers() {
	if (dragging) return;
	const stickers = (current?.stickers ?? []).filter((s) =>
		POLYTORIA_CDN_URL.test(s.url),
	);

	if (stickers.length === 0) {
		document.getElementById(STICKER_LAYER_ID)?.remove();
		return;
	}

	const layer = stickerLayer();
	layer.replaceChildren(
		...stickers.map((sticker) => {
			const img = document.createElement("img");
			img.className = STICKER_CLASS;
			if (editing) img.classList.add("kiln-pt-sticker-editable");
			img.src = sticker.url;
			img.alt = "";
			img.draggable = false;
			img.dataset.pinId = sticker.id;
			img.dataset.stickerId = sticker.id;
			Object.assign(img.style, {
				width: `${Math.min(400, Math.max(16, sticker.size))}px`,
				transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
				zIndex: sticker.layer === "back" ? "-1" : "500",
			});
			img.addEventListener("load", schedulePositionPins, { once: true });
			return img;
		}),
	);
	positionStickers();
}

function renderNotes() {
	if (dragging) return;
	const notes = current?.notes ?? [];

	if (notes.length === 0) {
		document.getElementById(NOTE_LAYER_ID)?.remove();
		return;
	}

	const layer = noteLayer();
	layer.replaceChildren(
		...notes.map((note) => {
			const div = document.createElement("div");
			div.className = NOTE_CLASS;
			if (editing) div.classList.add("kiln-pt-sticker-editable");
			div.textContent = note.text;
			div.dataset.pinId = note.id;
			div.dataset.noteId = note.id;
			Object.assign(div.style, {
				fontSize: `${note.size}px`,
				color: note.color,
				background: note.background,
				transform: `translate(-50%, -50%) rotate(${note.rotation}deg)`,
				zIndex: note.layer === "back" ? "-1" : "500",
			});
			return div;
		}),
	);
	positionNotes();
}

function pinAt(x: number, y: number): HTMLElement | null {
	const nodes = [STICKER_LAYER_ID, NOTE_LAYER_ID].flatMap((id) => {
		const layer = document.getElementById(id);
		return layer ? (Array.from(layer.children) as HTMLElement[]) : [];
	});
	const sorted = nodes
		.reverse()
		.sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
	return (
		sorted.find((node) => {
			if (node.style.display === "none") return false;
			const r = node.getBoundingClientRect();
			return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
		}) ?? null
	);
}

function isIgnoredTarget(target: EventTarget | null) {
	return (
		!!editing?.ignoreWithin &&
		target instanceof Node &&
		editing.ignoreWithin.contains(target)
	);
}

function onEditPointerMove(e: PointerEvent) {
	const root = document.documentElement;
	if (!dragging) {
		root.classList.toggle(
			"kiln-pt-grab",
			!isIgnoredTarget(e.target) && !!pinAt(e.clientX, e.clientY),
		);
		return;
	}
	dragging.moved = true;
	dragging.el.style.left = `${e.pageX - dragging.offsetX}px`;
	dragging.el.style.top = `${e.pageY - dragging.offsetY}px`;
}

function onEditPointerDown(e: PointerEvent) {
	if (e.button !== 0 || isIgnoredTarget(e.target)) return;
	const el = pinAt(e.clientX, e.clientY);
	if (!el) return;
	e.preventDefault();
	e.stopPropagation();
	const r = el.getBoundingClientRect();
	dragging = {
		el,
		offsetX: e.clientX - (r.left + r.width / 2),
		offsetY: e.clientY - (r.top + r.height / 2),
		moved: false,
	};
	document.documentElement.classList.remove("kiln-pt-grab");
	document.documentElement.classList.add("kiln-pt-grabbing");
}

function onEditPointerUp(e: PointerEvent) {
	if (!dragging) return;
	const { el, offsetX, offsetY, moved } = dragging;
	dragging = null;
	document.documentElement.classList.remove("kiln-pt-grabbing");

	if (!moved) return;

	const suppressClick = (click: MouseEvent) => {
		click.preventDefault();
		click.stopPropagation();
	};
	window.addEventListener("click", suppressClick, {
		capture: true,
		once: true,
	});
	requestAnimationFrame(() =>
		window.removeEventListener("click", suppressClick, { capture: true }),
	);

	const placement = stickerPlacementAt(
		e.clientX - offsetX,
		e.clientY - offsetY,
	);
	if (!placement) return;
	if (el.dataset.stickerId)
		editing?.onStickerMove(
			el.dataset.stickerId,
			placement.anchor,
			placement.x,
			placement.y,
		);
	else if (el.dataset.noteId)
		editing?.onNoteMove?.(
			el.dataset.noteId,
			placement.anchor,
			placement.x,
			placement.y,
		);
}

export function stickerPlacementAt(
	clientX: number,
	clientY: number,
): { anchor: string; x: number; y: number } | null {
	const anchors = stickerAnchors();

	let anchorEl: HTMLElement | null = null;
	for (const hit of document.elementsFromPoint(clientX, clientY)) {
		for (let n: Element | null = hit; n; n = n.parentElement) {
			if (anchors.has(n as HTMLElement)) {
				anchorEl = n as HTMLElement;
				break;
			}
		}
		if (anchorEl) break;
	}
	anchorEl ??= [...anchors].find(([, key]) => key === PAGE_ANCHOR)?.[0] ?? null;
	if (!anchorEl) return null;

	const rect = anchorEl.getBoundingClientRect();
	if (!rect.width || !rect.height) return null;
	const toPercent = (offset: number, size: number) =>
		Math.round(Math.min(150, Math.max(-50, (offset / size) * 100)) * 100) / 100;
	return {
		anchor: anchors.get(anchorEl)!,
		x: toPercent(clientX - rect.left, rect.width),
		y: toPercent(clientY - rect.top, rect.height),
	};
}

let editListenersAttached = false;
function setEditListeners(attach: boolean) {
	if (attach === editListenersAttached) return;
	editListenersAttached = attach;
	const method = attach ? "addEventListener" : "removeEventListener";
	window[method]("pointerdown", onEditPointerDown as EventListener, true);
	window[method]("pointermove", onEditPointerMove as EventListener, true);
	window[method]("pointerup", onEditPointerUp as EventListener, true);
	if (!attach) {
		dragging = null;
		document.documentElement.classList.remove(
			"kiln-pt-grab",
			"kiln-pt-grabbing",
		);
	}
}

const CARD_STYLE_ID = "kiln-pt-cards";
const PAGE_CLASS = "kiln-pt-page";
const OUTER_CARD = `.${PAGE_CLASS} .card:not(.card .card)`;

function getProfileRow(): HTMLElement | null {
	return (
		document.querySelector<HTMLElement>(".user-right")?.parentElement ?? null
	);
}

function applyCardStyle(style: ProfileCardStyle | undefined) {
	const row = getProfileRow();
	row?.classList.toggle(PAGE_CLASS, !!style);
	if (!row) return;
	sharedApplyCardStyle(CARD_STYLE_ID, style, OUTER_CARD, row);
}

const AVATAR_BACKDROP_ID = "kiln-pt-avatar-backdrop";
const AVATAR_IFRAME_STYLE_ID = "kiln-pt-iframe-transparent";
let avatarIframeHooked = false;

function setAvatarIframeTransparent(transparent: boolean) {
	const iframe = document.getElementById(
		"avatar3dIframe",
	) as HTMLIFrameElement | null;
	if (!iframe) return;

	const sync = () => {
		try {
			const doc = iframe.contentDocument;
			if (!doc?.head) return;
			const existing = doc.getElementById(AVATAR_IFRAME_STYLE_ID);
			if (!document.getElementById(AVATAR_BACKDROP_ID)) {
				existing?.remove();
				return;
			}
			if (existing) return;
			const style = doc.createElement("style");
			style.id = AVATAR_IFRAME_STYLE_ID;
			style.textContent =
				"html, body, canvas { background: transparent !important; }";
			doc.head.appendChild(style);
		} catch {}
	};

	if (transparent && !avatarIframeHooked) {
		avatarIframeHooked = true;
		iframe.addEventListener("load", sync);
	}
	sync();
}

function applyAvatarBackdrop(backdrop: ProfileAvatarBackdrop | undefined) {
	document.getElementById(AVATAR_BACKDROP_ID)?.remove();
	let background: string | null = null;
	if (backdrop?.type === "gradient") {
		const alpha = (backdrop.opacity ?? 100) / 100;
		const [r1, g1, b1] = hexToRgb(backdrop.color1);
		const [r2, g2, b2] = hexToRgb(backdrop.color2);
		background = `linear-gradient(${backdrop.angle}deg, rgba(${r1},${g1},${b1},${alpha}), rgba(${r2},${g2},${b2},${alpha}))`;
	} else if (
		backdrop?.type === "image" &&
		POLYTORIA_CDN_URL.test(backdrop.url)
	) {
		const fade = 1 - (backdrop.opacity ?? 100) / 100;
		const image = `url(${JSON.stringify(backdrop.url)}) center / ${backdrop.fit} no-repeat`;
		background =
			fade > 0
				? `linear-gradient(rgba(var(--bs-tertiary-bg-rgb, 33,37,41), ${fade}), rgba(var(--bs-tertiary-bg-rgb, 33,37,41), ${fade})), ${image}`
				: image;
	}

	if (background) {
		const el = document.createElement("style");
		el.id = AVATAR_BACKDROP_ID;
		el.textContent = `#user-avatar-card .position-relative:has(> #avatar2dImg) { background: ${background} !important; border-radius: 10px; }`;
		document.head.appendChild(el);
	}
	setAvatarIframeTransparent(!!background);
}

function applyPointerEffects(effects: ProfilePointerEffects | undefined) {
	sharedApplyPointerEffects("kiln-pt-pointer", effects);
}

export function applyProfileExtras(
	extras: ProfileThemeExtras | null,
	options: { editing?: StickerEditing } = {},
) {
	ensureBaseStyle();
	current = extras;
	editing = options.editing ?? null;

	columnObserver?.disconnect();
	applyLayout(extras?.layout);
	applyUsernameStyle(extras?.usernameStyle);
	applyBanner(extras?.banner);
	applyAmbient(extras?.ambient);
	applyCardStyle(extras?.cardStyle);
	applyAvatarBackdrop(extras?.avatarBackdrop);
	applyPointerEffects(extras?.pointerEffects);
	renderStickers();
	renderNotes();
	syncPinLifecycle();
	setEditListeners(
		!!editing && !!(extras?.stickers?.length || extras?.notes?.length),
	);

	if (extras) {
		if (columnObserver) observeColumns();
		else watchColumns();
	} else {
		columnObserver = null;
	}
}

export function clearProfileExtras() {
	applyProfileExtras(null);
}

export function extrasFromTheme(theme: {
	layout?: ProfileLayout | null;
	usernameStyle?: ProfileUsernameStyle | null;
	banner?: ProfileBanner | null;
	ambient?: ProfileAmbient | null;
	stickers?: ProfileSticker[] | null;
	notes?: ProfileNote[] | null;
	cardStyle?: ProfileCardStyle | null;
	avatarBackdrop?: ProfileAvatarBackdrop | null;
	pointerEffects?: ProfilePointerEffects | null;
}): ProfileThemeExtras {
	return {
		layout: theme.layout ?? undefined,
		usernameStyle: theme.usernameStyle ?? undefined,
		banner: theme.banner ?? undefined,
		ambient: theme.ambient ?? undefined,
		stickers: theme.stickers?.length ? theme.stickers : undefined,
		notes: theme.notes?.length ? theme.notes : undefined,
		cardStyle: theme.cardStyle ?? undefined,
		avatarBackdrop: theme.avatarBackdrop ?? undefined,
		pointerEffects: theme.pointerEffects ?? undefined,
	};
}
