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

import { hexToRgb, isValidHex, rgbToHex } from "@/utils/theme";

export type VisualCssEditor = {
	syncFromText(): void;
	destroy(): void;
};

type Model = Map<string, Map<string, string>>;
type Pseudo = "" | ":hover";
type Candidate = { selector: string; count: number };

const BLOCK_START = "/* visual-editor:start */";
const BLOCK_END = "/* visual-editor:end */";
const BLOCK_RE =
	/\/\* visual-editor:start[^*]*\*\/([\s\S]*?)\/\* visual-editor:end \*\//;

function parseBlock(css: string): Model {
	const model: Model = new Map();
	const block = css.match(BLOCK_RE);
	if (!block) return model;
	for (const rule of block[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selector = rule[1].trim();
		if (!selector) continue;
		const decls = new Map<string, string>();
		for (const decl of rule[2].split(";")) {
			const colon = decl.indexOf(":");
			if (colon < 1) continue;
			const prop = decl.slice(0, colon).trim().toLowerCase();
			const value = decl
				.slice(colon + 1)
				.replace(/!important/i, "")
				.trim();
			if (prop && value) decls.set(prop, value);
		}
		if (decls.size) model.set(selector, decls);
	}
	return model;
}

function serializeBlock(model: Model): string {
	if (!model.size) return "";
	const rules = [...model].map(
		([selector, decls]) =>
			`${selector} {\n${[...decls].map(([p, v]) => `\t${p}: ${v} !important;`).join("\n")}\n}`,
	);
	return `${BLOCK_START}\n${rules.join("\n")}\n${BLOCK_END}`;
}

function writeBlock(css: string, model: Model): string {
	const block = serializeBlock(model);
	if (BLOCK_RE.test(css)) {
		const out = css.replace(BLOCK_RE, () => block);
		return block ? out : out.replace(/\n{3,}/g, "\n\n").trim();
	}
	if (!block) return css;
	return css.trim() ? `${css.trimEnd()}\n\n${block}` : block;
}

const BLOCKED = /kiln|kadmin/i;
const IDENT = /^-?[A-Za-z_][\w-]*$/;
const UTILITY_CLASS =
	/^(?:[mp][trblxy]?-(?:\d|auto|n\d)|d-|col(?:-|$)|row(?:-|$)|g[xy]?-\d|gap-|justify-|align-|flex(?:-|$)|order-|text-|fw-|fs-|border(?:-|$)|rounded|[wh]-\d|bg-|position-|float-|overflow-|shadow|visible$|invisible$|active$|show$|collapsed?$|collapsing$|fade$|disabled$|hover$|focus$|open$|selected$|is-|has-|ng-|js-|small$|lead$|clearfix$)/;
const SEMANTIC_TAGS = new Set([
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"p",
	"a",
	"button",
	"img",
	"input",
	"label",
	"li",
	"table",
	"th",
	"td",
]);

function qsa(selector: string): Element[] {
	try {
		return Array.from(document.querySelectorAll(selector));
	} catch {
		return [];
	}
}

function safeClasses(el: Element): string[] {
	return Array.from(el.classList).filter(
		(c) =>
			IDENT.test(c) &&
			!BLOCKED.test(c) &&
			!UTILITY_CLASS.test(c) &&
			!/\d{3,}/.test(c),
	);
}

function safeId(el: Element): string | null {
	const id = el.id;
	if (!id || !IDENT.test(id) || BLOCKED.test(id) || /\d{3,}/.test(id))
		return null;
	return qsa(`#${id}`).length === 1 ? id : null;
}

function selectorPart(el: Element): string {
	const id = safeId(el);
	if (id) return `#${id}`;
	return (
		el.localName +
		safeClasses(el)
			.slice(0, 2)
			.map((c) => `.${c}`)
			.join("")
	);
}

function indexedPart(el: Element, part: string): string {
	const parent = el.parentElement;
	if (!parent) return part;
	const siblings = Array.from(parent.children);
	let same = 0;
	for (const s of siblings) {
		try {
			if (s.matches(part)) same++;
		} catch {}
	}
	return same > 1 ? `${part}:nth-child(${siblings.indexOf(el) + 1})` : part;
}

function uniqueSelector(el: Element): string {
	const build = (indexed: boolean) => {
		const parts: string[] = [];
		let node: Element | null = el;
		for (
			let depth = 0;
			node && node !== document.body && node !== document.documentElement;
			depth++
		) {
			if (depth >= 8) break;
			const part = selectorPart(node);
			parts.unshift(indexed ? indexedPart(node, part) : part);
			const selector = parts.join(" > ");
			const hits = qsa(selector);
			if (hits.length === 1 && hits[0] === el)
				return { selector, unique: true };
			if (part.startsWith("#")) break;
			node = node.parentElement;
		}
		return { selector: parts.join(" > "), unique: false };
	};
	const plain = build(false);
	if (plain.unique) return plain.selector;
	return build(true).selector;
}

function buildCandidates(el: Element): Candidate[] {
	const selectors: string[] = [uniqueSelector(el)];
	const classes = safeClasses(el);
	if (classes.length)
		selectors.push(
			el.localName +
				classes
					.slice(0, 3)
					.map((c) => `.${c}`)
					.join(""),
		);
	for (const c of classes.slice(0, 3)) selectors.push(`.${c}`);
	if (!classes.length && SEMANTIC_TAGS.has(el.localName))
		selectors.push(el.localName);

	const seen = new Set<string>();
	const out: Candidate[] = [];
	for (const selector of selectors) {
		if (!selector || seen.has(selector) || BLOCKED.test(selector)) continue;
		seen.add(selector);
		out.push({ selector, count: qsa(selector).length });
	}
	return out;
}

function describe(el: Element): string {
	const id = el.id && !BLOCKED.test(el.id) ? `#${el.id}` : "";
	const classes = Array.from(el.classList)
		.filter((c) => !BLOCKED.test(c))
		.slice(0, 2)
		.map((c) => `.${c}`)
		.join("");
	return `${el.localName}${id}${classes}`;
}

type Field =
	| { kind: "color"; prop: string; label: string; read?: string }
	| {
			kind: "range";
			prop: string;
			label: string;
			min: number;
			max: number;
			step: number;
			suffix: string;
			format: (n: number) => string;
			parse: (v: string) => number | null;
			read?: string;
			computed?: (cs: CSSStyleDeclaration) => number | null;
			implies?: { prop: string; value: string; unless: string };
	  }
	| {
			kind: "select";
			prop: string;
			label: string;
			options: [string, string][];
			read?: string;
	  }
	| {
			kind: "numbers";
			label: string;
			items: [prop: string, short: string][];
	  }
	| {
			kind: "toggle";
			prop: string;
			label: string;
			value: string;
			hint: string;
	  };

const num = (v: string): number | null => {
	const n = parseFloat(v);
	return Number.isFinite(n) ? n : null;
};

const px = (
	prop: string,
	label: string,
	min: number,
	max: number,
	extra: Partial<Extract<Field, { kind: "range" }>> = {},
): Field => ({
	kind: "range",
	prop,
	label,
	min,
	max,
	step: 1,
	suffix: "px",
	format: (n) => `${n}px`,
	parse: num,
	...extra,
});

const SIDES = (base: string): [string, string][] => [
	[`${base}-top`, "T"],
	[`${base}-right`, "R"],
	[`${base}-bottom`, "B"],
	[`${base}-left`, "L"],
];

const SHADOWS: [string, string][] = [
	["none", "None"],
	["0 2px 8px rgba(0,0,0,0.25)", "Soft"],
	["0 6px 18px rgba(0,0,0,0.35)", "Medium"],
	["0 12px 32px rgba(0,0,0,0.5)", "Strong"],
	["0 0 18px var(--bs-primary)", "Accent glow"],
];

const GROUPS: { title: string; open?: boolean; fields: Field[] }[] = [
	{
		title: "Text",
		open: true,
		fields: [
			{ kind: "color", prop: "color", label: "Color" },
			px("font-size", "Size", 8, 96),
			{
				kind: "select",
				prop: "font-weight",
				label: "Weight",
				options: [
					["300", "Light"],
					["400", "Normal"],
					["500", "Medium"],
					["600", "Semi-bold"],
					["700", "Bold"],
					["800", "Extra bold"],
				],
			},
			{
				kind: "select",
				prop: "font-style",
				label: "Style",
				options: [
					["normal", "Normal"],
					["italic", "Italic"],
				],
			},
			{
				kind: "select",
				prop: "text-decoration-line",
				label: "Decoration",
				options: [
					["none", "None"],
					["underline", "Underline"],
					["line-through", "Strikethrough"],
				],
			},
			{
				kind: "select",
				prop: "text-align",
				label: "Align",
				options: [
					["left", "Left"],
					["center", "Center"],
					["right", "Right"],
					["justify", "Justify"],
				],
			},
			{
				kind: "select",
				prop: "text-transform",
				label: "Case",
				options: [
					["none", "As written"],
					["uppercase", "UPPERCASE"],
					["lowercase", "lowercase"],
					["capitalize", "Capitalize"],
				],
			},
			px("letter-spacing", "Spacing", -2, 10, { step: 0.5 }),
			{
				kind: "range",
				prop: "line-height",
				label: "Line height",
				min: 0.8,
				max: 3,
				step: 0.1,
				suffix: "",
				format: (n) => String(n),
				parse: num,
				computed: (cs) => {
					const lh = parseFloat(cs.lineHeight);
					const fs = parseFloat(cs.fontSize);
					return Number.isFinite(lh) && fs
						? Math.round((lh / fs) * 10) / 10
						: null;
				},
			},
		],
	},
	{
		title: "Background",
		open: true,
		fields: [{ kind: "color", prop: "background-color", label: "Color" }],
	},
	{
		title: "Border",
		fields: [
			px("border-width", "Width", 0, 20, {
				read: "border-top-width",
				implies: {
					prop: "border-style",
					value: "solid",
					unless: "border-top-style",
				},
			}),
			{
				kind: "select",
				prop: "border-style",
				label: "Style",
				read: "border-top-style",
				options: [
					["solid", "Solid"],
					["dashed", "Dashed"],
					["dotted", "Dotted"],
					["double", "Double"],
					["none", "None"],
				],
			},
			{
				kind: "color",
				prop: "border-color",
				label: "Color",
				read: "border-top-color",
			},
			px("border-radius", "Radius", 0, 100, { read: "border-top-left-radius" }),
		],
	},
	{
		title: "Spacing",
		fields: [
			{ kind: "numbers", label: "Padding", items: SIDES("padding") },
			{ kind: "numbers", label: "Margin", items: SIDES("margin") },
		],
	},
	{
		title: "Size",
		fields: [
			{
				kind: "numbers",
				label: "Size",
				items: [
					["width", "W"],
					["height", "H"],
				],
			},
			{
				kind: "numbers",
				label: "Max size",
				items: [
					["max-width", "W"],
					["max-height", "H"],
				],
			},
		],
	},
	{
		title: "Effects",
		fields: [
			{
				kind: "range",
				prop: "opacity",
				label: "Opacity",
				min: 0,
				max: 100,
				step: 1,
				suffix: "%",
				format: (n) => String(n / 100),
				parse: (v) => {
					const n = parseFloat(v);
					return Number.isFinite(n) ? Math.round(n * 100) : null;
				},
			},
			{
				kind: "select",
				prop: "box-shadow",
				label: "Shadow",
				options: SHADOWS,
			},
			{
				kind: "range",
				prop: "backdrop-filter",
				label: "Blur behind",
				min: 0,
				max: 40,
				step: 1,
				suffix: "px",
				format: (n) => (n ? `blur(${n}px)` : "none"),
				parse: (v) => {
					const m = v.match(/blur\(\s*([\d.]+)px\s*\)/);
					return m ? Math.round(parseFloat(m[1])) : null;
				},
			},
			{
				kind: "toggle",
				prop: "display",
				label: "Visibility",
				value: "none",
				hint: "Hide this element",
			},
		],
	},
];

function parseCssColor(value: string): [string, number] | null {
	const v = value.trim();
	if (isValidHex(v)) return [v.toLowerCase(), 100];
	const m = v.match(
		/^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i,
	);
	if (!m) return null;
	let alpha = 1;
	if (m[4])
		alpha = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
	return [
		rgbToHex(Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])),
		Math.round(alpha * 100),
	];
}

function formatCssColor(hex: string, alpha: number): string {
	if (alpha >= 100) return hex;
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r},${g},${b},${Number((alpha / 100).toFixed(2))})`;
}

const OWN_UI = '[id^="kiln"], [id^="kadmin"], .kiln-extension-modal';
const BLOCKED_EVENTS = [
	"click",
	"mousedown",
	"pointerdown",
	"dblclick",
	"auxclick",
];

const PROTECTED_CONTROLS =
	"#navbar-dark-dropdown-menu-link, #dropdown-menu-button, .dropdown, .dropdown-menu, .dropdown-menu-end, .dropdown-menu-right, .dropdown-item, .nav-item, .nav-link, .navbar, .navbar-nav";
const PROTECTED_TRIGGERS =
	'#navbar-dark-dropdown-menu-link, #dropdown-menu-button, a[href^="/report/user/"]';

const HIDE_VALUE: Record<string, RegExp> = {
	display: /^none$/i,
	opacity: /^0(?:\.0+)?%?$/,
	visibility: /^(?:hidden|collapse)$/i,
	filter: /opacity\(\s*0(?:\.0+)?%?\s*\)/i,
	"content-visibility": /^hidden$/i,
	"clip-path": /(?:circle|ellipse)\(\s*0|inset\(\s*(?:100|[5-9]\d)(?:\.\d+)?%/i,
	"pointer-events": /^none$/i,
};

const PROTECTED_HIDE_MESSAGE =
	"Custom CSS can't hide the account menu or the profile actions menu (where users report a theme or a user). You can still style them, but they have to stay reachable.";

type Row = { el: HTMLElement; props: string[]; sync: () => void };

export function createVisualCssEditor(options: {
	mount: HTMLElement;
	sidebar: HTMLElement;
	idPrefix: string;
	getCss: () => string;
	setCss: (css: string) => void | Promise<void>;
	onBlocked?: (message: string | null) => void;
}): VisualCssEditor {
	const { mount, sidebar, idPrefix } = options;

	let enabled = false;
	let model: Model = parseBlock(options.getCss());
	let selectedEl: Element | null = null;
	let hoverEl: Element | null = null;
	let candidates: Candidate[] = [];
	let selector = "";
	let pseudo: Pseudo = "";
	let rows: Row[] = [];
	const openGroups = new Set(GROUPS.filter((g) => g.open).map((g) => g.title));

	const styleEl = document.createElement("style");
	styleEl.id = `kiln-vce-style-${idPrefix}`;
	styleEl.textContent = `
		html.kiln-vce-on *:not(.kiln-vce-ui):not(.kiln-vce-ui *) { cursor: crosshair !important; }
		.kiln-vce-box { position: fixed; display: none; pointer-events: none; z-index: 99990; box-sizing: border-box; }
		.kiln-vce-box.hover { border: 2px dashed #3bafff; background: rgba(59,175,255,0.10); }
		.kiln-vce-box.selected { border: 2px solid #ff9f1a; background: rgba(255,159,26,0.12); }
		.kiln-vce-chip { position: absolute; left: -2px; bottom: 100%; padding: 1px 6px; font: 11px/1.5 monospace; color: #fff; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; }
		.kiln-vce-box.hover .kiln-vce-chip { background: #3bafff; }
		.kiln-vce-box.selected .kiln-vce-chip { background: #ff9f1a; }
		.kiln-vce-chip.inside { bottom: auto; top: 0; left: 0; }
		.kiln-vce-group { border: 1px solid rgba(128,128,128,0.2); border-radius: 6px; margin-bottom: 6px; }
		.kiln-vce-group > summary { cursor: pointer; padding: 5px 8px; font-size: 0.8rem; font-weight: 600; list-style: none; user-select: none; }
		.kiln-vce-group > summary::-webkit-details-marker { display: none; }
		.kiln-vce-group > summary::after { content: "\\25BE"; float: right; opacity: 0.6; }
		.kiln-vce-group[open] > summary::after { content: "\\25B4"; }
		.kiln-vce-group-body { padding: 6px 8px 2px; }
		.kiln-vce-row { display: grid; grid-template-columns: 78px 1fr 16px; grid-template-areas: "lab ctl reset"; align-items: center; gap: 6px; margin-bottom: 6px; }
		.kiln-vce-row.stacked { grid-template-columns: 1fr 16px; grid-template-areas: "lab reset" "ctl ctl"; gap: 3px 6px; }
		.kiln-vce-label { grid-area: lab; font-size: 0.75rem; color: var(--bs-secondary-color, #999); }
		.kiln-vce-row.is-set .kiln-vce-label { color: var(--bs-primary, #3bafff); font-weight: 600; }
		.kiln-vce-ctl { grid-area: ctl; display: flex; align-items: center; gap: 6px; min-width: 0; }
		.kiln-vce-ctl input[type=range] { flex: 1; min-width: 0; }
		.kiln-vce-ctl select { min-width: 0; }
		.kiln-vce-num { width: 58px; flex-shrink: 0; }
		.kiln-vce-reset { grid-area: reset; visibility: hidden; background: none; border: none; padding: 0; color: inherit; opacity: 0.55; cursor: pointer; font-size: 0.7rem; line-height: 1; }
		.kiln-vce-row.is-set .kiln-vce-reset { visibility: visible; }
		.kiln-vce-cells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; width: 100%; }
		.kiln-vce-cells.two { grid-template-columns: repeat(2, 1fr); }
		.kiln-vce-cell { display: flex; align-items: center; gap: 3px; margin: 0; font-size: 0.7rem; color: var(--bs-secondary-color, #999); }
		.kiln-vce-cell input { min-width: 0; padding-left: 4px; padding-right: 2px; }
		.kiln-vce-list-row { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 4px; cursor: pointer; }
		.kiln-vce-list-row:hover { background: rgba(128,128,128,0.12); }
		.kiln-vce-list-row.current { background: rgba(255,159,26,0.16); }
		.kiln-vce-list-row code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.7rem; }
	`;
	document.head.appendChild(styleEl);

	const toggleId = `kiln-vce-toggle-${idPrefix}`;
	mount.innerHTML = `
		<div class="form-check form-switch mb-1">
			<input class="form-check-input" type="checkbox" id="${toggleId}" />
			<label class="form-check-label small fw-semibold" for="${toggleId}">Visual editor</label>
		</div>
		<div data-role="body" style="display:none;">
			<p class="small text-muted mb-2" data-role="status"></p>
			<div data-role="panel" style="display:none;">
				<div class="d-flex align-items-center gap-1 mb-2">
					<code class="flex-fill text-truncate small" data-role="tag"></code>
					<button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2" data-act="parent" title="Select the parent element"><i class="fas fa-arrow-up"></i></button>
					<button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2" data-act="deselect" title="Deselect (Esc)">✕</button>
				</div>
				<label class="form-label small text-muted mb-1">Apply to</label>
				<select class="form-select form-select-sm mb-2" data-role="target"></select>
				<div class="btn-group btn-group-sm w-100 mb-2" role="group">
					<button type="button" class="btn btn-outline-secondary" data-pseudo="">Normal</button>
					<button type="button" class="btn btn-outline-secondary" data-pseudo=":hover">On hover</button>
				</div>
				<div data-role="notice" class="alert alert-warning py-2 px-2 small mb-2" style="display:none;" role="alert"></div>
				<div data-role="fields"></div>
			</div>
			<div data-role="list-wrap" style="display:none;" class="mt-2">
				<div class="d-flex justify-content-between align-items-center mb-1">
					<span class="small text-muted">Edited elements</span>
					<button type="button" class="btn btn-link btn-sm p-0 text-danger" data-act="clear-all" style="font-size:0.75rem;">Clear all</button>
				</div>
				<div data-role="list"></div>
			</div>
		</div>`;

	const q = <T extends HTMLElement>(sel: string) =>
		mount.querySelector<T>(sel)!;
	const toggle = q<HTMLInputElement>(`#${toggleId}`);
	const bodyEl = q("[data-role=body]");
	const statusEl = q("[data-role=status]");
	const panelEl = q("[data-role=panel]");
	const tagEl = q("[data-role=tag]");
	const targetSelect = q<HTMLSelectElement>("[data-role=target]");
	const noticeEl = q("[data-role=notice]");
	const fieldsEl = q("[data-role=fields]");
	const listWrap = q("[data-role=list-wrap]");
	const listEl = q("[data-role=list]");
	const pseudoBtns = Array.from(
		mount.querySelectorAll<HTMLButtonElement>("[data-pseudo]"),
	);

	const makeBox = (kind: "hover" | "selected") => {
		const box = document.createElement("div");
		box.id = `kiln-vce-${kind}-${idPrefix}`;
		box.className = `kiln-vce-box ${kind}`;
		const chip = document.createElement("span");
		chip.className = "kiln-vce-chip";
		box.appendChild(chip);
		return box;
	};
	const hoverBox = makeBox("hover");
	const selectedBox = makeBox("selected");

	function place(box: HTMLElement, el: Element | null) {
		if (!el?.isConnected) {
			box.style.display = "none";
			return;
		}
		const r = el.getBoundingClientRect();
		if (!r.width && !r.height) {
			box.style.display = "none";
			return;
		}
		Object.assign(box.style, {
			display: "block",
			left: `${r.left}px`,
			top: `${r.top}px`,
			width: `${r.width}px`,
			height: `${r.height}px`,
		});
		const chip = box.firstElementChild as HTMLElement;
		chip.textContent = describe(el);
		chip.classList.toggle("inside", r.top < 22);
	}

	function updateOverlays() {
		place(hoverBox, hoverEl === selectedEl ? null : hoverEl);
		place(selectedBox, selectedEl);
	}

	let overlayFrame = 0;
	function scheduleOverlays() {
		if (overlayFrame) return;
		overlayFrame = requestAnimationFrame(() => {
			overlayFrame = 0;
			updateOverlays();
		});
	}

	const currentKey = () => selector + pseudo;
	const getProp = (prop: string) => model.get(currentKey())?.get(prop);

	function hidesProtectedControl(prop: string, value: string): boolean {
		if (!selector || !HIDE_VALUE[prop]?.test(value.trim())) return false;
		return qsa(selector).some(
			(el) =>
				el.matches(PROTECTED_CONTROLS) ||
				!!el.querySelector(PROTECTED_CONTROLS) ||
				!!el.closest(PROTECTED_TRIGGERS),
		);
	}

	function notifyBlocked(message: string | null) {
		if (options.onBlocked) {
			options.onBlocked(message);
			return;
		}
		noticeEl.textContent = message ?? "";
		noticeEl.style.display = message ? "" : "none";
	}

	async function commit() {
		await options.setCss(writeBlock(options.getCss(), model));
		renderList();
		scheduleOverlays();
	}

	function setProp(prop: string, value: string | null) {
		const key = currentKey();
		if (!selector || BLOCKED.test(key)) return Promise.resolve();
		if (value !== null && hidesProtectedControl(prop, value)) {
			notifyBlocked(PROTECTED_HIDE_MESSAGE);
			return Promise.resolve();
		}
		notifyBlocked(null);
		let decls = model.get(key);
		if (value === null) {
			decls?.delete(prop);
			if (decls && !decls.size) model.delete(key);
		} else {
			if (!decls) {
				decls = new Map();
				model.set(key, decls);
			}
			decls.set(prop, value);
		}
		return commit();
	}

	function syncRows(except?: Row) {
		for (const row of rows) if (row !== except) row.sync();
	}

	function pickable(target: EventTarget | null): Element | null {
		if (!(target instanceof Element)) return null;
		if (sidebar.contains(target) || target.closest(OWN_UI)) return null;
		if (target === document.body || target === document.documentElement)
			return null;
		return target;
	}

	function select(el: Element) {
		const found = buildCandidates(el);
		if (!found.length) {
			deselect();
			statusEl.textContent = "That element can't be styled.";
			return;
		}
		selectedEl = el;
		candidates = found;
		const edited = found.find(
			(c) => model.has(c.selector) || model.has(`${c.selector}:hover`),
		);
		const chosen = edited ?? found[0];
		selector = chosen.selector;
		pseudo =
			!model.has(chosen.selector) && model.has(`${chosen.selector}:hover`)
				? ":hover"
				: "";
		render();
		updateOverlays();
		panelEl.scrollIntoView({ block: "nearest" });
	}

	function selectFromList(key: string) {
		pseudo = key.endsWith(":hover") ? ":hover" : "";
		selector = pseudo ? key.slice(0, -":hover".length) : key;
		selectedEl = qsa(selector)[0] ?? null;
		candidates = selectedEl ? buildCandidates(selectedEl) : [];
		if (!candidates.some((c) => c.selector === selector))
			candidates.unshift({ selector, count: qsa(selector).length });
		render();
		updateOverlays();
	}

	function deselect() {
		selectedEl = null;
		selector = "";
		pseudo = "";
		candidates = [];
		render();
		updateOverlays();
	}

	function render() {
		notifyBlocked(null);
		const has = !!selector;
		panelEl.style.display = has ? "" : "none";
		statusEl.style.display = has ? "none" : "";
		if (!has) {
			statusEl.textContent = "Click an element on the page to start.";
			rows = [];
			fieldsEl.replaceChildren();
			renderList();
			return;
		}
		tagEl.textContent = selectedEl ? describe(selectedEl) : selector;
		tagEl.title = selector;
		targetSelect.replaceChildren(
			...candidates.map((c, i) => {
				const label =
					i === 0 && c.count === 1
						? `Only this element: ${c.selector}`
						: c.count === 1
							? `${c.selector} (1 element)`
							: `${c.selector} (${c.count} elements)`;
				const opt = new Option(label, c.selector);
				return opt;
			}),
		);
		targetSelect.value = selector;
		targetSelect.title = targetSelect.selectedOptions[0]?.text ?? "";
		for (const btn of pseudoBtns)
			btn.classList.toggle("active", btn.dataset.pseudo === pseudo);
		renderFields();
		renderList();
	}

	function renderList() {
		listWrap.style.display = model.size ? "" : "none";
		listEl.replaceChildren(
			...[...model].map(([key, decls]) => {
				const row = document.createElement("div");
				row.className = "kiln-vce-list-row";
				row.classList.toggle("current", key === currentKey());
				const code = document.createElement("code");
				code.textContent = key;
				code.title = key;
				const count = document.createElement("span");
				count.className = "badge bg-secondary";
				count.textContent = String(decls.size);
				const remove = document.createElement("button");
				remove.type = "button";
				remove.title = "Remove these edits";
				remove.textContent = "✕";
				remove.style.cssText =
					"background:none;border:none;padding:0 2px;color:inherit;opacity:.55;cursor:pointer;font-size:.75rem;";
				remove.addEventListener("click", (e) => {
					e.stopPropagation();
					model.delete(key);
					const wasCurrent = key === currentKey();
					void commit().then(() => {
						if (wasCurrent) renderFields();
					});
				});
				row.addEventListener("click", () => selectFromList(key));
				row.append(code, count, remove);
				return row;
			}),
		);
	}

	function renderFields() {
		fieldsEl.replaceChildren();
		rows = [];
		if (!selector) return;
		const cs = selectedEl ? getComputedStyle(selectedEl) : null;
		for (const group of GROUPS) {
			const details = document.createElement("details");
			details.className = "kiln-vce-group";
			details.open = openGroups.has(group.title);
			details.addEventListener("toggle", () => {
				if (details.open) openGroups.add(group.title);
				else openGroups.delete(group.title);
			});
			const summary = document.createElement("summary");
			summary.textContent = group.title;
			const body = document.createElement("div");
			body.className = "kiln-vce-group-body";
			for (const field of group.fields) {
				const row = buildRow(field, cs);
				rows.push(row);
				body.appendChild(row.el);
			}
			details.append(summary, body);
			fieldsEl.appendChild(details);
		}
	}

	function shell(label: string, stacked = false) {
		const el = document.createElement("div");
		el.className = `kiln-vce-row${stacked ? " stacked" : ""}`;
		const lab = document.createElement("span");
		lab.className = "kiln-vce-label";
		lab.textContent = label;
		const ctl = document.createElement("div");
		ctl.className = "kiln-vce-ctl";
		const reset = document.createElement("button");
		reset.type = "button";
		reset.className = "kiln-vce-reset";
		reset.title = "Reset";
		reset.textContent = "✕";
		el.append(lab, ctl, reset);
		return { el, ctl, reset };
	}

	function buildRow(field: Field, cs: CSSStyleDeclaration | null): Row {
		const props =
			field.kind === "numbers" ? field.items.map(([p]) => p) : [field.prop];
		const { el, ctl, reset } = shell(field.label, field.kind === "numbers");
		const isSet = () => props.some((p) => getProp(p) !== undefined);
		const row: Row = {
			el,
			props,
			sync: () => el.classList.toggle("is-set", isSet()),
		};
		reset.addEventListener("click", () => {
			const key = currentKey();
			const decls = model.get(key);
			for (const p of props) decls?.delete(p);
			if (decls && !decls.size) model.delete(key);
			void commit().then(() => renderFields());
		});

		const computed = (prop: string) => cs?.getPropertyValue(prop).trim() ?? "";

		switch (field.kind) {
			case "color": {
				const read = (): [string, number] => {
					const stored = getProp(field.prop);
					if (stored) {
						const parsed = parseCssColor(stored);
						if (parsed) return parsed;
					}
					const computedParsed = parseCssColor(
						computed(field.read ?? field.prop),
					);
					if (computedParsed) {
						const [computedHex, computedAlpha] = computedParsed;
						return [computedHex, computedAlpha === 0 ? 100 : computedAlpha];
					}
					return ["#000000", 100];
				};
				const [hex0, alpha0] = read();
				const picker = document.createElement("input");
				picker.type = "color";
				picker.className = "kiln-te-color-picker";
				picker.value = hex0;
				const hexInput = document.createElement("input");
				hexInput.type = "text";
				hexInput.maxLength = 7;
				hexInput.className = "form-control form-control-sm kiln-te-hex-input";
				hexInput.value = hex0;
				const alpha = document.createElement("input");
				alpha.type = "number";
				alpha.min = "0";
				alpha.max = "100";
				alpha.title = "Opacity %";
				alpha.className = "form-control form-control-sm kiln-vce-num";
				alpha.value = String(alpha0);
				const emit = () => {
					const a = Math.min(100, Math.max(0, Number(alpha.value) || 0));
					void setProp(field.prop, formatCssColor(picker.value, a));
					syncRows(row);
					row.sync();
				};
				picker.addEventListener("input", () => {
					hexInput.value = picker.value;
					if (Number(alpha.value) === 0) alpha.value = "100";
					emit();
				});
				hexInput.addEventListener("change", () => {
					const v = hexInput.value.startsWith("#")
						? hexInput.value
						: `#${hexInput.value}`;
					if (isValidHex(v)) {
						picker.value = v.toLowerCase();
						hexInput.value = v.toLowerCase();
						if (Number(alpha.value) === 0) alpha.value = "100";
						emit();
					} else hexInput.value = picker.value;
				});
				alpha.addEventListener("input", emit);
				ctl.append(picker, hexInput, alpha);
				break;
			}
			case "range": {
				const stored = getProp(field.prop);
				const initial =
					(stored ? field.parse(stored) : null) ??
					(cs ? field.computed?.(cs) : null) ??
					field.parse(computed(field.read ?? field.prop)) ??
					field.min;
				const slider = document.createElement("input");
				slider.type = "range";
				slider.min = String(field.min);
				slider.max = String(field.max);
				slider.step = String(field.step);
				slider.value = String(initial);
				const number = document.createElement("input");
				number.type = "number";
				number.step = String(field.step);
				number.className = "form-control form-control-sm kiln-vce-num";
				number.value = String(initial);
				const apply = (n: number) => {
					const value = field.format(n);
					if (hidesProtectedControl(field.prop, value)) {
						notifyBlocked(PROTECTED_HIDE_MESSAGE);
						// Put the slider back on the stored/computed value so it
						// doesn't read as applied when the edit was refused.
						const stored = getProp(field.prop);
						const restore =
							(stored ? field.parse(stored) : null) ??
							(cs ? field.computed?.(cs) : null) ??
							initial;
						slider.value = String(restore);
						number.value = String(restore);
						row.sync();
						return;
					}
					const implied = field.implies;
					if (implied && n > 0) {
						const decls = model.get(currentKey());
						if (
							!decls?.has(implied.prop) &&
							computed(implied.unless) === "none"
						)
							void setProp(implied.prop, implied.value);
					}
					void setProp(field.prop, value);
					syncRows(row);
					row.sync();
				};
				slider.addEventListener("input", () => {
					number.value = slider.value;
					apply(Number(slider.value));
				});
				number.addEventListener("input", () => {
					const n = parseFloat(number.value);
					if (!Number.isFinite(n)) return;
					slider.value = String(n);
					apply(n);
				});
				ctl.append(slider, number);
				if (field.suffix) {
					const unit = document.createElement("span");
					unit.className = "small text-muted";
					unit.textContent = field.suffix;
					ctl.appendChild(unit);
				}
				break;
			}
			case "select": {
				const select = document.createElement("select");
				select.className = "form-select form-select-sm";
				const comp = computed(field.read ?? field.prop);
				select.add(
					new Option(
						`Unchanged${comp && comp.length <= 24 ? ` (${comp})` : ""}`,
						"",
					),
				);
				for (const [value, label] of field.options)
					select.add(new Option(label, value));
				row.sync = () => {
					const cur = getProp(field.prop) ?? "";
					if (cur && !Array.from(select.options).some((o) => o.value === cur))
						select.add(new Option(`Custom: ${cur}`, cur));
					select.value = cur;
					el.classList.toggle("is-set", !!cur);
				};
				select.addEventListener("change", () => {
					void setProp(field.prop, select.value || null);
					syncRows(row);
					row.sync();
				});
				ctl.appendChild(select);
				row.sync();
				break;
			}
			case "numbers": {
				const cells = document.createElement("div");
				cells.className = `kiln-vce-cells${field.items.length === 2 ? " two" : ""}`;
				for (const [prop, short] of field.items) {
					const cell = document.createElement("label");
					cell.className = "kiln-vce-cell";
					const input = document.createElement("input");
					input.type = "number";
					input.className = "form-control form-control-sm";
					const stored = getProp(prop);
					input.value = stored ? String(parseFloat(stored)) : "";
					const comp = computed(prop);
					input.placeholder = Number.isFinite(parseFloat(comp))
						? String(Math.round(parseFloat(comp)))
						: comp;
					input.addEventListener("input", () => {
						const raw = input.value.trim();
						if (raw === "") void setProp(prop, null);
						else {
							const n = parseFloat(raw);
							if (!Number.isFinite(n)) return;
							void setProp(prop, `${n}px`);
						}
						row.sync();
					});
					const letter = document.createElement("span");
					letter.textContent = short;
					cell.append(letter, input);
					cells.appendChild(cell);
				}
				ctl.appendChild(cells);
				break;
			}
			case "toggle": {
				const label = document.createElement("label");
				label.className = "d-flex align-items-center gap-2 small mb-0";
				const box = document.createElement("input");
				box.type = "checkbox";
				box.className = "form-check-input mt-0";
				box.checked = getProp(field.prop) === field.value;
				row.sync = () => {
					box.checked = getProp(field.prop) === field.value;
					el.classList.toggle("is-set", box.checked);
				};
				box.addEventListener("change", () => {
					void setProp(field.prop, box.checked ? field.value : null);
					row.sync();
				});
				label.append(box, document.createTextNode(field.hint));
				ctl.appendChild(label);
				row.sync();
				break;
			}
		}
		el.classList.toggle("is-set", isSet());
		return row;
	}

	function onBlock(e: Event) {
		if (
			sidebar.contains(e.target as Node) ||
			(e.target as Element | null)?.closest?.(OWN_UI)
		)
			return;
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		if (e.type !== "click") return;
		const el = pickable(e.target);
		if (el) select(el);
		else deselect();
	}

	function onMove(e: PointerEvent) {
		const el = pickable(e.target);
		if (el === hoverEl) return;
		hoverEl = el;
		scheduleOverlays();
	}

	function onLeave() {
		hoverEl = null;
		scheduleOverlays();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key !== "Escape" || !selectedEl) return;
		const t = e.target;
		if (t instanceof HTMLElement && t.matches("input, textarea, select"))
			return;
		deselect();
	}

	let resizeObserver: ResizeObserver | null = null;

	function setEnabled(on: boolean) {
		if (on === enabled) return;
		enabled = on;
		bodyEl.style.display = on ? "" : "none";
		sidebar.classList.toggle("kiln-vce-ui", on);
		document.documentElement.classList.toggle("kiln-vce-on", on);
		if (on) {
			document.body.append(hoverBox, selectedBox);
			for (const type of BLOCKED_EVENTS)
				window.addEventListener(type, onBlock, true);
			window.addEventListener("pointermove", onMove, true);
			window.addEventListener("scroll", scheduleOverlays, true);
			window.addEventListener("resize", scheduleOverlays);
			window.addEventListener("keydown", onKey, true);
			document.documentElement.addEventListener("pointerleave", onLeave);
			resizeObserver = new ResizeObserver(scheduleOverlays);
			resizeObserver.observe(document.body);
			render();
		} else {
			for (const type of BLOCKED_EVENTS)
				window.removeEventListener(type, onBlock, true);
			window.removeEventListener("pointermove", onMove, true);
			window.removeEventListener("scroll", scheduleOverlays, true);
			window.removeEventListener("resize", scheduleOverlays);
			window.removeEventListener("keydown", onKey, true);
			document.documentElement.removeEventListener("pointerleave", onLeave);
			resizeObserver?.disconnect();
			resizeObserver = null;
			cancelAnimationFrame(overlayFrame);
			overlayFrame = 0;
			hoverEl = null;
			selectedEl = null;
			selector = "";
			pseudo = "";
			candidates = [];
			hoverBox.remove();
			selectedBox.remove();
		}
	}

	toggle.addEventListener("change", () => setEnabled(toggle.checked));
	q("[data-act=parent]").addEventListener("click", () => {
		const parent = selectedEl?.parentElement;
		if (parent && pickable(parent)) select(parent);
	});
	q("[data-act=deselect]").addEventListener("click", deselect);
	q("[data-act=clear-all]").addEventListener("click", () => {
		model = new Map();
		void commit().then(() => {
			if (selector) renderFields();
		});
	});
	targetSelect.addEventListener("change", () => {
		selector = targetSelect.value;
		targetSelect.title = targetSelect.selectedOptions[0]?.text ?? "";
		renderFields();
		renderList();
	});
	for (const btn of pseudoBtns)
		btn.addEventListener("click", () => {
			pseudo = (btn.dataset.pseudo ?? "") as Pseudo;
			for (const b of pseudoBtns)
				b.classList.toggle("active", b.dataset.pseudo === pseudo);
			renderFields();
			renderList();
		});

	renderList();

	return {
		syncFromText() {
			model = parseBlock(options.getCss());
			if (enabled) render();
			else renderList();
		},
		destroy() {
			setEnabled(false);
			styleEl.remove();
			mount.replaceChildren();
		},
	};
}
