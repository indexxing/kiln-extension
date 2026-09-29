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

import { Theme } from "@kiln/schemas";
import { POLYTORIA_CDN_URL } from "@/utils/decal";
import { sendMessage } from "@/utils/messaging";
import metadata from "@/utils/static/metadata.json";
import {
	type Ambient,
	applyAmbient,
	applyCardStyle,
	applyPointerEffects,
	type CardStyle,
	type PointerEffects,
} from "@/utils/visualEffects";
import type { ThemeEffect } from "./types";

export const {
	EFFECT_SLOTS,
	EFFECT_TYPE_CONFIGS,
	FONTS,
	THEME_PRESETS,
	COLOR_TOKENS,
	SELECTOR_REFERENCE,
	hexToRgb,
	rgbToHex,
	rgbToHsl,
	hslToRgb,
	darkenHex,
	lightenHex,
	getContrastColor,
	isValidHex,
	hexToIconFilter,
	buildThemeCSS,
} = Theme;

export function proxyThemeImageUrl(url: string): string {
	const trimmed = url.trim();
	if (
		!trimmed ||
		trimmed.startsWith("data:") ||
		trimmed.startsWith(metadata.endpoints.extension) ||
		POLYTORIA_CDN_URL.test(trimmed)
	)
		return trimmed;
	return `${metadata.endpoints.extension}theme/image?url=${encodeURIComponent(trimmed)}`;
}

export function buildEffectsCSS(effects: ThemeEffect[]): string {
	return Theme.buildEffectsCSS(effects, proxyThemeImageUrl);
}

const resolvedAudioUrls = new Map<number, string>();

async function resolveAudioUrl(assetId: number): Promise<string | null> {
	const cached = resolvedAudioUrls.get(assetId);
	if (cached) return cached;
	const result = await sendMessage("getAssetAudio", assetId);
	if (!result.ok || !result.data.url) return null;
	resolvedAudioUrls.set(assetId, result.data.url);
	return result.data.url;
}

let clickSoundListener: ((e: MouseEvent) => void) | null = null;

async function playClickSound(assetId: number) {
	const url = await resolveAudioUrl(assetId);
	if (url) new Audio(url).play().catch(() => {});
}

function getClickSoundAssetId(effects?: ThemeEffect[]): number | null {
	const effect = effects?.find(
		(e) => e.slot === "global" && e.type === "clicking-sound",
	);
	const id = Number(effect?.value);
	return effect && Number.isFinite(id) && id > 0 ? id : null;
}

function applyClickSound(effects?: ThemeEffect[]) {
	if (clickSoundListener) {
		document.removeEventListener("click", clickSoundListener, true);
		clickSoundListener = null;
	}
	const assetId = getClickSoundAssetId(effects);
	if (assetId === null) return;
	clickSoundListener = () => playClickSound(assetId);
	document.addEventListener("click", clickSoundListener, true);
}

export function parseAssetVolume(
	value: string | number,
): { assetId: number; volume: number } | null {
	const [idPart, volumePart] = String(value).split(":");
	const assetId = Number(idPart);
	if (!Number.isFinite(assetId) || assetId <= 0) return null;
	const volume = Number(volumePart);
	return {
		assetId,
		volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 50,
	};
}

let bgMusicAudio: HTMLAudioElement | null = null;
let bgMusicAssetId: number | null = null;
let bgMusicToken = 0;
let bgMusicClickListener: (() => void) | null = null;

function stopBackgroundMusic() {
	bgMusicAudio?.pause();
	bgMusicAudio?.remove();
	bgMusicAudio = null;
	bgMusicAssetId = null;
	if (bgMusicClickListener) {
		document.removeEventListener("click", bgMusicClickListener);
		bgMusicClickListener = null;
	}
}

const BG_MUSIC_POSITION_KEY = "kiln-bg-music-position";

function saveBackgroundMusicPosition() {
	if (!bgMusicAudio || bgMusicAssetId === null) return;
	try {
		localStorage.setItem(
			BG_MUSIC_POSITION_KEY,
			JSON.stringify({
				assetId: bgMusicAssetId,
				currentTime: bgMusicAudio.currentTime,
				timestamp: Date.now(),
			}),
		);
	} catch {}
}

window.addEventListener("pagehide", saveBackgroundMusicPosition);

function loadBackgroundMusicPosition(assetId: number): number | null {
	try {
		const raw = localStorage.getItem(BG_MUSIC_POSITION_KEY);
		if (!raw) return null;
		const saved = JSON.parse(raw) as {
			assetId: number;
			currentTime: number;
			timestamp: number;
		};
		if (saved.assetId !== assetId) return null;
		return saved.currentTime + (Date.now() - saved.timestamp) / 1000;
	} catch {
		return null;
	}
}

const BG_MUSIC_LOCK_NAME = "kiln-bg-music-playback";
const HAS_WEB_LOCKS = typeof navigator !== "undefined" && "locks" in navigator;

let bgMusicWantedAssetId: number | null = null;
let bgMusicWantedVolume = 50;
let bgMusicHasLock = false;
let bgMusicLockRequested = false;
let releaseBgMusicLock: (() => void) | null = null;

function requestBgMusicLock() {
	if (bgMusicLockRequested) return;
	bgMusicLockRequested = true;
	navigator.locks.request(BG_MUSIC_LOCK_NAME, () => {
		bgMusicHasLock = true;
		startWantedBackgroundMusic();
		return new Promise<void>((resolve) => {
			releaseBgMusicLock = () => {
				bgMusicHasLock = false;
				bgMusicLockRequested = false;
				releaseBgMusicLock = null;
				resolve();
			};
		});
	});
}

async function startWantedBackgroundMusic() {
	if (bgMusicWantedAssetId === null) {
		releaseBgMusicLock?.();
		return;
	}

	if (bgMusicAudio && bgMusicAssetId === bgMusicWantedAssetId) {
		bgMusicAudio.volume = bgMusicWantedVolume / 100;
		return;
	}

	stopBackgroundMusic();
	const assetId = bgMusicWantedAssetId;
	bgMusicAssetId = assetId;
	const token = ++bgMusicToken;
	const url = await resolveAudioUrl(assetId);
	if (token !== bgMusicToken || !url || bgMusicWantedAssetId !== assetId)
		return;

	const audio = new Audio(url);
	audio.id = "kiln-custom-bg-music";
	audio.loop = true;
	audio.volume = bgMusicWantedVolume / 100;

	const resumeAt = loadBackgroundMusicPosition(assetId);
	if (resumeAt !== null) {
		audio.addEventListener(
			"loadedmetadata",
			() => {
				if (Number.isFinite(audio.duration) && audio.duration > 0)
					audio.currentTime = resumeAt % audio.duration;
			},
			{ once: true },
		);
	}

	document.body.appendChild(audio);
	bgMusicAudio = audio;

	const tryPlay = () => {
		bgMusicClickListener = null;
		if (audio !== bgMusicAudio) return;
		audio.play().catch(() => {});
	};
	tryPlay();
	bgMusicClickListener = tryPlay;
	document.addEventListener("click", tryPlay, { once: true });
}

async function applyBackgroundMusic(effects?: ThemeEffect[]) {
	const effect = effects?.find(
		(e) => e.slot === "global" && e.type === "background-music",
	);
	const parsed = effect ? parseAssetVolume(effect.value) : null;

	bgMusicWantedAssetId = parsed?.assetId ?? null;
	bgMusicWantedVolume = parsed?.volume ?? 50;

	if (!parsed) {
		stopBackgroundMusic();
		releaseBgMusicLock?.();
		return;
	}

	if (!HAS_WEB_LOCKS || bgMusicHasLock) await startWantedBackgroundMusic();
	else requestBgMusicLock();
}

const SITEWIDE_CARD_SELECTOR =
	".card:not(#kiln-te-sidebar *):not(#kiln-pte-sidebar *):is(.bg-inset, :not(.card .card))";

function themeHead(): HTMLElement {
	return document.head ?? document.documentElement;
}

function whenBodyReady(callback: () => void) {
	if (document.body) {
		callback();
		return;
	}
	document.addEventListener("DOMContentLoaded", callback, { once: true });
}

let cursorApplyToken = 0;

async function applyScaledCursorCSS(rawUrl: string, scale?: number) {
	const token = ++cursorApplyToken;
	document.getElementById("kiln-custom-cursor")?.remove();
	const proxied = proxyThemeImageUrl(rawUrl);
	let finalUrl = proxied;
	try {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.src = proxied;
		await img.decode();
		if (token !== cursorApplyToken) return;
		const size =
			scale !== undefined
				? Math.min(128, Math.max(16, Math.round(scale) || 32))
				: Math.min(128, Math.max(img.naturalWidth, img.naturalHeight));
		if (img.naturalWidth !== size || img.naturalHeight !== size) {
			const canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;
			canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
			finalUrl = canvas.toDataURL("image/png");
		}
	} catch {
		finalUrl = proxied;
	}
	if (token !== cursorApplyToken) return;
	const cursorStyle = document.createElement("style");
	cursorStyle.id = "kiln-custom-cursor";
	cursorStyle.textContent = `* { cursor: url(${JSON.stringify(finalUrl)}) 0 0, auto !important; }`;
	themeHead().appendChild(cursorStyle);
}

function clearScaledCursor() {
	cursorApplyToken++;
	document.getElementById("kiln-custom-cursor")?.remove();
}

export function applyKilnTheme(
	colors: {
		accentColor: string;
		navbarColor: string;
		customCss?: string;
		fontFamily?: string;
		backgroundImage?: string;
		backgroundOverlayColor?: string;
		backgroundOverlayOpacity?: number;
		effects?: ThemeEffect[];
		navbarIconColor?: string;
		cursorUrl?: string;
		cursorScale?: number;
		colorTokens?: Record<string, string>;
		ambient?: Ambient;
		cardStyle?: CardStyle;
		pointerEffects?: PointerEffects;
	} | null,
) {
	document.getElementById("kiln-custom-theme")?.remove();
	document.getElementById("kiln-custom-bg")?.remove();
	document.getElementById("kiln-custom-effects")?.remove();
	document.getElementById("kiln-custom-tokens")?.remove();
	document.getElementById("kiln-custom-css")?.remove();

	const applyEffects = () => {
		applyClickSound(colors?.effects);
		applyBackgroundMusic(colors?.effects);
		applyAmbient("kiln-custom-ambient", colors?.ambient);
		applyCardStyle(
			"kiln-custom-cards",
			colors?.cardStyle,
			SITEWIDE_CARD_SELECTOR,
			document.body,
		);
		applyPointerEffects("kiln-custom-pointer", colors?.pointerEffects);
	};

	if (!colors) {
		document.getElementById("kiln-custom-font")?.remove();
		clearScaledCursor();
		whenBodyReady(applyEffects);
		return;
	}

	const font =
		colors.fontFamily && colors.fontFamily !== "default"
			? FONTS[colors.fontFamily]
			: null;

	const existingFontLink = document.getElementById(
		"kiln-custom-font",
	) as HTMLLinkElement | null;
	if (font?.googleFamily) {
		const href = `https://fonts.googleapis.com/css2?family=${font.googleFamily}&display=swap`;
		if (existingFontLink?.getAttribute("href") !== href) {
			existingFontLink?.remove();
			const link = document.createElement("link");
			link.id = "kiln-custom-font";
			link.rel = "stylesheet";
			link.href = href;
			themeHead().appendChild(link);
		}
	} else {
		existingFontLink?.remove();
	}

	const themeStyle = document.createElement("style");
	themeStyle.id = "kiln-custom-theme";
	let css = buildThemeCSS(
		colors.accentColor,
		colors.navbarColor,
		colors.navbarIconColor,
		browser.runtime.getURL("/svgs/logo.svg" as any),
	);
	if (font?.localFile) {
		const fontUrl = browser.runtime.getURL(font.localFile as any);
		const fontName = font.stack.match(/^'([^']+)'/)?.[1] ?? "KilnCustomFont";
		css =
			`@font-face { font-family: '${fontName}'; src: url('${fontUrl}') format('truetype'); }\n` +
			css;
	}
	if (font?.stack) {
		css += `\nbody, :root { font-family: ${font.stack} !important; --bs-body-font-family: ${font.stack}; }`;
	}
	themeStyle.textContent = css;
	themeHead().appendChild(themeStyle);

	if (colors.backgroundImage?.trim()) {
		const bgStyle = document.createElement("style");
		bgStyle.id = "kiln-custom-bg";
		const imgUrl = `url(${JSON.stringify(proxyThemeImageUrl(colors.backgroundImage))})`;
		const opacity = colors.backgroundOverlayOpacity ?? 0;
		const hasOverlay = opacity > 0 && colors.backgroundOverlayColor;
		let bgImage: string;
		if (hasOverlay) {
			const [r, g, b] = hexToRgb(colors.backgroundOverlayColor!);
			const a = (opacity / 100).toFixed(3);
			bgImage = `linear-gradient(rgba(${r},${g},${b},${a}),rgba(${r},${g},${b},${a})), ${imgUrl}`;
		} else {
			bgImage = imgUrl;
		}
		bgStyle.textContent = `body { background-image: ${bgImage} !important; background-size: cover !important; background-attachment: fixed !important; background-position: center !important; background-repeat: no-repeat !important; }`;
		themeHead().appendChild(bgStyle);
	}

	if (colors.effects?.length) {
		const effectsStyle = document.createElement("style");
		effectsStyle.id = "kiln-custom-effects";
		effectsStyle.textContent = buildEffectsCSS(colors.effects);
		themeHead().appendChild(effectsStyle);
	}

	if (colors.colorTokens && Object.keys(colors.colorTokens).length > 0) {
		const tokensStyle = document.createElement("style");
		tokensStyle.id = "kiln-custom-tokens";
		tokensStyle.textContent = Object.entries(colors.colorTokens)
			.filter(([, v]) => v)
			.map(([k, v]) => COLOR_TOKENS[k]?.apply(v) ?? "")
			.filter(Boolean)
			.join("\n");
		themeHead().appendChild(tokensStyle);
	}

	if (colors.customCss?.trim()) {
		const customStyle = document.createElement("style");
		customStyle.id = "kiln-custom-css";
		customStyle.textContent = colors.customCss;
		themeHead().appendChild(customStyle);
	}

	if (colors.cursorUrl?.trim()) {
		void applyScaledCursorCSS(colors.cursorUrl.trim(), colors.cursorScale);
	} else {
		clearScaledCursor();
	}

	whenBodyReady(applyEffects);
}

export function extractDominantColor(imageUrl: string): Promise<string> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			const SIZE = 64;
			const canvas = document.createElement("canvas");
			canvas.width = SIZE;
			canvas.height = SIZE;
			const ctx = canvas.getContext("2d")!;
			ctx.drawImage(img, 0, 0, SIZE, SIZE);
			const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

			type HSLPixel = { h: number; s: number; l: number };
			const pixels: HSLPixel[] = [];

			for (let i = 0; i < data.length; i += 4) {
				const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
				if (a < 128) continue;
				const [h, s, l] = rgbToHsl(r, g, b);
				if (l >= 0.1 && l <= 0.9 && s >= 0.25) {
					pixels.push({ h, s, l });
				}
			}

			if (pixels.length === 0) {
				resolve("#2563eb");
				return;
			}

			pixels.sort((a, b) => b.s - a.s);
			const top = pixels.slice(0, Math.max(1, Math.floor(pixels.length * 0.3)));

			let sinSum = 0;
			let cosSum = 0;
			for (const p of top) {
				sinSum += Math.sin(p.h * Math.PI * 2);
				cosSum += Math.cos(p.h * Math.PI * 2);
			}
			const avgHue =
				Math.atan2(sinSum / top.length, cosSum / top.length) / (Math.PI * 2);
			const hue = avgHue < 0 ? avgHue + 1 : avgHue;

			const avgSat = top.reduce((s, p) => s + p.s, 0) / top.length;
			const finalSat = Math.min(0.85, Math.max(0.55, avgSat));

			const [r, g, b] = hslToRgb(hue, finalSat, 0.5);
			resolve(rgbToHex(r, g, b));
		};
		img.onerror = () => resolve("#2563eb");
		img.src = imageUrl;
	});
}
