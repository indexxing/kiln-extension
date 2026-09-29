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
import { hexToRgb } from "@/utils/theme";

export type Ambient = Extension.ProfileAmbient;
export type AmbientType = Ambient["type"];
export type CardStyle = Extension.ProfileCardStyle;
export type PointerEffects = Extension.ProfilePointerEffects;

export const NO_POINTER_EFFECTS_ATTR = "data-kiln-no-pointer-effects";

export const AMBIENT_TYPES: {
	key: AmbientType;
	label: string;
	color: string;
}[] = [
	{ key: "snow", label: "Snow", color: "#ffffff" },
	{ key: "stars", label: "Twinkling Stars", color: "#fff6c8" },
	{ key: "rain", label: "Rain", color: "#9cc7ff" },
	{ key: "bubbles", label: "Bubbles", color: "#bfe8ff" },
	{ key: "fireflies", label: "Fireflies", color: "#d7ff6b" },
	{ key: "petals", label: "Petals", color: "#ffb7d5" },
];

export const CARD_PRESET_OPACITY: Record<CardStyle["preset"], number> = {
	solid: 100,
	glass: 45,
	outline: 0,
	gradient: 85,
};

type Particle = {
	x: number;
	y: number;
	size: number;
	speed: number;
	drift: number;
	phase: number;
	spin: number;
};

const ambientKeys = new Map<string, string>();
const ambientTeardowns = new Map<string, () => void>();
const ambientApplyTokens = new Map<string, number>();

function stopAmbient(id: string) {
	ambientTeardowns.get(id)?.();
	ambientTeardowns.delete(id);
	ambientKeys.delete(id);
	ambientApplyTokens.set(id, (ambientApplyTokens.get(id) ?? 0) + 1);
}

function whenBodyReady(callback: () => void) {
	if (document.body) {
		callback();
		return;
	}
	document.addEventListener("DOMContentLoaded", callback, { once: true });
}

export function applyAmbient(id: string, ambient: Ambient | undefined) {
	const key = ambient ? JSON.stringify(ambient) : "";
	if (key === ambientKeys.get(id)) return;
	stopAmbient(id);
	if (!ambient) return;
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const token = ambientApplyTokens.get(id)!;

	whenBodyReady(() => startAmbient(id, key, ambient, token));
}

function startAmbient(
	id: string,
	key: string,
	ambient: Ambient,
	token: number,
) {
	if (ambientApplyTokens.get(id) !== token) return;

	const type = ambient.type;
	const color =
		ambient.color ?? AMBIENT_TYPES.find((t) => t.key === type)?.color ?? "#fff";
	const [r, g, b] = hexToRgb(color);
	const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;

	const canvas = document.createElement("canvas");
	canvas.id = id;
	Object.assign(canvas.style, {
		position: "fixed",
		inset: "0",
		width: "100vw",
		height: "100vh",
		pointerEvents: "none",
		zIndex: "1",
	});
	document.body.appendChild(canvas);
	ambientKeys.set(id, key);
	const ctx = canvas.getContext("2d")!;

	let width = 0;
	let height = 0;
	const resize = () => {
		const dpr = window.devicePixelRatio || 1;
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	};
	resize();

	const perDensity: Record<AmbientType, number> = {
		snow: 60,
		stars: 70,
		rain: 90,
		bubbles: 25,
		fireflies: 20,
		petals: 25,
	};
	const count = Math.round(
		perDensity[type] * Math.min(3, Math.max(1, ambient.density)),
	);
	const spawn = (anywhere: boolean): Particle => {
		const rising = type === "bubbles" || type === "fireflies";
		return {
			x: Math.random() * width,
			y: anywhere ? Math.random() * height : rising ? height + 20 : -20,
			size:
				type === "rain"
					? 10 + Math.random() * 14
					: type === "bubbles"
						? 4 + Math.random() * 10
						: type === "petals"
							? 5 + Math.random() * 5
							: 1 + Math.random() * 2.5,
			speed:
				type === "rain"
					? 9 + Math.random() * 6
					: type === "stars"
						? 0
						: type === "fireflies"
							? 0.15 + Math.random() * 0.3
							: 0.4 + Math.random() * 1.1,
			drift: (Math.random() - 0.5) * 0.6,
			phase: Math.random() * Math.PI * 2,
			spin: (Math.random() - 0.5) * 0.04,
		};
	};
	const particles = Array.from({ length: count }, () => spawn(true));

	const tick = (time: number) => {
		ctx.clearRect(0, 0, width, height);
		for (let i = 0; i < particles.length; i++) {
			const p = particles[i];
			const t = time / 1000;
			switch (type) {
				case "snow": {
					p.y += p.speed;
					p.x += Math.sin(t + p.phase) * 0.4 + p.drift;
					ctx.fillStyle = rgba(0.85);
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
					ctx.fill();
					break;
				}
				case "rain": {
					p.y += p.speed;
					p.x += p.drift;
					ctx.strokeStyle = rgba(0.45);
					ctx.lineWidth = 1;
					ctx.beginPath();
					ctx.moveTo(p.x, p.y);
					ctx.lineTo(p.x + p.drift * 2, p.y + p.size);
					ctx.stroke();
					break;
				}
				case "stars": {
					const alpha = 0.25 + 0.75 * Math.abs(Math.sin(t * 0.8 + p.phase));
					ctx.fillStyle = rgba(alpha);
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
					ctx.fill();
					break;
				}
				case "bubbles": {
					p.y -= p.speed;
					p.x += Math.sin(t * 1.5 + p.phase) * 0.5;
					ctx.strokeStyle = rgba(0.55);
					ctx.lineWidth = 1.2;
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
					ctx.stroke();
					break;
				}
				case "fireflies": {
					p.y -= p.speed * Math.sin(t * 0.5 + p.phase);
					p.x += Math.cos(t * 0.7 + p.phase) * 0.6;
					const alpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.3 + p.phase));
					ctx.shadowBlur = 12;
					ctx.shadowColor = rgba(alpha);
					ctx.fillStyle = rgba(alpha);
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
					ctx.fill();
					ctx.shadowBlur = 0;
					break;
				}
				case "petals": {
					p.y += p.speed;
					p.x += Math.sin(t + p.phase) * 0.8 + p.drift;
					p.phase += p.spin;
					ctx.save();
					ctx.translate(p.x, p.y);
					ctx.rotate(p.phase);
					ctx.fillStyle = rgba(0.8);
					ctx.beginPath();
					ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
					ctx.fill();
					ctx.restore();
					break;
				}
			}

			const out =
				p.y > height + 30 || p.y < -30 || p.x < -30 || p.x > width + 30;
			if (out) {
				particles[i] = type === "fireflies" ? spawn(true) : spawn(false);
			}
		}
		frame = requestAnimationFrame(tick);
	};

	let frame = 0;
	window.addEventListener("resize", resize);
	ambientTeardowns.set(id, () => {
		cancelAnimationFrame(frame);
		window.removeEventListener("resize", resize);
		canvas.remove();
	});

	frame = requestAnimationFrame(tick);
}

const cardTiltTeardowns = new Map<string, () => void>();

function isChromiumBrowser(): boolean {
	return (
		/Chrome\/|Chromium\//.test(navigator.userAgent) &&
		!/Firefox\//.test(navigator.userAgent)
	);
}

function liquidGlassFilterId(id: string): string {
	return `${id}-liquid`;
}

function ensureLiquidGlassFilter(id: string) {
	if (!document.body) return;
	const svgId = liquidGlassFilterId(id);
	if (document.getElementById(svgId)) return;
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.id = svgId;
	svg.setAttribute("aria-hidden", "true");
	Object.assign(svg.style, {
		position: "absolute",
		width: "0",
		height: "0",
		overflow: "hidden",
	});
	svg.innerHTML = `
		<filter id="${svgId}-filter" color-interpolation-filters="sRGB">
			<feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
			<feGaussianBlur in="noise" stdDeviation="3" result="softNoise" />
			<feDisplacementMap in="SourceGraphic" in2="softNoise" scale="70" xChannelSelector="R" yChannelSelector="G" />
		</filter>
	`;
	document.body.appendChild(svg);
}

function enableTilt(root: HTMLElement, cardSelector: string): () => void {
	let tilted: HTMLElement | null = null;
	const reset = () => {
		if (tilted) tilted.style.transform = "";
		tilted = null;
	};
	const onMove = (e: PointerEvent) => {
		const card = (e.target as Element | null)?.closest<HTMLElement>(
			cardSelector,
		);
		if (card !== tilted) reset();
		if (!card || !root.contains(card)) return;
		tilted = card;
		const r = card.getBoundingClientRect();
		const px = (e.clientX - r.left) / r.width - 0.5;
		const py = (e.clientY - r.top) / r.height - 0.5;
		card.style.transform = `perspective(900px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg)`;
	};
	root.addEventListener("pointermove", onMove);
	root.addEventListener("pointerleave", reset);
	return () => {
		root.removeEventListener("pointermove", onMove);
		root.removeEventListener("pointerleave", reset);
		reset();
	};
}

export function applyCardStyle(
	id: string,
	style: CardStyle | undefined,
	cardSelector: string,
	root: HTMLElement,
) {
	document.getElementById(id)?.remove();
	document.getElementById(liquidGlassFilterId(id))?.remove();
	cardTiltTeardowns.get(id)?.();
	cardTiltTeardowns.delete(id);
	if (!style) return;

	const alpha = (style.opacity ?? CARD_PRESET_OPACITY[style.preset]) / 100;
	const tint = style.tint ? hexToRgb(style.tint).join(",") : null;
	const base = tint ?? "var(--bs-tertiary-bg-rgb, 33,37,41)";
	const accent = tint ?? "var(--bs-primary-rgb, 59,175,255)";

	const surfaceRules: string[] = [];
	const cardOnlyRules: string[] = [];
	switch (style.preset) {
		case "solid":
			surfaceRules.push(`background-color: rgba(${base}, ${alpha}) !important`);
			break;
		case "glass": {
			const liquid = !!style.liquidGlass && isChromiumBrowser();
			if (liquid) ensureLiquidGlassFilter(id);
			surfaceRules.push(
				`background-color: rgba(${base}, ${alpha}) !important`,
				liquid
					? `backdrop-filter: url(#${liquidGlassFilterId(id)}-filter) blur(6px) saturate(150%)`
					: "backdrop-filter: blur(12px) saturate(140%)",
				"-webkit-backdrop-filter: blur(12px) saturate(140%)",
			);
			cardOnlyRules.push(
				`border-color: rgba(255,255,255,${liquid ? 0.22 : 0.14}) !important`,
			);
			if (liquid)
				cardOnlyRules.push(
					"box-shadow: inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -1px 8px rgba(0,0,0,0.2) !important",
				);
			break;
		}
		case "outline":
			surfaceRules.push(`background-color: rgba(${base}, ${alpha}) !important`);
			cardOnlyRules.push(`border: 1px solid rgba(${accent}, 0.7) !important`);
			break;
		case "gradient":
			surfaceRules.push(
				"background-color: transparent !important",
				`background-image: linear-gradient(135deg, rgba(${accent}, ${alpha * 0.45}), rgba(${base}, ${alpha})) !important`,
			);
			break;
	}

	const headerSelector = `${cardSelector} > .card-header`;
	const tabsSelector = `${cardSelector} .nav-tabs`;

	let css = `${cardSelector} { ${[...surfaceRules, ...cardOnlyRules].join("; ")}; }`;
	css += `\n${headerSelector} { ${[...surfaceRules, "border-color: rgba(255,255,255,0.1) !important"].join("; ")}; }`;
	css += `\n${tabsSelector} { border-color: rgba(255,255,255,0.1) !important; }`;
	css += `\n${tabsSelector} .nav-link { background-color: transparent !important; border-color: transparent !important; }`;
	css += `\n${tabsSelector} .nav-link.active { background-color: rgba(${accent}, ${Math.max(alpha, 0.25)}) !important; border-color: transparent !important; }`;

	if (style.radius !== undefined) {
		css += `\n${cardSelector} { border-radius: ${style.radius}px !important; }`;
		css += `\n${headerSelector} { border-top-left-radius: ${style.radius}px !important; border-top-right-radius: ${style.radius}px !important; }`;
	}

	const hover = style.hover ?? "none";
	if (hover !== "none")
		css += `\n${cardSelector} { transition: transform 0.2s ease, box-shadow 0.2s ease; }`;
	if (hover === "lift")
		css += `\n${cardSelector}:hover { transform: translateY(-4px); box-shadow: 0 12px 28px rgba(0,0,0,0.35); }`;
	if (hover === "glow")
		css += `\n${cardSelector}:hover { box-shadow: 0 0 0 1px rgba(${accent}, 0.6), 0 0 22px rgba(${accent}, 0.35); }`;

	const el = document.createElement("style");
	el.id = id;
	el.textContent = css;
	(document.head ?? document.documentElement).appendChild(el);

	if (hover === "tilt" && root)
		cardTiltTeardowns.set(id, enableTilt(root, cardSelector));
}

type Spark = {
	kind: "star" | "heart" | "ring" | "rect" | "dot" | "glow";
	x: number;
	y: number;
	vx: number;
	vy: number;
	gravity: number;
	size: number;
	grow: number;
	life: number;
	maxLife: number;
	rotation: number;
	spin: number;
	color: string;
};

function drawStar(ctx: CanvasRenderingContext2D, r: number) {
	ctx.beginPath();
	for (let i = 0; i < 8; i++) {
		const radius = i % 2 === 0 ? r : r * 0.35;
		const angle = (Math.PI / 4) * i;
		ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
	}
	ctx.closePath();
	ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, size: number) {
	const s = size / 2;
	ctx.beginPath();
	ctx.moveTo(0, s * 0.6);
	ctx.bezierCurveTo(-s * 1.2, -s * 0.2, -s * 0.5, -s * 1.1, 0, -s * 0.4);
	ctx.bezierCurveTo(s * 0.5, -s * 1.1, s * 1.2, -s * 0.2, 0, s * 0.6);
	ctx.fill();
}

const pointerKeys = new Map<string, string>();
const pointerTeardowns = new Map<string, () => void>();
const pointerApplyTokens = new Map<string, number>();

export function applyPointerEffects(
	id: string,
	effects: PointerEffects | undefined,
) {
	const active = !!effects && (!!effects.click || !!effects.trail);
	const key = active ? JSON.stringify(effects) : "";
	if (key === pointerKeys.get(id)) return;
	pointerTeardowns.get(id)?.();
	pointerTeardowns.delete(id);
	pointerKeys.delete(id);
	pointerApplyTokens.set(id, (pointerApplyTokens.get(id) ?? 0) + 1);
	if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
		return;
	const token = pointerApplyTokens.get(id)!;

	whenBodyReady(() => startPointerEffects(id, key, effects, token));
}

function startPointerEffects(
	id: string,
	key: string,
	effects: PointerEffects,
	token: number,
) {
	if (pointerApplyTokens.get(id) !== token) return;

	const canvas = document.createElement("canvas");
	canvas.id = id;
	Object.assign(canvas.style, {
		position: "fixed",
		inset: "0",
		width: "100vw",
		height: "100vh",
		pointerEvents: "none",
		zIndex: "99990",
	});
	document.body.appendChild(canvas);
	pointerKeys.set(id, key);
	const ctx = canvas.getContext("2d")!;

	const resize = () => {
		const dpr = window.devicePixelRatio || 1;
		canvas.width = window.innerWidth * dpr;
		canvas.height = window.innerHeight * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	};
	resize();

	const color = () =>
		effects!.color ??
		(getComputedStyle(document.documentElement)
			.getPropertyValue("--bs-primary")
			.trim() ||
			"#ffffff");
	const confettiColor = () =>
		effects!.color ?? `hsl(${Math.floor(Math.random() * 360)}, 90%, 62%)`;

	const sparks: Spark[] = [];
	const spark = (partial: Partial<Spark> & Pick<Spark, "kind" | "x" | "y">) =>
		sparks.push({
			vx: 0,
			vy: 0,
			gravity: 0,
			size: 6,
			grow: 0,
			life: 0,
			maxLife: 40,
			rotation: 0,
			spin: 0,
			color: color(),
			...partial,
		});

	let frame = 0;
	const tick = () => {
		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
		for (let i = sparks.length - 1; i >= 0; i--) {
			const p = sparks[i];
			p.life++;
			if (p.life >= p.maxLife) {
				sparks.splice(i, 1);
				continue;
			}
			p.vy += p.gravity;
			p.x += p.vx;
			p.y += p.vy;
			p.size = Math.max(0, p.size + p.grow);
			p.rotation += p.spin;

			ctx.save();
			ctx.globalAlpha = 1 - p.life / p.maxLife;
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.fillStyle = p.color;
			ctx.strokeStyle = p.color;
			switch (p.kind) {
				case "star":
					drawStar(ctx, p.size);
					break;
				case "heart":
					drawHeart(ctx, p.size);
					break;
				case "ring":
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.arc(0, 0, p.size, 0, Math.PI * 2);
					ctx.stroke();
					break;
				case "rect":
					ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
					break;
				case "dot":
					ctx.beginPath();
					ctx.arc(0, 0, p.size, 0, Math.PI * 2);
					ctx.fill();
					break;
				case "glow": {
					const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
					g.addColorStop(0, p.color);
					g.addColorStop(1, "transparent");
					ctx.fillStyle = g;
					ctx.beginPath();
					ctx.arc(0, 0, p.size, 0, Math.PI * 2);
					ctx.fill();
					break;
				}
			}
			ctx.restore();
		}
		frame = sparks.length ? requestAnimationFrame(tick) : 0;
	};
	const kick = () => {
		if (!frame) frame = requestAnimationFrame(tick);
	};

	const ignored = (target: EventTarget | null) =>
		target instanceof Element &&
		!!target.closest(`[${NO_POINTER_EFFECTS_ATTR}]`);

	const onDown = (e: PointerEvent) => {
		if (e.button !== 0 || ignored(e.target)) return;
		const { clientX: x, clientY: y } = e;
		const rand = (min: number, max: number) =>
			min + Math.random() * (max - min);
		switch (effects!.click) {
			case "sparkles":
				for (let i = 0; i < 10; i++) {
					const a = (Math.PI * 2 * i) / 10 + rand(-0.2, 0.2);
					const v = rand(1.5, 3.5);
					spark({
						kind: "star",
						x,
						y,
						vx: Math.cos(a) * v,
						vy: Math.sin(a) * v,
						size: rand(3, 6),
						maxLife: 34,
						spin: 0.15,
					});
				}
				break;
			case "hearts":
				for (let i = 0; i < 6; i++)
					spark({
						kind: "heart",
						x,
						y,
						vx: rand(-1.6, 1.6),
						vy: rand(-3, -1.5),
						size: rand(10, 16),
						maxLife: 48,
					});
				break;
			case "ripples":
				spark({ kind: "ring", x, y, size: 4, grow: 1.4, maxLife: 32 });
				spark({ kind: "ring", x, y, size: 1, grow: 0.9, maxLife: 40 });
				break;
			case "confetti":
				for (let i = 0; i < 18; i++)
					spark({
						kind: "rect",
						x,
						y,
						vx: rand(-4, 4),
						vy: rand(-6, -2),
						gravity: 0.25,
						size: rand(6, 10),
						maxLife: 60,
						spin: rand(-0.3, 0.3),
						color: confettiColor(),
					});
				break;
		}
		kick();
	};

	let lastX = -1000;
	let lastY = -1000;
	const onMove = (e: PointerEvent) => {
		if (!effects!.trail || ignored(e.target)) return;
		const { clientX: x, clientY: y } = e;
		if (Math.hypot(x - lastX, y - lastY) < 14) return;
		lastX = x;
		lastY = y;
		switch (effects!.trail) {
			case "sparkles":
				spark({
					kind: "star",
					x,
					y,
					vx: (Math.random() - 0.5) * 0.8,
					vy: 0.4,
					size: 4,
					maxLife: 28,
					spin: 0.1,
				});
				break;
			case "dots":
				spark({ kind: "dot", x, y, size: 3.5, grow: -0.12, maxLife: 26 });
				break;
			case "hearts":
				spark({ kind: "heart", x, y, vy: -0.6, size: 9, maxLife: 32 });
				break;
			case "glow":
				spark({ kind: "glow", x, y, size: 16, grow: -0.3, maxLife: 30 });
				break;
		}
		kick();
	};

	window.addEventListener("resize", resize);
	window.addEventListener("pointerdown", onDown, { passive: true });
	window.addEventListener("pointermove", onMove, { passive: true });
	pointerTeardowns.set(id, () => {
		cancelAnimationFrame(frame);
		window.removeEventListener("resize", resize);
		window.removeEventListener("pointerdown", onDown);
		window.removeEventListener("pointermove", onMove);
		canvas.remove();
	});
}
