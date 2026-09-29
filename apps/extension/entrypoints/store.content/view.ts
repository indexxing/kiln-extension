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

import errorIcon from "@/assets/error.svg";
import { escapeHtml } from "@/utils/escapeHtml";
import type { CurrencyCode, FormattedHoarder } from "@/utils/types";
import {
	applyKilnDisclosureTitle,
	bricksToCurrency,
	createKilnDisclosureBadge,
	createModal,
	kilnDisclosureBadgeHtml,
} from "@/utils/utilities";

const itemID = window.location.pathname.split("/")[2];

export async function irlBrickPrice(
	irlCurrency: CurrencyCode,
	showDisclosures: boolean,
) {
	try {
		const purchaseBtn = document.querySelector(
			'button[onclick^="buy"], button[data-price]',
		)!;
		const currency = await bricksToCurrency(
			parseInt(purchaseBtn.getAttribute("data-price")!, 10),
			irlCurrency,
		);

		if (currency) {
			const spanTag = document.createElement("span");
			spanTag.classList.add("text-muted");
			spanTag.style.fontSize = "0.7rem";
			spanTag.style.fontWeight = "lighter";
			spanTag.innerText = ` (${currency})`;
			applyKilnDisclosureTitle(
				spanTag,
				showDisclosures,
				"IRL currency conversion",
			);
			purchaseBtn.appendChild(spanTag);
		}
	} catch (_e) {
		console.warn("[Kiln] Failure to find purchase button on page.");
	}

	const addPrice = async (item: HTMLElement) => {
		const price = item.getElementsByClassName("text-success")[0];
		const purchaseBtn = item.querySelector("button[data-listing-id]");

		if (price && purchaseBtn) {
			const currency = await bricksToCurrency(
				parseInt(purchaseBtn.getAttribute("data-price")!, 10),
				irlCurrency,
			);

			if (currency) {
				const spanTag = document.createElement("span");
				spanTag.classList.add("text-muted");
				spanTag.style.fontSize = "0.7rem";
				spanTag.style.fontWeight = "lighter";
				spanTag.innerText = ` (${currency})`;
				applyKilnDisclosureTitle(
					spanTag,
					showDisclosures,
					"IRL currency conversion",
				);
				price.appendChild(spanTag);
			}
		}
	};

	const resellers = document.getElementById("resellers-container");
	if (resellers) {
		for (const reseller of resellers.children) {
			addPrice(reseller as HTMLElement);
		}

		const mutations = new MutationObserver((mutations) => {
			for (const record of mutations) {
				for (const node of record.addedNodes) {
					addPrice(node as HTMLElement);
				}
			}
		});

		mutations.observe(resellers, { childList: true });
	}
}

export async function accurateOwnerCount(showDisclosures: boolean) {
	const counter = document.querySelectorAll(".col.text-center")[2]!;
	if (!counter || counter.children[1].textContent!.trim() != "0") return;

	const ownersResult = await sendMessage("getItemOwners", {
		itemId: parseInt(itemID, 10),
		limit: 1,
	});

	if (!ownersResult.ok) {
		throw new Error(
			"[Kiln] API unavailable, cancelling accurate item owner count loading..",
		);
	}
	const owners = ownersResult.data.total;

	(counter.children[0] as HTMLHeadingElement).innerText = "Owners";
	(counter.children[1] as HTMLHeadingElement).innerText =
		owners.toLocaleString();
	applyKilnDisclosureTitle(
		counter as HTMLElement,
		showDisclosures,
		"Accurate owner count",
	);
}

export function hoardersList(
	minCopies: number,
	showAvatars: boolean,
	inactiveDays: number,
	showLabels: boolean,
	ogYear: number,
	showDisclosures: boolean,
) {
	if (document.getElementById("resellers") === null) {
		return;
	}

	let page = 0;
	const tabs = document.getElementById("store-tabs")!;

	let tabs2 = document.getElementById("store-tabs-2") as HTMLElement | null;
	if (!tabs2) {
		tabs2 = document.createElement("ul");
		tabs2.id = "store-tabs-2";
		tabs2.className = tabs.className;
		tabs2.style.marginTop = "-0.5rem";
		tabs.after(tabs2);
	}

	const tab = document.createElement("li");
	tab.classList.add("nav-item");
	tab.innerHTML = `
	<a class="nav-link">
		<i class="fas fa-calculator me-1"></i>
		<span class="d-none d-sm-inline">Hoarders${kilnDisclosureBadgeHtml(showDisclosures)}</span>
	</a>
	`;
	tabs2.appendChild(tab);

	const loadingHtml = (text: string) => `
	<div class="text-center text-muted py-4">
		<div class="spinner-border mb-2" role="status">
			<span class="visually-hidden">Loading...</span>
		</div>
		<small class="d-block" style="font-size: 0.8rem;" id="p-hoarders-status">${text}</small>
	</div>
	`;
	const setStatus = (text: string) => {
		const el = document.getElementById("p-hoarders-status");
		if (el) el.textContent = text;
	};

	const tabContent = document.createElement("div");
	tabContent.classList.add("d-none");
	tabContent.innerHTML = loadingHtml("Fetching owners...");
	document.getElementById("owners")!.parentElement!.appendChild(tabContent);

	for (const t of Array.from([...tabs.children, ...tabs2.children])) {
		(t as HTMLElement).addEventListener("click", () => {
			if (t === tab) {
				for (const t2 of Array.from([...tabs.children, ...tabs2.children])) {
					t2.children[0]?.classList.remove("active");
				}
				for (const t2 of Array.from(
					document.getElementById("owners")!.parentElement!.children,
				)) {
					t2.classList.add("d-none");
				}
				t.children[0].classList.add("active");
				tabContent.classList.remove("d-none");
			} else {
				tab.children[0]?.classList.remove("active");
				tabContent.classList.add("d-none");
			}
		});
	}

	let fetched = false;
	tab.addEventListener("click", async () => {
		if (fetched) {
			return;
		}
		fetched = true;

		const hoardersResult = await sendMessage("getItemOwners", {
			itemId: parseInt(itemID, 10),
		});

		if (!hoardersResult.ok) {
			tabContent.innerHTML = `<div class="text-center p-2"><p class="text-muted mb-0">Sorry! This feature is currently unavailable. Please check back later!</p></div>`;
			return;
		}
		const owners = hoardersResult.data;

		const formatted: { [key: number]: FormattedHoarder } = {};
		for (const owner of owners.inventories) {
			if (formatted[owner.user.id]) {
				formatted[owner.user.id].copies++;
				formatted[owner.user.id].serials.push(owner.serial);
			} else {
				formatted[owner.user.id] = {
					user: {
						id: owner.user.id,
						name: owner.user.username,
					},
					copies: 1,
					serials: [owner.serial],
				};
			}
		}

		const activity = new Map<
			number,
			{ active: boolean; registeredAt: string | null }
		>();
		let hideInactive = false;
		let groups: FormattedHoarder[][] = [];
		let buildToken = 0;

		const loadActivity = async (
			list: FormattedHoarder[],
			onProgress?: (done: number, total: number) => void,
		) => {
			const missing = list
				.map((h) => h.user.id)
				.filter((id) => !activity.has(id));

			const chunks: number[][] = [];
			for (let i = 0; i < missing.length; i += 5) {
				chunks.push(missing.slice(i, i + 5));
			}

			onProgress?.(0, missing.length);
			for (let i = 0; i < chunks.length; i += 4) {
				await Promise.all(
					chunks.slice(i, i + 4).map(async (chunk) => {
						const result = await sendMessage("checkUserActivity", {
							userIds: chunk,
							days: inactiveDays,
						});
						if (!result.ok) return;
						for (const id of chunk) {
							const info = result.data[String(id)];
							if (info) activity.set(id, info);
						}
					}),
				);
				onProgress?.(Math.min((i + 4) * 5, missing.length), missing.length);
			}
		};

		const loadThumbnails = async (
			list: FormattedHoarder[],
			onProgress?: (done: number, total: number) => void,
		) => {
			const pending = list
				.slice(0, 15)
				.filter((h) => h.user.thumbnail === undefined);
			let done = 0;
			if (pending.length === 0) return;
			onProgress?.(done, pending.length);

			const hashResult = await sendMessage(
				"getAvatarHashes",
				pending.map((h) => h.user.id),
			);
			if (hashResult.ok) {
				for (const hoarder of pending) {
					const hash = hashResult.data[String(hoarder.user.id)];
					if (!hash) continue;
					hoarder.user.thumbnail = `https://cdn.polytoria.com/thumbnails/avatars/${hash}-icon.png`;
					onProgress?.(++done, pending.length);
				}
			}

			for (const hoarder of pending) {
				if (hoarder.user.thumbnail !== undefined) continue;
				const userResult = await sendMessage("getUser", hoarder.user.id);
				hoarder.user.thumbnail = userResult.ok
					? userResult.data.thumbnail.icon
					: "";
				onProgress?.(++done, pending.length);
			}
		};

		const activityProgress = (done: number, total: number) => {
			if (total > 0) setStatus(`Checking activity (${done}/${total} users)...`);
		};

		const buildGroups = async () => {
			const token = ++buildToken;

			let hoarders = Object.values(formatted)
				.filter((h) => h.copies >= minCopies)
				.sort((a, b) => b.copies - a.copies);

			if (hideInactive) {
				await loadActivity(hoarders, activityProgress);
				hoarders = hoarders.filter(
					(h) => activity.get(h.user.id)?.active !== false,
				);
			}

			if (showAvatars) {
				await loadThumbnails(hoarders, (done, total) => {
					if (total > 0) setStatus(`Loading avatars (${done}/${total})...`);
				});
			}

			if (token !== buildToken) return false;

			groups = [];
			while (hoarders.length > 0) {
				groups.push(hoarders.splice(0, 4));
			}
			return true;
		};

		const labelsHtml = (h: FormattedHoarder) => {
			const info = activity.get(h.user.id);
			if (!showLabels || !info) return "";

			let html = "";
			if (!info.active) {
				html += `<span class="badge bg-secondary ms-1" style="font-size:0.65rem;vertical-align:middle;" data-bs-toggle="tooltip" data-bs-title="Hasn't been seen online in the last ${inactiveDays} days">Inactive</span>${kilnDisclosureBadgeHtml(showDisclosures)}`;
			}
			if (
				info.registeredAt &&
				info.registeredAt.slice(0, 10) < `${ogYear + 1}-01-01`
			) {
				html += `<span class="badge bg-warning text-dark ms-1" style="font-size:0.65rem;vertical-align:middle;" data-bs-toggle="tooltip" data-bs-title="Joined during ${ogYear} or earlier">OG</span>${kilnDisclosureBadgeHtml(showDisclosures)}`;
			}
			return html;
		};

		const renderHoardersPage = () => {
			const container = document.getElementById("p-hoarders-container")!;
			const currentPageSpan = document.getElementById("p-hoarders-current-pg")!;
			const prevBtn = document.getElementById("p-hoarders-prev-pg")!;
			const nextBtn = document.getElementById("p-hoarders-next-pg")!;
			const firstBtn = document.getElementById("p-hoarders-first-pg")!;
			const lastBtn = document.getElementById("p-hoarders-last-pg")!;

			currentPageSpan.innerText = (page + 1).toString();

			if (groups[page]) {
				container.innerHTML = groups[page]
					.map(
						(h) => `
				<div class="card mb-3">
					<div class="card-body">
						<div class="row">
							${
								showAvatars
									? `
							<div class="col-auto">
								<img src="${h.user.thumbnail}" alt="${h.user.name}" width="72" class="rounded-circle border border-2 border-secondary bg-dark">
							</div>
							`
									: ""
							}
							<div class="col d-flex align-items-center">
								<div>
									<h6 class="mb-1">
										<a class="text-reset" href="/u/${h.user.name}">${h.user.name}</a>${labelsHtml(h)}
									</h6>
									<small class="text-muted">${h.copies} Copies <i class="fa-solid fa-circle-info" data-bs-toggle="tooltip" data-bs-title="#${h.serials
										.sort((a, b) => a - b)
										.join(", #")}"></i></small>
								</div>
							</div>
							<div class="col-auto d-flex align-items-center">
								<a class="btn btn-warning" type="button" href="/trade/new/${h.user.id}">
									<i class="fad fa-exchange-alt me-1"></i>
									<span class="d-none d-sm-inline">Trade</span>
								</a>
							</div>
						</div>
					</div>
				</div>
				`,
					)
					.join("");

				sendMessage("registerBootstrapElements");
			} else {
				container.innerHTML = `
				<div class="card mb-3">
					<div class="card-body text-center py-5 text-muted">
					<h1 class="display-3"><i class="fa-solid fa-rectangle-history-circle-user"></i></h1>
					<h5> No hoarders </h5>
					<p class="mb-0">This item is fresh and doesn't have any hoarders yet! Come back later!</p>
					</div>
				</div>
				`;
			}

			prevBtn.parentElement!.classList.toggle("disabled", page <= 0);
			firstBtn.parentElement!.classList.toggle("disabled", page <= 0);
			nextBtn.parentElement!.classList.toggle(
				"unavailable",
				page >= groups.length - 1,
			);
			lastBtn.parentElement!.classList.toggle(
				"unavailable",
				page >= groups.length - 1,
			);
		};

		const updateHoardersList = () => {
			renderHoardersPage();

			const current = groups[page];
			if (!showLabels || !current) return;
			if (current.every((h) => activity.has(h.user.id))) return;

			const token = buildToken;
			const shownPage = page;
			loadActivity(current).then(() => {
				if (token !== buildToken || shownPage !== page) return;
				renderHoardersPage();
			});
		};

		setStatus("Counting copies...");
		await buildGroups();
		if (showLabels && groups[0]) {
			await loadActivity(groups[0], activityProgress);
		}

		tabContent.innerHTML = `
		<div id="p-hoarders-container"></div>
		<nav aria-label="Hoarders">
			<ul class="pagination justify-content-center">
				<li style="margin-top: auto; margin-bottom: auto;">
					<select class="form-select form-select-sm" style="height: 37px !important;" id="p-hoarders-min-copies">
						<option value="2">Min. 2+ Copies</option>
						<option value="3">Min. 3+ Copies</option>
						<option value="5">Min. 5+ Copies</option>
						<option value="10">Min. 10+ Copies</option>
						<option value="15">Min. 15+ Copies</option>
						<option value="35">Min. 35+ Copies</option>
					</select>
				</li>
				<li class="ms-2 me-2" style="margin-top: auto; margin-bottom: auto;">
					<div class="form-check mb-0">
						<input class="form-check-input" type="checkbox" id="p-hoarders-hide-inactive">
						<label class="form-check-label" for="p-hoarders-hide-inactive" style="font-size: 0.85rem;">Hide inactive</label>
					</div>
				</li>
				<li class="page-item disabled">
					<a class="page-link" href="#!" id="p-hoarders-first-pg">«</a>
				</li>
				<li class="page-item disabled">
					<a class="page-link" href="#!" tabindex="-1" id="p-hoarders-prev-pg">‹</a>
				</li>
				<li class="page-item active">
					<a class="page-link">
						<span class="visually-hidden">Page</span>
						<span id="p-hoarders-current-pg">1</span>
					</a>
				</li>
				<li class="page-item">
					<a class="page-link" href="#!" id="p-hoarders-next-pg">›</a>
				</li>
				<li class="page-item">
					<a class="page-link" href="#!" id="p-hoarders-last-pg">»</a>
				</li>
			</ul>
		</nav>
		<small class="text-muted text-center mt-1 mb-3 d-block" style="font-size: 0.7rem;">feature of Kiln</small>
		`;

		const minCopiesSelect = document.getElementById(
			"p-hoarders-min-copies",
		) as HTMLSelectElement;
		minCopiesSelect.value = minCopies.toString();

		const hideInactiveCheck = document.getElementById(
			"p-hoarders-hide-inactive",
		) as HTMLInputElement;

		const rebuild = async () => {
			minCopiesSelect.disabled = true;
			hideInactiveCheck.disabled = true;
			document.getElementById("p-hoarders-container")!.innerHTML =
				loadingHtml("Updating list...");

			const applied = await buildGroups();
			if (!applied) return;

			minCopiesSelect.disabled = false;
			hideInactiveCheck.disabled = false;
			page = 0;
			updateHoardersList();
		};

		minCopiesSelect.addEventListener("change", () => {
			minCopies = parseInt(minCopiesSelect.value, 10);
			rebuild();
		});

		hideInactiveCheck.addEventListener("change", () => {
			hideInactive = hideInactiveCheck.checked;
			rebuild();
		});

		document
			.getElementById("p-hoarders-first-pg")!
			.addEventListener("click", () => {
				if (page > 0) {
					page = 0;
					updateHoardersList();
				}
			});

		document
			.getElementById("p-hoarders-prev-pg")!
			.addEventListener("click", () => {
				if (page > 0) {
					page--;
					updateHoardersList();
				}
			});

		document
			.getElementById("p-hoarders-next-pg")!
			.addEventListener("click", () => {
				if (page < groups.length - 1) {
					page++;
					updateHoardersList();
				}
			});

		document
			.getElementById("p-hoarders-last-pg")!
			.addEventListener("click", () => {
				if (page < groups.length - 1) {
					page = groups.length - 1;
					updateHoardersList();
				}
			});

		updateHoardersList();
	});
}

export async function mySerial(userId: number, showDisclosures: boolean) {
	const salesCounter = document.querySelectorAll(".col.text-center")[2]!;
	if (!salesCounter) return;

	const owner = await sendMessage("getItemCopy", {
		itemId: parseInt(itemID, 10),
		userId,
	});

	if (!owner.ok) {
		throw new Error("[Kiln] API unavailable, cancelling my serial loading..");
	}

	const copy = owner.data.inventory;
	if (!copy) return;

	const counter = document.createElement("div");
	counter.classList.add("col", "text-center");
	counter.innerHTML = `
	<h6>My Serial${kilnDisclosureBadgeHtml(showDisclosures)}</h6>
	<h3 class="small">#${copy.serial}</h3>
	`;

	salesCounter.parentElement!.appendChild(counter);
}

export async function nftItems(userId: number, showDisclosures: boolean) {
	const config = await getConfig();

	const MAX_NFT_ITEMS = config.limits.maxNFTItems;
	const MAX_NFT_SERIALS_PER_ITEM = config.limits.maxNFTSerialsPerItem;

	const favoriteBtn = document.getElementById("favorite-btn");
	if (!favoriteBtn) return;

	const sessionResult = await sendMessage("getApiSession", userId);
	const hasSession = sessionResult.ok;

	const button = document.createElement("button");
	button.classList.add("btn", "btn-outline-primary", "btn-sm", "ms-2");
	button.innerHTML = `<i class="fa-regular fa-ban me-1"></i><span>Not for Trade</span>`;

	if (!hasSession) {
		button.innerHTML = `<i class="fa-regular fa-lock me-1"></i><span>Verify to Mark NFT</span>`;
	}

	applyKilnDisclosureTitle(button, showDisclosures, "Not for Trade");

	favoriteBtn.parentElement!.appendChild(button);

	const modal = createModal();

	const renderModal = async () => {
		modal.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-2">
			<h5 class="mb-0" style="color: #fff;">Not for Trade Items${kilnDisclosureBadgeHtml(showDisclosures)}</h5>
			<button class="btn btn-sm btn-secondary" id="p-nft-close">✕</button>
		</div>
		<p class="text-muted mb-3" style="font-size: 0.8rem;">
			Mark this item as "Not for Trade" to auto-reject trades involving it or specific serials.
		</p>
		<div id="p-nft-body">
			<div class="text-center text-muted py-3">Loading...</div>
		</div>
		`;

		document
			.getElementById("p-nft-close")!
			.addEventListener("click", () => modal.close());

		if (!hasSession) {
			document.getElementById("p-nft-body")!.innerHTML = `
			<div class="text-center p-3">
				<p class="text-muted mb-1">You need to verify your Kiln account to use this feature.</p>
				<small class="text-muted">Verify in the Kiln extension preferences.</small>
			</div>`;
			return;
		}

		const [nftResult, ...invPages] = await Promise.all([
			sendMessage("getNFTItems", userId),
			sendMessage("getUserInventory", {
				userId,
				limit: 100,
				page: 1,
				collectiblesOnly: true,
			}),
		]);

		const currentNFT = nftResult.ok
			? nftResult.data.data.find((n) => n.itemId === parseInt(itemID, 10))
			: undefined;
		const nftItemCount = nftResult.ok ? nftResult.data.data.length : 0;
		const atNFTLimit = !currentNFT && nftItemCount >= MAX_NFT_ITEMS;

		const serials: number[] = [];
		const firstPage = invPages[0];
		if (firstPage.ok) {
			for (const inv of firstPage.data.inventory) {
				if (inv.asset.id === parseInt(itemID, 10) && inv.serial != null) {
					serials.push(inv.serial);
				}
			}
			const totalPages = firstPage.data.pages;
			for (let p = 2; p <= totalPages; p++) {
				const page = await sendMessage("getUserInventory", {
					userId,
					limit: 100,
					page: p,
					collectiblesOnly: true,
				});
				if (!page.ok) break;
				for (const inv of page.data.inventory) {
					if (inv.asset.id === parseInt(itemID, 10) && inv.serial != null) {
						serials.push(inv.serial);
					}
				}
			}
		}
		serials.sort((a, b) => a - b);

		const isNFTAll = !!(currentNFT && currentNFT.serials === null);
		const nftSerials = currentNFT?.serials ?? [];

		const body = document.getElementById("p-nft-body")!;

		if (serials.length === 0) {
			body.innerHTML = `
			<div class="mb-3">
				<p class="text-muted" style="font-size: 0.85rem;">You don't own any serials of this item.</p>
				${currentNFT ? `<div class="alert alert-warning py-2 mb-3" style="font-size: 0.8rem;">This item is currently marked as Not for Trade.</div>` : ""}
				${atNFTLimit ? `<div class="alert alert-danger py-2 mb-3" style="font-size: 0.8rem;">You've reached the NFT item limit (${MAX_NFT_ITEMS}).</div>` : ""}
			</div>
			<div class="d-flex gap-2">
				${
					currentNFT
						? `<button class="btn btn-sm btn-danger" id="p-nft-remove">Remove NFT</button>`
						: `<button class="btn btn-sm btn-primary" id="p-nft-save" ${atNFTLimit ? "disabled" : ""}>Mark as NFT</button>`
				}
			</div>
			<div id="p-nft-status" class="mt-2" style="font-size: 0.8rem;"></div>`;
		} else {
			body.innerHTML = `
			<div class="mb-2">
				<label class="form-check">
					<input class="form-check-input" type="checkbox" id="p-nft-all" ${isNFTAll ? "checked" : ""}>
					<span class="form-check-label" style="font-size: 0.85rem; color: #fff;">All serials (including future copies)</span>
				</label>
			</div>
			<div id="p-nft-serials" style="max-height: 180px; overflow-y: auto; border: 1px solid #333; border-radius: 8px; padding: 8px; margin-bottom: 10px;">
				${serials
					.map(
						(s) => `
				<label class="form-check mb-1">
					<input class="form-check-input p-nft-serial-check" type="checkbox" value="${s}"
						${isNFTAll || nftSerials.includes(s) ? "checked" : ""}
						${isNFTAll ? "disabled" : ""}>
					<span class="form-check-label text-muted" style="font-size: 0.85rem;">#${s}</span>
				</label>
				`,
					)
					.join("")}
			</div>
			<small class="text-muted d-block mb-3" style="font-size: 0.7rem;">
				Max ${MAX_NFT_SERIALS_PER_ITEM} serials per item &middot; Max ${MAX_NFT_ITEMS} NFT items total
			</small>
			<div class="d-flex gap-2">
				<button class="btn btn-sm btn-primary" id="p-nft-save">Save</button>
				${currentNFT ? `<button class="btn btn-sm btn-danger" id="p-nft-remove">Remove NFT</button>` : ""}
			</div>
			<div id="p-nft-status" class="mt-2" style="font-size: 0.8rem;"></div>`;

			const allCheck = document.getElementById("p-nft-all") as HTMLInputElement;
			allCheck.addEventListener("change", () => {
				document
					.querySelectorAll<HTMLInputElement>(".p-nft-serial-check")
					.forEach((c) => {
						c.checked = allCheck.checked;
						c.disabled = allCheck.checked;
					});
			});
		}

		document
			.getElementById("p-nft-save")
			?.addEventListener("click", async () => {
				const statusEl = document.getElementById("p-nft-status")!;

				if (atNFTLimit) {
					statusEl.innerHTML = `<span class="text-danger">You've reached the NFT item limit (${MAX_NFT_ITEMS}).</span>`;
					return;
				}

				const allCheck = document.getElementById(
					"p-nft-all",
				) as HTMLInputElement | null;
				const useAllSerials = allCheck?.checked ?? false;

				let selectedSerials: number[] | null = null;
				if (!useAllSerials && serials.length > 0) {
					selectedSerials = Array.from(
						document.querySelectorAll<HTMLInputElement>(
							".p-nft-serial-check:checked",
						),
					).map((c) => parseInt(c.value, 10));

					if (selectedSerials.length === 0) {
						statusEl.innerHTML = `<span class="text-danger">Select at least one serial or check "All serials".</span>`;
						return;
					}
					if (selectedSerials.length > MAX_NFT_SERIALS_PER_ITEM) {
						statusEl.innerHTML = `<span class="text-danger">You can only mark up to ${MAX_NFT_SERIALS_PER_ITEM} serials per item.</span>`;
						return;
					}
				}

				const saveBtn = document.getElementById(
					"p-nft-save",
				) as HTMLButtonElement;
				saveBtn.disabled = true;
				saveBtn.innerHTML = "Saving...";

				const result = await sendMessage("markItemAsNFT", {
					userId,
					itemId: parseInt(itemID, 10),
					serials: selectedSerials,
				});

				if (result.ok) {
					await renderModal();
				} else {
					saveBtn.disabled = false;
					saveBtn.innerHTML = "Save";
					document.getElementById("p-nft-status")!.innerHTML =
						`<span class="text-danger">Failed to save. Try again later.</span>`;
				}
			});

		document
			.getElementById("p-nft-remove")
			?.addEventListener("click", async () => {
				const removeBtn = document.getElementById(
					"p-nft-remove",
				) as HTMLButtonElement;
				removeBtn.disabled = true;
				removeBtn.innerHTML = "Removing...";

				const result = await sendMessage("unmarkItemAsNFT", {
					userId,
					itemId: parseInt(itemID, 10),
				});

				if (result.ok) {
					await renderModal();
				} else {
					removeBtn.disabled = false;
					removeBtn.innerHTML = "Remove NFT";
					document.getElementById("p-nft-status")!.innerHTML =
						`<span class="text-danger">Failed to remove. Try again later.</span>`;
				}
			});
	};

	button.addEventListener("click", async () => {
		await renderModal();
		modal.showModal();
	});
}

export async function nlfItems(userId: number, showDisclosures: boolean) {
	const config = await getConfig();

	const MAX_NLF_ITEMS = config.limits.maxNLFItems;

	const favoriteBtn = document.getElementById("favorite-btn");
	if (!favoriteBtn) return;

	const sessionResult = await sendMessage("getApiSession", userId);
	const hasSession = sessionResult.ok;

	const button = document.createElement("button");
	button.classList.add("btn", "btn-outline-primary", "btn-sm", "ms-2");
	button.innerHTML = `<i class="fa-regular fa-eye-slash me-1"></i><span>Not Looking For</span>`;

	if (!hasSession) {
		button.innerHTML = `<i class="fa-regular fa-lock me-1"></i><span>Verify to Mark NLF</span>`;
	}

	applyKilnDisclosureTitle(button, showDisclosures, "Not Looking For");

	favoriteBtn.parentElement!.appendChild(button);

	const modal = createModal();

	const renderModal = async () => {
		modal.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-2">
			<h5 class="mb-0" style="color: #fff;">Not Looking For Items${kilnDisclosureBadgeHtml(showDisclosures)}</h5>
			<button class="btn btn-sm btn-secondary" id="p-nlf-close">✕</button>
		</div>
		<p class="text-muted mb-3" style="font-size: 0.8rem;">
			Mark this item as "Not Looking For" to auto-reject incoming trades where someone offers it to you.
		</p>
		<div id="p-nlf-body">
			<div class="text-center text-muted py-3">Loading...</div>
		</div>
		`;

		document
			.getElementById("p-nlf-close")!
			.addEventListener("click", () => modal.close());

		const body = document.getElementById("p-nlf-body")!;

		if (!hasSession) {
			body.innerHTML = `
			<div class="text-center p-3">
				<p class="text-muted mb-1">You need to verify your Kiln account to use this feature.</p>
				<small class="text-muted">Verify in the Kiln extension preferences.</small>
			</div>`;
			return;
		}

		const nlfResult = await sendMessage("getNLFItems", userId);
		const nlfIds = nlfResult.ok ? nlfResult.data.data : [];
		const isNLF = nlfIds.includes(parseInt(itemID, 10));
		const atNLFLimit = !isNLF && nlfIds.length >= MAX_NLF_ITEMS;

		body.innerHTML = `
			${isNLF ? `<div class="alert alert-warning py-2 mb-3" style="font-size: 0.8rem;">This item is currently marked as Not Looking For.</div>` : ""}
			${atNLFLimit ? `<div class="alert alert-danger py-2 mb-3" style="font-size: 0.8rem;">You've reached the NLF item limit (${MAX_NLF_ITEMS}).</div>` : ""}
			<small class="text-muted d-block mb-3" style="font-size: 0.7rem;">
				Max ${MAX_NLF_ITEMS} NLF items total
			</small>
			<div class="d-flex gap-2">
				${
					isNLF
						? `<button class="btn btn-sm btn-danger" id="p-nlf-remove">Remove NLF</button>`
						: `<button class="btn btn-sm btn-primary" id="p-nlf-save" ${atNLFLimit ? "disabled" : ""}>Mark as NLF</button>`
				}
			</div>
			<div id="p-nlf-status" class="mt-2" style="font-size: 0.8rem;"></div>`;

		document
			.getElementById("p-nlf-save")
			?.addEventListener("click", async () => {
				const saveBtn = document.getElementById(
					"p-nlf-save",
				) as HTMLButtonElement;
				saveBtn.disabled = true;
				saveBtn.innerHTML = "Saving...";

				const result = await sendMessage("markItemAsNLF", {
					userId,
					itemId: parseInt(itemID, 10),
				});

				if (result.ok) {
					await renderModal();
				} else {
					saveBtn.disabled = false;
					saveBtn.innerHTML = "Mark as NLF";
					document.getElementById("p-nlf-status")!.innerHTML =
						`<span class="text-danger">Failed to save. Try again later.</span>`;
				}
			});

		document
			.getElementById("p-nlf-remove")
			?.addEventListener("click", async () => {
				const removeBtn = document.getElementById(
					"p-nlf-remove",
				) as HTMLButtonElement;
				removeBtn.disabled = true;
				removeBtn.innerHTML = "Removing...";

				const result = await sendMessage("unmarkItemAsNLF", {
					userId,
					itemId: parseInt(itemID, 10),
				});

				if (result.ok) {
					await renderModal();
				} else {
					removeBtn.disabled = false;
					removeBtn.innerHTML = "Remove NLF";
					document.getElementById("p-nlf-status")!.innerHTML =
						`<span class="text-danger">Failed to remove. Try again later.</span>`;
				}
			});
	};

	button.addEventListener("click", async () => {
		await renderModal();
		modal.showModal();
	});
}

export async function ownerCheck(showDisclosures: boolean) {
	const favoriteBtn = document.getElementById("favorite-btn");
	if (!favoriteBtn) return;

	const button = document.createElement("button");
	button.classList.add("btn", "btn-outline-secondary", "btn-sm", "ms-2");
	button.innerHTML = `<i class="fa-regular fa-magnifying-glass me-1"></i><span>Owner Check</span>`;
	applyKilnDisclosureTitle(button, showDisclosures, "Owner Check");

	favoriteBtn.parentElement!.appendChild(button);

	const modal = createModal();
	modal.style.overflow = "visible";
	modal.innerHTML = `
	<div class="d-flex justify-content-between align-items-center mb-2">
		<h5 class="mb-0" style="color: #fff;">Owner Check${kilnDisclosureBadgeHtml(showDisclosures)}</h5>
		<button class="btn btn-sm btn-secondary" id="p-owner-close">✕</button>
	</div>
	<p class="text-muted mb-3" style="font-size: 0.8rem;">
		Check whether a user owns this item, and their serial if so.
	</p>
	<div class="position-relative mb-2">
		<div class="input-group">
			<input type="text" class="form-control" id="p-owner-input" placeholder="Username..." autocomplete="off">
			<button class="btn btn-primary" id="p-owner-check" disabled>Check</button>
		</div>
		<div class="list-group position-absolute w-100 mt-1 shadow-sm d-none" id="p-owner-suggestions" style="z-index: 1000; max-height: 220px; overflow-y: auto;"></div>
	</div>
	<div id="p-owner-result" style="font-size: 0.85rem;"></div>
	<hr class="my-3" style="border-color: #333;">
	<p class="text-muted mb-2" style="font-size: 0.8rem;">
		Or look up who owns a specific serial.
	</p>
	<div class="input-group mb-2">
		<span class="input-group-text bg-dark">#</span>
		<input type="number" min="1" class="form-control" id="p-owner-serial-input" placeholder="Serial...">
		<button class="btn btn-primary" id="p-owner-serial-check">Find</button>
	</div>
	<div id="p-owner-serial-result" style="font-size: 0.85rem;"></div>
	`;

	document
		.getElementById("p-owner-close")!
		.addEventListener("click", () => modal.close());

	const input = document.getElementById("p-owner-input") as HTMLInputElement;
	const checkBtn = document.getElementById(
		"p-owner-check",
	) as HTMLButtonElement;
	const suggestions = document.getElementById("p-owner-suggestions")!;
	const result = document.getElementById("p-owner-result")!;

	let selectedUserId: number | null = null;
	let selectedUsername = "";

	const hideSuggestions = () => {
		suggestions.classList.add("d-none");
		suggestions.innerHTML = "";
	};

	const selectUser = (userId: number, username: string) => {
		selectedUserId = userId;
		selectedUsername = username;
		input.value = username;
		checkBtn.disabled = false;
		hideSuggestions();
		checkBtn.click();
	};

	let requestId = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	input.addEventListener("input", () => {
		selectedUserId = null;
		checkBtn.disabled = true;
		result.innerHTML = "";
		clearTimeout(debounceTimer);

		const query = input.value.trim();
		if (query.length < 2) {
			hideSuggestions();
			return;
		}

		debounceTimer = setTimeout(async () => {
			const thisRequest = ++requestId;
			const searchResult = await sendMessage("searchUsersByActivity", query);
			if (thisRequest !== requestId) return;

			if (!searchResult.ok || searchResult.data.length === 0) {
				hideSuggestions();
				return;
			}

			suggestions.innerHTML = "";
			for (const user of searchResult.data.slice(0, 5)) {
				const item = document.createElement("button");
				item.type = "button";
				item.className =
					"list-group-item list-group-item-action py-1 px-2 d-flex align-items-center gap-2";

				const img = document.createElement("img");
				img.src = user.thumbnailUrl ?? errorIcon;
				img.width = 24;
				img.height = 24;
				img.className = "rounded";

				const span = document.createElement("span");
				span.textContent = user.username;

				item.append(img, span);
				item.addEventListener("mousedown", (event) => {
					event.preventDefault();
					selectUser(user.userId, user.username);
				});
				suggestions.appendChild(item);
			}
			suggestions.classList.remove("d-none");
		}, 250);
	});

	input.addEventListener("blur", () => hideSuggestions());

	checkBtn.addEventListener("click", async () => {
		if (selectedUserId === null) return;

		const checkingUserId = selectedUserId;
		const checkingUsername = selectedUsername;
		input.value = "";

		checkBtn.disabled = true;
		const originalText = checkBtn.innerHTML;
		checkBtn.innerHTML = "Checking...";
		result.innerHTML = "";

		const ownerResult = await sendMessage("getItemCopy", {
			itemId: parseInt(itemID, 10),
			userId: checkingUserId,
		});

		checkBtn.disabled = selectedUserId === null;
		checkBtn.innerHTML = originalText;

		result.innerHTML = "";
		const icon = document.createElement("i");
		const text = document.createElement("span");
		text.append(`${checkingUsername} `);

		if (!ownerResult.ok) {
			icon.className = "fa-solid fa-triangle-exclamation me-1";
			text.append("Failed to check owner. Try again later.");
			result.className = "text-danger";
		} else if (ownerResult.data.owned && ownerResult.data.inventory) {
			icon.className = "fa-solid fa-circle-check me-1";
			text.append(
				`owns this item! Serial: #${ownerResult.data.inventory.serial}`,
			);
			result.className = "text-success";
		} else {
			icon.className = "fa-regular fa-circle-xmark me-1";
			text.append("does not own this item.");
			result.className = "text-muted";
		}

		result.append(icon, text);
	});

	const serialInput = document.getElementById(
		"p-owner-serial-input",
	) as HTMLInputElement;
	const serialCheckBtn = document.getElementById(
		"p-owner-serial-check",
	) as HTMLButtonElement;
	const serialResult = document.getElementById("p-owner-serial-result")!;

	const findSerialOwner = async () => {
		const serial = parseInt(serialInput.value, 10);

		serialResult.innerHTML = "";
		if (!Number.isInteger(serial) || serial < 1) {
			serialResult.className = "text-danger";
			serialResult.textContent = "Enter a valid serial number.";
			return;
		}

		serialCheckBtn.disabled = true;
		const originalText = serialCheckBtn.innerHTML;
		serialCheckBtn.innerHTML = "Searching...";

		const totalResult = await sendMessage("getItemOwners", {
			itemId: parseInt(itemID, 10),
			limit: 1,
		});

		if (!totalResult.ok) {
			serialCheckBtn.disabled = false;
			serialCheckBtn.innerHTML = originalText;
			serialResult.className = "text-danger";
			serialResult.textContent = "Failed to look up owner. Try again later.";
			return;
		}

		const total = totalResult.data.total;
		const maxPage = Math.max(1, Math.ceil(total / 100));
		const estimatedPage = Math.max(1, Math.ceil(serial / 100));
		const SEARCH_RADIUS = 5;

		const pagesToTry = [estimatedPage];
		for (let offset = 1; offset <= SEARCH_RADIUS; offset++) {
			if (estimatedPage - offset >= 1) pagesToTry.push(estimatedPage - offset);
			if (estimatedPage + offset <= maxPage + SEARCH_RADIUS)
				pagesToTry.push(estimatedPage + offset);
		}

		const findOwnerOnPage = async (page: number) => {
			const pageResult = await sendMessage("getItemOwners", {
				itemId: parseInt(itemID, 10),
				limit: 100,
				page,
			});
			if (!pageResult.ok) return { ok: false as const };
			return {
				ok: true as const,
				owner: pageResult.data.inventories.find((inv) => inv.serial === serial),
			};
		};

		let owner: Awaited<ReturnType<typeof findOwnerOnPage>>["owner"];
		let anySucceeded = false;
		for (const page of pagesToTry) {
			const result = await findOwnerOnPage(page);
			if (result.ok) anySucceeded = true;
			if (result.ok && result.owner) {
				owner = result.owner;
				break;
			}
		}

		serialCheckBtn.disabled = false;
		serialCheckBtn.innerHTML = originalText;

		serialResult.innerHTML = "";
		const icon = document.createElement("i");
		const text = document.createElement("span");

		if (owner) {
			icon.className = "fa-solid fa-circle-check me-1";
			text.append(`Serial #${serial} is owned by `);
			const link = document.createElement("a");
			link.href = `/u/${owner.user.username}`;
			link.className = "text-reset";
			link.textContent = owner.user.username;
			text.append(link);
			serialResult.className = "text-success";
		} else if (!anySucceeded) {
			icon.className = "fa-solid fa-triangle-exclamation me-1";
			text.append("Failed to look up owner. Try again later.");
			serialResult.className = "text-danger";
		} else {
			icon.className = "fa-regular fa-circle-question me-1";
			text.append(`Couldn't find who owns serial #${serial}.`);
			serialResult.className = "text-muted";
		}

		serialResult.append(icon, text);
	};

	serialCheckBtn.addEventListener("click", findSerialOwner);
	serialInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			findSerialOwner();
		}
	});

	button.addEventListener("click", () => {
		input.value = "";
		selectedUserId = null;
		selectedUsername = "";
		checkBtn.disabled = true;
		result.innerHTML = "";
		hideSuggestions();
		serialInput.value = "";
		serialResult.innerHTML = "";
		modal.showModal();
	});
}

export async function pinnedAchievements(userId: number) {
	const favoriteBtn = document.getElementById("favorite-btn");
	if (!favoriteBtn) return;

	const achievementId = parseInt(itemID, 10);

	const [sessionResult, pinnedResult] = await Promise.all([
		sendMessage("getApiSession", userId),
		sendMessage("getPinnedAchievements", userId),
	]);

	const hasSession = sessionResult.ok;
	let isPinned =
		pinnedResult.ok && pinnedResult.data.data.includes(achievementId);

	const button = document.createElement("button");
	button.classList.add("btn", "btn-outline-secondary", "btn-sm", "ms-2");

	const render = () => {
		if (!hasSession) {
			button.innerHTML = `<i class="fa-regular fa-lock me-1"></i><span>Verify to Pin</span>`;
			return;
		}
		button.innerHTML = isPinned
			? `<i class="fa-solid fa-thumbtack me-1"></i><span>Unpin Achievement</span>`
			: `<i class="fa-regular fa-thumbtack me-1"></i><span>Pin Achievement</span>`;
	};

	render();
	const dropdownWrapper =
		favoriteBtn.parentElement!.querySelector(".dropdown")?.parentElement ??
		null;
	if (dropdownWrapper) {
		favoriteBtn.parentElement!.insertBefore(button, dropdownWrapper);
	} else {
		favoriteBtn.parentElement!.appendChild(button);
	}

	if (!hasSession) return;

	button.addEventListener("click", async () => {
		button.disabled = true;
		button.innerHTML = `<i class="fa-regular fa-spinner fa-spin me-1"></i><span>${isPinned ? "Unpinning..." : "Pinning..."}</span>`;

		const result = isPinned
			? await sendMessage("unpinAchievement", { achievementId, userId })
			: await sendMessage("pinAchievement", { achievementId, userId });

		if (result.ok) isPinned = !isPinned;
		render();
		button.disabled = false;
	});
}

export const CLOTHING_PREVIEW_BODIES: { id: number | null; name: string }[] = [
	{ id: null, name: "Default" },
	{ id: 203643, name: "Robes" },
	{ id: 138708, name: "Athlete" },
	{ id: 138707, name: "Action Figure (Slim)" },
	{ id: 138706, name: "Action Figure" },
	{ id: 137759, name: "Tubby" },
	{ id: 137758, name: "Slim" },
];

export async function clothing3DPreview(showDisclosures: boolean) {
	const hero = document.querySelector<HTMLElement>(".item-hero");
	if (!hero) return;

	const modal = createModal();

	const btn = document.createElement("button");
	btn.className = "btn btn-sm btn-secondary";
	btn.style.cssText =
		"position: absolute; bottom: 8px; right: 8px; opacity: 0.85; z-index: 1;";
	btn.innerHTML = `<i class="fa-solid fa-rotate me-1"></i>3D View (Kiln)`;
	hero.style.position = "relative";
	hero.appendChild(btn);

	btn.addEventListener("click", async () => {
		modal.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-2">
			<h5 class="mb-0" style="color: #fff;">Clothing Preview${kilnDisclosureBadgeHtml(showDisclosures)}</h5>
			<button class="btn btn-sm btn-secondary" id="p-back-close">✕</button>
		</div>
		<p class="text-muted mb-1" style="font-size: 0.8rem;">
			Preview this clothing item on a template avatar in 3D.
		</p>
		<div class="mb-2">
			<select class="form-select form-select-sm" id="p-back-body-select">
				${CLOTHING_PREVIEW_BODIES.map(
					(b) => `<option value="${b.id ?? ""}">${b.name}</option>`,
				).join("")}
			</select>
		</div>
		<div id="kiln-back-clothing-preview-body">
			<div class="text-center text-muted py-3">Loading...</div>
		</div>
		`;

		document
			.getElementById("p-back-close")!
			.addEventListener("click", () => modal.close());

		modal.showModal();

		const body = document.getElementById("kiln-back-clothing-preview-body")!;
		const bodySelect = document.getElementById(
			"p-back-body-select",
		) as HTMLSelectElement;

		try {
			const textureResult = await sendMessage(
				"getItemTexture",
				parseInt(itemID, 10),
			);
			if (!textureResult.ok || !textureResult.data.url) {
				body.innerHTML = `<div class="text-center text-muted py-3">Texture unavailable for this item.</div>`;
				return;
			}
			const clothingUrl = textureResult.data.url;

			const canvas = document.createElement("canvas");
			canvas.style.cssText =
				"width: 100%; height: 360px; display: block; border-radius: 8px;";
			body.innerHTML = "";
			body.appendChild(canvas);

			const { AvatarRenderer } = await import(
				"../account.content/avatarRenderer"
			);
			const avatarRenderer = new AvatarRenderer(canvas);

			modal.addEventListener("close", () => avatarRenderer.dispose(), {
				once: true,
			});

			const bodyMeshCache = new Map<number, string>();
			const getBodyUrl = async (id: number | null): Promise<string> => {
				if (id === null) return "";
				const cached = bodyMeshCache.get(id);
				if (cached !== undefined) return cached;
				const meshResult = await sendMessage("getItemMesh", id);
				const url =
					meshResult.ok && meshResult.data.url ? meshResult.data.url : "";
				bodyMeshCache.set(id, url);
				return url;
			};

			const renderAvatar = async () => {
				const selectedId = bodySelect.value
					? parseInt(bodySelect.value, 10)
					: null;
				const bodyUrl = await getBodyUrl(selectedId);
				await avatarRenderer.load({
					useCharacter: false,
					face: browser.runtime.getURL("/images/default-face.png"),
					clothing: [clothingUrl],
					body: bodyUrl,
					tool: "",
					items: [],
					headColor: "#dce0e8",
					torsoColor: "#dce0e8",
					leftArmColor: "#dce0e8",
					rightArmColor: "#dce0e8",
					leftLegColor: "#dce0e8",
					rightLegColor: "#dce0e8",
				});
			};

			bodySelect.addEventListener("change", () => {
				renderAvatar();
			});

			await renderAvatar();
		} catch (_e) {
			body.innerHTML = `<div class="text-center text-muted py-3">Failed to render preview.</div>`;
		}
	});
}

export async function loveIntegration(showDisclosures: boolean) {
	const tabs = document.getElementById("store-tabs")!;

	const section = document.createElement("div");
	section.classList = "mb-3";
	section.innerHTML = `
	<h6 class="section-title mt-3 mt-lg-0 mb-3 px-2">
		Valuation${kilnDisclosureBadgeHtml(showDisclosures)} <a href="https://polytoria.trade/store/${itemID}" target="_blank">(data from polytoria.trade)</a>
	</h6>
	<div class="card" id="kiln_valuation_card">
		<div class="card-body">
			<small class="d-block text-center text-muted" style="font-size: 0.8rem;">
				Loading...
			</small>
			<lottie-player id="avatar-loading" src="https://c0.ptacdn.com/static/images/lottie/poly-brick-loading.2b51aa85.json" background="transparent" speed="1" style="width: 20%;height: auto;margin: -16px auto 50px;margin-top: 0px;" loop="" autoplay=""></lottie-player>
		</div>
	</div>
	`;
	tabs.parentElement!.insertBefore(section, tabs);

	const cardBody = section.getElementsByClassName("card-body")[0]!;

	const loveData = await sendMessage("getPolytoriaTradeItems", [+itemID]);
	if (!loveData.ok) {
		cardBody.innerHTML = "There is no evaluation for this item at this time.";
		return;
	}

	const data = loveData.data[0]!;
	const item = data.data?.item;

	if (!item) {
		cardBody.innerHTML = "There is no evaluation for this item at this time.";
		return;
	}

	const stats = item.stats;
	const tags = (item.tags ?? []).filter(
		(t): t is { id: number; name: string; emoji: string } =>
			t.name !== undefined,
	);

	const TagColors: Record<string, string> = {
		Projected: "warning",
		Hoarded: "success",
		Rare: "primary",
		Freaky: "danger",
	};

	const getTagColor = (label: string) =>
		TagColors[label] ?? TagColors[label.substring(1)] ?? "dark";

	const getTrendColor = (trend: string | null | undefined) => {
		switch (trend?.toLowerCase()) {
			case "rising":
				return "success";
			case "stable":
				return "primary";
			case "fluctuating":
				return "warning";
			case "dropping":
				return "danger";
			default:
				return "secondary";
		}
	};

	const getDemandColor = (demand: string | null | undefined) => {
		switch (demand?.toLowerCase()) {
			case "high":
				return "success";
			case "normal":
				return "primary";
			case "low":
				return "warning";
			case "none":
				return "danger";
			default:
				return "secondary";
		}
	};

	const fmt = (n?: number | null) => (n != null ? n.toLocaleString() : "—");

	const coloredBadge = (label: string | null | undefined, color: string) =>
		`<span class="badge bg-${color}">${escapeHtml(label ?? "—")}</span>`;

	cardBody.innerHTML = `
		<div class="mb-1">
			<b class="text-success">
				<i class="pi pi-brick" style="width:1.2em"></i>
				Value
			</b>
			<span class="float-end">${fmt(stats?.value)}</span>
		</div>
		<div class="mb-1">
			<b class="text-primary">
				<i class="pi" style="width:1.2em">%</i>
				Trend
			</b>
			<span class="float-end">
				${coloredBadge(stats?.trend, getTrendColor(stats?.trend))}
			</span>
		</div>
		<div class="mb-1">
			<b>
				<i class="fa-duotone fa-triangle" style="width:1.2em"></i>
				Demand
			</b>
			<span class="float-end">
				${coloredBadge(stats?.demand, getDemandColor(stats?.demand))}
			</span>
		</div>
		<div class="mb-1">
			<b>
				<i class="fa-duotone fa-hand-wave" style="width:1.2em"></i>
				Shorthand
			</b>
			<span class="float-end">${escapeHtml(item.shorthand ?? "—")}</span>
		</div>
		${
			tags.length > 0
				? `
		<div class="d-flex mt-1" style="gap: 5px;">
			${tags.map((t) => `<span class="badge bg-${getTagColor(t.name)}">${t.emoji ? `${escapeHtml(t.emoji)} ` : ""}${escapeHtml(t.name)}</span>`).join("")}
		</div>
		`
				: ""
		}
	`;
}

export async function collectibleOwnerLabels(
	inactiveDays: number,
	ogYear: number,
	showDisclosures: boolean,
) {
	const container = document.getElementById("owners-container");
	if (!container) return;

	const processedCards = new WeakSet<Element>();
	const infoCache = new Map<
		number,
		{ active: boolean; registeredAt: string | null } | null
	>();
	const OG_CUTOFF = `${ogYear + 1}-01-01`;

	const applyLabels = (
		nameEl: Element,
		info: { active: boolean; registeredAt: string | null } | null,
	) => {
		if (!info) return;

		if (!info.active) {
			nameEl.insertAdjacentHTML(
				"beforeend",
				`<span class="badge bg-secondary ms-1" style="font-size:0.65rem;vertical-align:middle;" data-bs-toggle="tooltip" data-bs-title="Hasn't been seen online in the last ${inactiveDays} days">Inactive</span>${kilnDisclosureBadgeHtml(showDisclosures)}`,
			);
		}

		if (info.registeredAt && info.registeredAt.slice(0, 10) < OG_CUTOFF) {
			nameEl.insertAdjacentHTML(
				"beforeend",
				`<span class="badge bg-warning text-dark ms-1" style="font-size:0.65rem;vertical-align:middle;" data-bs-toggle="tooltip" data-bs-title="Joined during ${ogYear} or earlier">OG</span>${kilnDisclosureBadgeHtml(showDisclosures)}`,
			);
		}
	};

	const processCards = async (cards: Element[]) => {
		const cached: { userId: number; nameEl: Element }[] = [];
		const toFetch = new Map<number, { userId: number; nameEls: Element[] }>();

		for (const card of cards) {
			if (processedCards.has(card)) continue;
			const link = card.querySelector<HTMLAnchorElement>('a[href^="/users/"]');
			if (!link) continue;
			const userId = parseInt(link.getAttribute("href")!.split("/")[2], 10);
			if (!userId || Number.isNaN(userId)) continue;
			const nameEl = card.querySelector("h6.mb-1");
			if (!nameEl) continue;
			processedCards.add(card);

			if (infoCache.has(userId)) {
				cached.push({ userId, nameEl });
			} else {
				const entry = toFetch.get(userId) ?? { userId, nameEls: [] };
				entry.nameEls.push(nameEl);
				toFetch.set(userId, entry);
			}
		}

		for (const { userId, nameEl } of cached) {
			applyLabels(nameEl, infoCache.get(userId) ?? null);
		}
		if (cached.length) sendMessage("registerBootstrapElements");

		const toFetchList = [...toFetch.values()];
		for (let i = 0; i < toFetchList.length; i += 5) {
			const chunk = toFetchList.slice(i, i + 5);
			const result = await sendMessage("checkUserActivity", {
				userIds: chunk.map((c) => c.userId),
				days: inactiveDays,
			});
			if (!result.ok) continue;

			for (const { userId, nameEls } of chunk) {
				const info = result.data[String(userId)] ?? null;
				infoCache.set(userId, info);
				for (const nameEl of nameEls) applyLabels(nameEl, info);
			}

			sendMessage("registerBootstrapElements");
		}
	};

	processCards(Array.from(container.querySelectorAll(".card")));

	new MutationObserver((mutations) => {
		const added: Element[] = [];
		for (const m of mutations) {
			for (const node of m.addedNodes) {
				if (node instanceof Element) added.push(node);
			}
		}
		if (added.length) processCards(added);
	}).observe(container, { childList: true });
}

export function creatorCommentLabels(
	creatorId: number,
	showDisclosures: boolean,
) {
	const container = document.getElementById("comments");
	if (!container) return;

	const tag = (Card: Element): void => {
		const usernameElement = Card.querySelector<HTMLAnchorElement>(
			'.text-reset[href^="/users/"]',
		);
		if (!usernameElement) return;

		if (
			usernameElement.getAttribute("href")?.split("/")[2] !=
			creatorId.toString()
		)
			return;

		const badge = document.createElement("span");
		badge.classList.add("badge", "bg-primary");
		badge.style.marginLeft = "5px";
		badge.style.verticalAlign = "text-top";
		badge.innerText = "CREATOR";

		badge.setAttribute("data-bs-toggle", "tooltip");
		badge.setAttribute("data-bs-title", "This user created this item.");

		usernameElement.appendChild(badge);
		if (showDisclosures)
			usernameElement.appendChild(createKilnDisclosureBadge());
		sendMessage("registerBootstrapElements");
	};

	Array.from(container.children).forEach(tag);

	new MutationObserver((Records) => {
		for (const Record of Records)
			for (const Node of Record.addedNodes)
				if (Node instanceof Element && Node.classList.contains("card"))
					tag(Node);
	}).observe(container, { attributes: false, childList: true, subtree: false });
}

export function legacyStoreLayout(showDisclosures: boolean): Promise<void> {
	if (!location.pathname.match(/^\/store\/\d+/)) return Promise.resolve();

	function esc(str: unknown): string {
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function el(tag: string, cls?: string, html?: string): HTMLElement {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (html !== undefined) e.innerHTML = html;
		return e;
	}

	function waitFor(
		sel: string,
		root?: Element | null,
		timeout?: number,
	): Promise<Element> {
		const r = root ?? document.body;
		const t = timeout ?? 10000;
		return new Promise((resolve, reject) => {
			const hit = r.querySelector(sel);
			if (hit) return resolve(hit);
			const obs = new MutationObserver(() => {
				const hit = r.querySelector(sel);
				if (hit) {
					obs.disconnect();
					resolve(hit);
				}
			});
			obs.observe(r, { childList: true, subtree: true });
			setTimeout(() => {
				obs.disconnect();
				reject(new Error(`waitFor: ${sel}`));
			}, t);
		});
	}

	function decodeDataOptions(encoded: string): Record<string, unknown> | null {
		try {
			const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
			return JSON.parse(decodeURIComponent(atob(b64)));
		} catch {
			return null;
		}
	}

	function getLoggedInUsername(): string | null {
		const trigger = document.querySelector("#navbar-dark-dropdown-menu-link");
		if (!trigger) return null;
		const menu = trigger.nextElementSibling;
		if (!menu) return null;
		const span = menu.querySelector('[class*="userlink-"]');
		return span ? (span.textContent?.trim() ?? null) : null;
	}

	async function applyOldLayout(): Promise<void> {
		try {
			await waitFor(".item-hero");
		} catch {
			return;
		}

		const hero = document.querySelector(".item-hero") as HTMLElement | null;
		const mainCont = hero?.nextElementSibling as HTMLElement | null;
		if (!hero || !mainCont) return;

		const imgEl = hero.querySelector<HTMLElement>(
			"#store-thumbnail, .item-image",
		);
		const canvasEl = hero.querySelector<HTMLElement>("#canvas");
		const avatarBtn = hero.querySelector<HTMLElement>(".previewAvatarToggler");
		const view3DBtn = hero.querySelector<HTMLElement>(
			'[class*="3dviewtoggler"]',
		);

		const canvasOpts = canvasEl
			? decodeDataOptions(canvasEl.getAttribute("data-options") ?? "")
			: null;

		const titleRowEl = mainCont.querySelector(
			".d-flex.align-items-center.justify-content-between",
		);
		const titleEl = titleRowEl?.querySelector<HTMLElement>("h1") ?? null;
		const favBtnNew =
			titleRowEl?.querySelector<HTMLElement>("#favorite-btn") ?? null;
		const dropdownDiv =
			titleRowEl?.querySelector<HTMLElement>(".dropdown") ?? null;

		const badgeRow = mainCont.querySelector<HTMLElement>(
			"h6.text-muted.text-uppercase",
		);

		const creatorRow = mainCont.querySelector(".px-4.px-lg-0.row.mb-3");
		let creatorNameEl: HTMLElement | null = null;
		let creatorImgEl: HTMLElement | null = null;
		let creatorHref: string | null = null;
		let uploaderEl: HTMLElement | null = null;
		let designerEl: HTMLElement | null = null;
		let allBuyBtns: HTMLElement[] = [];
		let sectionDivEl: HTMLElement | null = null;

		if (creatorRow) {
			const nameCol = creatorRow.querySelector(".col-12.col-md-3");
			if (nameCol) {
				creatorImgEl = nameCol.querySelector("img");
				creatorNameEl = nameCol.querySelector("h5");
				const anchor = nameCol.querySelector("a");
				if (anchor) creatorHref = anchor.getAttribute("href");

				nameCol
					.querySelectorAll<HTMLElement>("i.text-muted.small")
					.forEach((i) => {
						if (/Uploaded by/i.test(i.textContent ?? "")) uploaderEl = i;
						if (/Designed by/i.test(i.textContent ?? "")) designerEl = i;
					});
			}
			const btnCol = creatorRow.querySelector(".col-12.col-md-9");
			if (btnCol) {
				allBuyBtns = Array.from(
					btnCol.querySelectorAll<HTMLElement>("button, a.btn"),
				);
				sectionDivEl = btnCol.querySelector(".section-div");
			}
		}

		const highestBuyEl = mainCont.querySelector<HTMLElement>(
			".text-success.fw-semibold.small",
		);

		let stockP: HTMLElement | null = null;
		mainCont.querySelectorAll<HTMLElement>("p.text-danger").forEach((p) => {
			if (!stockP && p.querySelector(".fa-boxes-stacked")) stockP = p;
		});

		const timerP = mainCont.querySelector<HTMLElement>(
			"p.text-danger.fw-semibold",
		);
		const timerScript =
			timerP?.nextElementSibling?.tagName === "SCRIPT" &&
			(timerP.nextElementSibling as HTMLElement).textContent?.includes("timer")
				? (timerP.nextElementSibling as HTMLElement)
				: null;

		const aboutCard = mainCont.querySelector<HTMLElement>(".mcard.card.mb-4");

		let statsRow: HTMLElement | null = null;
		mainCont.querySelectorAll<HTMLElement>(".row").forEach((r) => {
			if (
				!statsRow &&
				r.querySelectorAll(":scope > .col.text-center").length >= 2
			)
				statsRow = r;
		});

		let priceHistRow: HTMLElement | null = null;
		mainCont.querySelectorAll(".section-title").forEach((e) => {
			if (e.textContent?.trim() === "Price History")
				priceHistRow = (e.closest(".row") ?? e.parentElement) as HTMLElement;
		});

		const tabPanel = mainCont.querySelector<HTMLElement>(".col-lg-7");

		let commentsRow: HTMLElement | null = null;
		mainCont.querySelectorAll(".section-title").forEach((e) => {
			if (e.textContent?.trim() === "Comments")
				commentsRow = (e.closest(".row") ??
					e.parentElement?.closest(".row")) as HTMLElement;
		});

		const badgeText = badgeRow?.textContent?.toLowerCase() ?? "";
		const isCollectible = !!badgeRow?.querySelector(".badge.bg-danger");
		const isAudio = badgeText.includes("audio");
		const isTheme = badgeText.includes("theme");

		let audioUrl: string | null = null;
		if (isAudio && canvasOpts && Array.isArray(canvasOpts.items)) {
			audioUrl =
				(canvasOpts.items as unknown[]).find(
					(u): u is string => typeof u === "string" && u.endsWith(".mp3"),
				) ?? null;
		}

		const storeItemId =
			(location.pathname.match(/\/store\/(\d+)/) ?? [])[1] ?? null;

		hero.remove();
		while (mainCont.firstChild) mainCont.removeChild(mainCont.firstChild);
		mainCont.className = "container p-0 p-lg-5";
		mainCont.style.maxWidth = "1300px";

		const pageTitleText =
			titleEl?.textContent?.trim() ||
			document.title.replace(" - Polytoria", "").trim();

		mainCont.appendChild(
			el(
				"div",
				"row mt-3 px-2 mt-lg-0",
				`
            <div class="col-auto">
                <nav aria-label="breadcrumb">
                    <ol class="breadcrumb">
                        <li class="breadcrumb-item">
                            <a class="text-muted" href="/store">Store</a>
                        </li>
                        <li class="breadcrumb-item active" aria-current="page">
                            <span class="text-light">${esc(pageTitleText)}</span>${kilnDisclosureBadgeHtml(showDisclosures)}
                        </li>
                    </ol>
                </nav>
            </div>`,
			),
		);
		mainCont.appendChild(el("hr", "mb-5 mt-0"));

		const mainRow = el("div", "row justify-content-center");
		mainCont.appendChild(mainRow);

		const leftCol = el("div", "d-none d-lg-block col-12 col-lg-5 mb-5");
		const cardDiv = el("div", isCollectible ? "card asset-limited" : "card");
		if (isCollectible) {
			cardDiv.insertAdjacentHTML(
				"afterbegin",
				'<div class="asset-limited-triangle"><i class="fas fa-star asset-border-icon"></i></div>',
			);
		}
		const cardBody = el("div", "card-body p-3");
		cardDiv.appendChild(cardBody);
		leftCol.appendChild(cardDiv);

		const thumbWrap = el("div", "pol-thumb-wrap");

		if (imgEl) {
			imgEl.className = "store-thumbnail rounded-3";
			imgEl.removeAttribute("id");
			if (isAudio) imgEl.style.display = "none";
			thumbWrap.appendChild(imgEl);
		}

		if (isAudio && audioUrl) {
			const audioEl = document.createElement("audio");
			audioEl.id = "pol-audio-player";
			audioEl.controls = true;
			audioEl.innerHTML = `<source src="${esc(audioUrl)}" type="audio/mpeg">`;
			const audioWrap = el("div", "pol-audio-wrap");
			audioWrap.appendChild(audioEl);
			thumbWrap.appendChild(audioWrap);
		}

		if (canvasEl) {
			canvasEl.style.cssText =
				"width:100%;height:auto;aspect-ratio:1;border-radius:10px;";
			thumbWrap.appendChild(canvasEl);
		}
		if (avatarBtn) {
			avatarBtn.style.cssText =
				"display:none;position:absolute;bottom:30px;right:10px;width:60px";
			thumbWrap.appendChild(avatarBtn);
		}
		if (view3DBtn) {
			view3DBtn.style.cssText =
				"position:absolute;bottom:15px;right:10px;width:60px;z-index:5";
			thumbWrap.appendChild(view3DBtn);
		}

		cardBody.appendChild(thumbWrap);
		mainRow.appendChild(leftCol);

		if (favBtnNew) {
			favBtnNew.className = "btn btn-sm btn-outline-warning mt-2";
			favBtnNew.id = "favorite-btn";
			leftCol.appendChild(favBtnNew);
		}

		const rightCol = el("div", "col col-md-9 col-lg-7 text-lg-end");
		mainRow.appendChild(rightCol);

		const titleRowDiv = el("div", "row px-4 px-lg-0 align-items-center");
		const titleColDiv = el("div", "col");
		titleRowDiv.appendChild(titleColDiv);
		if (titleEl) {
			titleEl.className = "mb-1 pol-item-title";
			titleColDiv.appendChild(titleEl);
		}
		if (dropdownDiv) {
			const dropWrap = el("div", "col-auto align-self-start pt-1");
			dropWrap.appendChild(dropdownDiv);
			titleRowDiv.appendChild(dropWrap);
		}
		rightCol.appendChild(titleRowDiv);

		if (badgeRow) {
			badgeRow.className = "px-4 px-lg-0 text-muted text-uppercase mb-3";
			rightCol.appendChild(badgeRow);
		}

		if (creatorNameEl || creatorHref) {
			const creditRow = el("div", "px-4 px-lg-0 row mb-3");
			const nameCol = el("div", "col my-auto");

			if (creatorNameEl) {
				const h5 = document.createElement("h5");
				const clone = creatorNameEl.cloneNode(true) as HTMLElement;
				clone.querySelectorAll("img").forEach((i) => {
					i.remove();
				});
				h5.innerHTML = clone.innerHTML;
				nameCol.appendChild(h5);
			}
			if (uploaderEl)
				nameCol.appendChild((uploaderEl as HTMLElement).cloneNode(true));
			if (designerEl)
				nameCol.appendChild((designerEl as HTMLElement).cloneNode(true));

			const imgCol = el("div", "col-auto");
			if (creatorImgEl && creatorHref) {
				const anchor = document.createElement("a");
				anchor.href = creatorHref;
				const imgClone = creatorImgEl.cloneNode(true) as HTMLImageElement;
				imgClone.width = 64;
				imgClone.className =
					"img-fluid border border-2 border-secondary rounded-circle";
				anchor.appendChild(imgClone);
				imgCol.appendChild(anchor);
			}

			creditRow.appendChild(nameCol);
			creditRow.appendChild(imgCol);
			rightCol.appendChild(creditRow);
		}

		const buyOuter = el(
			"div",
			"row justify-content-center justify-content-lg-end",
		);
		const buyInner = el("div", "col-12 col-lg-10");
		buyOuter.appendChild(buyInner);

		if (allBuyBtns.length > 0) {
			const btnFlex = el("div", "d-flex");
			btnFlex.appendChild(el("div", "flex-grow-1 d-none d-lg-block"));
			const btnGrid = el("div", "flex-grow-1 d-grid gap-2 mb-4 px-2 px-lg-0");

			allBuyBtns.forEach((btn, i) => {
				if (sectionDivEl && i > 0 && !btnGrid.contains(sectionDivEl))
					btnGrid.appendChild(sectionDivEl);

				btn
					.querySelectorAll<HTMLElement>(".d-none.d-sm-inline, .d-sm-inline")
					.forEach((span) => {
						span.classList.remove("d-none", "d-sm-inline");
						span.style.display = "inline";
					});

				btnGrid.appendChild(btn);
			});

			btnFlex.appendChild(btnGrid);
			buyInner.appendChild(btnFlex);
		}

		if (highestBuyEl) {
			highestBuyEl.style.cssText = "margin-top:-1em;opacity:.8;";
			buyInner.appendChild(highestBuyEl);
		}

		if (stockP) buyInner.appendChild(stockP);
		if (timerP) {
			buyInner.appendChild(timerP);
			if (timerScript) buyInner.appendChild(timerScript);
		}

		const mobileImgDiv = el("div", "d-block d-lg-none col-12 col-lg-5 mb-5");
		const mobileCard = el(
			"div",
			isCollectible ? "mcard card asset-limited" : "mcard card",
		);
		if (isCollectible) {
			mobileCard.insertAdjacentHTML(
				"afterbegin",
				'<div class="asset-limited-triangle"><i class="fas fa-star asset-border-icon"></i></div>',
			);
		}
		const mobileCardBody = el("div", "card-body p-3");
		const mobileInner = el("div", "mx-auto");
		mobileInner.style.maxWidth = "50%";
		if (imgEl && !isAudio) {
			const mWrap = el("div");
			mWrap.style.cssText = "width:100%;height:100%;position:relative";
			const imgClone = imgEl.cloneNode(true) as HTMLElement;
			imgClone.className = "store-thumbnail rounded-3";
			mWrap.appendChild(imgClone);
			mobileInner.appendChild(mWrap);
		}
		mobileCardBody.appendChild(mobileInner);
		mobileCard.appendChild(mobileCardBody);
		mobileImgDiv.appendChild(mobileCard);

		const mobileFavBtn = document.createElement("button");
		mobileFavBtn.id = "favorite-btn-mobile";
		mobileFavBtn.className =
			"btn btn-outline-warning d-flex align-items-center justify-content-center w-100 mt-3";
		mobileFavBtn.setAttribute("onclick", "toggleFavorite()");
		const isFavInit = favBtnNew?.dataset.favorited === "true";
		const favCountTxt =
			favBtnNew?.querySelector("#favorite-text")?.textContent?.trim() ?? "0";
		mobileFavBtn.setAttribute("data-favorited", isFavInit ? "true" : "false");
		mobileFavBtn.innerHTML = `<i class="fas fa-star"></i><span class="ms-2">${
			isFavInit ? "Favorited" : "Favorite"
		} (${esc(favCountTxt)})</span>`;
		if (isFavInit)
			mobileFavBtn.classList.replace("btn-outline-warning", "btn-warning");

		mobileImgDiv.appendChild(mobileFavBtn);
		buyInner.appendChild(mobileImgDiv);

		if (aboutCard) buyInner.appendChild(aboutCard);

		if (isTheme && storeItemId) {
			const loggedInUser = getLoggedInUsername();
			if (loggedInUser) {
				const previewWrap = el("div", "mb-3 px-2 px-lg-0");
				const previewBtn = document.createElement("a");
				previewBtn.className = "btn btn-outline-secondary w-100";
				previewBtn.href = `https://polytoria.com/u/${encodeURIComponent(loggedInUser)}?previewThemeId=${storeItemId}`;
				previewBtn.target = "_blank";
				previewBtn.rel = "noopener noreferrer";
				previewBtn.innerHTML =
					'<i class="fad fa-eye me-1"></i> Preview this theme';
				previewWrap.appendChild(previewBtn);
				buyInner.appendChild(previewWrap);
			}
		}

		if (statsRow) buyInner.appendChild(statsRow);
		rightCol.appendChild(buyOuter);

		if (priceHistRow) {
			const phRow = el("div", "row mt-2");
			const phCol = el("div", "col");
			phRow.appendChild(phCol);
			const phTitle = (priceHistRow as HTMLElement).querySelector(
				".section-title",
			);
			if (phTitle) phCol.appendChild(phTitle);
			const phCard = (priceHistRow as HTMLElement).querySelector<HTMLElement>(
				".mcard.card, .card",
			);
			if (phCard) phCol.appendChild(phCard);
			mainCont.appendChild(phRow);
		}

		const bottomRow = el("div", "row mt-4");
		mainCont.appendChild(bottomRow);

		if (commentsRow) {
			const commentsCol = el("div", "col-lg-5");
			const cTitle = (commentsRow as HTMLElement).querySelector(
				".section-title",
			);
			if (cTitle) commentsCol.appendChild(cTitle);
			(commentsRow as HTMLElement)
				.querySelectorAll(
					".mcard.card, #comments, #no-comments, #comments-pagination",
				)
				.forEach((e) => {
					commentsCol.appendChild(e);
				});
			bottomRow.appendChild(commentsCol);
		}

		if (tabPanel) {
			tabPanel.className = "col-lg-7 mt-4 mt-lg-0";
			bottomRow.appendChild(tabPanel);
			enforceTabState(tabPanel);
		}

		setup3DToggle(canvasEl, imgEl, view3DBtn);
		syncFavState();
		injectStyles();
	}

	function enforceTabState(tabPanel: HTMLElement): void {
		const apply = () => {
			const container = tabPanel.querySelector("#resellers")?.parentElement;
			if (!container) return;
			Array.from(container.children).forEach((panel, i) => {
				panel.classList.toggle("d-none", i !== 0);
			});
		};
		apply();
		setTimeout(apply, 0);
		window.addEventListener("load", apply, { once: true });
	}

	function setup3DToggle(
		canvasEl: HTMLElement | null,
		imgEl: HTMLElement | null,
		toggleBtn: HTMLElement | null,
	): void {
		if (!toggleBtn || !canvasEl) return;
		toggleBtn.removeAttribute("onclick");

		toggleBtn.addEventListener("click", function () {
			const icon = (this as HTMLElement).querySelector<HTMLElement>(
				".toggleIcn",
			);
			const showing3D = !canvasEl.classList.contains("d-none");

			if (showing3D) {
				canvasEl.classList.add("d-none");
				if (imgEl) imgEl.style.removeProperty("display");
				if (icon) {
					icon.classList.remove("fa-image");
					icon.classList.add("fa-360-degrees");
				}
			} else {
				if (imgEl) imgEl.style.display = "none";
				canvasEl.classList.remove("d-none");
				if (icon) {
					icon.classList.remove("fa-360-degrees");
					icon.classList.add("fa-image");
				}

				const c = canvasEl as HTMLElement & {
					_itemview?: unknown;
					_initAttempted?: boolean;
				};
				if (!c._itemview && !c._initAttempted) {
					c._initAttempted = true;
					const w = window as Window & {
						initItemView?: (el: HTMLElement) => void;
						ItemView?: new (el: HTMLElement) => unknown;
					};
					if (typeof w.initItemView === "function") {
						w.initItemView(canvasEl);
					} else if (typeof w.ItemView === "function") {
						try {
							new w.ItemView(canvasEl);
						} catch {}
					} else {
						const src = (
							document.querySelector(
								'script[src*="itemview"]',
							) as HTMLScriptElement | null
						)?.src;
						if (src) {
							const s = document.createElement("script");
							s.src = src;
							document.head.appendChild(s);
						}
					}
				}
			}
		});
	}

	function syncFavState(): void {
		const desktopBtn = document.querySelector<HTMLElement>("#favorite-btn");
		const mobileBtn = document.querySelector<HTMLElement>(
			"#favorite-btn-mobile",
		);
		if (!desktopBtn) return;
		const isFav = desktopBtn.dataset.favorited === "true";
		[desktopBtn, mobileBtn].forEach((btn) => {
			if (!btn) return;
			btn.classList.toggle("btn-warning", isFav);
			btn.classList.toggle("btn-outline-warning", !isFav);
		});
	}

	function injectStyles(): void {
		if (document.getElementById("pol-old-layout-css")) return;
		const style = document.createElement("style");
		style.id = "pol-old-layout-css";
		style.textContent = `
            .item-hero { display: none !important; }
            .store-thumbnail { width: 100%; height: auto; display: block; }
            .pol-thumb-wrap { width: 100%; position: relative; }
            .card .card-body { overflow: hidden; }
            .pol-item-title {
                overflow-wrap: break-word;
                word-break: break-word;
                hyphens: auto;
                white-space: normal;
            }
            .flex-grow-1.d-grid .btn,
            .flex-grow-1.d-grid a.btn { width: 100%; }
            .section-div {
                text-align: center;
                color: var(--bs-secondary-color, #888);
                font-size: .85rem;
                margin: 2px 0;
            }
            #favorite-btn-mobile { width: 100%; }
            .pol-audio-wrap {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                aspect-ratio: 1;
                padding: 24px;
                box-sizing: border-box;
            }
            #pol-audio-player { width: 100%; }
            #resellers-container .btn span,
            #buy-requests .btn span,
            #owners-container .btn span { display: inline !important; }
        `;
		document.head.appendChild(style);
	}

	if (document.readyState === "loading") {
		return new Promise<void>((resolve) => {
			document.addEventListener("DOMContentLoaded", () => {
				applyOldLayout().then(resolve);
			});
		});
	}
	return applyOldLayout();
}

export async function recentTransactions(showDisclosures: boolean) {
	if (document.getElementById("resellers") === null) {
		return;
	}

	const tabs = document.getElementById("store-tabs")!;
	let tabs2 = document.getElementById("store-tabs-2");
	if (!tabs2) {
		tabs2 = document.createElement("ul");
		tabs2.id = "store-tabs-2";
		tabs2.className = tabs.className;
		tabs2.style.marginTop = "-0.5rem";
		tabs.after(tabs2);
	}

	const tab = document.createElement("li");
	tab.classList.add("nav-item");
	tab.innerHTML = `
<a class="nav-link">
	<i class="fas fa-history me-1"></i>
	<span class="d-none d-sm-inline">Recent Transactions${kilnDisclosureBadgeHtml(showDisclosures)}</span>
</a>
`;
	tabs2.appendChild(tab);

	const tabContent = document.createElement("div");
	tabContent.classList.add("d-none");
	tabContent.innerHTML = `
	<small class="d-block text-center text-muted" style="font-size: 0.8rem;">
		Loading... (this may take a few seconds)
	</small>
	<lottie-player src="https://cdn.polytoria.com/static/images/lottie/poly-brick-loading.2b51aa85.json" background="transparent" speed="1" style="width: 20%;height: auto;margin: -16px auto 50px;margin-top: 0px;" loop="" autoplay=""></lottie-player>
	`;
	document.getElementById("owners")!.parentElement!.appendChild(tabContent);

	for (const t of Array.from([...tabs.children, ...tabs2.children])) {
		(t as HTMLElement).addEventListener("click", () => {
			if (t === tab) {
				for (const t2 of Array.from([...tabs.children, ...tabs2.children])) {
					t2.children[0]?.classList.remove("active");
				}
				for (const t2 of Array.from(
					document.getElementById("owners")!.parentElement!.children,
				)) {
					t2.classList.add("d-none");
				}
				t.children[0].classList.add("active");
				tabContent.classList.remove("d-none");
			} else {
				tab.children[0]?.classList.remove("active");
				tabContent.classList.add("d-none");
			}
		});
	}

	let fetched = false;
	tab.addEventListener("click", async () => {
		if (fetched) return;
		fetched = true;

		const ownerHistoryData = await sendMessage("getItemOwnerHistory", +itemID);
		if (!ownerHistoryData.ok) {
			tabContent.innerHTML = `<div class="text-center p-2"><p class="text-muted mb-0">Sorry! This feature is currently unavailable. Please check back later!</p></div>`;
			return;
		}

		const entries = ownerHistoryData.data
			.flatMap((batch) => batch.result.data)
			.sort((a, b) => b.created_at - a.created_at)
			.slice(0, 5);

		if (entries.length === 0) {
			tabContent.innerHTML = `
			<div class="card mb-3">
				<div class="card-body text-center py-5 text-muted">
					<h1 class="display-3"><i class="fa-solid fa-clock-rotate-left"></i></h1>
					<h5>No transactions</h5>
					<p class="mb-0">This item has no ownership history yet.</p>
				</div>
			</div>
			<small class="text-muted text-center mt-1 mb-3 d-block" style="font-size: 0.7rem;">feature of Kiln</small>
			`;
			return;
		}

		tabContent.innerHTML = `
		<div id="p-oh-container">
			${entries
				.map((entry) => {
					const date = new Date(entry.created_at);
					const dateStr = date.toLocaleDateString(undefined, {
						year: "numeric",
						month: "short",
						day: "numeric",
					});
					const timeStr = date.toLocaleTimeString(undefined, {
						hour: "2-digit",
						minute: "2-digit",
					});

					return `
					<div class="card mb-3">
						<div class="card-body">
							<div class="row">
								<div class="col d-flex align-items-center">
									<div>
										<h6 class="mb-1">
											<a class="text-reset" href="/u/${entry.username}">${entry.username}</a>
											${entry.isFirst ? `<span class="badge bg-warning text-dark ms-1" data-bs-toggle="tooltip" data-bs-title="Original owner"><i class="fa-solid fa-star me-1"></i>Original</span>` : ""}
										</h6>
										<small class="text-muted">Serial #${entry.serial}</small>
									</div>
								</div>
								<div class="col-auto d-flex align-items-center">
									<div class="text-end me-3">
										<small class="text-muted d-block">${dateStr}</small>
										<small class="text-muted d-block">${timeStr}</small>
									</div>
									<a class="btn btn-warning" href="/trade/new/${entry.userId}">
										<i class="fad fa-exchange-alt me-1"></i>
										<span class="d-none d-sm-inline">Trade</span>
									</a>
								</div>
							</div>
						</div>
					</div>
					`;
				})
				.join("")}
		</div>
		<small class="text-muted text-center mt-1 mb-3 d-block" style="font-size: 0.7rem;">feature of Kiln</small>
		`;

		sendMessage("registerBootstrapElements");
	});
}
