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

export async function audioPreviews(showDisclosures: boolean) {
	const activeAudio: { current: HTMLAudioElement | null } = { current: null };

	const getSelectedTab = (): string | null => {
		return (
			document
				.querySelector("#categories .active")
				?.getAttribute("data-category") || null
		);
	};

	const attachPlayButton = (assetCard: HTMLDivElement): void => {
		const link =
			assetCard.querySelector<HTMLAnchorElement>('a[href^="/store"]');
		if (!link) return;

		const assetId = link.getAttribute("href")?.split("/")[2];
		if (!assetId) return;

		const thumbnail = assetCard.querySelector("img");
		if (!thumbnail) return;

		const sizedWrapper = assetCard.firstElementChild as HTMLElement | null;
		const maxWidth = sizedWrapper
			? getComputedStyle(sizedWrapper).maxWidth
			: null;
		if (sizedWrapper && maxWidth && maxWidth !== "none") {
			sizedWrapper.style.width = maxWidth;
		}

		const playButton = createAudioPlayButton(+assetId, activeAudio);
		applyKilnDisclosureTitle(playButton, showDisclosures, "Audio preview");
		thumbnail.replaceWith(playButton);
	};

	const assetGrid = document.getElementById("assets");
	if (!assetGrid) return;

	const observer = new MutationObserver((records) => {
		const clearedAllAssets = records.some(
			(record) =>
				record.removedNodes.length > 0 && assetGrid.children.length === 0,
		);

		if (clearedAllAssets) {
			activeAudio.current?.pause();
			activeAudio.current = null;
		}

		if (getSelectedTab() !== "audio") return;

		for (const record of records) {
			for (const node of record.addedNodes) {
				if (node instanceof HTMLDivElement) {
					attachPlayButton(node);
				}
			}
		}
	});

	observer.observe(assetGrid, {
		attributes: false,
		childList: true,
		subtree: false,
	});
}

type LibraryItem = {
	id: number;
	name: string;
	creatorName: string;
	thumbnailUrl: string;
	creatorUrl: string;
};

type LibraryResponse = {
	meta: { currentPage: number; lastPage: number };
	data: LibraryItem[];
};

export function toolboxPageJump() {
	const FALLBACK_LINK_PREFIX = "/store/";
	let navigating = false;
	let requestToken = 0;
	let pageInput: HTMLInputElement | null = null;

	const getCurrentElement = () => document.getElementById("pagination-current");

	const getCurrentPage = (): number =>
		Number.parseInt(getCurrentElement()?.textContent ?? "", 10) || 1;

	const getCategory = (): string =>
		document
			.querySelector("#categories .active")
			?.getAttribute("data-category") ?? "model";

	const getSearch = (): string =>
		document.querySelector<HTMLInputElement>("#search-input")?.value ?? "";

	const getLinkPrefix = (): string => {
		const href = document
			.querySelector<HTMLAnchorElement>("#assets .itemCardCont a")
			?.getAttribute("href");
		if (href) return href.replace(/\d+$/, "");
		return getCategory() === "model" ? "/models/" : FALLBACK_LINK_PREFIX;
	};

	const fetchPage = async (page: number): Promise<LibraryResponse | null> => {
		const params = new URLSearchParams({
			page: String(page),
			search: getSearch(),
			type: getCategory(),
		});
		try {
			const res = await fetch(`/api/library?${params.toString()}`, {
				credentials: "same-origin",
			});
			if (!res.ok) return null;
			return (await res.json()) as LibraryResponse;
		} catch {
			return null;
		}
	};

	const buildCard = (item: LibraryItem, linkPrefix: string): HTMLElement => {
		const cell = document.createElement("div");
		cell.className = "col-auto mb-3 itemCardCont";

		const inner = document.createElement("div");
		inner.style.maxWidth = "150px";

		const link = document.createElement("a");
		link.className = "text-reset";
		link.href = `${linkPrefix}${item.id}`;

		const card = document.createElement("div");
		card.className = "card mb-2";
		const pad = document.createElement("div");
		pad.className = "p-2";
		const img = document.createElement("img");
		img.src = item.thumbnailUrl;
		img.width = 128;
		img.height = 128;
		img.className = "img-fluid rounded-3";
		img.alt = item.name;
		pad.appendChild(img);
		card.appendChild(pad);

		const title = document.createElement("h6");
		title.className = "text-truncate mb-0";
		title.textContent = item.name;
		link.append(card, title);

		const by = document.createElement("small");
		by.className = "text-muted d-block text-truncate";
		by.append("by ");
		const creator = document.createElement("a");
		creator.href = item.creatorUrl;
		creator.className = "text-reset";
		creator.textContent = item.creatorName;
		by.appendChild(creator);

		inner.append(link, by);
		cell.appendChild(inner);
		return cell;
	};

	const setDisabled = (id: string, disabled: boolean) => {
		document.getElementById(id)?.classList.toggle("disabled", disabled);
	};

	const render = (response: LibraryResponse) => {
		const grid = document.getElementById("assets");
		const current = getCurrentElement();
		if (!grid || !current) return;

		const linkPrefix = getLinkPrefix();
		grid.replaceChildren(
			...response.data.map((item) => buildCard(item, linkPrefix)),
		);

		const { currentPage, lastPage } = response.meta;
		current.textContent = String(currentPage);
		setDisabled("pagination-first", currentPage <= 1);
		setDisabled("pagination-prev", currentPage <= 1);
		setDisabled("pagination-next", currentPage >= lastPage);
		setDisabled("pagination-last", currentPage >= lastPage);
	};

	const goToPage = async (target: number): Promise<void> => {
		if (navigating) return;
		navigating = true;
		const token = ++requestToken;
		if (pageInput) pageInput.disabled = true;

		try {
			let response = await fetchPage(target);
			if (response && target > response.meta.lastPage) {
				response = await fetchPage(response.meta.lastPage);
			}
			if (response && token === requestToken) render(response);
		} finally {
			navigating = false;
			if (pageInput) pageInput.disabled = false;
		}
	};

	const getLastPage = async (): Promise<number | null> => {
		const response = await fetchPage(getCurrentPage());
		return response?.meta.lastPage ?? null;
	};

	const interceptButtons = (pagination: HTMLElement) => {
		const targets: Record<string, () => Promise<number | null> | number> = {
			"pagination-first": () => 1,
			"pagination-prev": () => Math.max(1, getCurrentPage() - 1),
			"pagination-next": () => getCurrentPage() + 1,
			"pagination-last": getLastPage,
		};

		pagination.addEventListener(
			"click",
			async (event) => {
				const item = (event.target as HTMLElement).closest<HTMLElement>(
					".page-item",
				);
				if (!item || !(item.id in targets)) return;

				event.preventDefault();
				event.stopImmediatePropagation();
				if (item.classList.contains("disabled") || navigating) return;

				const page = await targets[item.id]();
				if (page) goToPage(page);
			},
			true,
		);
	};

	const injectStyles = () => {
		if (document.getElementById("kiln-page-jump-css")) return;
		const style = document.createElement("style");
		style.id = "kiln-page-jump-css";
		style.textContent = `
			.kiln-page-jump-input {
				display: inline-block;
				box-sizing: content-box;
				min-width: 2ch;
				margin: -2px 0;
				padding: 1px 6px;
				border: 1px solid rgba(255, 255, 255, 0.35);
				border-radius: 6px;
				background: rgba(255, 255, 255, 0.15);
				color: inherit;
				font: inherit;
				font-weight: 600;
				line-height: inherit;
				text-align: center;
				outline: none;
				cursor: text;
				transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
			}
			.kiln-page-jump-input:hover {
				background: rgba(255, 255, 255, 0.25);
				border-color: rgba(255, 255, 255, 0.6);
			}
			.kiln-page-jump-input:focus {
				background: rgba(255, 255, 255, 0.3);
				border-color: #fff;
				box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
			}
			.kiln-page-jump-input:disabled {
				opacity: 0.6;
				cursor: progress;
			}
		`;
		document.head.appendChild(style);
	};

	const createInput = (current: HTMLElement): HTMLInputElement => {
		injectStyles();
		const input = document.createElement("input");
		input.type = "text";
		input.inputMode = "numeric";
		input.autocomplete = "off";
		input.className = "kiln-page-jump-input";
		input.title = "Type a page number and press Enter";
		input.setAttribute("aria-label", "Go to page");

		const sync = () => {
			const value = current.textContent ?? "1";
			input.value = value;
			input.style.width = `${Math.max(value.length, 2)}ch`;
		};
		sync();
		new MutationObserver(sync).observe(current, {
			childList: true,
			characterData: true,
			subtree: true,
		});

		input.addEventListener("focus", () => input.select());
		input.addEventListener("keydown", (event) => {
			event.stopPropagation();
			if (event.key === "Enter") {
				event.preventDefault();
				const target = Number.parseInt(input.value, 10);
				if (Number.isFinite(target) && target >= 1) {
					goToPage(target);
				}
				input.blur();
			} else if (event.key === "Escape") {
				event.preventDefault();
				input.blur();
			}
		});
		input.addEventListener("input", () => {
			input.value = input.value.replace(/\D/g, "");
		});
		input.addEventListener("blur", sync);
		input.addEventListener("click", (event) => event.stopPropagation());
		return input;
	};

	const attach = () => {
		const pagination = document.getElementById("pagination");
		const current = getCurrentElement();
		if (!pagination || !current || pagination.dataset.kilnPageJump === "true") {
			return;
		}
		pagination.dataset.kilnPageJump = "true";

		interceptButtons(pagination);

		const input = createInput(current);
		pageInput = input;
		current.style.display = "none";
		current.insertAdjacentElement("afterend", input);
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", attach);
	} else {
		attach();
	}
}
