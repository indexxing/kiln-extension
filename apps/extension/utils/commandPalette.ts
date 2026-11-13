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

import type { PolyTrack } from "@kiln/schemas";
import errorIcon from "@/assets/error.svg";
import { safeHttpUrl } from "@/utils/escapeHtml";
import { sendMessage } from "@/utils/messaging";
import { kilnDisclosureBadgeHtml } from "@/utils/utilities";

type GroupId =
	| "pages"
	| "users"
	| "worlds"
	| "guilds"
	| "items"
	| "forums"
	| "feed";
type FilterId = "all" | Exclude<GroupId, "pages">;
type Lane = "entities" | "content" | "items";
type Shape = "round" | "square" | "wide";

type Entry = {
	key: string;
	title: string;
	subtitle: string | null;
	label: string | null;
	image: string | null;
	shape: Shape;
	icon: string | null;
	href: string;
};

type Groups = Partial<Record<GroupId, Entry[]>>;

const GROUP_ORDER: GroupId[] = [
	"pages",
	"users",
	"worlds",
	"guilds",
	"items",
	"forums",
	"feed",
];

const GROUP_LABELS: Record<GroupId, string> = {
	pages: "Pages",
	users: "Users",
	worlds: "Worlds",
	guilds: "Guilds",
	items: "Store Items",
	forums: "Forum Posts",
	feed: "Feed Posts",
};

const FILTERS: { id: FilterId; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "users", label: "Users" },
	{ id: "worlds", label: "Worlds" },
	{ id: "guilds", label: "Guilds" },
	{ id: "items", label: "Items" },
	{ id: "forums", label: "Forums" },
	{ id: "feed", label: "Feed" },
];

const POLYTRACK_GROUPS: Record<string, GroupId> = {
	users: "users",
	worlds: "worlds",
	guilds: "guilds",
	forums: "forums",
	feed: "feed",
};

const PAGES: { title: string; href: string; icon: string; keywords: string }[] =
	[
		{ title: "Home", href: "/home", icon: "fa-home", keywords: "dashboard" },
		{
			title: "Store",
			href: "/store",
			icon: "fa-store",
			keywords: "shop items",
		},
		{
			title: "Worlds",
			href: "/places",
			icon: "fa-gamepad",
			keywords: "places games",
		},
		{
			title: "Avatar",
			href: "/my/avatar",
			icon: "fa-user",
			keywords: "outfit",
		},
		{
			title: "Inventory",
			href: "/my/inventory",
			icon: "fa-backpack",
			keywords: "items",
		},
		{
			title: "Create",
			href: "/create",
			icon: "fa-screwdriver-wrench",
			keywords: "develop",
		},
		{ title: "Friends", href: "/my/friends", icon: "fa-users", keywords: "" },
		{
			title: "Inbox",
			href: "/inbox",
			icon: "fa-envelope",
			keywords: "messages",
		},
		{ title: "Trades", href: "/trade", icon: "fa-handshake", keywords: "" },
		{
			title: "Rankings",
			href: "/rankings",
			icon: "fa-ranking-star",
			keywords: "leaderboard",
		},
		{
			title: "Forum",
			href: "/forum",
			icon: "fa-comments",
			keywords: "threads",
		},
		{
			title: "Guilds",
			href: "/guilds",
			icon: "fa-shield-halved",
			keywords: "",
		},
		{
			title: "Users",
			href: "/users",
			icon: "fa-user-group",
			keywords: "players",
		},
		{ title: "Settings", href: "/my/settings", icon: "fa-gear", keywords: "" },
		{
			title: "Kiln Settings",
			href: "/my/settings/kiln",
			icon: "fa-fire",
			keywords: "extension preferences",
		},
	];

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

function modifierLabel(): string {
	return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

function toPath(href: string | null): string | null {
	if (!href) return null;
	try {
		const url = new URL(href);
		return url.hostname === "polytoria.com" ? url.pathname + url.search : null;
	} catch {
		return null;
	}
}

function toShape(value: string | null): Shape {
	return value === "wide" || value === "square" ? value : "round";
}

function hitToEntry(hit: PolyTrack.SearchHit): Entry | null {
	const href = toPath(hit.polytoriaHref);
	if (!href) return null;

	return {
		key: `${hit.type}:${hit.id}`,
		title: hit.title,
		subtitle: hit.subtitle,
		label:
			hit.type === "users" ? null : (hit.meta ?? hit.badges[0]?.label ?? null),
		image: hit.image,
		shape: toShape(hit.imageShape),
		icon: null,
		href,
	};
}

async function fetchPolyTrackLane(
	query: string,
	lane: "entities" | "content",
	limit: number,
): Promise<Groups> {
	const result = await sendMessage("getPolyTrackSearch", {
		query,
		lane,
		limit,
	});
	if (!result.ok) throw new Error(result.message);

	const groups: Groups = {};
	const seen = new Set<string>();
	const hits = [
		...result.data.exact,
		...result.data.groups.flatMap((group) => group.hits),
	];

	for (const hit of hits) {
		const groupId = POLYTRACK_GROUPS[hit.type];
		const entry = groupId ? hitToEntry(hit) : null;
		if (!groupId || !entry || seen.has(entry.key)) continue;
		seen.add(entry.key);
		groups[groupId] = [...(groups[groupId] ?? []), entry];
	}

	return groups;
}

async function fetchItems(query: string, limit: number): Promise<Groups> {
	const result = await sendMessage("getStore", { search: query, limit });
	if (!result.ok) throw new Error(result.message);

	return {
		items: result.data.assets.map((item) => ({
			key: `items:${item.id}`,
			title: item.name,
			subtitle: `by ${item.creator.name}`,
			label:
				item.price === null
					? "Off sale"
					: `${item.price.toLocaleString()} Bricks`,
			image: item.thumbnail,
			shape: "square" as const,
			icon: null,
			href: `/store/${item.id}`,
		})),
	};
}

function lanesFor(filter: FilterId): Lane[] {
	if (filter === "all") return ["entities", "content", "items"];
	if (filter === "items") return ["items"];
	if (filter === "forums" || filter === "feed") return ["content"];
	return ["entities"];
}

function matchPages(query: string): Entry[] {
	const needle = query.toLowerCase();
	return PAGES.filter(
		(page) =>
			!needle ||
			page.title.toLowerCase().includes(needle) ||
			page.keywords.includes(needle),
	)
		.slice(0, needle ? 4 : PAGES.length)
		.map((page) => ({
			key: `pages:${page.href}`,
			title: page.title,
			subtitle: null,
			label: null,
			image: null,
			shape: "round" as const,
			icon: page.icon,
			href: page.href,
		}));
}

function isEditable(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			target.matches("input, textarea, select, [contenteditable]"))
	);
}

function createItemElement(entry: Entry): HTMLAnchorElement {
	const anchor = document.createElement("a");
	anchor.href = entry.href;
	anchor.className = "kiln-palette-item";

	if (entry.icon) {
		const icon = document.createElement("div");
		icon.className = "kiln-palette-icon";
		icon.innerHTML = `<i class="fas ${entry.icon}"></i>`;
		anchor.append(icon);
	} else {
		const image = document.createElement("img");
		image.className = `kiln-palette-img kiln-palette-img--${entry.shape}`;
		image.src = safeHttpUrl(entry.image) || errorIcon;
		image.loading = "lazy";
		image.addEventListener(
			"error",
			() => {
				image.src = errorIcon;
			},
			{ once: true },
		);
		anchor.append(image);
	}

	const body = document.createElement("div");
	body.className = "flex-grow-1";
	body.style.minWidth = "0";

	const title = document.createElement("div");
	title.className = "text-truncate fw-semibold";
	title.textContent = entry.title;
	body.append(title);

	if (entry.subtitle) {
		const subtitle = document.createElement("div");
		subtitle.className = "text-truncate small text-muted";
		subtitle.textContent = entry.subtitle;
		body.append(subtitle);
	}

	anchor.append(body);

	if (entry.label) {
		const label = document.createElement("span");
		label.className = "small text-muted flex-shrink-0";
		label.textContent = entry.label;
		anchor.append(label);
	}

	return anchor;
}

function createPalette(showDisclosures: boolean) {
	const modKey = modifierLabel();

	const dialog = document.createElement("dialog");
	dialog.className = "kiln-palette";
	dialog.innerHTML = `
		<div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
			<i class="fas fa-search text-muted"></i>
			<input type="text" class="form-control bg-transparent border-0 shadow-none text-white px-0" placeholder="Search users, worlds, guilds, items, forums, and feed posts..." autocomplete="off" spellcheck="false" aria-label="Search" data-kiln="palette-input">
			<span class="spinner-border spinner-border-sm text-muted d-none" data-kiln="palette-spinner"></span>
		</div>
		<div class="d-flex flex-wrap gap-1 px-3 py-2 border-bottom" data-kiln="palette-filters"></div>
		<div class="kiln-palette-results" data-kiln="palette-results"></div>
		<div class="d-flex flex-wrap justify-content-between gap-2 px-3 py-2 border-top small text-muted">
			<span>↑↓ navigate · Enter open · ${modKey}+Enter new tab · Tab filter</span>
			<span>Powered by PolyTrack${kilnDisclosureBadgeHtml(showDisclosures)}</span>
		</div>
	`;

	const input = dialog.querySelector<HTMLInputElement>(
		'[data-kiln="palette-input"]',
	)!;
	const spinner = dialog.querySelector<HTMLElement>(
		'[data-kiln="palette-spinner"]',
	)!;
	const filterBar = dialog.querySelector<HTMLElement>(
		'[data-kiln="palette-filters"]',
	)!;
	const list = dialog.querySelector<HTMLElement>(
		'[data-kiln="palette-results"]',
	)!;

	let query = "";
	let filter: FilterId = "all";
	let results: Groups = {};
	let flat: HTMLAnchorElement[] = [];
	let active = 0;
	let pending = 0;
	let failed = 0;
	let requestId = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	const filterButtons = new Map<FilterId, HTMLButtonElement>();
	for (const { id, label } of FILTERS) {
		const button = document.createElement("button");
		button.type = "button";
		button.tabIndex = -1;
		button.className = "btn btn-sm btn-outline-secondary";
		button.textContent = label;
		button.addEventListener("click", () => {
			setFilter(id);
			input.focus();
		});
		filterButtons.set(id, button);
		filterBar.append(button);
	}

	const setActive = (index: number, scroll = true) => {
		active = index;
		flat.forEach((el, i) => {
			el.classList.toggle("active", i === index);
		});
		if (scroll) flat[index]?.scrollIntoView({ block: "nearest" });
	};

	const message = (text: string) => {
		const el = document.createElement("div");
		el.className = "text-center text-muted py-4";
		el.textContent = text;
		list.append(el);
	};

	const render = () => {
		list.replaceChildren();
		flat = [];
		spinner.classList.toggle("d-none", pending === 0);

		const visible: Groups = { ...results };
		if (filter === "all") visible.pages = matchPages(query);

		for (const groupId of GROUP_ORDER) {
			const entries = visible[groupId];
			if (!entries?.length) continue;
			if (groupId !== "pages" && filter !== "all" && filter !== groupId)
				continue;

			const heading = document.createElement("div");
			heading.className =
				"px-3 pt-2 pb-1 small fw-bold text-uppercase text-muted";
			heading.textContent = GROUP_LABELS[groupId];
			list.append(heading);

			for (const entry of entries) {
				const el = createItemElement(entry);
				const index = flat.length;
				el.addEventListener("mousemove", () => {
					if (index !== active) setActive(index, false);
				});
				list.append(el);
				flat.push(el);
			}
		}

		if (flat.length === 0) {
			if (query.length < MIN_QUERY_LENGTH) message("Type to search");
			else if (pending > 0) message("Searching...");
			else if (failed > 0) message("Search is unavailable right now.");
			else message(`No results for "${query}"`);
		}

		setActive(Math.min(active, Math.max(flat.length - 1, 0)));
	};

	const runSearch = (token: number) => {
		const lanes = lanesFor(filter);
		const limit = filter === "all" ? 5 : 20;
		pending = lanes.length;
		failed = 0;

		for (const lane of lanes) {
			const request =
				lane === "items"
					? fetchItems(query, limit)
					: fetchPolyTrackLane(query, lane, limit);

			request
				.then((groups) => {
					if (token === requestId) results = { ...results, ...groups };
				})
				.catch(() => {
					if (token === requestId) failed++;
				})
				.finally(() => {
					if (token !== requestId) return;
					pending--;
					render();
				});
		}
	};

	const refresh = () => {
		clearTimeout(debounceTimer);
		const token = ++requestId;
		results = {};
		pending = 0;
		failed = 0;
		active = 0;

		if (query.length < MIN_QUERY_LENGTH) {
			render();
			return;
		}

		pending = lanesFor(filter).length;
		render();
		debounceTimer = setTimeout(() => runSearch(token), DEBOUNCE_MS);
	};

	const setFilter = (id: FilterId) => {
		filter = id;
		for (const [buttonId, button] of filterButtons) {
			button.classList.toggle("active", buttonId === id);
		}
		refresh();
	};

	input.addEventListener("input", () => {
		query = input.value.trim();
		refresh();
	});

	dialog.addEventListener("keydown", (e) => {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (flat.length === 0) return;
			const step = e.key === "ArrowDown" ? 1 : -1;
			setActive((active + step + flat.length) % flat.length);
		} else if (e.key === "Enter") {
			const target = flat[active];
			if (!target) return;
			e.preventDefault();
			if (e.ctrlKey || e.metaKey)
				window.open(target.href, "_blank", "noopener");
			else window.location.href = target.href;
		} else if (e.key === "Tab") {
			e.preventDefault();
			const index = FILTERS.findIndex((f) => f.id === filter);
			const step = e.shiftKey ? -1 : 1;
			setFilter(FILTERS[(index + step + FILTERS.length) % FILTERS.length].id);
		}
	});

	dialog.addEventListener("mousedown", (e) => {
		if (e.target === dialog) dialog.close();
	});

	document.body.append(dialog);

	return {
		isOpen: () => dialog.open,
		close: () => dialog.close(),
		open: () => {
			input.value = "";
			query = "";
			filter = "all";
			for (const [id, button] of filterButtons) {
				button.classList.toggle("active", id === "all");
			}
			refresh();
			if (!dialog.open) dialog.showModal();
			input.focus();
		},
	};
}

export function initCommandPalette(showDisclosures: boolean): void {
	let palette: ReturnType<typeof createPalette> | null = null;

	const open = () => {
		palette ??= createPalette(showDisclosures);
		palette.open();
	};

	document.addEventListener("keydown", (e) => {
		if (e.isComposing) return;

		if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
			e.preventDefault();
			if (palette?.isOpen()) palette.close();
			else open();
			return;
		}

		if (
			e.key === "/" &&
			!e.ctrlKey &&
			!e.metaKey &&
			!e.altKey &&
			!isEditable(e.target) &&
			!palette?.isOpen()
		) {
			e.preventDefault();
			open();
		}
	});

	const isSearchInput = (target: EventTarget | null) =>
		target instanceof HTMLElement && target.id === "gsearch";

	document.addEventListener(
		"mousedown",
		(e) => {
			if (!isSearchInput(e.target)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			open();
		},
		true,
	);

	document.addEventListener(
		"focus",
		(e) => {
			if (!isSearchInput(e.target)) return;
			e.stopImmediatePropagation();
			(e.target as HTMLInputElement).blur();
			open();
		},
		true,
	);

	const searchInput = document.getElementById("gsearch");
	if (searchInput) {
		searchInput.setAttribute("placeholder", `Search (${modifierLabel()} K)`);
	}
}
