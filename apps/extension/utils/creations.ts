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
import { createAudioPlayButton } from "@/utils/utilities";
import type { Result } from "./types";

type CreationAsset = Polytoria.UserCreationsApi["assets"][number];

const CREATION_TYPE_META: Record<string, { icon: string; label: string }> = {
	model: { icon: "fad fa-cubes", label: "Models" },
	audio: { icon: "fad fa-volume-up", label: "Audio" },
	decal: { icon: "fad fa-image", label: "Images" },
	mesh: { icon: "fad fa-cube", label: "Meshes" },
	hat: { icon: "fas fa-hat-cowboy", label: "Hats" },
	tool: { icon: "fas fa-wrench", label: "Tools" },
	face: { icon: "fas fa-smile", label: "Faces" },
	clothing: { icon: "fas fa-tshirt", label: "Clothing" },
	gamePass: { icon: "fas fa-certificate", label: "Game Passes" },
	achievement: { icon: "fas fa-medal", label: "Achievements" },
	body: { icon: "fas fa-person-limbs-wide", label: "Bodies" },
	profileTheme: { icon: "fas fa-brush", label: "Profile Themes" },
	consumable: { icon: "fas fa-flask", label: "Consumables" },
};

function creationTypeLabel(type: string) {
	return (
		CREATION_TYPE_META[type]?.label ??
		type
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			.replace(/^\w/, (c) => c.toUpperCase())
	);
}

function creationTypeIcon(type: string) {
	return CREATION_TYPE_META[type]?.icon ?? "fas fa-cube";
}

export async function fetchAllCreations(
	fetchPage: (
		page: number,
	) => Promise<Promise<Result<Polytoria.UserCreationsApi>>>,
): Promise<CreationAsset[] | null> {
	const first = await fetchPage(1);
	if (!first.ok) return null;

	const assets = [...first.data.assets];
	const rest = await Promise.all(
		Array.from({ length: first.data.pages - 1 }, (_, i) => fetchPage(i + 2)),
	);
	for (const result of rest) {
		if (result.ok) assets.push(...result.data.assets);
	}
	return assets;
}

export function renderCreationsBrowser(
	row: HTMLElement,
	assets: CreationAsset[],
	activeAudio: { current: HTMLAudioElement | null },
	itemsPerPage: number,
	navColumns = 2,
) {
	let activeType = "all";
	let searchQuery = "";
	let currentPage = 1;
	let searchDebounce: ReturnType<typeof setTimeout>;

	row.innerHTML = `
		<div class="col-12 col-lg-${navColumns} mb-3">
			<ul class="nav nav-pills flex-column creations-type-nav"></ul>
		</div>
		<div class="col">
			<div class="input-group input-group-sm mb-3">
				<input type="text" class="form-control" placeholder="Search creations...">
				<button class="btn btn-secondary" type="button">
					<i class="fas fa-search"></i>
				</button>
			</div>
			<div class="creations-results"></div>
		</div>
	`;

	const typeNav = row.querySelector<HTMLUListElement>(".creations-type-nav")!;
	const results = row.querySelector<HTMLDivElement>(".creations-results")!;
	const searchInput = row.querySelector<HTMLInputElement>("input")!;
	const searchBtn = row.querySelector<HTMLButtonElement>("button")!;

	const presentTypes = [...new Set(assets.map((a) => a.type))].sort((a, b) => {
		const order = Object.keys(CREATION_TYPE_META);
		const ai = order.indexOf(a);
		const bi = order.indexOf(b);
		if (ai === -1 && bi === -1) return a.localeCompare(b);
		if (ai === -1) return 1;
		if (bi === -1) return -1;
		return ai - bi;
	});

	const addPill = (
		type: string,
		icon: string,
		label: string,
		count: number,
	) => {
		const li = document.createElement("li");
		li.classList.add("nav-item");

		const a = document.createElement("a");
		a.href = "#!";
		a.classList.add("nav-link");
		if (type === activeType) a.classList.add("active");

		const iconEl = document.createElement("i");
		iconEl.classList.add(...icon.split(" "), "me-1");
		a.appendChild(iconEl);

		const labelEl = document.createElement("span");
		labelEl.classList.add("pilltitle");
		labelEl.textContent = label;
		a.appendChild(labelEl);

		const badge = document.createElement("span");
		badge.classList.add("badge", "bg-secondary", "float-end");
		badge.textContent = String(count);
		a.appendChild(badge);

		a.addEventListener("click", (e) => {
			e.preventDefault();
			if (activeType === type) return;
			activeType = type;
			currentPage = 1;
			for (const link of typeNav.querySelectorAll(".nav-link"))
				link.classList.remove("active");
			a.classList.add("active");
			renderResults();
		});

		li.appendChild(a);
		typeNav.appendChild(li);
	};

	addPill("all", "fas fa-layer-group", "All", assets.length);
	for (const type of presentTypes) {
		addPill(
			type,
			creationTypeIcon(type),
			creationTypeLabel(type),
			assets.filter((a) => a.type === type).length,
		);
	}

	const renderPagination = (pages: number) => {
		const existing = results.querySelector(".creations-pagination");
		existing?.remove();
		if (pages <= 1) return;

		const items: string[] = [];
		const pageLink = (label: string, page: number, disabled = false) =>
			`<li class="page-item ${disabled ? "disabled" : ""}"><a class="page-link" href="#!" data-page="${page}">${label}</a></li>`;

		items.push(pageLink("«", 1, currentPage === 1));
		items.push(pageLink("‹", Math.max(1, currentPage - 1), currentPage === 1));

		const windowSize = 2;
		const start = Math.max(1, currentPage - windowSize);
		const end = Math.min(pages, currentPage + windowSize);

		if (start > 1) {
			items.push(pageLink("1", 1));
			if (start > 2)
				items.push(
					`<li class="page-item disabled"><a class="page-link">…</a></li>`,
				);
		}
		for (let p = start; p <= end; p++) {
			items.push(
				p === currentPage
					? `<li class="page-item active"><a class="page-link" href="#!" data-page="${p}">${p}</a></li>`
					: pageLink(String(p), p),
			);
		}
		if (end < pages) {
			if (end < pages - 1)
				items.push(
					`<li class="page-item disabled"><a class="page-link">…</a></li>`,
				);
			items.push(pageLink(String(pages), pages));
		}

		items.push(
			pageLink("›", Math.min(pages, currentPage + 1), currentPage === pages),
		);
		items.push(pageLink("»", pages, currentPage === pages));

		const nav = document.createElement("div");
		nav.classList.add(
			"creations-pagination",
			"d-flex",
			"justify-content-center",
			"mt-3",
		);
		nav.innerHTML = `<nav><ul class="pagination">${items.join("")}</ul></nav>`;
		nav.addEventListener("click", (e) => {
			const target = (e.target as HTMLElement).closest("a[data-page]");
			if (!target) return;
			e.preventDefault();
			const page = Number(target.getAttribute("data-page"));
			if (Number.isNaN(page) || page === currentPage) return;
			currentPage = page;
			renderResults();
		});
		results.appendChild(nav);
	};

	const renderResults = () => {
		activeAudio.current?.pause();
		activeAudio.current = null;

		let filtered =
			activeType === "all"
				? assets
				: assets.filter((a) => a.type === activeType);
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			filtered = filtered.filter((a) => a.name.toLowerCase().includes(q));
		}

		const pages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
		if (currentPage > pages) currentPage = pages;

		const grid = results.querySelector(".itemgrid");
		grid?.remove();
		results.querySelector(".creations-empty")?.remove();

		if (filtered.length === 0) {
			const empty = document.createElement("p");
			empty.classList.add(
				"text-muted",
				"text-center",
				"py-3",
				"creations-empty",
			);
			empty.textContent = searchQuery
				? `No creations match "${searchQuery}".`
				: "No creations in this category.";
			results.prepend(empty);
			renderPagination(0);
			return;
		}

		const pageItems = filtered.slice(
			(currentPage - 1) * itemsPerPage,
			currentPage * itemsPerPage,
		);

		const itemGrid = document.createElement("div");
		itemGrid.classList.add("row", "alignleft", "itemgrid");
		for (const asset of pageItems) {
			const col = document.createElement("div");
			col.classList.add("px-0");
			col.innerHTML = `
					<a href="/store/${asset.id}" class="text-reset">
						<div class="card mb-2">
							<div class="card-body"></div>
						</div>
						<h6 class="text-truncate mb-0"></h6>
					</a>
				`;
			const cardBody = col.querySelector<HTMLDivElement>(".card-body")!;
			if (asset.type === "audio") {
				cardBody.appendChild(createAudioPlayButton(asset.id, activeAudio));
			} else {
				const img = document.createElement("img");
				img.className = "img-fluid rounded";
				img.src = asset.thumbnail;
				img.alt = asset.name;
				cardBody.appendChild(img);
			}
			col.querySelector("h6")!.textContent = asset.name;
			itemGrid.appendChild(col);
		}
		results.prepend(itemGrid);

		renderPagination(pages);
		sendMessage("registerBootstrapElements");
	};

	const runSearch = () => {
		searchQuery = searchInput.value.trim();
		currentPage = 1;
		renderResults();
	};

	searchBtn.addEventListener("click", runSearch);
	searchInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			runSearch();
		}
	});
	searchInput.addEventListener("input", () => {
		clearTimeout(searchDebounce);
		searchDebounce = setTimeout(runSearch, 200);
	});

	renderResults();
	sendMessage("registerBootstrapElements");
}
