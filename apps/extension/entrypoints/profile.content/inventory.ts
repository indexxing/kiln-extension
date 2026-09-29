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

import type { Polytoria } from "@kiln/schemas";

const ITEMS_PER_PAGE = 28;

type CollectibleItem = Polytoria.InventoryApi["inventory"][number];
type CollectibleWithCopies = CollectibleItem & {
	copies: number;
	serials: number[];
};

export async function collectibleInventoryCategory(userId: number) {
	const pageCache = new Map<number, CollectibleItem[]>();
	let totalPages = 0;
	let requestId = 0;

	const grid = document.getElementsByClassName("itemgrid")[0];
	grid.innerHTML = "";
	document.getElementsByClassName("pagination")[0]?.remove();

	const fetchPage = async (page: number): Promise<CollectibleItem[] | null> => {
		if (pageCache.has(page)) return pageCache.get(page)!;
		const result = await sendMessage("getUserInventory", {
			userId,
			limit: ITEMS_PER_PAGE,
			page,
			collectiblesOnly: true,
		});
		if (!result.ok) return null;
		if (totalPages === 0) totalPages = result.data.pages;
		pageCache.set(page, result.data.inventory);
		return result.data.inventory;
	};

	const updateHoardedCard = (items: CollectibleItem[]) => {
		const multiples: CollectibleWithCopies[] = [];
		for (const item of items) {
			const idx = multiples.findIndex((x) => x.asset.id === item.asset.id);
			if (idx !== -1) {
				multiples[idx].copies++;
				multiples[idx].serials.push(item.serial!);
			} else {
				multiples.push({
					...item,
					copies: 1,
					serials: [item.serial!],
				});
			}
		}

		const hoarded = multiples
			.filter((x) => x.copies > 1)
			.sort((a, b) => b.copies - a.copies);
		const hoardedItemsCard = document.getElementById("p+hoarded_card")!;
		hoardedItemsCard.style.cssText = "max-height: 300px; overflow-y: auto;";
		hoardedItemsCard.innerHTML = "";
		for (const item of hoarded) {
			const el = document.createElement("div");
			el.classList = "mb-1 mb-2";
			el.innerHTML = `
			<a href="/store/${item.asset.id}" style="font-size: 0.8rem; color: #454545 !important;">
				<b>${item.asset.name}</b>
			</a>
			<br>
			<span>
				${item.copies} copies <i class="fa-solid fa-circle-info" data-bs-toggle="tooltip" data-bs-title="#${item.serials.sort((a, b) => a - b).join(", #")}"></i>
			</span>
			`;
			hoardedItemsCard.appendChild(el);
		}
	};

	const renderPagination = (currentPage: number) => {
		const existing = document.getElementById("p+collectibles_pagination");
		if (existing) existing.remove();
		if (totalPages <= 1) return;

		const baseUrl = window.location.pathname;
		const pageUrl = (p: number) => `${baseUrl}?page=${p}`;

		const items: string[] = [];

		items.push(
			currentPage === 1
				? `<li class="page-item disabled"><a class="page-link" href="${pageUrl(1)}">«</a></li>`
				: `<li class="page-item"><a class="page-link" data-page="1" href="${pageUrl(1)}">«</a></li>`,
		);
		items.push(
			currentPage === 1
				? `<li class="page-item disabled"><a class="page-link" href="${pageUrl(1)}">‹</a></li>`
				: `<li class="page-item"><a class="page-link" data-page="${currentPage - 1}" href="${pageUrl(currentPage - 1)}">‹</a></li>`,
		);

		const windowSize = 2;
		const start = Math.max(1, currentPage - windowSize);
		const end = Math.min(totalPages, currentPage + windowSize);

		if (start > 1) {
			items.push(
				`<li class="page-item"><a class="page-link" data-page="1" href="${pageUrl(1)}">1</a></li>`,
			);
			if (start > 2) {
				items.push(
					`<li class="page-item disabled"><a class="page-link">…</a></li>`,
				);
			}
		}
		for (let p = start; p <= end; p++) {
			items.push(
				p === currentPage
					? `<li class="page-item active"><a class="page-link" data-page="${p}" href="${pageUrl(p)}">${p}</a></li>`
					: `<li class="page-item"><a class="page-link" data-page="${p}" href="${pageUrl(p)}">${p}</a></li>`,
			);
		}
		if (end < totalPages) {
			if (end < totalPages - 1) {
				items.push(
					`<li class="page-item disabled"><a class="page-link">…</a></li>`,
				);
			}
			items.push(
				`<li class="page-item"><a class="page-link" data-page="${totalPages}" href="${pageUrl(totalPages)}">${totalPages}</a></li>`,
			);
		}

		items.push(
			currentPage === totalPages
				? `<li class="page-item disabled"><a class="page-link" href="${pageUrl(totalPages)}">›</a></li>`
				: `<li class="page-item"><a class="page-link" data-page="${currentPage + 1}" href="${pageUrl(currentPage + 1)}">›</a></li>`,
		);
		items.push(
			currentPage === totalPages
				? `<li class="page-item disabled"><a class="page-link" href="${pageUrl(totalPages)}">»</a></li>`
				: `<li class="page-item"><a class="page-link" data-page="${totalPages}" href="${pageUrl(totalPages)}">»</a></li>`,
		);

		const nav = document.createElement("div");
		nav.id = "p+collectibles_pagination";
		nav.classList.add("d-flex", "justify-content-center", "mt-3");
		nav.innerHTML = `<nav><ul class="pagination">${items.join("")}</ul></nav>`;

		nav.addEventListener("click", (e) => {
			const target = (e.target as HTMLElement).closest("a[data-page]");
			if (!target) return;
			e.preventDefault();
			const nextPage = Number(target.getAttribute("data-page"));
			if (Number.isNaN(nextPage) || nextPage === currentPage) return;
			goToPage(nextPage);
		});

		grid.insertAdjacentElement("afterend", nav);
	};

	const renderItems = (items: CollectibleItem[]) => {
		grid.innerHTML = "";

		const order = new Map<number, number>();
		const sorted = items.slice().sort((a, b) => {
			if (!order.has(a.asset.id)) order.set(a.asset.id, order.size);
			if (!order.has(b.asset.id)) order.set(b.asset.id, order.size);
			const groupDiff = order.get(a.asset.id)! - order.get(b.asset.id)!;
			if (groupDiff !== 0) return groupDiff;
			return (a.serial ?? 0) - (b.serial ?? 0);
		});

		for (const item of sorted) {
			const col = document.createElement("div");
			col.classList = "px-0";
			col.innerHTML = `
			<a href="/store/${item.asset.id}" class="text-reset">
				<div class="card mb-2">
					<div class="ribbon ribbon-limited ribbon-top-right"><span>Limited</span></div>
					<div class="card-body">
						<img src="${item.asset.thumbnail}" class="img-fluid rounded">
						<span class="badge bg-dark" style="
							font-weight: lighter;
							position: absolute;
							bottom: 0;
							left: 0;
							margin: 5px;
						">#${item.serial}</span>
					</div>
				</div>
				<h6 class="text-truncate mb-0">
					${item.asset.name}
				</h6>
			</a>
			<small class="text-muted d-block mb-1">
				by <a href="/u/Polytoria" class="text-muted">Polytoria</a>
			</small>
			`;
			grid.appendChild(col);
		}
	};

	const goToPage = async (page: number) => {
		const id = ++requestId;
		const items = await fetchPage(page);
		if (id !== requestId) return;
		if (!items) return;

		history.replaceState(null, "", `${window.location.pathname}?page=${page}`);
		renderItems(items);
		renderPagination(page);
		sendMessage("registerBootstrapElements");
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	const loadHoardedItems = async () => {
		if (totalPages <= 0) return;
		const pages = await Promise.all(
			Array.from({ length: totalPages }, (_, i) => fetchPage(i + 1)),
		);
		updateHoardedCard(pages.filter((p): p is CollectibleItem[] => !!p).flat());
	};

	const urlPage =
		Number(new URLSearchParams(window.location.search).get("page")) || 1;
	await goToPage(urlPage);
	await loadHoardedItems();
}
