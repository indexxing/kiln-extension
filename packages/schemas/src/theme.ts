export type EffectSlot =
	| "global"
	| "cards"
	| "buttons"
	| "inputs"
	| "navbar"
	| "modals"
	| "avatars";

export type EffectType =
	| "border-radius"
	| "box-shadow"
	| "border-width"
	| "border-color"
	| "border-style"
	| "background-color"
	| "letter-spacing"
	| "text-transform"
	| "frame-image"
	| "frame-shape"
	| "clicking-sound"
	| "background-music";

export type ThemeEffect = {
	id: string;
	slot: EffectSlot;
	type: EffectType;
	value: string | number;
};

export const EFFECT_SLOTS: Record<
	EffectSlot,
	{ label: string; types: EffectType[] }
> = {
	global: {
		label: "Global",
		types: [
			"border-radius",
			"letter-spacing",
			"text-transform",
			"clicking-sound",
			"background-music",
		],
	},
	cards: {
		label: "Cards",
		types: [
			"border-radius",
			"box-shadow",
			"border-width",
			"border-color",
			"border-style",
			"background-color",
		],
	},
	buttons: {
		label: "Buttons",
		types: [
			"border-radius",
			"box-shadow",
			"border-width",
			"border-color",
			"border-style",
			"letter-spacing",
			"text-transform",
		],
	},
	inputs: {
		label: "Inputs",
		types: [
			"border-radius",
			"border-width",
			"border-color",
			"border-style",
			"background-color",
		],
	},
	navbar: {
		label: "Navbar",
		types: ["box-shadow", "border-width", "border-color", "background-color"],
	},
	modals: {
		label: "Modals",
		types: ["border-radius", "box-shadow", "border-color", "background-color"],
	},
	avatars: {
		label: "Avatars",
		types: [
			"border-color",
			"border-width",
			"border-style",
			"box-shadow",
			"frame-image",
			"frame-shape",
		],
	},
};

export const EFFECT_TYPE_CONFIGS: Record<
	EffectType,
	{
		label: string;
		input:
			| {
					kind: "slider";
					min: number;
					max: number;
					step: number;
					unit: string;
					default: number;
			  }
			| {
					kind: "select";
					options: { value: string; label: string }[];
					default: string;
			  }
			| { kind: "color"; default: string }
			| { kind: "color-alpha"; default: string }
			| { kind: "url"; default: string }
			| { kind: "number"; min: number; max: number; default: number }
			| { kind: "audio-volume"; min: number; max: number; default: string };
	}
> = {
	"border-radius": {
		label: "Border Radius",
		input: { kind: "slider", min: 0, max: 32, step: 1, unit: "px", default: 8 },
	},
	"box-shadow": {
		label: "Box Shadow",
		input: {
			kind: "select",
			options: [
				{ value: "none", label: "None" },
				{ value: "subtle", label: "Subtle" },
				{ value: "medium", label: "Medium" },
				{ value: "strong", label: "Strong" },
			],
			default: "subtle",
		},
	},
	"border-width": {
		label: "Border Width",
		input: { kind: "slider", min: 0, max: 4, step: 1, unit: "px", default: 1 },
	},
	"border-color": {
		label: "Border Color",
		input: { kind: "color", default: "#ffffff" },
	},
	"border-style": {
		label: "Border Style",
		input: {
			kind: "select",
			options: [
				{ value: "solid", label: "Solid" },
				{ value: "dashed", label: "Dashed" },
				{ value: "dotted", label: "Dotted" },
				{ value: "none", label: "None" },
			],
			default: "solid",
		},
	},
	"background-color": {
		label: "Background Color",
		input: { kind: "color-alpha", default: "rgba(26,26,26,1)" },
	},
	"letter-spacing": {
		label: "Letter Spacing",
		input: {
			kind: "slider",
			min: 0,
			max: 5,
			step: 0.5,
			unit: "px",
			default: 0.5,
		},
	},
	"text-transform": {
		label: "Text Transform",
		input: {
			kind: "select",
			options: [
				{ value: "none", label: "None" },
				{ value: "uppercase", label: "UPPERCASE" },
				{ value: "capitalize", label: "Capitalize" },
				{ value: "lowercase", label: "lowercase" },
			],
			default: "uppercase",
		},
	},
	"frame-image": {
		label: "Frame Image",
		input: { kind: "url", default: "" },
	},
	"frame-shape": {
		label: "Frame Shape",
		input: {
			kind: "select",
			options: [
				{ value: "round", label: "Round" },
				{ value: "square", label: "Square" },
			],
			default: "round",
		},
	},
	"clicking-sound": {
		label: "Clicking Sound",
		input: { kind: "number", min: 1, max: 2147483647, default: 0 },
	},
	"background-music": {
		label: "Background Music",
		input: {
			kind: "audio-volume",
			min: 1,
			max: 2147483647,
			default: "0:50",
		},
	},
};

function buildSingleEffectCSS(
	effect: ThemeEffect,
	resolveImageUrl: (url: string) => string,
): string {
	const key = `${effect.slot}:${effect.type}`;
	switch (key) {
		case "global:border-radius": {
			const v = `${effect.value}px`;
			return `:root { --bs-border-radius: ${v}; --bs-border-radius-sm: calc(${v} * 0.75); --bs-border-radius-lg: calc(${v} * 1.5); --bs-border-radius-xl: calc(${v} * 2); }`;
		}
		case "cards:border-radius": {
			const v = `${effect.value}px`;
			return `.card { border-radius: ${v} !important; }\n.card-header:first-child { border-top-left-radius: calc(${v} - 1px) !important; border-top-right-radius: calc(${v} - 1px) !important; }\n.card-footer:last-child { border-bottom-left-radius: calc(${v} - 1px) !important; border-bottom-right-radius: calc(${v} - 1px) !important; }`;
		}
		case "buttons:border-radius":
			return `.btn { border-radius: ${effect.value}px !important; }`;
		case "inputs:border-radius":
			return `.form-control, .form-select { border-radius: ${effect.value}px !important; }`;
		case "modals:border-radius":
			return `.modal-content { border-radius: ${effect.value}px !important; }`;

		case "cards:box-shadow":
		case "buttons:box-shadow":
		case "modals:box-shadow":
		case "navbar:box-shadow": {
			const shadows: Record<string, string> = {
				none: "none",
				subtle: "0 2px 8px rgba(0,0,0,0.3)",
				medium: "0 4px 16px rgba(0,0,0,0.5)",
				strong: "0 8px 32px rgba(0,0,0,0.7)",
			};
			const shadow = shadows[String(effect.value)] ?? "none";
			const sel =
				effect.slot === "cards"
					? ".card"
					: effect.slot === "buttons"
						? ".btn"
						: effect.slot === "modals"
							? ".modal-content"
							: "nav.navbar";
			return `${sel} { box-shadow: ${shadow} !important; }`;
		}

		case "cards:border-width":
			return `.card { border-width: ${effect.value}px !important; }`;
		case "buttons:border-width":
			return `.btn { border-width: ${effect.value}px !important; }`;
		case "inputs:border-width":
			return `.form-control, .form-select { border-width: ${effect.value}px !important; }`;
		case "navbar:border-width":
			return `nav.navbar { border-bottom: ${effect.value}px solid var(--bs-border-color) !important; }`;

		case "cards:border-color":
			return `.card { border-color: ${effect.value} !important; --bs-card-border-color: ${effect.value}; }`;
		case "buttons:border-color":
			return `.btn:not(.btn-primary):not(.btn-outline-primary) { border-color: ${effect.value} !important; }`;
		case "inputs:border-color":
			return `.form-control, .form-select { border-color: ${effect.value} !important; }`;
		case "modals:border-color":
			return `.modal-content { border-color: ${effect.value} !important; }`;
		case "navbar:border-color":
			return `nav.navbar { border-bottom-color: ${effect.value} !important; border-bottom-style: solid !important; }`;

		case "cards:border-style":
			return `.card { border-style: ${effect.value} !important; }`;
		case "buttons:border-style":
			return `.btn { border-style: ${effect.value} !important; }`;
		case "inputs:border-style":
			return `.form-control, .form-select { border-style: ${effect.value} !important; }`;

		case "cards:background-color":
			return `.card { background-color: ${effect.value} !important; --bs-card-bg: ${effect.value}; }`;
		case "inputs:background-color":
			return `.form-control, .form-select { background-color: ${effect.value} !important; }\n.form-control:focus { background-color: ${effect.value} !important; }`;
		case "navbar:background-color":
			return `.bg-navbar, nav.navbar { background-color: ${effect.value} !important; }`;
		case "modals:background-color":
			return `.modal-content { background-color: ${effect.value} !important; }`;

		case "global:letter-spacing":
			return `body { letter-spacing: ${effect.value}px !important; }`;
		case "buttons:letter-spacing":
			return `.btn { letter-spacing: ${effect.value}px !important; }`;

		case "global:text-transform":
			return `body { text-transform: ${effect.value} !important; }`;

		// Clicking sound and background music are played by the extension
		// directly — there's no CSS to generate for either.
		case "global:clicking-sound":
		case "global:background-music":
			return "";
		case "buttons:text-transform":
			return `.btn { text-transform: ${effect.value} !important; }`;

		case "avatars:border-color":
			return `.img-fluid.rounded-circle { border-color: ${effect.value} !important; }`;
		case "avatars:border-width":
			return `.img-fluid.rounded-circle { border-width: ${effect.value}px !important; border-style: solid; }`;
		case "avatars:border-style":
			return `.img-fluid.rounded-circle { border-style: ${effect.value} !important; }`;
		case "avatars:box-shadow": {
			const shadows: Record<string, string> = {
				none: "none",
				subtle: "0 0 6px 2px rgba(0,0,0,0.5)",
				medium: "0 0 12px 4px rgba(0,0,0,0.6)",
				strong: "0 0 20px 6px rgba(0,0,0,0.75)",
			};
			const shadow = shadows[String(effect.value)] ?? "none";
			return `.img-fluid.rounded-circle { box-shadow: ${shadow} !important; }`;
		}
		case "avatars:frame-image": {
			const url = String(effect.value).trim();
			if (!url) return "";
			const safeUrl = JSON.stringify(resolveImageUrl(url));
			return `a:has(> .img-fluid.rounded-circle) { position: relative !important; display: inline-block !important; line-height: 0; overflow: visible !important; }
a:has(> .img-fluid.rounded-circle)::after { content: ""; position: absolute; z-index: 2; inset: -5px; pointer-events: none; background: url(${safeUrl}) center / 100% 100% no-repeat; }
a:has(> .img-fluid.rounded-circle) > .img-fluid.rounded-circle { border: 0 !important; box-shadow: none !important; }
.friend-circle { position: relative; overflow: visible !important; }
.friend-circle::after { content: ""; position: absolute; z-index: 2; top: -5px; left: -5px; width: 100px; height: 100px; pointer-events: none; background: url(${safeUrl}) center / 100% 100% no-repeat; }
.friend-circle > img[width="90"] { display: block !important; position: relative; z-index: 1; width: 76px !important; height: 76px !important; margin: 7px !important; object-fit: cover !important; border: 0 !important; border-radius: 50% !important; box-shadow: none !important; clip-path: none !important; }`;
		}
		case "avatars:frame-shape": {
			if (effect.value === "square") {
				return `a:has(> .img-fluid.rounded-circle) > .img-fluid.rounded-circle { border-radius: 8px !important; clip-path: inset(0 round 8px) !important; }
.friend-circle > img[width="90"] { border-radius: 0 !important; clip-path: inset(0 round 8px) !important; }`;
			}
			return `a:has(> .img-fluid.rounded-circle) > .img-fluid.rounded-circle { border-radius: 50% !important; clip-path: none !important; }
.friend-circle > img[width="90"] { border-radius: 50% !important; clip-path: none !important; }`;
		}
	}
	return "";
}

export function buildEffectsCSS(
	effects: ThemeEffect[],
	resolveImageUrl: (url: string) => string = (url) => url,
): string {
	return effects
		.map((effect) => buildSingleEffectCSS(effect, resolveImageUrl))
		.filter(Boolean)
		.join("\n");
}

export const FONTS: Record<
	string,
	{ name: string; googleFamily?: string; localFile?: string; stack: string }
> = {
	default: { name: "Default (Polytoria)", stack: "" },
	"polytoria-logo": {
		name: "Polytoria Logo Font",
		localFile: "fonts/PolytoriaLogoFont-Regular.ttf",
		stack: "'PolytoriaLogoFont', sans-serif",
	},
	inter: {
		name: "Inter",
		googleFamily: "Inter:wght@400;500;600;700",
		stack: "'Inter', sans-serif",
	},
	roboto: {
		name: "Roboto",
		googleFamily: "Roboto:wght@400;500;700",
		stack: "'Roboto', sans-serif",
	},
	poppins: {
		name: "Poppins",
		googleFamily: "Poppins:wght@400;500;600;700",
		stack: "'Poppins', sans-serif",
	},
	nunito: {
		name: "Nunito",
		googleFamily: "Nunito:wght@400;600;700",
		stack: "'Nunito', sans-serif",
	},
	raleway: {
		name: "Raleway",
		googleFamily: "Raleway:wght@400;500;600;700",
		stack: "'Raleway', sans-serif",
	},
	montserrat: {
		name: "Montserrat",
		googleFamily: "Montserrat:wght@400;500;600;700",
		stack: "'Montserrat', sans-serif",
	},
	"space-grotesk": {
		name: "Space Grotesk",
		googleFamily: "Space+Grotesk:wght@400;500;600;700",
		stack: "'Space Grotesk', sans-serif",
	},
	"dm-sans": {
		name: "DM Sans",
		googleFamily: "DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700",
		stack: "'DM Sans', sans-serif",
	},
	"playfair-display": {
		name: "Playfair Display",
		googleFamily: "Playfair+Display:wght@400;600;700",
		stack: "'Playfair Display', serif",
	},
	"jetbrains-mono": {
		name: "JetBrains Mono",
		googleFamily: "JetBrains+Mono:wght@400;500;700",
		stack: "'JetBrains Mono', monospace",
	},
};

export const THEME_PRESETS: Record<
	string,
	{ name: string; accentColor: string; navbarColor: string }
> = {
	ocean: {
		name: "Ocean",
		accentColor: "#06b6d4",
		navbarColor: "#0c4a6e",
	},
	sunset: {
		name: "Sunset",
		accentColor: "#f97316",
		navbarColor: "#431407",
	},
	forest: {
		name: "Forest",
		accentColor: "#22c55e",
		navbarColor: "#14532d",
	},
	nebula: {
		name: "Nebula",
		accentColor: "#a855f7",
		navbarColor: "#3b0764",
	},
	rose: {
		name: "Rose",
		accentColor: "#f43f5e",
		navbarColor: "#4c0519",
	},
	monochrome: {
		name: "Mono",
		accentColor: "#6b7280",
		navbarColor: "#000000",
	},
};

export const COLOR_TOKENS: Record<
	string,
	{ label: string; apply: (v: string) => string }
> = {
	bodyBg: {
		label: "Page Background",
		apply: (v) =>
			`body { background-color: ${v} !important; } :root { --bs-body-bg: ${v}; }`,
	},
	bodyText: {
		label: "Body Text",
		apply: (v) =>
			`body { color: ${v} !important; } :root { --bs-body-color: ${v}; }`,
	},
	cardBg: {
		label: "Card Background",
		apply: (v) =>
			`.card { background-color: ${v} !important; --bs-card-bg: ${v}; }`,
	},
	linkColor: {
		label: "Links",
		apply: (v) =>
			`:root { --bs-link-color: ${v}; --bs-link-hover-color: ${v}; }`,
	},
	mutedText: {
		label: "Muted Text",
		apply: (v) =>
			`.text-muted { color: ${v} !important; } :root { --bs-secondary-color: ${v}; }`,
	},
	studsColor: {
		label: "Studs Color",
		apply: (v) => `.text-studs { color: ${v} !important; }`,
	},
	bricksColor: {
		label: "Bricks Color",
		// Bricks balance just reuses the generic .text-success class, so scope
		// the override to spans containing the brick icon instead of hijacking
		// every other text-success usage on the site.
		apply: (v) => `.text-success:has(.pi-brick) { color: ${v} !important; }`,
	},
};

export const SELECTOR_REFERENCE: {
	category: string;
	items: { label: string; selector: string; note?: string }[];
}[] = [
	{
		category: "Global",
		items: [
			{ label: "Page body", selector: "body" },
			{
				label: "Theme CSS variables",
				selector: ":root",
				note: "--bs-primary, --bs-body-bg, --bs-border-color, etc.",
			},
			{ label: "Dividers", selector: "hr" },
			{ label: "Dropdown menu", selector: ".dropdown-menu" },
			{ label: "Pill nav (tabs)", selector: ".nav-pills" },
			{ label: "Tab nav", selector: ".nav-tabs" },
			{ label: "Tab nav link", selector: ".nav-tabs .nav-link" },
			{ label: "Active tab link", selector: ".nav-tabs .nav-link.active" },
			{ label: "Progress bar track", selector: ".progress" },
			{ label: "Progress bar fill", selector: ".progress-bar" },
			{ label: "Checkbox/radio input", selector: ".form-check-input" },
			{ label: "Scrollbar (thin)", selector: "::-webkit-scrollbar" },
			{ label: "Scrollbar track", selector: "::-webkit-scrollbar-track" },
			{ label: "Scrollbar thumb", selector: "::-webkit-scrollbar-thumb" },
			{ label: "Footer", selector: ".footer-container" },
		],
	},
	{
		category: "Navbar & Sidebar",
		items: [
			{ label: "Top navbar", selector: "nav.navbar" },
			{ label: "Navbar background wrapper", selector: ".bg-navbar" },
			{ label: "Navbar logo image", selector: ".navbar-brand img" },
			{
				label: "Account dropdown toggle",
				selector: "#navbar-dark-dropdown-menu-link",
			},
			{ label: "Left sidebar container", selector: ".nav-sidebar-cont" },
			{
				label: "Left sidebar panel",
				selector: ".nav-sidebar-cont .nav-sidebar",
			},
			{ label: "Sidebar icon button", selector: ".nav-sidebar-button" },
			{ label: "Sidebar icon images", selector: ".nav-sidebar-cont a img" },
			{
				label: "Sidebar upgrade button",
				selector: ".nav-sidebar-upgrade-button",
			},
			{ label: "Search input", selector: "#gsearch" },
			{ label: "Search input wrapper", selector: ".input-group.nav-search" },
			{ label: "Search results popup", selector: ".search-popup" },
			{ label: "Search result row", selector: ".search-popup .search-item" },
			{ label: "Notifications popup", selector: ".notifications-popup" },
			{ label: "Notification row", selector: ".notification-item" },
			{ label: "Friends popup", selector: ".friendsPopup" },
			{ label: "Friend row in popup", selector: ".friendsPopup .popupItem" },
		],
	},
	{
		category: "Cards",
		items: [
			{ label: "Card", selector: ".card" },
			{ label: "Card body", selector: ".card-body" },
			{ label: "Card header", selector: ".card-header" },
			{ label: "Card footer", selector: ".card-footer" },
			{
				label: "Inbox message card",
				selector: ".card-inbox",
				note: "left accent border",
			},
			{ label: "Dashboard summary card", selector: ".card-dash" },
			{ label: "Dashboard card subtitle", selector: ".dash-ctitle2" },
			{ label: "XP / level card", selector: ".xp-card" },
		],
	},
	{
		category: "Buttons",
		items: [
			{ label: "Button (base)", selector: ".btn" },
			{ label: "Primary button", selector: ".btn-primary" },
			{ label: "Outline primary button", selector: ".btn-outline-primary" },
			{ label: "Secondary button", selector: ".btn-secondary" },
			{ label: 'Feed "Post" button', selector: "#feed-post-button" },
			{ label: "Like/rating thumb button", selector: ".thumbup-button" },
			{ label: "Active thumb button", selector: ".thumbup-button.active" },
		],
	},
	{
		category: "Forms & Inputs",
		items: [
			{ label: "Text input", selector: ".form-control" },
			{ label: "Select dropdown", selector: ".form-select" },
			{ label: "Input group addon", selector: ".input-group-text" },
			{ label: "Feed post composer", selector: "#feed-post" },
		],
	},
	{
		category: "Modals & Alerts",
		items: [
			{ label: "Bootstrap modal content", selector: ".modal-content" },
			{ label: "Kiln extension modal", selector: ".kiln-extension-modal" },
			{ label: "SweetAlert popup", selector: ".swal2-popup" },
			{ label: "SweetAlert title", selector: ".swal2-title" },
			{ label: "SweetAlert body text", selector: ".swal2-html-container" },
			{ label: "SweetAlert confirm button", selector: ".swal2-confirm" },
			{ label: "SweetAlert cancel button", selector: ".swal2-cancel" },
			{ label: "SweetAlert text input", selector: ".swal2-input" },
			{ label: "SweetAlert textarea", selector: ".swal2-textarea" },
		],
	},
	{
		category: "Pagination",
		items: [
			{ label: "Page link", selector: ".page-link" },
			{ label: "Active page link", selector: ".page-item.active .page-link" },
			{
				label: "Disabled page link",
				selector: ".page-item.disabled .page-link",
			},
		],
	},
	{
		category: "Avatars & Profile",
		items: [
			{ label: "Circular avatar image", selector: ".img-fluid.rounded-circle" },
			{ label: "Friend list avatar wrapper", selector: ".friend-circle" },
			{ label: "Wall/profile post bubble", selector: ".user-post-bubble" },
			{ label: "User forum post content", selector: ".user-forum-content" },
		],
	},
	{
		category: "Forum",
		items: [
			{ label: "Forum thread row", selector: ".forum-entry" },
			{
				label: "Read thread row",
				selector: ".forum-entry.forum-post-read",
			},
			{
				label: "Unread thread row",
				selector: ".forum-entry.forum-post-unread",
			},
			{
				label: "Forum category container",
				selector: ".forum-category-container",
			},
			{
				label: "Forum post title bar",
				selector: ".forum-post-title-container",
			},
			{ label: "Forum user sidebar", selector: ".forum-user-container" },
		],
	},
	{
		category: "Store & Marketplace",
		items: [
			{ label: "Store landing banner", selector: ".card-store" },
			{ label: "Store search banner", selector: ".card-store-search" },
			{ label: "Stud market banner", selector: ".card-stud-market" },
			{ label: "Forum banner card", selector: ".card-forum" },
			{ label: "Item type filter button", selector: ".store-type-btn" },
			{
				label: "Accessory filter button",
				selector: ".store-accessory-btn",
			},
			{ label: "Advanced filters panel", selector: ".store-advanced-panel" },
			{ label: "Filter label text", selector: ".store-filter-label" },
			{ label: "Item hero image", selector: ".item-hero" },
		],
	},
	{
		category: "Trades",
		items: [
			{
				label: "Trade item preview strip",
				selector: ".trd-items-preview",
			},
			{ label: "Trade item card", selector: ".trd-items-preview .item" },
			{ label: "Trade value badge", selector: ".trd-box-val" },
		],
	},
	{
		category: "Dashboard & Challenges",
		items: [
			{ label: "Daily challenge card", selector: ".daily-challenge-card" },
			{ label: "Streak badge", selector: ".challenge-streak-badge" },
			{
				label: "Streak badge label",
				selector: ".challenge-streak-badge-label",
			},
			{
				label: "Streak badge multiplier",
				selector: ".challenge-streak-badge-multiplier",
			},
			{ label: "Item of the day card", selector: ".iotd-card" },
		],
	},
	{
		category: "Places",
		items: [
			{ label: "Place card title", selector: ".place-card-title" },
			{ label: '"Now playing" indicator', selector: ".place-playing" },
			{ label: "Place rating", selector: ".place-rating" },
		],
	},
];

export function hexToRgb(hex: string): [number, number, number] {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return [0, 0, 0];
	return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function rgbToHsl(
	r: number,
	g: number,
	b: number,
): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}
	return [h, s, l];
}

export function hslToRgb(
	h: number,
	s: number,
	l: number,
): [number, number, number] {
	if (s === 0) {
		const v = Math.round(l * 255);
		return [v, v, v];
	}
	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return [
		Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
		Math.round(hue2rgb(p, q, h) * 255),
		Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
	];
}

export function darkenHex(hex: string, percent: number): string {
	const [r, g, b] = hexToRgb(hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	const [nr, ng, nb] = hslToRgb(h, s, Math.max(0, l - percent / 100));
	return rgbToHex(nr, ng, nb);
}

export function lightenHex(hex: string, percent: number): string {
	const [r, g, b] = hexToRgb(hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	const [nr, ng, nb] = hslToRgb(h, s, Math.min(1, l + percent / 100));
	return rgbToHex(nr, ng, nb);
}

export function getContrastColor(hex: string): "#000000" | "#ffffff" {
	const [r, g, b] = hexToRgb(hex);
	const toLinear = (c: number) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
	return L > 0.179 ? "#000000" : "#ffffff";
}

export function isValidHex(hex: string): boolean {
	return /^#[0-9a-f]{6}$/i.test(hex);
}

const LOGO_BASE_HUE = rgbToHsl(...hexToRgb("#ff5951"))[0];

export function hexToIconFilter(hex: string): string {
	const [r, g, b] = hexToRgb(hex);
	const [h, s, l] = rgbToHsl(r, g, b);
	const hueRotateDeg = Math.round(((h - LOGO_BASE_HUE + 1) % 1) * 360);
	if (s < 0.05) {
		const brightness = Math.min(10, l / 0.45).toFixed(2);
		return `saturate(0) brightness(${brightness})`;
	}
	const saturate = Math.min(20, s * 1.1).toFixed(2);
	const brightness = Math.min(5, l / 0.45).toFixed(2);
	return `hue-rotate(${hueRotateDeg}deg) saturate(${saturate}) brightness(${brightness})`;
}

export function buildThemeCSS(
	accentColor: string,
	navbarColor: string,
	navbarIconColor?: string,
	logoAssetUrl?: string,
): string {
	const [ar, ag, ab] = hexToRgb(accentColor);
	const accentHover = darkenHex(accentColor, 10);
	const accentActive = darkenHex(accentColor, 18);
	const [ahr, ahg, ahb] = hexToRgb(accentHover);
	const btnText = getContrastColor(accentColor);
	const btnHoverText = getContrastColor(accentHover);

	const [nr, ng, nb] = hexToRgb(navbarColor);
	const chromeBg = darkenHex(navbarColor, 4);
	const cardCap = lightenHex(navbarColor, 3);
	const cardBg = lightenHex(navbarColor, 7);
	const dropdownBg = lightenHex(navbarColor, 9);
	const secondaryBg = lightenHex(navbarColor, 13);
	const borderColor = lightenHex(navbarColor, 18);
	const heroBgTop = darkenHex(navbarColor, 5);
	const heroBgBottom = darkenHex(navbarColor, 11);
	const [hvr, hvg, hvb] = hexToRgb(darkenHex(navbarColor, 16));
	const [cr, cg, cb] = hexToRgb(cardBg);
	const [sr, sg, sb] = hexToRgb(secondaryBg);
	const [bcr, bcg, bcb] = hexToRgb(borderColor);

	const [accentH] = rgbToHsl(ar, ag, ab);
	const hueRotate = Math.round(((accentH - LOGO_BASE_HUE + 1) % 1) * 360);

	const bodyText = getContrastColor(navbarColor);
	const [btr, btg, btb] = hexToRgb(bodyText);

	return `
:root {
  --bs-primary: ${accentColor};
  --bs-primary-rgb: ${ar}, ${ag}, ${ab};

  --bs-link-color: ${accentColor};
  --bs-link-color-rgb: ${ar}, ${ag}, ${ab};
  --bs-link-hover-color: ${accentHover};
  --bs-link-hover-color-rgb: ${ahr}, ${ahg}, ${ahb};

  --bs-body-bg: ${navbarColor};
  --bs-body-bg-rgb: ${nr}, ${ng}, ${nb};
  --bs-body-color: ${bodyText};
  --bs-body-color-rgb: ${btr}, ${btg}, ${btb};

  --bs-secondary-bg: ${secondaryBg};
  --bs-secondary-bg-rgb: ${sr}, ${sg}, ${sb};
  --bs-tertiary-bg: ${cardBg};
  --bs-tertiary-bg-rgb: ${cr}, ${cg}, ${cb};

  --bs-border-color: ${borderColor};
  --bs-border-color-translucent: ${borderColor}40;

  --pt-inset: ${secondaryBg};
}

.btn-primary {
  --bs-btn-color: ${btnText};
  --bs-btn-bg: ${accentColor};
  --bs-btn-border-color: ${accentColor};
  --bs-btn-hover-color: ${btnHoverText};
  --bs-btn-hover-bg: ${accentHover};
  --bs-btn-hover-border-color: ${accentHover};
  --bs-btn-focus-shadow-rgb: ${ar}, ${ag}, ${ab};
  --bs-btn-active-color: ${btnHoverText};
  --bs-btn-active-bg: ${accentActive};
  --bs-btn-active-border-color: ${accentActive};
  --bs-btn-disabled-color: ${btnText};
  --bs-btn-disabled-bg: ${accentColor};
  --bs-btn-disabled-border-color: ${accentColor};
}

.btn-outline-primary {
  --bs-btn-color: ${accentColor};
  --bs-btn-border-color: ${accentColor};
  --bs-btn-hover-color: ${btnText};
  --bs-btn-hover-bg: ${accentColor};
  --bs-btn-hover-border-color: ${accentColor};
  --bs-btn-focus-shadow-rgb: ${ar}, ${ag}, ${ab};
  --bs-btn-active-color: ${btnText};
  --bs-btn-active-bg: ${accentColor};
  --bs-btn-active-border-color: ${accentColor};
  --bs-btn-disabled-color: ${accentColor};
  --bs-btn-disabled-border-color: ${accentColor};
}

#feed-post-button {
  --bs-btn-color: ${bodyText};
  --bs-btn-border-color: ${accentColor};
  --bs-btn-hover-color: ${btnText};
  --bs-btn-hover-bg: ${accentColor};
  --bs-btn-hover-border-color: ${accentColor};
  --bs-btn-focus-shadow-rgb: ${ar}, ${ag}, ${ab};
  --bs-btn-active-color: ${btnText};
  --bs-btn-active-bg: ${accentColor};
  --bs-btn-active-border-color: ${accentColor};
}

.card {
  --bs-card-bg: ${cardBg};
  --bs-card-cap-bg: ${cardCap};
  --bs-card-border-color: ${borderColor};
}

.dropdown-menu {
  --bs-dropdown-bg: ${dropdownBg};
  --bs-dropdown-link-hover-bg: ${secondaryBg};
  --bs-dropdown-link-active-bg: ${accentColor};
}

.nav-pills {
  --bs-nav-pills-link-active-bg: ${accentColor};
}

.nav-tabs { border-bottom-color: ${borderColor} !important; }
.nav-tabs .nav-link {
  border-color: transparent !important;
  color: ${bodyText} !important;
}
.nav-tabs .nav-link:hover {
  border-color: ${borderColor} ${borderColor} ${borderColor} !important;
}
.nav-tabs .nav-link.active {
  color: ${lightenHex(accentColor, 20)} !important;
  background-color: ${cardBg} !important;
  border-color: ${borderColor} ${borderColor} ${cardBg} !important;
}

.daily-challenge-card .text-primary { color: ${lightenHex(accentColor, 20)} !important; }

.form-check-input:checked {
  background-color: ${accentColor} !important;
  border-color: ${accentColor} !important;
}

.bg-primary { background-color: ${accentColor} !important; }
.text-primary { color: ${accentColor} !important; }
.border-primary { border-color: ${accentColor} !important; }
.badge.bg-primary { background-color: ${accentColor} !important; }
.alert-primary { border-color: ${accentColor} !important; }
.progress-bar { background-color: ${accentColor} !important; }
.page-item.active .page-link {
  background-color: ${accentColor} !important;
  border-color: ${accentColor} !important;
}
.page-link {
  background-color: ${cardBg} !important;
  border-color: ${borderColor} !important;
  color: ${bodyText} !important;
}
.page-link:hover {
  background-color: ${secondaryBg} !important;
  border-color: ${borderColor} !important;
  color: ${bodyText} !important;
}
.page-item.disabled .page-link {
  background-color: ${navbarColor} !important;
  border-color: ${borderColor} !important;
  color: rgba(${btr}, ${btg}, ${btb}, 0.35) !important;
}

.bg-navbar { background-color: ${chromeBg} !important; }

.bg-inset { background-color: ${secondaryBg} !important; }

:root { --bs-dark-rgb: ${cr}, ${cg}, ${cb}; }

.input-group-text { border-color: ${borderColor} !important; }

.form-select {
  background-color: ${cardBg} !important;
  border-color: ${borderColor} !important;
  color: ${bodyText} !important;
}
.form-select:focus {
  border-color: ${accentColor} !important;
  box-shadow: 0 0 0 0.25rem rgba(${ar}, ${ag}, ${ab}, 0.25) !important;
}
.form-select:disabled { background-color: ${secondaryBg} !important; }

.card-inbox { border-left-color: ${accentColor} !important; }

.forum-entry {
  background-color: ${cardBg} !important;
}
.forum-entry.forum-post-read { border-left-color: ${borderColor} !important; }
.forum-entry.forum-post-unread { border-left-color: ${accentColor} !important; }

.forum-category-container { background-color: ${cardBg} !important; }
.forum-post-title-container { background-color: ${cardBg} !important; }

@media (min-width: 768px) {
  .forum-user-container { background: ${secondaryBg} !important; }
}

.trd-items-preview .item {
  background-color: ${cardBg} !important;
  border-color: ${borderColor} !important;
}

.card-store-search::before {
  background: linear-gradient(to right, ${accentColor} 35%, #0000),
    url(https://cdn.polytoria.com/static/store-bg-DbYLmiES.png) no-repeat center !important;
  background-size: cover !important;
}

.card-store {
  background: linear-gradient(to right, ${accentColor} 35%, #0000),
    url(https://cdn.polytoria.com/static/store-bg-DbYLmiES.png) no-repeat center !important;
  background-size: cover !important;
}

.card-stud-market {
  background: linear-gradient(to right, ${accentColor} 35%, #0000),
    url(https://cdn.polytoria.com/static/studs-market-bg-DTVRt-7A.png) no-repeat center !important;
  background-size: cover !important;
}

.card-forum {
  background: linear-gradient(to right, ${accentColor} 20%, #0000),
    url(https://cdn.polytoria.com/static/forum-bg-BxZFPqfx.png) no-repeat center !important;
  background-size: cover !important;
}

.iotd-card {
  background: linear-gradient(135deg, ${accentColor}, ${accentActive}) !important;
  border-color: ${accentActive} !important;
}
.card-forum .card {
  background-color: rgba(255, 255, 255, 0.15) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
}

.notifications-popup {
  background-color: ${cardBg} !important;
  border: 1px solid ${borderColor} !important;
}
.notification-item:hover { background-color: ${secondaryBg} !important; }

.search-popup {
  background-color: ${cardBg} !important;
  border: 1px solid ${borderColor} !important;
}
.search-popup .search-item:hover,
.search-popup .search-item:focus {
  background-color: ${secondaryBg} !important;
  border-color: ${borderColor} !important;
  box-shadow: none !important;
}

.friendsPopup {
  background-color: ${cardBg} !important;
  border-color: ${borderColor} !important;
}
.friendsPopup .popupItem:hover { background-color: ${secondaryBg} !important; }

html .input-group.nav-search #search-addon,
html .input-group.nav-search input#gsearch {
  background: ${cardBg} !important;
  border-color: ${borderColor} !important;
  color: ${bodyText} !important;
}
#gsearch::placeholder { color: rgba(${btr}, ${btg}, ${btb}, 0.5) !important; }
html .input-group.nav-search input#gsearch:focus {
  border-color: ${accentColor} !important;
  box-shadow: 0 0 0 0.25rem rgba(${ar}, ${ag}, ${ab}, 0.25) !important;
}

.store-type-btn,
.store-accessory-btn {
  background-color: ${cardBg};
  border: 1px solid ${borderColor};
  color: ${bodyText};
}
.store-type-btn:hover,
.store-type-btn.active,
.store-accessory-btn:hover,
.store-accessory-btn.active {
  background-color: ${accentColor} !important;
  border-color: ${accentColor} !important;
  color: ${btnText} !important;
}

.store-advanced-panel {
  background-color: ${cardBg};
  border-radius: 8px;
  padding: 12px;
}
.store-filter-label { color: rgba(255, 255, 255, 0.7); }

.item-hero {
  background: linear-gradient(180deg, ${heroBgTop}, ${heroBgBottom}) !important;
  border-bottom-color: ${borderColor} !important;
}
.item-hero::before {
  content: "";
  position: absolute;
  inset: -15%;
  z-index: 0;
  background-image: var(--item-bg);
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  filter: blur(50px) saturate(1.3);
  opacity: 0.22;
  pointer-events: none;
}
.item-hero::after {
  background: radial-gradient(
    ellipse at center,
    rgba(${ar}, ${ag}, ${ab}, 0.1) 0%,
    transparent 42%,
    rgba(${hvr}, ${hvg}, ${hvb}, 0.85) 100%
  ) !important;
}
.item-hero > canvas { position: relative; z-index: 1; }

.card-dash {
  background: linear-gradient(180deg, ${cardBg}, ${cardCap}) !important;
}

.dash-ctitle2 { color: rgba(255, 255, 255, 0.5) !important; }

.form-control {
  background-color: ${cardBg} !important;
  border-color: ${borderColor} !important;
  color: ${bodyText} !important;
}
.form-control:focus {
  background-color: ${secondaryBg} !important;
  border-color: ${accentColor} !important;
  box-shadow: 0 0 0 0.25rem rgba(${ar}, ${ag}, ${ab}, 0.25) !important;
}

#feed-post,
#feed-post:focus {
  background-color: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.xp-card {
  background-color: ${cardBg};
  border-radius: 15px;
}

:root { --bs-secondary-rgb: ${bcr}, ${bcg}, ${bcb}; }

.progress { background-color: ${secondaryBg} !important; }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: ${navbarColor}; }
::-webkit-scrollbar-thumb { background-color: ${borderColor}; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background-color: ${accentColor}; }

.swal2-popup {
  background-color: ${cardBg} !important;
  color: ${bodyText} !important;
  border: 1px solid ${borderColor} !important;
}
.swal2-title,
.swal2-html-container { color: ${bodyText} !important; }
.swal2-confirm {
  background-color: ${accentColor} !important;
  border-color: ${accentColor} !important;
  color: ${btnText} !important;
}
.swal2-cancel { background-color: ${secondaryBg} !important; color: ${bodyText} !important; }
.swal2-input,
.swal2-textarea {
  background-color: ${secondaryBg} !important;
  border-color: ${borderColor} !important;
  color: ${bodyText} !important;
}

.thumbup-button.active,
.thumbup-button.active i { color: ${accentColor} !important; }
.rating-divider { background-color: ${borderColor} !important; }
.btns-container {
  background-color: ${cardBg} !important;
  border-color: ${borderColor} !important;
}

#reportForm .bg-dark { background-color: ${cardBg} !important; }
code.bg-dark { background-color: ${navbarColor} !important; color: ${bodyText} !important; }

hr { border-color: ${borderColor} !important; opacity: 1; }

${(() => {
	const iconFilter = navbarIconColor
		? hexToIconFilter(navbarIconColor)
		: `hue-rotate(${hueRotate}deg) saturate(1.1)`;
	const contentOverride = logoAssetUrl
		? `content: url(${JSON.stringify(logoAssetUrl)});\n  `
		: "";
	return `.navbar-brand img,
.nav-sidebar-cont a img {
  ${contentOverride}filter: ${iconFilter};
}`;
})()}

.form-check-input:not(:checked) {
  background-color: ${secondaryBg} !important;
  border-color: ${borderColor} !important;
}

.btn-secondary {
  --bs-btn-color: ${bodyText};
  --bs-btn-bg: ${secondaryBg};
  --bs-btn-border-color: ${borderColor};
  --bs-btn-hover-color: ${bodyText};
  --bs-btn-hover-bg: ${cardBg};
  --bs-btn-hover-border-color: ${borderColor};
  --bs-btn-focus-shadow-rgb: ${bcr}, ${bcg}, ${bcb};
  --bs-btn-active-color: ${bodyText};
  --bs-btn-active-bg: ${cardCap};
  --bs-btn-active-border-color: ${borderColor};
  --bs-btn-disabled-color: ${bodyText};
  --bs-btn-disabled-bg: ${secondaryBg};
  --bs-btn-disabled-border-color: ${borderColor};
}

.user-post-bubble {
  background-color: ${cardBg} !important;
  border: 1px solid ${borderColor} !important;
  color: ${bodyText} !important;
}
.user-post-bubble-0,
.user-post-bubble-1,
.user-post-bubble-2 { background-color: ${cardBg} !important; }

.kiln-extension-modal {
  background-color: ${cardBg} !important;
  border-color: ${borderColor} !important;
}

.footer-container { border-top-color: ${borderColor} !important; }

.nav-sidebar-cont .nav-sidebar {
  background-color: ${chromeBg} !important;
  box-shadow: 5px 0 5px rgba(0, 0, 0, 0.2) !important;
}
.nav-sidebar-button {
  background: ${cardBg} !important;
  border-color: ${borderColor} !important;
}
.nav-sidebar-button:hover {
  background-color: ${accentColor} !important;
  border-color: ${accentColor} !important;
  color: ${btnText} !important;
}
.nav-sidebar-upgrade-button,
.nav-sidebar-upgrade-button:hover {
  background: linear-gradient(180deg, ${accentColor}, ${accentActive}) !important;
  background-origin: border-box !important;
  border-color: rgba(0, 0, 0, 0.25) !important;
}
`.trim();
}
