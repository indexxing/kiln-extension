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

import { onMessage, sendMessage } from "@/utils/messaging";
import type {
	FeaturedPlace,
	PlaceListing,
	PlacesListingFilters,
} from "@/utils/types";
import {
	applyKilnDisclosureTitle,
	DEFAULT_PLACE_THUMBNAILS,
	kilnDisclosureBadgeHtml,
} from "@/utils/utilities";

let activeRollStatusHandler: ((status: string) => void) | null = null;

onMessage("rollRandomPlaceStatus", ({ data }) => {
	activeRollStatusHandler?.(data);
});

function setRandomPlaceButtonState(
	button: HTMLButtonElement,
	showDisclosures: boolean,
	status: string | null,
) {
	button.disabled = status !== null;
	button.innerHTML =
		status !== null
			? `<span class="spinner-border spinner-border-sm me-1"></span>${status}${kilnDisclosureBadgeHtml(showDisclosures)}`
			: `Random Place${kilnDisclosureBadgeHtml(showDisclosures)}`;
}

async function rollRandomPlaceWithStatus(
	button: HTMLButtonElement,
	showDisclosures: boolean,
) {
	setRandomPlaceButtonState(button, showDisclosures, "Finding a place...");
	activeRollStatusHandler = (status) =>
		setRandomPlaceButtonState(button, showDisclosures, status);

	try {
		await sendMessage("rollRandomPlace");
	} finally {
		activeRollStatusHandler = null;
		setRandomPlaceButtonState(button, showDisclosures, null);
	}
}

export async function randomPlace(showDisclosures: boolean) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "btn btn-outline-secondary";
	button.innerHTML = `Random Place${kilnDisclosureBadgeHtml(showDisclosures)}`;
	Object.assign(button.style, {
		position: "absolute",
		bottom: "20px",
		right: "20px",
		zIndex: "1000",
	});

	document.body.appendChild(button);

	button.addEventListener("click", () =>
		rollRandomPlaceWithStatus(button, showDisclosures),
	);
}

export function legacyWorldDiscoveryLayout(
	showDisclosures: boolean,
	disableAutoScroll: boolean = false,
): void {
	const container = document.querySelector<HTMLElement>(
		'div[style*="min-height: 60vh"]',
	);
	if (!container) {
		console.warn(
			"[Kiln] Legacy World Discovery Layout: couldn't find the places container.",
		);
		return;
	}

	const iconFallbacks = DEFAULT_PLACE_THUMBNAILS;

	container.innerHTML = `
		<div id="legacy-hero-slot"></div>
		<div class="card mcard force-mcard">
			<div class="card-body p-1">
				<div class="row m-auto" style="max-width:900px" id="legacy-filters-row">
					<div class="col">
						<div class="input-group nav-search">
							<span class="input-group-text border-right-0 border pe-1">
								<i class="far fa-search text-muted"></i>
							</span>
							<input type="text" class="form-control border-left-0 border" placeholder="Search Worlds..." aria-label="Search" id="legacy-search-input">
						</div>
					</div>
					<div class="col-12 col-lg-auto px-lg-0">
						<div class="input-group nav-search" style="min-width: 0px;">
							<select class="form-select border-0 border-secondary bg-dark" id="legacy-genre">
								<option value="all" selected>All Genres</option>
								<option value="adventure">Adventure</option>
								<option value="building">Building</option>
								<option value="competitive">Competitive</option>
								<option value="creative">Creative</option>
								<option value="fighting">Fighting</option>
								<option value="funny">Funny</option>
								<option value="hangout">Hangout</option>
								<option value="horror">Horror</option>
								<option value="medieval">Medieval</option>
								<option value="parkour">Parkour</option>
								<option value="puzzle">Puzzle</option>
								<option value="racing">Racing</option>
								<option value="roleplay">Roleplay</option>
								<option value="sandbox">Sandbox</option>
								<option value="showcase">Showcase</option>
								<option value="simulator">Simulator</option>
								<option value="sports">Sports</option>
								<option value="strategy">Strategy</option>
								<option value="survival">Survival</option>
								<option value="techdemo">TechDemo</option>
								<option value="trading">Trading</option>
								<option value="tycoon">Tycoon</option>
								<option value="western">Western</option>
								<option value="other">Other</option>
							</select>
						</div>
					</div>
					<div class="col-12 col-lg-auto px-lg-0 ms-2">
						<div class="input-group nav-search" style="min-width: 0px;">
							<select class="form-select border-0 border-secondary bg-dark" id="legacy-branch">
								<option value="all" selected>All Versions</option>
								<option value="stable">Stable</option>
								<option value="beta">Beta</option>
							</select>
						</div>
					</div>
					<div class="col-12 col-lg-auto px-lg-0 ms-2">
						<div class="input-group nav-search" style="min-width: 0px;">
							<select class="form-select border-0 border-secondary bg-dark" id="legacy-sort">
								<option value="trending">Trending</option>
								<option value="recommended">Recommended</option>
								<option value="live">Live Now</option>
								<option value="topThisWeek">Top This Week</option>
								<option value="newAndRising">New &amp; Rising</option>
								<option value="rating">Top Rated</option>
								<option value="updated">Recently Updated</option>
								<option value="newest">Newest</option>
							</select>
						</div>
					</div>
				</div>
			</div>
		</div>
		<div style="max-width: 1840px" class="container px-0 py-0">
			<div class="mt-lg-2 px-xl-5" id="legacy-places-container"></div>
			<div class="text-center py-3" id="legacy-loading" style="display:none">
				<span class="spinner-border spinner-border-sm"></span>
			</div>
		</div>
	`;

	const heroSlot = container.querySelector<HTMLElement>("#legacy-hero-slot")!;

	const renderHeroCarousel = (featured: FeaturedPlace[]): HTMLElement => {
		const carousel = document.createElement("div");
		carousel.id = "games-carousel";
		carousel.className = "carousel slide";
		carousel.setAttribute("data-bs-interval", "3000");
		carousel.setAttribute("data-bs-ride", "carousel");

		const indicators = document.createElement("ol");
		indicators.className = "carousel-indicators";
		const inner = document.createElement("div");
		inner.className = "carousel-inner";

		featured.forEach((entry, i) => {
			const indicator = document.createElement("li");
			indicator.setAttribute("data-bs-target", "#games-carousel");
			indicator.setAttribute("data-bs-slide-to", String(i));
			if (i === 0) {
				indicator.className = "active";
				indicator.setAttribute("aria-current", "true");
			}
			indicators.appendChild(indicator);

			const item = document.createElement("div");
			item.className = `carousel-item${i === 0 ? " active" : ""}`;

			const link = document.createElement("a");
			link.href = `/places/${entry.place.id}`;

			const imageUrl = entry.imageUrl.endsWith("/null.png")
				? entry.place.thumbnail
				: entry.imageUrl;

			const background = document.createElement("div");
			Object.assign(background.style, {
				position: "relative",
				height: "400px",
				overflow: "hidden",
			});

			const image = document.createElement("img");
			image.src = imageUrl;
			image.loading = i === 0 ? "eager" : "lazy";
			image.alt = entry.place.name;
			Object.assign(image.style, {
				width: "100%",
				height: "100%",
				objectFit: "cover",
			});
			background.appendChild(image);

			const overlay = document.createElement("div");
			Object.assign(overlay.style, {
				position: "absolute",
				left: "0",
				top: "0",
				background:
					"linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), linear-gradient(#0000, #00000096)",
				width: "100%",
				height: "100%",
				zIndex: "1",
			});
			background.appendChild(overlay);

			const caption = document.createElement("div");
			caption.className = "carousel-caption";
			caption.style.zIndex = "10";

			const title = document.createElement("h1");
			title.textContent = entry.place.name;

			const by = document.createElement("p");
			by.className = "text-truncate mb-0 small";
			Object.assign(by.style, {
				opacity: "0.6",
				display: "-webkit-box",
				WebkitLineClamp: "1",
				WebkitBoxOrient: "vertical",
			});
			by.textContent = `By ${entry.place.creator.name}`;

			const description = document.createElement("p");
			description.className = "text-truncate";
			Object.assign(description.style, {
				display: "-webkit-box",
				WebkitLineClamp: "1",
				WebkitBoxOrient: "vertical",
			});
			description.textContent = entry.place.description;

			caption.append(title, by, description);
			background.appendChild(caption);
			link.appendChild(background);
			item.appendChild(link);
			inner.appendChild(item);
		});

		const prev = document.createElement("a");
		prev.className = "carousel-control-prev";
		prev.href = "#games-carousel";
		prev.setAttribute("role", "button");
		prev.setAttribute("data-bs-slide", "prev");
		prev.innerHTML = `<span class="carousel-control-prev-icon" aria-hidden="true"></span><span class="sr-only">Previous</span>`;

		const next = document.createElement("a");
		next.className = "carousel-control-next";
		next.href = "#games-carousel";
		next.setAttribute("role", "button");
		next.setAttribute("data-bs-slide", "next");
		next.innerHTML = `<span class="carousel-control-next-icon" aria-hidden="true"></span><span class="sr-only">Next</span>`;

		carousel.append(indicators, inner, prev, next);
		return carousel;
	};

	(async () => {
		const result = await sendMessage("getFeaturedPlaces");
		if (result.ok && result.data.length > 0) {
			heroSlot.replaceWith(renderHeroCarousel(result.data));
		}
	})();

	const searchInput = container.querySelector<HTMLInputElement>(
		"#legacy-search-input",
	)!;
	const genreSelect =
		container.querySelector<HTMLSelectElement>("#legacy-genre")!;
	const branchSelect =
		container.querySelector<HTMLSelectElement>("#legacy-branch")!;
	const sortSelect =
		container.querySelector<HTMLSelectElement>("#legacy-sort")!;
	const placesContainer = container.querySelector<HTMLElement>(
		"#legacy-places-container",
	)!;
	const loadingIndicator =
		container.querySelector<HTMLElement>("#legacy-loading")!;

	let page = 0;
	let loading = false;
	let lastPage = false;
	let loadRequestId = 0;

	const renderCard = (place: PlaceListing): HTMLElement => {
		const isEvent = place.placeType === "event";
		const iconUrl = place.iconUrl.includes("placeholders")
			? iconFallbacks[place.id % iconFallbacks.length]
			: place.iconUrl;

		const card = document.createElement("div");
		card.className = `mcard card place-card${!place.isLegacy ? " twopointo-demo-place" : ""} mb-2 me-2`;
		card.style.textAlign = "left";
		card.innerHTML = `
			${!place.isLegacy ? `<div class="twopointo-title">2.0</div>` : ""}
			<div class="card-body">
				<img class="place-card-image">
				<div class="flex-grow-1 mx-2 mx-lg-1">
					<div class="mt-2 mb-1 place-card-title">
						<i class="text-muted fas fa-${place.genreIcon}"></i> <span class="kiln-legacy-place-name"></span>
					</div>
					<div class="place-card-details">
						<span class="text-muted mx-e"><i class="fas fa-user"></i> ${place.playing}</span>
						<span class="kiln-legacy-place-rating"></span>
					</div>
				</div>
			</div>
			${isEvent ? `<div class="event-indication text-light">EVENT</div>` : ""}
		`;

		const icon = card.querySelector<HTMLImageElement>(".place-card-image")!;
		icon.src = iconUrl;
		icon.alt = place.name;

		card.querySelector(".kiln-legacy-place-name")!.textContent = place.name;

		const ratingEl = card.querySelector(".kiln-legacy-place-rating")!;
		if (place.rating === null) {
			ratingEl.innerHTML = `<span class="text-muted mx-1"><i class="fas fa-thumbs-up"></i> -</span>`;
		} else {
			const span = document.createElement("span");
			span.className = "mx-1";
			span.style.color = `hsl(${place.rating * 120}, 55.3%, 57.1%)`;
			span.innerHTML = `<i class="fas fa-thumbs-up"></i> ${Math.round(place.rating * 100)}%`;
			ratingEl.appendChild(span);
		}

		const link = document.createElement("a");
		link.href = `/places/${place.id}`;

		if (isEvent) {
			const wrapper = document.createElement("div");
			wrapper.className = "event-card";
			wrapper.appendChild(card);
			link.appendChild(wrapper);
		} else {
			link.appendChild(card);
		}

		return link;
	};

	const readFilters = (p: number): PlacesListingFilters => ({
		page: p,
		search: searchInput.value,
		genre: genreSelect.value,
		sort: sortSelect.value,
		branch: branchSelect.value,
	});

	const loadPlaces = async (clear: boolean): Promise<boolean> => {
		if (!clear && (loading || lastPage)) return true;

		const requestId = ++loadRequestId;
		const requestPage = clear ? 1 : page + 1;
		loading = true;
		loadingIndicator.style.display = "";

		const result = await sendMessage(
			"getPlacesListing",
			readFilters(requestPage),
		);

		if (requestId !== loadRequestId) return true;

		if (clear) {
			placesContainer.innerHTML = "";
		}

		if (!result.ok) {
			console.error("[Kiln] Failed to load legacy places listing:", result);
			loading = false;
			loadingIndicator.style.display = "none";
			return false;
		}

		page = requestPage;
		lastPage = result.data.meta.nextPageURL === null;

		for (const place of result.data.data) {
			placesContainer.appendChild(renderCard(place));
		}

		loading = false;
		loadingIndicator.style.display = "none";
		return true;
	};

	const resetAndReload = () => {
		lastPage = false;
		loadPlaces(true);
	};

	const search = new URLSearchParams(window.location.search).get("search");
	if (search) searchInput.value = search;

	applyKilnDisclosureTitle(
		container,
		showDisclosures,
		"Legacy world discovery layout",
	);

	searchInput.addEventListener("input", resetAndReload);
	genreSelect.addEventListener("change", resetAndReload);
	branchSelect.addEventListener("change", resetAndReload);
	sortSelect.addEventListener("change", resetAndReload);

	if (disableAutoScroll) {
		const loadMoreButton = document.createElement("button");
		loadMoreButton.type = "button";
		loadMoreButton.className = "btn btn-outline-secondary w-100 mb-3";
		loadMoreButton.innerHTML = `Load More${kilnDisclosureBadgeHtml(showDisclosures)}`;
		placesContainer.insertAdjacentElement("afterend", loadMoreButton);

		const setButtonState = (state: "idle" | "loading" | "error" | "done") => {
			loadMoreButton.disabled = state !== "idle";
			loadMoreButton.innerHTML =
				state === "loading"
					? `<span class="spinner-border spinner-border-sm"></span> Loading...`
					: state === "error"
						? "Failed to load more, click to retry"
						: state === "done"
							? "No more places"
							: `Load More${kilnDisclosureBadgeHtml(showDisclosures)}`;
		};

		loadMoreButton.addEventListener("click", async () => {
			if (loading || lastPage) return;
			setButtonState("loading");
			const success = await loadPlaces(false);
			setButtonState(!success ? "error" : lastPage ? "done" : "idle");
		});
	} else {
		window.addEventListener("scroll", () => {
			if (loading || lastPage) return;
			if (
				window.scrollY + window.innerHeight >
				document.documentElement.scrollHeight - 500
			) {
				loadPlaces(false);
			}
		});
	}

	loadPlaces(false);
}

export function legacySubtleV2Labels(
	mode: "minimal" | "legacy",
	showDisclosures: boolean,
) {
	const apply = (card: Element) => {
		const isV2 = card.classList.contains("twopointo-demo-place");
		card.classList.remove("twopointo-demo-place");

		card.querySelector(".kiln-v2-badge")?.remove();

		if (mode === "minimal") {
			if (!isV2) return;

			card.querySelector<HTMLElement>(".twopointo-title")?.remove();

			const badge = document.createElement("span");
			badge.className = "kiln-v2-badge badge bg-primary";
			badge.textContent = "2.0";
			Object.assign(badge.style, {
				position: "absolute",
				top: "0",
				left: "50%",
				translate: "-50%",
				zIndex: "2000",
				fontFamily: "'Varela Round'",
				borderTopLeftRadius: "0px",
				borderTopRightRadius: "0px",
				marginTop: "-3px",
				width: "50%",
				boxShadow: "0 0 3px #00000087",
			});
			applyKilnDisclosureTitle(badge, showDisclosures, "2.0 world indicator");
			card.querySelector(".card-body")?.appendChild(badge);
		} else {
			card.querySelector<HTMLElement>(".twopointo-title")?.remove();

			if (isV2) return;

			const badge = document.createElement("span");
			badge.className = "kiln-v2-badge badge bg-secondary";
			badge.textContent = "Legacy";
			Object.assign(badge.style, {
				position: "absolute",
				top: "0",
				left: "50%",
				translate: "-50%",
				zIndex: "2000",
				fontFamily: "'Varela Round'",
				borderTopLeftRadius: "0px",
				borderTopRightRadius: "0px",
				marginTop: "-3px",
				width: "50%",
				boxShadow: "0 0 3px #00000087",
			});
			applyKilnDisclosureTitle(
				badge,
				showDisclosures,
				"Legacy world indicator",
			);
			card.querySelector(".card-body")?.appendChild(badge);
		}
	};

	document.querySelectorAll<Element>(".place-card").forEach(apply);

	const container = document.querySelector("#legacy-places-container");
	if (container) {
		new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (!(node instanceof Element)) continue;
					if (node.classList.contains("place-card")) apply(node);
					node.querySelectorAll<Element>(".place-card").forEach(apply);
				}
			}
		}).observe(container, { childList: true, subtree: true });
	}
}

export async function legacyRandomPlace(showDisclosures: boolean) {
	const searchRow = document.querySelector<HTMLElement>("#legacy-filters-row");
	if (!searchRow) return;

	const row = document.createElement("div");
	row.classList.add("col-12", "col-lg-auto");
	row.innerHTML = `
    <button class="btn btn-secondary" type="button">Random Place${kilnDisclosureBadgeHtml(showDisclosures)}</button>
    `;

	const button = row.getElementsByTagName("button")[0]!;
	searchRow.appendChild(row);

	searchRow.style.maxWidth = "1200px";

	button.addEventListener("click", () =>
		rollRandomPlaceWithStatus(button, showDisclosures),
	);
}
