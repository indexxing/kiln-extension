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

import { escapeHtml, safeHttpUrl } from "@/utils/escapeHtml";
import type {
	CurrencyCode,
	StoreListingFilters,
	StoreListingItem,
} from "@/utils/types";
import {
	applyKilnDisclosureTitle,
	bricksToCurrency,
	createKilnDisclosureBadge,
	createModal,
	kilnDisclosureBadgeHtml,
	parseFormattedNumber,
} from "@/utils/utilities";

export function irlBrickPrice(
	irlCurrency: CurrencyCode,
	showDisclosures: boolean,
) {
	const addPrice = async (item: HTMLElement) => {
		const brickCounterEl = item.getElementsByClassName("text-success")[0] as
			| HTMLElement
			| undefined;
		if (
			!brickCounterEl?.textContent ||
			brickCounterEl.classList.contains("kiln-irl-price")
		)
			return;

		brickCounterEl.classList.add("kiln-irl-price");

		const brickCount = parseFormattedNumber(brickCounterEl.textContent!);
		const currency = await bricksToCurrency(brickCount, irlCurrency);

		if (currency) {
			const span = document.createElement("span");
			span.classList.add("text-muted");
			span.style.fontSize = "0.7rem";
			span.style.fontWeight = "lighter";
			span.textContent = ` (${currency})`;
			applyKilnDisclosureTitle(
				span,
				showDisclosures,
				"IRL currency conversion",
			);
			brickCounterEl.appendChild(span);
		}
	};

	const processCard = (item: HTMLElement) => {
		if (!item.classList.contains("store-listing-item")) return;
		addPrice(item);
	};

	const scanExisting = () => {
		for (const item of document.getElementsByClassName("store-listing-item")) {
			processCard(item as HTMLElement);
		}
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", scanExisting);
	} else {
		scanExisting();
	}

	const mutations = new MutationObserver((mutations) => {
		for (const record of mutations) {
			for (const node of record.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;

				processCard(node);

				for (const child of node.getElementsByClassName("store-listing-item")) {
					processCard(child as HTMLElement);
				}
			}
		}
	});

	const storeContainer = document.getElementById("store-items");
	if (storeContainer) {
		mutations.observe(storeContainer, { childList: true, subtree: false });
	} else {
		mutations.observe(document.body, { childList: true, subtree: false });
	}
}

type EventWithItems = {
	id: number;
	slug: string;
	name: string;
	date: string | null;
	link: string | null;
	items: { id: number; name: string; thumbnailUrl: string }[];
};

export async function eventItems(showDisclosures: boolean) {
	const eventsResult = await sendMessage("getEvents");
	if (!eventsResult.ok || eventsResult.data.data.length === 0) return;

	const allEvents = eventsResult.data.data;

	const EVENTS_PER_PAGE = 4;
	let page = 0;
	const groups: EventWithItems[][] = [];
	let loaded = false;

	const modal = createModal("lg");
	modal.style.padding = "20px";

	modal.innerHTML = `
	<div class="d-flex justify-content-between align-items-center mb-3">
		<h5 class="mb-0" style="color:#fff;"><i class="fad fa-party-horn me-2"></i>Event Items${kilnDisclosureBadgeHtml(showDisclosures)}</h5>
		<button class="btn btn-sm btn-secondary" id="p-ei-close">✕</button>
	</div>
	<div id="p-ei-body">
		<div class="text-center text-muted py-4">Loading...</div>
	</div>
	<div class="d-flex justify-content-center mt-3" id="p-ei-pagination" style="display:none!important;"></div>
	<small class="text-muted text-center mt-2 d-block" style="font-size:0.7rem;">feature of Kiln</small>
	`;

	modal
		.querySelector("#p-ei-close")!
		.addEventListener("click", () => modal.close());

	const renderPage = () => {
		const body = modal.querySelector<HTMLElement>("#p-ei-body")!;
		const paginationEl = modal.querySelector<HTMLElement>("#p-ei-pagination")!;

		body.innerHTML = groups[page]
			.map((event) => {
				const link = event.link ? safeHttpUrl(event.link) : "";
				return `
			<div class="row px-1 mb-1">
				<div class="col">
					${event.date ? `<h6 class="text-muted mb-0" style="font-size:0.75rem;">${escapeHtml(event.date)}</h6>` : ""}
					<h5 class="mb-0" style="color: #bfbfbf">${escapeHtml(event.name)}</h5>
				</div>
				${
					link
						? `<div class="col-auto d-flex align-items-center">
					<a class="text-muted" href="${escapeHtml(link)}" target="_blank">
						<span class="d-none d-lg-inline" style="font-size:0.85rem;">
							${link.includes("/places/") ? "Event Place" : "Blog Post"}
						</span>
						<i class="fas fa-angle-right ms-1"></i>
					</a>
				</div>`
						: ""
				}
			</div>
			<div class="card mb-3" style="background:#111;border-color:#333;">
				<div class="card-body p-2">
					<div class="d-flex" style="overflow-x:auto;gap:8px;padding-bottom:4px;">
						${event.items
							.map(
								(item) => `
						<a href="/store/${item.id}" style="flex:0 0 auto;text-decoration:none;">
							<div class="card text-center h-100" style="width:110px;background:#1a1a1a;border-color:#444;">
								<div class="card-body p-2">
									<img src="${escapeHtml(safeHttpUrl(item.thumbnailUrl))}" style="width:72px;height:72px;object-fit:contain;">
									<div class="mt-1" style="font-size:0.65rem;color:#aaa;line-height:1.2;word-break:break-word;">${escapeHtml(item.name)}</div>
								</div>
							</div>
						</a>
						`,
							)
							.join("")}
					</div>
				</div>
			</div>
			`;
			})
			.join("");

		paginationEl.style.removeProperty("display");
		paginationEl.innerHTML = `
		<nav>
			<ul class="pagination">
				<li class="page-item ${page === 0 ? "disabled" : ""}">
					<a class="page-link" href="#!" id="p-ei-first">«</a>
				</li>
				<li class="page-item ${page === 0 ? "disabled" : ""}">
					<a class="page-link" href="#!" id="p-ei-prev">‹</a>
				</li>
				<li class="page-item active">
					<a class="page-link"><span id="p-ei-current">${page + 1}</span></a>
				</li>
				<li class="page-item ${page === groups.length - 1 ? "disabled" : ""}">
					<a class="page-link" href="#!" id="p-ei-next">›</a>
				</li>
				<li class="page-item ${page === groups.length - 1 ? "disabled" : ""}">
					<a class="page-link" href="#!" id="p-ei-last">»</a>
				</li>
			</ul>
		</nav>
		`;

		paginationEl.querySelector("#p-ei-first")!.addEventListener("click", () => {
			if (page > 0) {
				page = 0;
				renderPage();
			}
		});
		paginationEl.querySelector("#p-ei-prev")!.addEventListener("click", () => {
			if (page > 0) {
				page--;
				renderPage();
			}
		});
		paginationEl.querySelector("#p-ei-next")!.addEventListener("click", () => {
			if (page < groups.length - 1) {
				page++;
				renderPage();
			}
		});
		paginationEl.querySelector("#p-ei-last")!.addEventListener("click", () => {
			if (page < groups.length - 1) {
				page = groups.length - 1;
				renderPage();
			}
		});
	};

	const loadAll = async () => {
		if (loaded) return;
		loaded = true;

		const results = await Promise.all(
			allEvents.map((e) => sendMessage("getEventItems", e.id)),
		);

		const withItems: EventWithItems[] = allEvents.map((e, i) => ({
			...e,
			items: results[i].ok
				? results[i].data.data.sort((a, b) => a.id - b.id)
				: [],
		}));

		const flat = [...withItems];
		while (flat.length > 0) {
			groups.push(flat.splice(0, EVENTS_PER_PAGE));
		}

		renderPage();
	};

	const button = document.createElement("button");
	button.classList.add("btn", "btn-outline-secondary", "btn-sm");
	button.innerHTML = `<i class="fad fa-party-horn me-1"></i>Event Items${kilnDisclosureBadgeHtml(showDisclosures)}`;
	button.addEventListener("click", async () => {
		modal.showModal();
		await loadAll();
	});

	const filterBar = document.querySelector<HTMLElement>(
		".store-filter-bar, #store-filter, .store-search",
	);
	if (filterBar) {
		filterBar.appendChild(button);
	} else {
		Object.assign(button.style, {
			position: "fixed",
			bottom: "20px",
			right: "20px",
			zIndex: "9999",
		});
		document.body.appendChild(button);
	}
}

export async function ownedTags(userId: number, showDisclosures: boolean) {
	const ownedResult = await sendMessage("getOwnedAssetMap", userId);

	if (!ownedResult.ok) {
		throw new Error(
			"[Kiln] API is disabled, cancelling item owned tags loading..",
		);
	}

	const assetMap = ownedResult.data;

	const owns = (item: HTMLElement) => {
		const itemId = parseInt(item.getAttribute("href")!.split("/")[2], 10);
		const entry = assetMap[itemId];
		if (!entry) return null;
		return {
			isCollectible: entry.isLimited,
			serials: entry.serials.sort((a, b) => a - b),
		};
	};

	const addTag = (
		item: HTMLElement,
		isCollectible: boolean,
		serials: number[],
	) => {
		if (item.querySelector(".kiln-owned-tag")) return;

		const tag = document.createElement("span");
		tag.classList.add(
			"badge",
			isCollectible ? "bg-warning" : "bg-primary",
			"kiln-owned-tag",
		);
		tag.setAttribute(
			"style",
			`
            position: absolute;
            font-size: 0.9rem;
            top: 0px;
            left: 0px;
            padding: 5.5px;
            border-top-left-radius: var(--bs-border-radius-lg) !important;
            border-top-right-radius: 0px;
            border-bottom-left-radius: 0px;
            font-size: 0.65rem;
        `,
		);
		tag.innerHTML = "<i class='fas fa-check'></i><br />owned";

		if (isCollectible && serials.length) {
			tag.setAttribute("data-bs-toggle", "tooltip");
			tag.setAttribute("data-bs-title", serials.map((s) => `#${s}`).join(", "));
		}

		const image = item.getElementsByTagName("img")[0]!;
		image.parentElement!.appendChild(tag);

		if (showDisclosures) {
			const disclosureBadge = createKilnDisclosureBadge();
			Object.assign(disclosureBadge.style, {
				position: "absolute",
				top: "0",
				right: "0",
				fontSize: "0.55rem",
				padding: "2px 4px",
				zIndex: "10",
			});
			image.parentElement!.appendChild(disclosureBadge);
		}
	};

	const processCard = (item: HTMLElement) => {
		if (!item.classList.contains("store-listing-item")) return;
		const link = item.getElementsByTagName("a")[0]!;
		const owned = owns(link);
		if (owned) addTag(item, owned.isCollectible, owned.serials);
	};

	const scanExisting = () => {
		for (const item of document.getElementsByClassName("store-listing-item")) {
			processCard(item as HTMLElement);
		}
		sendMessage("registerBootstrapElements");
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", scanExisting);
	} else {
		scanExisting();
	}

	const mutations = new MutationObserver((records) => {
		const cards: HTMLElement[] = [];

		for (const record of records) {
			for (const node of record.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;

				if (node.classList.contains("store-listing-item")) {
					cards.push(node);
				} else {
					for (const child of node.getElementsByClassName(
						"store-listing-item",
					)) {
						cards.push(child as HTMLElement);
					}
				}
			}
		}

		if (!cards.length) return;

		requestIdleCallback(() => {
			for (const card of cards) {
				processCard(card);
			}
		});
	});

	const container = document.getElementById("store-items");
	if (container) {
		mutations.observe(container, { childList: true, subtree: true });
	} else {
		mutations.observe(document.body, { childList: true, subtree: true });
	}
}

function parseStorePriceInput(value: string): number | null {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

function readStoreFilters(page: number) {
	const types = [
		...document.querySelectorAll<HTMLElement>(".store-type-btn.active"),
	].map((b) => b.dataset.type!);
	const accessoryTypes = [
		...document.querySelectorAll<HTMLElement>(".store-accessory-btn.active"),
	].map((b) => b.dataset.accessoryType!);

	const selected = (
		document.getElementById("store-sort") as HTMLSelectElement | null
	)?.selectedOptions[0];

	const currency = (
		document.getElementById("store-currency") as HTMLSelectElement | null
	)?.value;
	const search = (
		(document.getElementById("storeSearch") as HTMLInputElement | null)
			?.value ?? ""
	).trim();
	const showOffsale =
		(document.getElementById("show-offsale") as HTMLInputElement | null)
			?.checked ?? false;
	const collectiblesOnly =
		(document.getElementById("hide-non-collectible") as HTMLInputElement | null)
			?.checked ?? false;
	const minPrice = parseStorePriceInput(
		(document.getElementById("store-min-price") as HTMLInputElement | null)
			?.value ?? "",
	);
	const maxPrice = parseStorePriceInput(
		(document.getElementById("store-max-price") as HTMLInputElement | null)
			?.value ?? "",
	);
	const creatorName = (
		(document.getElementById("store-creator-name") as HTMLInputElement | null)
			?.value ?? ""
	).trim();

	return {
		types,
		accessoryTypes,
		currency: currency || undefined,
		page,
		search,
		sort: selected?.dataset.sort ?? "createdAt",
		order: selected?.dataset.order ?? "desc",
		showOffsale,
		collectiblesOnly,
		minPrice,
		maxPrice,
		creatorName,
	};
}

function renderStoreItem(asset: StoreListingItem): HTMLElement {
	const wrapper = document.createElement("div");
	wrapper.className = "me-3 col-auto store-listing-item";

	let ribbon = "";
	if (asset.isLimited) {
		ribbon = `<div class="ribbon ribbon-limited ribbon-top-right"><span><i class="fas fa-star d-inline"></i></span></div>`;
	} else if (asset.freeForPlus) {
		ribbon = `<div class="ribbon ribbon-plusdx ribbon-top-right"><span><i class="pi pi-plusdx"></i></span></div>`;
	} else if (asset.recentlyUploaded) {
		ribbon = `<div class="ribbon ribbon-new ribbon-top-right"><span>New</span></div>`;
	}

	let timer = "";
	let soldOut = false;
	if (asset.onSaleUntil !== null && !(asset.isLimited && asset.isSoldOut)) {
		const diff = new Date(asset.onSaleUntil).getTime() - Date.now();
		if (diff > 0) {
			const days = Math.floor(diff / 86_400_000);
			const hours = Math.floor((diff % 86_400_000) / 3_600_000);
			const minutes = Math.floor((diff % 3_600_000) / 60_000);
			const time =
				days > 0
					? `${days}d`
					: hours > 0
						? `${hours}h`
						: minutes > 0
							? `${minutes}m`
							: "<1m";
			timer = `<span class="text-danger ms-2"><i class="fas fa-clock"></i> ${time}</span>`;
		} else if (!asset.isLimited) {
			soldOut = true;
		}
	}

	const priceParts: string[] = [];
	if (asset.priceInStuds !== null) {
		priceParts.push(
			`<span class="text-studs"><i class="fa-sharp-duotone fa-regular fa-circle-dot me-0"></i> ${asset.priceInStuds.toLocaleString("en-US")}</span>`,
		);
	}
	if (asset.displayPrice !== null) {
		priceParts.push(
			asset.displayPrice === 0
				? `<span class="text-primary fw-bold">Free</span>`
				: `<span class="text-success"><i class="pi pi-brick${asset.isLimited ? "-value" : ""} me-1"></i> ${asset.displayPrice.toLocaleString("en-US")}</span>`,
		);
	}

	let price = soldOut
		? ""
		: priceParts.length === 2
			? asset.priceInStuds !== null && asset.priceInStuds > 10000
				? `${priceParts[0]}<br>${priceParts[1]}`
				: `${priceParts[0]}<span class="ms-2">${priceParts[1]}</span>`
			: (priceParts[0] ?? "");
	if (price.length > 0 && timer.length > 0) price += ` ${timer}`;

	wrapper.innerHTML = `
		<div style="max-width: 200px;">
			<a class="text-reset" href="/store/${asset.id}">
				<div class="card mb-1 p-2">
					${ribbon}
					<img width="128" height="128" class="img-fluid rounded-3 mb-2 kiln-store-thumb">
					<small class="text-muted d-block text-truncate kiln-store-creator" style="font-size: 0.75rem;"></small>
					<h6 class="text-truncate mb-0 kiln-store-name"></h6>
					<small class="d-block text-truncate">${price}</small>
				</div>
			</a>
		</div>
		`;

	const img = wrapper.querySelector<HTMLImageElement>(".kiln-store-thumb")!;
	img.src = asset.thumbnailUrl;
	img.alt = asset.name;

	const creatorEl = wrapper.querySelector(".kiln-store-creator")!;
	if (asset.type === "hat") {
		const label = asset.accessoryType
			? asset.accessoryType
					.replace("headAccessory", "headCover")
					.replace(/\b\w/g, (l) => l.toUpperCase())
					.replace(/([A-Z])/g, " $1")
			: "";
		creatorEl.innerHTML = `<i class="fas fa-hat-wizard"></i> `;
		creatorEl.append(label);
	} else if (asset.type === "tool") {
		creatorEl.innerHTML = `<i class="fas fa-wrench"></i> Tool`;
	} else if (asset.type === "face") {
		creatorEl.innerHTML = `<i class="fas fa-face-smile"></i> Face`;
	} else if (asset.type === "profileTheme") {
		creatorEl.innerHTML = `<i class="fas fa-brush"></i> Profile Theme`;
	} else {
		creatorEl.innerHTML = `<i class="fas fa-user"></i> `;
		const creatorLink = document.createElement("a");
		creatorLink.className = "text-reset";
		creatorLink.href = asset.creatorUrl;
		creatorLink.textContent = asset.creatorName;
		creatorEl.append(creatorLink);
	}

	wrapper.querySelector(".kiln-store-name")!.textContent = asset.name;

	return wrapper;
}

export function disableInfiniteScrolling(showDisclosures: boolean) {
	const itemsContainer = document.getElementById("store-items");
	if (!itemsContainer) return;

	document.getElementById("store-scroll-target")?.remove();

	let page = 1;
	let loading = false;
	let finished = false;
	let generation = 0;

	const button = document.createElement("button");
	button.type = "button";
	button.className = "btn btn-outline-secondary w-100 mb-3";
	button.innerHTML = `Load More${kilnDisclosureBadgeHtml(showDisclosures)}`;
	itemsContainer.insertAdjacentElement("afterend", button);

	const setButtonState = (state: "idle" | "loading" | "error" | "done") => {
		button.disabled = state !== "idle";
		button.innerHTML =
			state === "loading"
				? `<span class="spinner-border spinner-border-sm"></span> Loading...`
				: state === "error"
					? "Failed to load more, click to retry"
					: state === "done"
						? "No more items"
						: `Load More${kilnDisclosureBadgeHtml(showDisclosures)}`;
	};

	new MutationObserver((records) => {
		if (records.some((record) => record.removedNodes.length > 0)) {
			page = 1;
			finished = false;
			generation++;
			setButtonState("idle");
		}
	}).observe(itemsContainer, { childList: true });

	button.addEventListener("click", async () => {
		if (loading || finished) return;
		loading = true;
		const thisGeneration = generation;
		setButtonState("loading");

		const result = await sendMessage(
			"getStoreListing",
			readStoreFilters(page + 1),
		);
		loading = false;

		if (thisGeneration !== generation) return;

		if (!result.ok) {
			setButtonState("error");
			return;
		}

		page = result.data.meta.currentPage;
		for (const asset of result.data.data) {
			itemsContainer.appendChild(renderStoreItem(asset));
		}

		finished = result.data.meta.currentPage >= result.data.meta.lastPage;
		setButtonState(finished ? "done" : "idle");
	});
}

const LEGACY_DISCOVERY_HTML = `
<div class="p-0 mx-2 mt-5" data-kiln-legacy>
	<div class="row mx-auto" style="max-width:1200px">
		<div class="col-lg-2" style="min-width:225px;">
			<h3 class="store-title">Browse</h3>
			<div id="store-categories" class="mb-4">
				<div class="store-categories-list mb-4">
					<div class="form-check store-category-check fw-bold active" style="border-color:#fdc315">
						<input class="form-check-input" type="radio" name="storecat" id="storecat-featured" checked>
						<label class="form-check-label" for="storecat-featured">
							<i class="fad fa-stars"></i> Featured
						</label>
					</div>
					<div class="form-check store-category-check fw-bold" style="border-color:#37da0a">
						<input class="form-check-input" type="radio" name="storecat" id="storecat-new">
						<label class="form-check-label" for="storecat-new">
							<i class="fad fa-square-dashed-circle-plus"></i> New Items
						</label>
					</div>
					<div class="form-check store-category-check fw-bold" style="border-color:#0ecf8c">
						<input class="form-check-input" type="radio" name="storecat" id="storecat-collectibles">
						<label class="form-check-label" for="storecat-collectibles">
							<i class="fad fa-boxes"></i> Collectibles
						</label>
					</div>
					<div class="form-check store-category-check fw-bold" style="border-color:#0986e6">
						<input class="form-check-input" type="radio" name="storecat" id="storecat-usercreations">
						<label class="form-check-label" for="storecat-usercreations">
							<i class="fad fa-users"></i> User Creations
						</label>
					</div>
				</div>
				<div class="form-check store-item-check fw-bold">
					<input data-check-all="true" name="storeitem" class="form-check-input text-muted" type="checkbox" value="" id="store-allitems">
					<label class="form-check-label" for="store-allitems">
						<i class="fad fa-shopping-cart"></i> All items
					</label>
				</div>
				<div class="form-check store-item-check fw-bold">
					<input class="form-check-input" name="storeitem" type="checkbox" value="hat" id="store-hats" checked>
					<label class="form-check-label" for="store-hats">
						<i class="fad fa-hat-cowboy"></i> Hats
					</label>
				</div>
				<div class="form-check store-item-check fw-bold">
					<input class="form-check-input" name="storeitem" type="checkbox" value="tool" id="store-tools" checked>
					<label class="form-check-label" for="store-tools">
						<i class="fad fa-wrench"></i> Tools
					</label>
				</div>
				<div class="form-check store-item-check fw-bold">
					<input class="form-check-input" name="storeitem" type="checkbox" value="face" id="store-faces" checked>
					<label class="form-check-label" for="store-faces">
						<i class="fas fa-face-smile"></i> Faces
					</label>
				</div>
				<div class="form-check store-item-check fw-bold">
					<input class="form-check-input" name="storeitem" type="checkbox" value="shirt" id="store-shirts">
					<label class="form-check-label" for="store-shirts">
						<i class="fad fa-tshirt"></i> Shirts
					</label>
				</div>
				<div class="form-check store-item-check fw-bold">
					<input class="form-check-input" name="storeitem" type="checkbox" value="pants" id="store-pants">
					<label class="form-check-label" for="store-pants">
						<i class="fad fa-socks"></i> Pants
					</label>
				</div>
				<div class="form-check store-item-check fw-bold">
					<input class="form-check-input" name="storeitem" type="checkbox" value="profileTheme" id="store-profileTheme" checked>
					<label class="form-check-label" for="store-profileTheme">
						<i class="fad fa-brush"></i> Profile Themes
					</label>
				</div>
			</div>
			<div id="store-filters" style="cursor:pointer">
				<div class="row" id="filters-header">
					<div class="col">
						<h5 class="section-title">
							<i class="fas fa-filter me-1"></i>
							Filters
						</h5>
					</div>
					<div class="col-auto">
						<a class="text-muted">
							<i class="chevron-ico fas fa-chevron-down"></i>
						</a>
					</div>
				</div>
				<div id="filters" class="d-none">
					<div class="form-group mb-3">
						<label for="price-select" class="section-title mb-1">Price</label>
						<select class="form-select form-select-sm" id="price-select">
							<option value="all" selected>All</option>
							<option value="custom">Custom</option>
						</select>
					</div>
					<div id="custom-price-range" style="display: none;">
						<div class="form-group mb-2">
							<input type="number" class="form-control" id="min-price" placeholder="Min">
						</div>
						<div class="form-group mb-2">
							<input type="number" class="form-control" id="max-price" placeholder="Max">
						</div>
					</div>

					<div class="form-group mb-2">
						<label for="creator-select" class="section-title mb-1">Creator</label>
						<select class="form-select form-select-sm" id="creator-select">
							<option value="all" selected>All</option>
							<option value="custom">Custom</option>
						</select>
					</div>
					<div id="custom-creator" style="display: none;">
						<div class="form-group mb-2">
							<input type="text" class="form-control" id="creator-name" placeholder="Creator Name">
						</div>
					</div>

					<form class="form-group mb-2" id="hide-form">
						<span class="section-title mb-1">Hide</span>
						<div class="form-check form-switch active">
							<input class="form-check-input" type="checkbox" id="hide-offsale" checked>
							<label class="form-check-label" for="hide-offsale">
								Off sale
							</label>
						</div>
						<div class="form-check form-switch">
							<input class="form-check-input" type="checkbox" id="hide-non-collectible">
							<label class="form-check-label" for="hide-non-collectible">
								Non-collectible
							</label>
						</div>
					</form>

					<div class="d-grid mt-3">
						<button type="button" class="btn btn-secondary" id="apply-filters">Apply</button>
					</div>
				</div>
			</div>
		</div>
		<div class="col-lg">
			<div class="row">
				<div class="col d-none d-lg-block"></div>
				<div class="col-12 col-lg-auto mb-2 mb-lg-0">
					<div class="input-group">
						<span class="input-group-text border border-end-0 border-secondary bg-dark pe-1" id="search-addon">
							<i class="far fa-search text-muted"></i>
						</span>
						<input type="text" class="form-control border-start-0 border border-secondary bg-dark" placeholder="Search..." aria-label="Search" aria-describedby="search-addon" value="" id="search-input">
					</div>
				</div>
				<div class="col-12 col-lg-auto">
					<select class="form-select form-select-sm" id="sort-select">
						<option value="createdDesc" data-sort="createdAt" data-order="desc">Newest</option>
						<option value="createdAsc" data-sort="createdAt" data-order="asc">Oldest</option>
						<option value="trending" data-sort="salesVolume" data-order="desc">Trending</option>
						<option value="bestSelling" data-sort="sales" data-order="desc">Best Selling</option>
						<option value="updatedDesc" data-sort="updatedAt" data-order="desc">Updated (Newest)</option>
						<option value="updatedAsc" data-sort="updatedAt" data-order="asc">Updated (Oldest)</option>
						<option value="priceDesc" data-sort="price" data-order="desc">Price (Highest)</option>
						<option value="priceAsc" data-sort="price" data-order="asc">Price (Lowest)</option>
					</select>
				</div>
			</div>
			<hr>
			<div id="store-items"></div>
			<div class="d-flex justify-content-center mt-3">
				<nav id="pagination">
					<ul class="pagination">
						<li class="page-item disabled" id="pagination-first">
							<a class="page-link" href="#!">«</a>
						</li>
						<li class="page-item disabled" id="pagination-prev">
							<a class="page-link" href="#!">‹</a>
						</li>
						<li class="page-item active">
							<a class="page-link">
								<span class="visually-hidden">Page</span>
								<span id="pagination-current">1</span>
							</a>
						</li>
						<li class="page-item" id="pagination-next">
							<a class="page-link" href="#!">›</a>
						</li>
						<li class="page-item" id="pagination-last">
							<a class="page-link" href="#!">»</a>
						</li>
					</ul>
				</nav>
			</div>
		</div>
	</div>
</div>
`;

function renderLegacyStoreItem(asset: StoreListingItem): HTMLElement {
	const wrapper = document.createElement("div");
	wrapper.className = "mb-3 itemCardCont store-listing-item";

	let ribbon = "";
	if (asset.isLimited) {
		ribbon = `<div class="ribbon ribbon-limited ribbon-top-right"><span><i class="fas fa-star"></i></span></div>`;
	} else if (asset.freeForPlus) {
		ribbon = `<div class="ribbon ribbon-plusdx ribbon-top-right"><span><i class="pi pi-plusdx"></i></span></div>`;
	} else if (asset.recentlyUploaded) {
		ribbon = `<div class="ribbon ribbon-new ribbon-top-right"><span>New</span></div>`;
	}

	wrapper.innerHTML = `
		<div style="max-width: 150px;">
			<a class="text-reset" href="/store/${asset.id}">
				<div class="card mb-2">
					${ribbon}
					<div class="p-2">
						<img width="128" height="128" class="img-fluid rounded-3 kiln-store-thumb">
					</div>
				</div>
				<h6 class="text-truncate mb-0 kiln-store-name"></h6>
			</a>
			<small class="text-muted d-block text-truncate kiln-store-type"></small>
			<small class="d-block text-truncate kiln-store-price"></small>
		</div>
		`;

	const img = wrapper.querySelector<HTMLImageElement>(".kiln-store-thumb")!;
	img.src = asset.thumbnailUrl;
	img.alt = asset.name;

	wrapper.querySelector(".kiln-store-name")!.textContent = asset.name;

	const typeEl = wrapper.querySelector(".kiln-store-type")!;
	if (asset.type === "hat") {
		const label = asset.accessoryType
			? asset.accessoryType
					.replace("headAccessory", "headCover")
					.replace(/\b\w/g, (l) => l.toUpperCase())
					.replace(/([A-Z])/g, " $1")
			: "";
		typeEl.innerHTML = `<i class="fas fa-hat-wizard"></i> `;
		typeEl.append(label);
	} else if (asset.type === "tool") {
		typeEl.innerHTML = `<i class="fas fa-wrench"></i> Tool`;
	} else if (asset.type === "face") {
		typeEl.innerHTML = `<i class="fas fa-face-smile"></i> Face`;
	} else if (asset.type === "profileTheme") {
		typeEl.innerHTML = `<i class="fas fa-brush"></i> Profile Theme`;
	} else {
		typeEl.innerHTML = `<i class="fas fa-user"></i> `;
		const creatorLink = document.createElement("a");
		creatorLink.className = "text-reset";
		creatorLink.href = asset.creatorUrl;
		creatorLink.textContent = asset.creatorName;
		typeEl.append(creatorLink);
	}

	const priceEl = wrapper.querySelector<HTMLElement>(".kiln-store-price")!;
	if (asset.displayPrice !== null) {
		priceEl.innerHTML =
			asset.displayPrice === 0
				? "Free"
				: `<i class="pi pi-brick${asset.isLimited ? "-value" : ""} me-1"></i> ${asset.displayPrice.toLocaleString("en-US")}`;
		priceEl.className = "d-block text-truncate kiln-store-price text-success";
	} else if (asset.priceInStuds !== null) {
		priceEl.innerHTML = `<i class="fa-sharp-duotone fa-regular fa-circle-dot me-1"></i> ${asset.priceInStuds.toLocaleString("en-US")}`;
		priceEl.className = "d-block text-truncate kiln-store-price text-studs";
	} else {
		priceEl.remove();
	}

	return wrapper;
}

function wireLegacyDiscovery(root: HTMLElement): void {
	const itemsContainer = root.querySelector<HTMLElement>("#store-items")!;
	const searchInput = root.querySelector<HTMLInputElement>("#search-input")!;
	const sortSelect = root.querySelector<HTMLSelectElement>("#sort-select")!;
	const priceSelect = root.querySelector<HTMLSelectElement>("#price-select")!;
	const minPriceInput = root.querySelector<HTMLInputElement>("#min-price")!;
	const maxPriceInput = root.querySelector<HTMLInputElement>("#max-price")!;
	const customPriceRange = root.querySelector<HTMLElement>(
		"#custom-price-range",
	)!;
	const creatorSelect =
		root.querySelector<HTMLSelectElement>("#creator-select")!;
	const creatorNameInput =
		root.querySelector<HTMLInputElement>("#creator-name")!;
	const customCreator = root.querySelector<HTMLElement>("#custom-creator")!;
	const hideOffsaleCheck =
		root.querySelector<HTMLInputElement>("#hide-offsale")!;
	const hideNonCollectibleCheck = root.querySelector<HTMLInputElement>(
		"#hide-non-collectible",
	)!;
	const applyBtn = root.querySelector<HTMLButtonElement>("#apply-filters")!;
	const allItemsCheck =
		root.querySelector<HTMLInputElement>("#store-allitems")!;
	const typeChecks = Array.from(
		root.querySelectorAll<HTMLInputElement>(
			'.store-item-check input[type="checkbox"]:not(#store-allitems)',
		),
	);
	const categoryRadios = Array.from(
		root.querySelectorAll<HTMLInputElement>('input[name="storecat"]'),
	);
	const filtersHeader = root.querySelector<HTMLElement>("#filters-header")!;
	const filtersPanel = root.querySelector<HTMLElement>("#filters")!;
	const chevron = filtersHeader.querySelector<HTMLElement>(".chevron-ico")!;

	const firstBtn = root.querySelector<HTMLElement>("#pagination-first")!;
	const prevBtn = root.querySelector<HTMLElement>("#pagination-prev")!;
	const nextBtn = root.querySelector<HTMLElement>("#pagination-next")!;
	const lastBtn = root.querySelector<HTMLElement>("#pagination-last")!;
	const currentPageEl = root.querySelector<HTMLElement>("#pagination-current")!;

	const ITEMS_PER_VIEW = 15;

	const chunk = <T>(arr: T[], size: number): T[][] => {
		const out: T[][] = [];
		for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
		return out.length ? out : [[]];
	};

	let serverPage = 1;
	let serverLastPage = 1;
	let currentChunks: StoreListingItem[][] = [[]];
	let chunkIndex = 0;
	let chunksPerFullPage = 1;
	let requestId = 0;

	const getTypes = (): string[] => {
		if (allItemsCheck.checked) return [];
		return typeChecks.filter((c) => c.checked).map((c) => c.value);
	};

	const syncAllItemsCheck = (): void => {
		allItemsCheck.checked = !typeChecks.some((c) => c.checked);
	};

	const readFilters = (): StoreListingFilters => {
		const selected = sortSelect.selectedOptions[0];
		const useCustomPrice = priceSelect.value === "custom";
		const useCustomCreator = creatorSelect.value === "custom";

		return {
			types: getTypes(),
			accessoryTypes: [],
			page: serverPage,
			search: searchInput.value.trim(),
			sort: selected?.dataset.sort ?? "createdAt",
			order: selected?.dataset.order ?? "desc",
			showOffsale: !hideOffsaleCheck.checked,
			collectiblesOnly: hideNonCollectibleCheck.checked,
			minPrice: useCustomPrice
				? parseStorePriceInput(minPriceInput.value)
				: null,
			maxPrice: useCustomPrice
				? parseStorePriceInput(maxPriceInput.value)
				: null,
			creatorName: useCustomCreator ? creatorNameInput.value.trim() : "",
		};
	};

	const renderChunk = (): void => {
		const items = currentChunks[chunkIndex] ?? [];
		itemsContainer.innerHTML = "";
		if (items.length === 0) {
			itemsContainer.innerHTML = `<div class="col-12 text-center text-muted py-5">No items found.</div>`;
		} else {
			for (const asset of items) {
				itemsContainer.appendChild(renderLegacyStoreItem(asset));
			}
		}

		const atStart = serverPage <= 1 && chunkIndex <= 0;
		const atEnd =
			serverPage >= serverLastPage && chunkIndex >= currentChunks.length - 1;

		currentPageEl.textContent = (
			(serverPage - 1) * chunksPerFullPage +
			chunkIndex +
			1
		).toString();
		firstBtn.classList.toggle("disabled", atStart);
		prevBtn.classList.toggle("disabled", atStart);
		nextBtn.classList.toggle("disabled", atEnd);
		lastBtn.classList.toggle("disabled", atEnd);
	};

	const fetchPage = async (
		targetServerPage: number,
		initialChunk: number,
	): Promise<void> => {
		const thisRequest = ++requestId;
		serverPage = targetServerPage;
		itemsContainer.innerHTML = `<div class="col-12 text-center text-muted py-5">Loading...</div>`;

		const result = await sendMessage("getStoreListing", readFilters());
		if (thisRequest !== requestId) return;

		if (!result.ok) {
			itemsContainer.innerHTML = `<div class="col-12 text-center text-muted py-5">Failed to load items. Try again later.</div>`;
			return;
		}

		serverPage = result.data.meta.currentPage;
		serverLastPage = Math.max(result.data.meta.lastPage, 1);
		currentChunks = chunk(result.data.data, ITEMS_PER_VIEW);
		if (serverPage === 1) {
			chunksPerFullPage = Math.max(currentChunks.length, 1);
		}
		chunkIndex = Math.min(Math.max(initialChunk, 0), currentChunks.length - 1);

		renderChunk();
	};

	const goFirst = (): void => {
		fetchPage(1, 0);
	};
	const goPrev = (): void => {
		if (chunkIndex > 0) {
			chunkIndex--;
			renderChunk();
		} else if (serverPage > 1) {
			fetchPage(serverPage - 1, Number.POSITIVE_INFINITY);
		}
	};
	const goNext = (): void => {
		if (chunkIndex < currentChunks.length - 1) {
			chunkIndex++;
			renderChunk();
		} else if (serverPage < serverLastPage) {
			fetchPage(serverPage + 1, 0);
		}
	};
	const goLast = (): void => {
		fetchPage(serverLastPage, Number.POSITIVE_INFINITY);
	};

	const DEFAULT_TYPE_CHECKS = new Set(["hat", "tool", "face", "profileTheme"]);

	const resetCategoryFilters = (): void => {
		sortSelect.value = "createdDesc";
		hideNonCollectibleCheck.checked = false;
		for (const c of typeChecks) c.checked = DEFAULT_TYPE_CHECKS.has(c.value);
		syncAllItemsCheck();
	};

	const applyCategoryPreset = (id: string): void => {
		resetCategoryFilters();
		switch (id) {
			case "storecat-featured":
				sortSelect.value = "trending";
				break;
			case "storecat-new":
				sortSelect.value = "createdDesc";
				break;
			case "storecat-collectibles":
				hideNonCollectibleCheck.checked = true;
				break;
			case "storecat-usercreations":
				allItemsCheck.checked = false;
				for (const c of typeChecks) c.checked = c.value === "profileTheme";
				break;
		}
	};

	allItemsCheck.addEventListener("change", () => {
		if (allItemsCheck.checked) {
			for (const c of typeChecks) c.checked = false;
		}
		goFirst();
	});

	for (const check of typeChecks) {
		check.addEventListener("change", () => {
			syncAllItemsCheck();
			goFirst();
		});
	}

	sortSelect.addEventListener("change", () => {
		goFirst();
	});

	searchInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			goFirst();
		}
	});
	root.querySelector("#search-addon")?.addEventListener("click", () => {
		goFirst();
	});

	priceSelect.addEventListener("change", () => {
		customPriceRange.style.display =
			priceSelect.value === "custom" ? "" : "none";
	});
	creatorSelect.addEventListener("change", () => {
		customCreator.style.display =
			creatorSelect.value === "custom" ? "" : "none";
	});

	applyBtn.addEventListener("click", () => {
		goFirst();
	});

	firstBtn.addEventListener("click", (e) => {
		e.preventDefault();
		if (!firstBtn.classList.contains("disabled")) goFirst();
	});
	prevBtn.addEventListener("click", (e) => {
		e.preventDefault();
		if (!prevBtn.classList.contains("disabled")) goPrev();
	});
	nextBtn.addEventListener("click", (e) => {
		e.preventDefault();
		if (!nextBtn.classList.contains("disabled")) goNext();
	});
	lastBtn.addEventListener("click", (e) => {
		e.preventDefault();
		if (!lastBtn.classList.contains("disabled")) goLast();
	});

	for (const radio of categoryRadios) {
		radio.addEventListener("change", () => {
			if (!radio.checked) return;

			for (const other of categoryRadios) {
				other
					.closest(".store-category-check")
					?.classList.toggle("active", other === radio);
			}

			applyCategoryPreset(radio.id);
			goFirst();
		});
	}

	filtersHeader.addEventListener("click", () => {
		const collapsed = filtersPanel.classList.toggle("d-none");
		chevron.classList.toggle("fa-chevron-down", collapsed);
		chevron.classList.toggle("fa-chevron-up", !collapsed);
	});

	syncAllItemsCheck();
	applyCategoryPreset(
		categoryRadios.find((r) => r.checked)?.id ?? "storecat-featured",
	);
	goFirst();
}

function injectDiscoveryStyles(): void {
	if (document.getElementById("pol-old-discovery-css")) return;
	const style = document.createElement("style");
	style.id = "pol-old-discovery-css";
	style.textContent = `
        #store-items {
            display: grid !important;
            grid-template-columns: repeat(5, 150px) !important;
            justify-content: start !important;
            gap: 16px !important;
            margin: 0 !important;
        }
        #store-items .store-listing-item {
            margin: 0 !important;
        }
        @media (max-width: 1100px) {
            #store-items { grid-template-columns: repeat(3, 150px) !important; }
        }
        @media (max-width: 640px) {
            #store-items { grid-template-columns: repeat(2, 150px) !important; }
        }
    `;
	document.head.appendChild(style);
}

export function legacyStoreLayout(showDisclosures: boolean): void {
	function findMainContainer(): HTMLElement | null {
		const exact = document.querySelector<HTMLElement>(
			'div[style*="min-height: 60vh"]',
		);
		if (exact) return exact;

		for (const div of Array.from(document.getElementsByTagName("div"))) {
			if (div.style.minHeight === "60vh") return div;
		}
		return null;
	}

	function replaceContainer(container: HTMLElement): void {
		container.innerHTML = LEGACY_DISCOVERY_HTML;
		if (showDisclosures) {
			container
				.querySelector(".store-title")
				?.insertAdjacentHTML("beforeend", kilnDisclosureBadgeHtml(true));
		}
		injectDiscoveryStyles();
		wireLegacyDiscovery(container);
	}

	function apply(): void {
		let appliedContainer: HTMLElement | null = null;

		const tryApply = (): void => {
			const found = findMainContainer();
			if (
				found &&
				(found !== appliedContainer ||
					!found.querySelector("[data-kiln-legacy]"))
			) {
				appliedContainer = found;
				replaceContainer(found);
			}
		};

		tryApply();

		const observer = new MutationObserver(tryApply);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style"],
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", apply);
	} else {
		apply();
	}
}
