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

import sadFace from "@/assets/sad-face.webp";
import { _seenTradeIds } from "@/utils/storage";
import type { UserDetails } from "@/utils/types";
import {
	applyKilnDisclosureTitle,
	createModal,
	kilnDisclosureBadgeHtml,
	parseTrade,
} from "@/utils/utilities";

export async function quickCancelOutboundTrades(showDisclosures: boolean) {
	const container = document.querySelector(".col:has(.card-inbox)");
	if (!container) return;
	const cards = container.querySelectorAll(".card-inbox");

	for (const card of cards) {
		const viewBtn = card.getElementsByClassName(
			"btn",
		)[0] as unknown as HTMLLinkElement;
		const tradeId = +new URL(viewBtn.href).pathname.split("/")[3];

		const cancelBtn = document.createElement("button");
		cancelBtn.classList.add("btn", "btn-danger", "px-4", "me-2");
		cancelBtn.innerHTML = `Cancel${kilnDisclosureBadgeHtml(showDisclosures)}`;

		cancelBtn.addEventListener("click", async () => {
			cancelBtn.disabled = true;
			const result = await sendMessage("rejectTrade", tradeId);
			if (result.ok) {
				(card as HTMLElement).style.opacity = "0.5";
			} else {
				cancelBtn.disabled = false;
			}
		});

		viewBtn.parentElement!.prepend(cancelBtn);
	}
}

export async function quickCounterTrades(showDisclosures: boolean) {
	const container = document.querySelector(".col:has(.card-inbox)");
	if (!container) return;
	const cards = container.querySelectorAll(".card-inbox");

	for (const card of cards) {
		const viewBtn = card.getElementsByClassName(
			"btn",
		)[0] as unknown as HTMLLinkElement;
		const tradeId = +new URL(viewBtn.href).pathname.split("/")[3];

		const counterBtn = document.createElement("button");
		counterBtn.classList.add("btn", "btn-success", "px-4", "me-2");
		counterBtn.innerHTML = `Counter${kilnDisclosureBadgeHtml(showDisclosures)}`;

		const userId = +new URL(
			(card.querySelector('a[href^="/users/"]')! as HTMLLinkElement).href,
		).pathname.split("/")[2];

		counterBtn.addEventListener("click", async () => {
			counterBtn.disabled = true;
			const result = await sendMessage("rejectTrade", tradeId);
			if (result.ok) {
				window.location.pathname = `/trade/new/${userId}`;
			} else {
				counterBtn.disabled = false;
			}
		});

		viewBtn.parentElement!.prepend(counterBtn);
	}
}

export async function nftItems(user: UserDetails, showDisclosures: boolean) {
	const FETCH_DELAY_MS = 500;

	const container = document.querySelector(".col:has(.card-inbox)")!;

	const nftEntries = await sendMessage("getNFTItems", user.userId);
	if (!nftEntries.ok) return;

	const nftItems = nftEntries.data.data;

	const seenIds = new Set(await _seenTradeIds.getValue());

	function parseTradeCards(): Map<number, Element> {
		const cards = container.querySelectorAll(".card-inbox");
		const tradeMap = new Map<number, Element>();

		for (const card of cards) {
			const viewLink = card.querySelector<HTMLAnchorElement>(
				'a[href^="/trade/view/"]',
			);
			if (!viewLink) continue;

			const tradeId = parseInt(viewLink.href.split("/").at(-1)!, 10);
			if (!Number.isNaN(tradeId)) tradeMap.set(tradeId, card);
		}

		return tradeMap;
	}

	function injectBadge(
		card: Element,
		state: "checking" | "clear" | "rejected" | "failed",
	) {
		const existing = card.querySelector(".kiln-nft-badge");
		if (existing) existing.remove();
		if (state === "clear") return;

		const badge = document.createElement("span");
		badge.className = "kiln-nft-badge badge ms-2";

		switch (state) {
			case "checking":
				badge.classList.add("bg-secondary");
				badge.textContent = "⚙ Kiln checking...";
				break;
			case "rejected":
				badge.classList.add("bg-danger");
				badge.textContent = "⛔ Auto-rejected";
				badge.setAttribute("data-bs-toggle", "tooltip");
				badge.setAttribute(
					"data-bs-title",
					showDisclosures
						? "Includes an item marked Not for Trade (This is a Kiln extension feature, not part of Polytoria.)"
						: "Includes an item marked Not for Trade",
				);
				break;
			case "failed":
				badge.classList.add("bg-warning", "text-dark");
				badge.textContent = "⚠ Could not reject";
				applyKilnDisclosureTitle(badge, showDisclosures);
				break;
			default:
				break;
		}

		card.querySelector("h6")?.appendChild(badge);
		if (state === "rejected") sendMessage("registerBootstrapElements");
	}

	async function fetchTradeItemIds(tradeId: number) {
		const res = await fetch(`/trade/view/${tradeId}`);
		const html = await res.text();
		const doc = new DOMParser().parseFromString(html, "text/html");

		const trade = parseTrade(doc);
		const myIndex = trade.sides.findIndex(
			(s) => s.username.toLowerCase() === user.username.toLowerCase(),
		);
		const yourIndex: 0 | 1 = myIndex !== -1 ? (myIndex as 0 | 1) : 1;
		const theirIndex: 0 | 1 = yourIndex === 0 ? 1 : 0;

		return {
			giving: trade.sides[yourIndex].items.map((item) => ({
				itemId: item.storeId,
				serial: item.serial,
			})),
			receiving: trade.sides[theirIndex].items.map((item) => ({
				itemId: item.storeId,
				serial: item.serial,
			})),
		};
	}

	function getOfferingHashes(card: Element): string[] {
		const previews = card.querySelectorAll(".trd-items-preview");
		const offeringSide = previews[1];
		if (!offeringSide) return [];

		return Array.from(offeringSide.querySelectorAll("img"))
			.map((img) => {
				const src = img.src;
				if (!src.includes("cdn.polytoria.com")) return null;
				const filename = src.split("/").pop()!;
				return filename.replace(".png", "");
			})
			.filter((h): h is string => h !== null);
	}

	function isNFTHit(
		items: { itemId: number; serial: number | null }[],
	): boolean {
		for (const { itemId, serial } of items) {
			const entry = nftItems.find((e) => e.itemId === itemId);
			if (!entry) continue;
			if (entry.serials === null) return true;
			if (serial !== null && (entry.serials as number[]).includes(serial))
				return true;
		}
		return false;
	}

	async function processTradeCard(
		tradeId: number,
		card: Element,
	): Promise<"clear" | "rejected" | "failed"> {
		injectBadge(card, "checking");

		try {
			const hashes = getOfferingHashes(card);
			const resolved = await sendMessage("resolveItemThumbnails", hashes);
			if (!resolved.ok) {
				injectBadge(card, "failed");
				return "failed";
			}
			const hashToId = resolved.data.data;
			const itemIds = Object.values(hashToId);

			const hasWholeItemHit = itemIds.some((itemId) =>
				nftItems.some((e) => e.itemId === itemId && e.serials === null),
			);

			if (hasWholeItemHit) {
				const result = await sendMessage("rejectTrade", tradeId);
				injectBadge(card, result.ok ? "rejected" : "failed");
				return result.ok ? "rejected" : "failed";
			}

			const hasSerialCandidates = itemIds.some((itemId) =>
				nftItems.some((e) => e.itemId === itemId && e.serials !== null),
			);

			if (!hasSerialCandidates) {
				injectBadge(card, "clear");
				return "clear";
			}

			const { giving } = await fetchTradeItemIds(tradeId);

			if (!isNFTHit(giving)) {
				injectBadge(card, "clear");
				return "clear";
			}

			const result = await sendMessage("rejectTrade", tradeId);
			injectBadge(card, result.ok ? "rejected" : "failed");
			return result.ok ? "rejected" : "failed";
		} catch {
			injectBadge(card, "failed");
			return "failed";
		}
	}

	function delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function runBatch(
		entries: [number, Element][],
	): Promise<Map<number, "clear" | "rejected" | "failed">> {
		const results = new Map<number, "clear" | "rejected" | "failed">();
		for (let i = 0; i < entries.length; i++) {
			if (i > 0) await delay(FETCH_DELAY_MS);
			const [id, card] = entries[i];
			results.set(id, await processTradeCard(id, card));
		}
		return results;
	}

	const tradeMap = parseTradeCards();
	const unseen = [...tradeMap.entries()].filter(([id]) => !seenIds.has(id));

	if (!unseen.length) return;

	for (const [, card] of unseen) injectBadge(card, "checking");

	const results = await runBatch(unseen);
	const successfullyScreened = [...results.entries()]
		.filter(([, status]) => status !== "failed")
		.map(([id]) => id);

	const updated = [...seenIds, ...successfullyScreened];
	await _seenTradeIds.setValue(updated.slice(-500));
}

export async function nlfItems(user: UserDetails, showDisclosures: boolean) {
	const FETCH_DELAY_MS = 500;

	const nlfResult = await sendMessage("getNLFItems", user.userId);
	if (!nlfResult.ok) return;

	const nlfIds = new Set(nlfResult.data.data);
	if (!nlfIds.size) return;

	const container = document.querySelector(".col:has(.card-inbox)");
	if (!container) return;

	function injectBadge(
		card: Element,
		state: "checking" | "rejected" | "failed",
	) {
		const existing = card.querySelector(".kiln-nlf-badge");
		if (existing) existing.remove();

		const badge = document.createElement("span");
		badge.className = "kiln-nlf-badge badge ms-2";

		switch (state) {
			case "checking":
				badge.classList.add("bg-secondary");
				badge.textContent = "⚙ Kiln checking...";
				break;
			case "rejected":
				badge.classList.add("bg-danger");
				badge.textContent = "⛔ Auto-rejected";
				badge.setAttribute("data-bs-toggle", "tooltip");
				badge.setAttribute(
					"data-bs-title",
					showDisclosures
						? "Includes an item marked Not Looking For (This is a Kiln extension feature, not part of Polytoria.)"
						: "Includes an item marked Not Looking For",
				);
				break;
			case "failed":
				badge.classList.add("bg-warning", "text-dark");
				badge.textContent = "⚠ Could not reject";
				applyKilnDisclosureTitle(badge, showDisclosures);
				break;
		}

		card.querySelector("h6")?.appendChild(badge);
		if (state === "rejected") sendMessage("registerBootstrapElements");
	}

	function getReceivingHashes(card: Element): string[] {
		const receivingSide = card.querySelectorAll(".trd-items-preview")[0];
		if (!receivingSide) return [];

		return Array.from(receivingSide.querySelectorAll("img"))
			.map((img) => {
				if (!img.src.includes("cdn.polytoria.com")) return null;
				return img.src.split("/").pop()!.replace(".png", "");
			})
			.filter((h): h is string => h !== null);
	}

	const trades: Array<{ tradeId: number; card: Element; hashes: string[] }> =
		[];

	for (const card of container.querySelectorAll(".card-inbox")) {
		const viewLink = card.querySelector<HTMLAnchorElement>(
			'a[href^="/trade/view/"]',
		);
		if (!viewLink) continue;
		const tradeId = parseInt(viewLink.href.split("/").at(-1)!, 10);
		if (Number.isNaN(tradeId)) continue;

		const hashes = getReceivingHashes(card);
		if (hashes.length) trades.push({ tradeId, card, hashes });
	}

	const uniqueHashes = [...new Set(trades.flatMap((t) => t.hashes))];
	const hashToId: Record<string, number> = {};
	for (let i = 0; i < uniqueHashes.length; i += 100) {
		const resolved = await sendMessage(
			"resolveItemThumbnails",
			uniqueHashes.slice(i, i + 100),
		);
		if (!resolved.ok) continue;
		for (const [hash, itemId] of Object.entries(resolved.data.data)) {
			if (itemId !== null) hashToId[hash] = itemId;
		}
	}

	const toReject = trades.filter(({ hashes }) =>
		hashes.some((h) => nlfIds.has(hashToId[h])),
	);

	for (const { card } of toReject) injectBadge(card, "checking");

	for (let i = 0; i < toReject.length; i++) {
		if (i > 0)
			await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS));
		const { tradeId, card } = toReject[i];
		try {
			const result = await sendMessage("rejectTrade", tradeId);
			injectBadge(card, result.ok ? "rejected" : "failed");
		} catch {
			injectBadge(card, "failed");
		}
	}
}

export async function blockedTraders(
	user: UserDetails,
	showDisclosures: boolean,
) {
	const blockedResult = await sendMessage("getBlockedTraders", user.userId);
	if (!blockedResult.ok) return;

	const blockedIds = new Set(blockedResult.data.data);
	if (!blockedIds.size) return;

	const container = document.querySelector(".col:has(.card-inbox)");
	if (!container) return;

	function injectBadge(
		card: Element,
		state: "checking" | "rejected" | "failed",
	) {
		const existing = card.querySelector(".kiln-blocked-badge");
		if (existing) existing.remove();

		const badge = document.createElement("span");
		badge.className = "kiln-blocked-badge badge ms-2";

		switch (state) {
			case "checking":
				badge.classList.add("bg-secondary");
				badge.textContent = "⚙ Kiln checking...";
				break;
			case "rejected":
				badge.classList.add("bg-danger");
				badge.textContent = "⛔ Auto-rejected";
				badge.setAttribute("data-bs-toggle", "tooltip");
				badge.setAttribute(
					"data-bs-title",
					showDisclosures
						? "Sender is blocked from trading with you (This is a Kiln extension feature, not part of Polytoria.)"
						: "Sender is blocked from trading with you",
				);
				break;
			case "failed":
				badge.classList.add("bg-warning", "text-dark");
				badge.textContent = "⚠ Could not reject";
				applyKilnDisclosureTitle(badge, showDisclosures);
				break;
		}

		card.querySelector("h6")?.appendChild(badge);
		if (state === "rejected") sendMessage("registerBootstrapElements");
	}

	const cards = container.querySelectorAll(".card-inbox");

	const toReject: Array<{ tradeId: number; card: Element }> = [];

	for (const card of cards) {
		const viewLink = card.querySelector<HTMLAnchorElement>(
			'a[href^="/trade/view/"]',
		);
		if (!viewLink) continue;
		const tradeId = parseInt(viewLink.href.split("/").at(-1)!, 10);
		if (Number.isNaN(tradeId)) continue;

		const userLink =
			card.querySelector<HTMLAnchorElement>('a[href^="/users/"]');
		if (!userLink) continue;
		const senderId = parseInt(
			new URL(userLink.href).pathname.split("/")[2],
			10,
		);
		if (Number.isNaN(senderId) || !blockedIds.has(senderId)) continue;

		injectBadge(card, "checking");
		toReject.push({ tradeId, card });
	}

	for (let i = 0; i < toReject.length; i++) {
		if (i > 0) await new Promise((resolve) => setTimeout(resolve, 500));
		const { tradeId, card } = toReject[i];
		try {
			const result = await sendMessage("rejectTrade", tradeId);
			injectBadge(card, result.ok ? "rejected" : "failed");
		} catch {
			injectBadge(card, "failed");
		}
	}
}

export async function tradeManager(user: UserDetails) {
	const FETCH_DELAY_MS = 300;
	const MODAL_PAGE_SIZE = 10;

	interface ScrapedTrade {
		tradeId: number;
		userId: number;
		username: string;
		userHref: string;
		giving: string[];
		receiving: string[];
		relativeDate: string;
		tradeType: "inbound" | "outbound" | "inactive" | "completed";
		value?: number | null;
	}

	function delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function escapeHtml(str: string): string {
		return str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}

	function getMaxPages(doc: Document): number {
		const links = doc.querySelectorAll<HTMLAnchorElement>(
			".pagination .page-link",
		);
		let max = 1;
		for (const link of links) {
			const url = new URL(link.href, location.origin);
			const page = parseInt(url.searchParams.get("page") ?? "", 10);
			if (Number.isFinite(page) && page > max) max = page;
		}
		return max;
	}

	function parseTradeRows(
		doc: Document,
		tradeType: "inbound" | "outbound" | "inactive" | "completed" = "inbound",
	): ScrapedTrade[] {
		const cards = doc.querySelectorAll(".card-inbox");
		const results: ScrapedTrade[] = [];

		for (const card of cards) {
			const viewLink = card.querySelector<HTMLAnchorElement>(
				'a[href^="/trade/view/"]',
			);
			if (!viewLink) continue;

			const tradeId = parseInt(viewLink.href.split("/").at(-1)!, 10);
			if (Number.isNaN(tradeId)) continue;

			const userLink =
				card.querySelector<HTMLAnchorElement>('a[href^="/users/"]');
			const userId = userLink
				? parseInt(new URL(userLink.href).pathname.split("/")[2], 10)
				: 0;
			const username =
				card.querySelector<HTMLAnchorElement>("h6 a")?.textContent?.trim() ??
				"Unknown";
			const userHref = userLink?.href ?? "#";

			const relativeDate =
				card.querySelector("h6 small span")?.textContent?.trim() ?? "";

			const previews = card.querySelectorAll(".trd-items-preview");
			const srcsFrom = (preview: Element) =>
				Array.from(preview.querySelectorAll<HTMLImageElement>("img"))
					.map((img) => {
						const attr = img.getAttribute("src") ?? "";
						if (!attr) return "";
						try {
							return new URL(attr, location.href).href;
						} catch {
							return "";
						}
					})
					.filter((src) => src !== "");

			const giving = previews[0] ? srcsFrom(previews[0]) : [];
			const receiving = previews[1] ? srcsFrom(previews[1]) : [];

			results.push({
				tradeId,
				userId,
				username,
				userHref,
				giving,
				receiving,
				relativeDate,
				tradeType,
			});
		}

		return results;
	}

	function hashesFromUrls(urls: string[]): string[] {
		return urls
			.filter((src) => src.includes("cdn.polytoria.com"))
			.map((src) => src.split("/").pop()!.replace(".png", ""));
	}

	async function resolveHashesBatched(
		hashes: string[],
	): Promise<Record<string, number>> {
		const result: Record<string, number> = {};
		for (let i = 0; i < hashes.length; i += 100) {
			const chunk = hashes.slice(i, i + 100);
			const resolved = await sendMessage("resolveItemThumbnails", chunk);
			if (resolved.ok) Object.assign(result, resolved.data.data);
		}
		return result;
	}

	function getSorted(
		trades: ScrapedTrade[],
		sort: "username" | "id-asc" | "id-desc" | "value-desc" | "value-asc",
	): ScrapedTrade[] {
		return [...trades].sort((a, b) => {
			switch (sort) {
				case "username":
					return a.username
						.toLowerCase()
						.localeCompare(b.username.toLowerCase());
				case "id-asc":
					return a.tradeId - b.tradeId;
				case "id-desc":
					return b.tradeId - a.tradeId;
				case "value-desc":
					return (b.value ?? -Infinity) - (a.value ?? -Infinity);
				case "value-asc":
					return (a.value ?? Infinity) - (b.value ?? Infinity);
				default:
					return 0;
			}
		});
	}

	function renderItemImgs(srcs: string[]): string {
		if (!srcs.length)
			return `<span style="color:#555;font-size:0.75rem;">—</span>`;
		return srcs
			.map(
				(src) =>
					`<img src="${escapeHtml(src)}" width="36" height="36"
						style="border-radius:50%;border:1px solid #333;background:#222;" />`,
			)
			.join("");
	}

	function formatValue(value: number | null | undefined): string {
		if (value === undefined) return `<span style="color:#555;">—</span>`;
		if (value === null) return `<span style="color:#555;">?</span>`;
		const color = value > 0 ? "#4caf50" : value < 0 ? "#f44336" : "#aaa";
		const prefix = value > 0 ? "+" : "";
		return `<span style="color:${color};font-size:0.8rem;white-space:nowrap;">${prefix}${value.toLocaleString()}</span>`;
	}

	const trades: ScrapedTrade[] = [];
	const selectedIds = new Set<number>();
	const blockedIds = new Set<number>();
	const blockedUsernames = new Map<number, string>();
	const nftEntries: Array<{ itemId: number; serials: number[] | null }> = [];
	const nlfEntries: number[] = [];
	const nftItemDetails = new Map<number, { name: string; thumbnail: string }>();
	let activeTab:
		| "inbound"
		| "outbound"
		| "inactive"
		| "completed"
		| "blocked"
		| "nft"
		| "nlf" = "inbound";
	let sortKey: "username" | "id-asc" | "id-desc" | "value-desc" | "value-asc" =
		"id-desc";
	let modalPage = 1;
	let scraping = true;
	let scraped = false;
	let scrapeProgress = {
		current: 0,
		total: 0,
		phase: "inbound" as "inbound" | "outbound" | "valuating",
	};
	let scrapingInactive = false;
	let scrapedInactive = false;
	let inactiveProgress = { current: 0, total: 0 };
	let scrapingCompleted = false;
	let scrapedCompleted = false;
	let completedProgress = { current: 0, total: 0 };
	const hashToId: Record<string, number> = {};
	const communityValueMap = new Map<number, number>();
	const rapMap = new Map<number, number>();

	const modal = createModal("lg");

	function renderModal() {
		const tabBtn = (id: string, label: string, active: boolean) =>
			`<button id="${id}" style="background:${active ? "#2a2a2a" : "transparent"};border:1px solid ${active ? "#484848" : "transparent"};border-radius:6px;color:${active ? "#fff" : "#666"};cursor:pointer;padding:4px 12px;font-size:0.8rem;">${label}</button>`;

		const tabBar = `
			<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;border-bottom:1px solid #333;padding-bottom:8px;">
				${tabBtn("kiln-tab-inbound", `Inbound`, activeTab === "inbound")}
				${tabBtn("kiln-tab-outbound", `Outbound`, activeTab === "outbound")}
				${tabBtn("kiln-tab-completed", `Completed`, activeTab === "completed")}
				${tabBtn("kiln-tab-inactive", `Inactive`, activeTab === "inactive")}
				${tabBtn("kiln-tab-blocked", `Blocked Traders${blockedIds.size ? ` (${blockedIds.size})` : ""}`, activeTab === "blocked")}
				${tabBtn("kiln-tab-nft", `Not for Trade Items${nftEntries.length ? ` (${nftEntries.length})` : ""}`, activeTab === "nft")}
				${tabBtn("kiln-tab-nlf", `Not Looking For Items${nlfEntries.length ? ` (${nlfEntries.length})` : ""}`, activeTab === "nlf")}
			</div>
		`;

		function attachTabHandlers() {
			document
				.getElementById("kiln-tab-inbound")!
				.addEventListener("click", () => {
					selectedIds.clear();
					activeTab = "inbound";
					modalPage = 1;
					renderModal();
				});
			document
				.getElementById("kiln-tab-outbound")!
				.addEventListener("click", () => {
					selectedIds.clear();
					activeTab = "outbound";
					modalPage = 1;
					renderModal();
				});
			document
				.getElementById("kiln-tab-completed")!
				.addEventListener("click", () => {
					selectedIds.clear();
					activeTab = "completed";
					modalPage = 1;
					if (!scrapedCompleted && !scrapingCompleted && !scraping)
						scrapeCompletedTrades();
					renderModal();
				});
			document
				.getElementById("kiln-tab-inactive")!
				.addEventListener("click", () => {
					selectedIds.clear();
					activeTab = "inactive";
					modalPage = 1;
					if (!scrapedInactive && !scrapingInactive && !scraping)
						scrapeInactiveTrades();
					renderModal();
				});
			document
				.getElementById("kiln-tab-blocked")!
				.addEventListener("click", () => {
					selectedIds.clear();
					activeTab = "blocked";
					renderModal();
				});
			document.getElementById("kiln-tab-nft")!.addEventListener("click", () => {
				selectedIds.clear();
				activeTab = "nft";
				renderModal();
			});
			document.getElementById("kiln-tab-nlf")!.addEventListener("click", () => {
				selectedIds.clear();
				activeTab = "nlf";
				renderModal();
			});
		}

		if (activeTab === "nft") {
			const rows =
				nftEntries
					.map((entry) => {
						const details = nftItemDetails.get(entry.itemId);
						const serialInfo =
							entry.serials === null
								? `<span style="color:#4a9eff;font-size:0.75rem;">All copies</span>`
								: `<span style="color:#aaa;font-size:0.75rem;">Serials: ${entry.serials.slice(0, 6).join(", ")}${entry.serials.length > 6 ? ` +${entry.serials.length - 6} more` : ""}</span>`;
						const img = details?.thumbnail
							? `<img src="${escapeHtml(details.thumbnail)}" width="36" height="36" style="border-radius:6px;object-fit:cover;background:#222;flex-shrink:0;">`
							: `<div style="width:36px;height:36px;border-radius:6px;background:#222;flex-shrink:0;"></div>`;
						return `
						<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #222;">
							<div style="display:flex;align-items:center;gap:10px;">
								${img}
								<div>
									<div style="color:#fff;font-size:0.85rem;">${details ? escapeHtml(details.name) : `<span style="color:#555;font-size:0.8rem;">Item #${entry.itemId}</span>`}</div>
									${serialInfo}
								</div>
							</div>
							<button class="btn btn-sm px-3 kiln-ts-unmark-nft" data-item-id="${entry.itemId}"
								style="border:1px solid #555;background:transparent;color:#aaa;white-space:nowrap;">Unmark</button>
						</div>`;
					})
					.join("") ||
				`<div style="padding:18px;text-align:center;color:#555;font-size:0.85rem;">
					<img class="mb-3" src="${sadFace}" width="75" height="75" style="filter: grayscale(1)">
					<p class="text-muted mb-0">You don't have any items marked as "not for trade".</p>
				</div>`;

			modal.innerHTML = `
				<span class="badge bg-warning mb-2">KILN</span>
				<button id="kiln-ts-close" style="background:transparent;border:1px solid #484848;border-radius:8px;color:#aaa;cursor:pointer;padding:4px 10px;float:right;">✕</button>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
					<h5 style="color:#fff;margin:0;">Trade Manager</h5>
				</div>
				${tabBar}
				${rows}
			`;

			document
				.getElementById("kiln-ts-close")!
				.addEventListener("click", () => modal.close());
			attachTabHandlers();

			modal
				.querySelectorAll<HTMLButtonElement>(".kiln-ts-unmark-nft")
				.forEach((btn) => {
					btn.addEventListener("click", async () => {
						btn.disabled = true;
						btn.textContent = "...";
						const itemId = parseInt(btn.dataset.itemId!, 10);
						await sendMessage("unmarkItemAsNFT", {
							userId: user.userId,
							itemId,
						});
						const idx = nftEntries.findIndex((e) => e.itemId === itemId);
						if (idx !== -1) nftEntries.splice(idx, 1);
						renderModal();
					});
				});

			return;
		}

		if (activeTab === "nlf") {
			const rows =
				nlfEntries
					.map((itemId) => {
						const details = nftItemDetails.get(itemId);
						const img = details?.thumbnail
							? `<img src="${escapeHtml(details.thumbnail)}" width="36" height="36" style="border-radius:6px;object-fit:cover;background:#222;flex-shrink:0;">`
							: `<div style="width:36px;height:36px;border-radius:6px;background:#222;flex-shrink:0;"></div>`;
						return `
						<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #222;">
							<div style="display:flex;align-items:center;gap:10px;">
								${img}
								<div style="color:#fff;font-size:0.85rem;">${details ? escapeHtml(details.name) : `<span style="color:#555;font-size:0.8rem;">Item #${itemId}</span>`}</div>
							</div>
							<button class="btn btn-sm px-3 kiln-ts-unmark-nlf" data-item-id="${itemId}"
								style="border:1px solid #555;background:transparent;color:#aaa;white-space:nowrap;">Unmark</button>
						</div>`;
					})
					.join("") ||
				`<div style="padding:18px;text-align:center;color:#555;font-size:0.85rem;">
					<img class="mb-3" src="${sadFace}" width="75" height="75" style="filter: grayscale(1)">
					<p class="text-muted mb-0">You don't have any items marked as "not looking for".</p>
				</div>`;

			modal.innerHTML = `
				<span class="badge bg-warning mb-2">KILN</span>
				<button id="kiln-ts-close" style="background:transparent;border:1px solid #484848;border-radius:8px;color:#aaa;cursor:pointer;padding:4px 10px;float:right;">✕</button>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
					<h5 style="color:#fff;margin:0;">Trade Manager</h5>
				</div>
				${tabBar}
				${rows}
			`;

			document
				.getElementById("kiln-ts-close")!
				.addEventListener("click", () => modal.close());
			attachTabHandlers();

			modal
				.querySelectorAll<HTMLButtonElement>(".kiln-ts-unmark-nlf")
				.forEach((btn) => {
					btn.addEventListener("click", async () => {
						btn.disabled = true;
						btn.textContent = "...";
						const itemId = parseInt(btn.dataset.itemId!, 10);
						await sendMessage("unmarkItemAsNLF", {
							userId: user.userId,
							itemId,
						});
						const idx = nlfEntries.indexOf(itemId);
						if (idx !== -1) nlfEntries.splice(idx, 1);
						renderModal();
					});
				});

			return;
		}

		if (activeTab === "blocked") {
			const rows =
				[...blockedIds]
					.map((id) => {
						const name = blockedUsernames.get(id);
						return `
						<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #222;">
							<div>
								<span style="color:#fff;font-size:0.85rem;">${name ? escapeHtml(name) : `<span style="color:#555;font-size:0.8rem;">Loading…</span>`}</span>
								<span style="color:#555;font-size:0.75rem;margin-left:6px;">#${id}</span>
							</div>
							<button class="btn btn-sm px-3 kiln-ts-unblock-user" data-user-id="${id}"
								style="border:1px solid #555;background:transparent;color:#aaa;">Unblock</button>
						</div>`;
					})
					.join("") ||
				`<div style="padding:18px;text-align:center;color:#555;font-size:0.85rem;">
					<img class="mb-3" src="${sadFace}" width="75" height="75" style="filter: grayscale(1)">
					<p class="text-muted mb-0">You don't have any traders blocked.</p>
				</div>`;

			modal.innerHTML = `
				<span class="badge bg-warning mb-2">KILN</span>
				<button id="kiln-ts-close" style="background:transparent;border:1px solid #484848;border-radius:8px;color:#aaa;cursor:pointer;padding:4px 10px;float:right;">✕</button>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
					<h5 style="color:#fff;margin:0;">Trade Manager</h5>
				</div>
				${tabBar}
				${rows}
			`;

			document
				.getElementById("kiln-ts-close")!
				.addEventListener("click", () => modal.close());
			attachTabHandlers();

			modal
				.querySelectorAll<HTMLButtonElement>(".kiln-ts-unblock-user")
				.forEach((btn) => {
					btn.addEventListener("click", async () => {
						btn.disabled = true;
						btn.textContent = "...";
						const userId = parseInt(btn.dataset.userId!, 10);
						await sendMessage("unblockTrader", {
							userId: user.userId,
							blockedUserId: userId,
						});
						blockedIds.delete(userId);
						blockedUsernames.delete(userId);
						renderModal();
					});
				});

			return;
		}

		if (scraping) {
			const phaseLabel =
				scrapeProgress.phase === "valuating"
					? "Fetching valuations…"
					: scrapeProgress.phase === "outbound"
						? "Scraping outbound trades…"
						: "Scraping inbound trades…";
			const progressPct =
				scrapeProgress.phase === "valuating"
					? 100
					: scrapeProgress.total
						? Math.round((scrapeProgress.current / scrapeProgress.total) * 100)
						: 0;
			modal.innerHTML = `
				<span class="badge bg-warning mb-2">KILN</span>
				<button id="kiln-ts-close" style="background:transparent;border:1px solid #484848;border-radius:8px;color:#aaa;cursor:pointer;padding:4px 10px;float:right;">✕</button>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
					<h5 style="color:#fff;margin:0;">Trade Manager</h5>
				</div>
				${tabBar}
				<div style="text-align:center;padding:40px 0;">
					<div style="color:#aaa;font-size:0.9rem;margin-bottom:8px;">${phaseLabel}</div>
					<div style="color:#666;font-size:0.8rem;">
						${scrapeProgress.phase === "valuating" ? "" : `${scrapeProgress.current} / ${scrapeProgress.total} pages`}
					</div>
					<div style="margin-top:16px;height:4px;background:#333;border-radius:2px;overflow:hidden;">
						<div style="height:100%;width:${progressPct}%;background:#4a9eff;border-radius:2px;transition:width 0.2s ease;"></div>
					</div>
				</div>
			`;
			document
				.getElementById("kiln-ts-close")!
				.addEventListener("click", () => modal.close());
			attachTabHandlers();
			return;
		}

		if (scrapingCompleted && activeTab === "completed") {
			const progressPct = completedProgress.total
				? Math.round(
						(completedProgress.current / completedProgress.total) * 100,
					)
				: 0;
			modal.innerHTML = `
				<span class="badge bg-warning mb-2">KILN</span>
				<button id="kiln-ts-close" style="background:transparent;border:1px solid #484848;border-radius:8px;color:#aaa;cursor:pointer;padding:4px 10px;float:right;">✕</button>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
					<h5 style="color:#fff;margin:0;">Trade Manager</h5>
				</div>
				${tabBar}
				<div style="text-align:center;padding:40px 0;">
					<div style="color:#aaa;font-size:0.9rem;margin-bottom:8px;">Scraping completed trades…</div>
					<div style="color:#666;font-size:0.8rem;">${completedProgress.current} / ${completedProgress.total} pages</div>
					<div style="margin-top:16px;height:4px;background:#333;border-radius:2px;overflow:hidden;">
						<div style="height:100%;width:${progressPct}%;background:#4a9eff;border-radius:2px;transition:width 0.2s ease;"></div>
					</div>
				</div>
			`;
			document
				.getElementById("kiln-ts-close")!
				.addEventListener("click", () => modal.close());
			attachTabHandlers();
			return;
		}

		if (scrapingInactive && activeTab === "inactive") {
			const progressPct = inactiveProgress.total
				? Math.round((inactiveProgress.current / inactiveProgress.total) * 100)
				: 0;
			modal.innerHTML = `
				<span class="badge bg-warning mb-2">KILN</span>
				<button id="kiln-ts-close" style="background:transparent;border:1px solid #484848;border-radius:8px;color:#aaa;cursor:pointer;padding:4px 10px;float:right;">✕</button>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
					<h5 style="color:#fff;margin:0;">Trade Manager</h5>
				</div>
				${tabBar}
				<div style="text-align:center;padding:40px 0;">
					<div style="color:#aaa;font-size:0.9rem;margin-bottom:8px;">Scraping inactive trades…</div>
					<div style="color:#666;font-size:0.8rem;">${inactiveProgress.current} / ${inactiveProgress.total} pages</div>
					<div style="margin-top:16px;height:4px;background:#333;border-radius:2px;overflow:hidden;">
						<div style="height:100%;width:${progressPct}%;background:#4a9eff;border-radius:2px;transition:width 0.2s ease;"></div>
					</div>
				</div>
			`;
			document
				.getElementById("kiln-ts-close")!
				.addEventListener("click", () => modal.close());
			attachTabHandlers();
			return;
		}

		const isReadOnlyType = (t: ScrapedTrade["tradeType"]) =>
			t === "inactive" || t === "completed";

		const filtered = trades.filter((t) => t.tradeType === activeTab);
		const sorted = getSorted(filtered, sortKey);
		const totalPages = Math.max(1, Math.ceil(sorted.length / MODAL_PAGE_SIZE));
		const safePage = Math.min(modalPage, totalPages);
		const pageSlice = sorted.slice(
			(safePage - 1) * MODAL_PAGE_SIZE,
			safePage * MODAL_PAGE_SIZE,
		);

		const allOnPageSelected =
			pageSlice.length > 0 &&
			pageSlice.every((t) => selectedIds.has(t.tradeId));

		const rowsHtml = pageSlice.length
			? pageSlice
					.map(
						(t) => `
					<tr data-trade-id="${t.tradeId}" style="border-bottom:1px solid #222;${blockedIds.has(t.userId) ? "background:#1f1400;" : selectedIds.has(t.tradeId) ? "background:#1e2a1e;" : ""}">
						${
							!isReadOnlyType(t.tradeType)
								? `
							<td style="padding:8px 10px;">
								<input type="checkbox" class="kiln-ts-check" data-trade-id="${t.tradeId}"
									style="cursor:pointer;"
									${selectedIds.has(t.tradeId) ? "checked" : ""} />
							</td>
						`
								: ""
						}
						<td style="padding:8px 10px;">
							<a href="/trade/view/${t.tradeId}" target="_blank"
								style="color:#aaa;font-size:0.8rem;text-decoration:none;">#${t.tradeId}</a>
						</td>
						<td style="padding:8px 10px;">
							<a href="${escapeHtml(t.userHref)}" target="_blank"
								style="color:#fff;font-size:0.85rem;text-decoration:none;">${escapeHtml(t.username)}</a>
							${blockedIds.has(t.userId) ? `<span style="font-size:0.65rem;background:#6c3a00;color:#ffb347;padding:1px 5px;border-radius:4px;margin-left:4px;">Blocked</span>` : ""}
						</td>
						<td style="padding:8px 10px;">
							<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
								<div style="display:flex;gap:3px;">${renderItemImgs(t.giving)}</div>
								<span style="color:#666;font-size:0.8rem;">→</span>
								<div style="display:flex;gap:3px;">${renderItemImgs(t.receiving)}</div>
							</div>
						</td>
						<td style="padding:8px 10px;">${formatValue(t.value)}</td>
						<td style="padding:8px 10px;color:#666;font-size:0.8rem;white-space:nowrap;">${escapeHtml(t.relativeDate)}</td>
						<td style="padding:8px 10px;white-space:nowrap;">
							${
								!isReadOnlyType(t.tradeType)
									? `
								${t.tradeType === "inbound" ? `<button class="btn btn-success btn-sm px-3 me-1 kiln-ts-counter" data-trade-id="${t.tradeId}" data-user-id="${t.userId}">Counter</button>` : ""}
								<button class="btn btn-danger btn-sm px-3 me-1 kiln-ts-decline" data-trade-id="${t.tradeId}">${t.tradeType === "outbound" ? "Cancel" : "Decline"}</button>
								<button class="btn btn-sm px-2 kiln-ts-block" data-user-id="${t.userId}" data-trade-id="${t.tradeId}"
									style="border:1px solid ${blockedIds.has(t.userId) ? "#555" : "#b36200"};background:transparent;color:${blockedIds.has(t.userId) ? "#555" : "#ffb347"};">
									${blockedIds.has(t.userId) ? "Unblock" : "Block"}
								</button>
							`
									: `
								<a href="/trade/view/${t.tradeId}" target="_blank"
									class="btn btn-sm px-3"
									style="border:1px solid #484848;background:transparent;color:#aaa;">View</a>
							`
							}
						</td>
					</tr>`,
					)
					.join("")
			: `<tr><td colspan="${isReadOnlyType(activeTab as ScrapedTrade["tradeType"]) ? 6 : 7}" style="padding:24px;text-align:center;color:#555;font-size:0.85rem;">No ${activeTab} trades</td></tr>`;

		const mkPageBtn = (label: string, page: number, disabled: boolean) => {
			const isActive = page === safePage && !disabled;
			return `<button data-page="${page}"
				style="
					background:${isActive ? "#3a3a3a" : "transparent"};
					border:1px solid #484848;
					border-radius:6px;
					color:${disabled ? "#444" : "#fff"};
					cursor:${disabled ? "default" : "pointer"};
					padding:4px 10px;
					font-size:0.8rem;
				"
				${disabled ? "disabled" : ""}
			>${label}</button>`;
		};

		const maxVisible = 5;
		const half = Math.floor(maxVisible / 2);
		let start = Math.max(1, safePage - half);
		const end = Math.min(totalPages, start + maxVisible - 1);
		if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

		const pageNums = Array.from({ length: end - start + 1 }, (_, i) =>
			mkPageBtn(String(start + i), start + i, false),
		).join("");

		const hasSelection = selectedIds.size > 0;

		modal.innerHTML = `
			<span class="badge bg-warning mb-2">KILN</span>
				<button id="kiln-ts-close" style="background:transparent;border:1px solid #484848;border-radius:8px;color:#aaa;cursor:pointer;padding:4px 10px;float:right;">✕</button>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
					<h5 style="color:#fff;margin:0;">Trade Manager</h5>
				</div>
			${tabBar}
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
				<div style="display:flex;align-items:center;gap:10px;">
					<small style="color:#555;">${sorted.length} ${activeTab} trades</small>
					${
						hasSelection &&
						!isReadOnlyType(activeTab as ScrapedTrade["tradeType"])
							? `
						<button id="kiln-ts-decline-selected" class="btn btn-danger btn-sm px-3">
							${activeTab === "outbound" ? "Cancel" : "Decline"} selected (${selectedIds.size})
						</button>
					`
							: ""
					}
				</div>
				<div style="display:flex;gap:8px;align-items:center;">
					<label style="color:#aaa;font-size:0.8rem;">Sort:</label>
					<select id="kiln-ts-sort" style="background:#222;border:1px solid #484848;border-radius:6px;color:#fff;font-size:0.8rem;padding:3px 8px;">
						<option value="id-desc" ${sortKey === "id-desc" ? "selected" : ""}>Newest first</option>
						<option value="id-asc" ${sortKey === "id-asc" ? "selected" : ""}>Oldest first</option>
						<option value="username" ${sortKey === "username" ? "selected" : ""}>Username (A–Z)</option>
						<option value="value-desc" ${sortKey === "value-desc" ? "selected" : ""}>Best value first</option>
						<option value="value-asc" ${sortKey === "value-asc" ? "selected" : ""}>Worst value first</option>
					</select>
				</div>
			</div>

			<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
				<thead>
					<tr style="border-bottom:1px solid #333;">
						${
							!isReadOnlyType(activeTab as ScrapedTrade["tradeType"])
								? `
							<th style="padding:6px 10px;">
								<input type="checkbox" id="kiln-ts-check-all" style="cursor:pointer;"
									${allOnPageSelected ? "checked" : ""} />
							</th>
						`
								: ""
						}
						<th style="padding:6px 10px;text-align:left;color:#555;font-size:0.75rem;font-weight:500;white-space:nowrap;">Trade ID</th>
						<th style="padding:6px 10px;text-align:left;color:#555;font-size:0.75rem;font-weight:500;">Trader</th>
						<th style="padding:6px 10px;text-align:left;color:#555;font-size:0.75rem;font-weight:500;">Items</th>
						<th style="padding:6px 10px;text-align:left;color:#555;font-size:0.75rem;font-weight:500;">Value</th>
						<th style="padding:6px 10px;text-align:left;color:#555;font-size:0.75rem;font-weight:500;white-space:nowrap;">Date</th>
						<th style="padding:6px 10px;text-align:left;color:#555;font-size:0.75rem;font-weight:500;">Actions</th>
					</tr>
				</thead>
				<tbody>${rowsHtml}</tbody>
			</table>

			<div style="display:flex;justify-content:space-between;align-items:center;">
				<div style="display:flex;gap:4px;">
					${mkPageBtn("«", 1, safePage === 1)}
					${mkPageBtn("‹", safePage - 1, safePage === 1)}
					${pageNums}
					${mkPageBtn("›", safePage + 1, safePage === totalPages)}
					${mkPageBtn("»", totalPages, safePage === totalPages)}
				</div>
				<small style="color:#555;font-size:0.75rem;">Page ${safePage} of ${totalPages}</small>
			</div>
		`;

		document
			.getElementById("kiln-ts-close")!
			.addEventListener("click", () => modal.close());
		attachTabHandlers();

		document.getElementById("kiln-ts-sort")!.addEventListener("change", (e) => {
			sortKey = (e.target as HTMLSelectElement).value as typeof sortKey;
			modalPage = 1;
			renderModal();
		});

		document
			.getElementById("kiln-ts-check-all")
			?.addEventListener("change", (e) => {
				const checked = (e.target as HTMLInputElement).checked;
				for (const t of pageSlice) {
					if (checked) selectedIds.add(t.tradeId);
					else selectedIds.delete(t.tradeId);
				}
				renderModal();
			});

		modal
			.querySelectorAll<HTMLInputElement>(".kiln-ts-check")
			.forEach((checkbox) => {
				checkbox.addEventListener("change", () => {
					const tradeId = parseInt(checkbox.dataset.tradeId!, 10);
					if (checkbox.checked) selectedIds.add(tradeId);
					else selectedIds.delete(tradeId);
					renderModal();
				});
			});

		modal
			.querySelectorAll<HTMLButtonElement>("button[data-page]")
			.forEach((btn) => {
				btn.addEventListener("click", () => {
					modalPage = parseInt(btn.dataset.page!, 10);
					renderModal();
				});
			});

		modal
			.querySelectorAll<HTMLButtonElement>(".kiln-ts-counter")
			.forEach((btn) => {
				btn.addEventListener("click", async () => {
					btn.disabled = true;
					btn.textContent = "...";
					const tradeId = parseInt(btn.dataset.tradeId!, 10);
					const userId = parseInt(btn.dataset.userId!, 10);
					const result = await sendMessage("rejectTrade", tradeId);
					if (result.ok) {
						window.location.pathname = `/trade/new/${userId}`;
					} else {
						renderModal();
					}
				});
			});

		modal
			.querySelectorAll<HTMLButtonElement>(".kiln-ts-decline")
			.forEach((btn) => {
				btn.addEventListener("click", async () => {
					btn.disabled = true;
					btn.textContent = "...";
					const tradeId = parseInt(btn.dataset.tradeId!, 10);
					const result = await sendMessage("rejectTrade", tradeId);
					if (result.ok) {
						selectedIds.delete(tradeId);
						const idx = trades.findIndex((t) => t.tradeId === tradeId);
						if (idx !== -1) trades.splice(idx, 1);
					}
					renderModal();
				});
			});

		modal
			.querySelectorAll<HTMLButtonElement>(".kiln-ts-block")
			.forEach((btn) => {
				btn.addEventListener("click", async () => {
					btn.disabled = true;
					btn.textContent = "...";
					const tradeId = parseInt(btn.dataset.tradeId!, 10);
					const userId = parseInt(btn.dataset.userId!, 10);

					if (blockedIds.has(userId)) {
						await sendMessage("unblockTrader", {
							userId: user.userId,
							blockedUserId: userId,
						});
						blockedIds.delete(userId);
					} else {
						await sendMessage("blockTrader", {
							userId: user.userId,
							blockedUserId: userId,
						});
						blockedIds.add(userId);
						const result = await sendMessage("rejectTrade", tradeId);
						if (result.ok) {
							selectedIds.delete(tradeId);
							const idx = trades.findIndex((t) => t.tradeId === tradeId);
							if (idx !== -1) trades.splice(idx, 1);
						}
					}

					renderModal();
				});
			});

		document
			.getElementById("kiln-ts-decline-selected")
			?.addEventListener("click", async () => {
				const btn = document.getElementById(
					"kiln-ts-decline-selected",
				) as HTMLButtonElement;
				btn.disabled = true;
				btn.textContent = "Declining…";

				const ids = [...selectedIds];
				for (let i = 0; i < ids.length; i++) {
					if (i > 0) await delay(FETCH_DELAY_MS);
					const result = await sendMessage("rejectTrade", ids[i]);
					if (result.ok) {
						selectedIds.delete(ids[i]);
						const idx = trades.findIndex((t) => t.tradeId === ids[i]);
						if (idx !== -1) trades.splice(idx, 1);
					}
				}

				renderModal();
			});
	}

	async function valuateTrades(newTrades: ScrapedTrade[]): Promise<void> {
		const newHashes = [
			...new Set([
				...newTrades.flatMap((t) => hashesFromUrls(t.giving)),
				...newTrades.flatMap((t) => hashesFromUrls(t.receiving)),
			]),
		].filter((h) => !(h in hashToId));

		if (newHashes.length) {
			Object.assign(hashToId, await resolveHashesBatched(newHashes));
		}

		const newItemIds = [
			...new Set(
				newTrades
					.flatMap((t) => [
						...hashesFromUrls(t.giving),
						...hashesFromUrls(t.receiving),
					])
					.map((h) => hashToId[h])
					.filter((id): id is number => id != null),
			),
		].filter((id) => !communityValueMap.has(id) && !rapMap.has(id));

		if (newItemIds.length) {
			const valResult = await sendMessage("getPolytoriaTradeItems", newItemIds);
			if (valResult.ok) {
				for (const entry of valResult.data) {
					const value = entry.data?.item.stats?.value;
					if (value != null && value > 0)
						communityValueMap.set(entry.itemId, value);
				}
			}

			const missingIds = newItemIds.filter((id) => !communityValueMap.has(id));
			if (missingIds.length) {
				await Promise.all(
					missingIds.map(async (id) => {
						const r = await sendMessage("getItem", id);
						if (r.ok && r.data.averagePrice)
							rapMap.set(id, r.data.averagePrice);
					}),
				);
			}
		}

		const sumValue = (urls: string[]): number =>
			hashesFromUrls(urls)
				.map((h) => {
					const id = hashToId[h] ?? -1;
					return communityValueMap.get(id) ?? rapMap.get(id) ?? 0;
				})
				.reduce((a, b) => a + b, 0);

		for (const trade of newTrades) {
			trade.value = sumValue(trade.giving) - sumValue(trade.receiving);
		}
	}

	async function scrapeCompletedTrades(): Promise<void> {
		scrapingCompleted = true;
		scrapedCompleted = true;
		completedProgress = { current: 0, total: 0 };
		renderModal();

		const firstRes = await fetch("/trade/completed?page=1");
		const firstHtml = await firstRes.text();
		const firstDoc = new DOMParser().parseFromString(firstHtml, "text/html");
		const maxPages = getMaxPages(firstDoc);

		completedProgress = { current: 1, total: maxPages };
		renderModal();

		const completedTrades = parseTradeRows(firstDoc, "completed");

		for (let page = 2; page <= maxPages; page++) {
			await delay(FETCH_DELAY_MS);
			const res = await fetch(`/trade/completed?page=${page}`);
			const html = await res.text();
			const doc = new DOMParser().parseFromString(html, "text/html");
			completedTrades.push(...parseTradeRows(doc, "completed"));
			completedProgress.current = page;
			renderModal();
		}

		trades.push(...completedTrades);
		await valuateTrades(completedTrades);

		scrapingCompleted = false;
		renderModal();
	}

	async function scrapeInactiveTrades(): Promise<void> {
		scrapingInactive = true;
		scrapedInactive = true;
		inactiveProgress = { current: 0, total: 0 };
		renderModal();

		const firstRes = await fetch("/trade/inactive?page=1");
		const firstHtml = await firstRes.text();
		const firstDoc = new DOMParser().parseFromString(firstHtml, "text/html");
		const maxPages = getMaxPages(firstDoc);

		inactiveProgress = { current: 1, total: maxPages };
		renderModal();

		const inactiveTrades = parseTradeRows(firstDoc, "inactive");

		for (let page = 2; page <= maxPages; page++) {
			await delay(FETCH_DELAY_MS);
			const res = await fetch(`/trade/inactive?page=${page}`);
			const html = await res.text();
			const doc = new DOMParser().parseFromString(html, "text/html");
			inactiveTrades.push(...parseTradeRows(doc, "inactive"));
			inactiveProgress.current = page;
			renderModal();
		}

		trades.push(...inactiveTrades);
		await valuateTrades(inactiveTrades);

		scrapingInactive = false;
		renderModal();
	}

	async function openManager() {
		blockedIds.clear();
		blockedUsernames.clear();
		nftEntries.length = 0;
		nlfEntries.length = 0;

		const [blockedResult, nftResult, nlfResult] = await Promise.all([
			sendMessage("getBlockedTraders", user.userId),
			sendMessage("getNFTItems", user.userId),
			sendMessage("getNLFItems", user.userId),
		]);

		if (blockedResult.ok) {
			for (const id of blockedResult.data.data) blockedIds.add(id);
		}
		if (nftResult.ok) {
			nftEntries.push(...nftResult.data.data);
		}
		if (nlfResult.ok) {
			nlfEntries.push(...nlfResult.data.data);
		}

		for (const id of blockedIds) {
			(async () => {
				const result = await sendMessage("getUser", id);
				if (result.ok) {
					blockedUsernames.set(id, result.data.username);
					if (activeTab === "blocked") renderModal();
				}
			})();
		}

		for (const entry of nftEntries) {
			if (!nftItemDetails.has(entry.itemId)) {
				(async () => {
					const result = await sendMessage("getItem", entry.itemId);
					if (result.ok) {
						nftItemDetails.set(entry.itemId, {
							name: result.data.name,
							thumbnail: result.data.thumbnail,
						});
						if (activeTab === "nft") renderModal();
					}
				})();
			}
		}

		for (const itemId of nlfEntries) {
			if (!nftItemDetails.has(itemId)) {
				(async () => {
					const result = await sendMessage("getItem", itemId);
					if (result.ok) {
						nftItemDetails.set(itemId, {
							name: result.data.name,
							thumbnail: result.data.thumbnail,
						});
						if (activeTab === "nlf") renderModal();
					}
				})();
			}
		}

		modal.showModal();
		renderModal();

		if (scraped) return;
		scraped = true;

		const firstRes = await fetch("/trade/pending?page=1");
		const firstHtml = await firstRes.text();
		const firstDoc = new DOMParser().parseFromString(firstHtml, "text/html");
		const maxInboundPages = getMaxPages(firstDoc);

		scrapeProgress = { current: 1, total: maxInboundPages, phase: "inbound" };
		trades.push(...parseTradeRows(firstDoc, "inbound"));

		for (let page = 2; page <= maxInboundPages; page++) {
			await delay(FETCH_DELAY_MS);
			const res = await fetch(`/trade/pending?page=${page}`);
			const html = await res.text();
			const doc = new DOMParser().parseFromString(html, "text/html");
			trades.push(...parseTradeRows(doc, "inbound"));
			scrapeProgress.current = page;
			renderModal();
		}

		const firstOutRes = await fetch("/trade/sent?page=1");
		const firstOutHtml = await firstOutRes.text();
		const firstOutDoc = new DOMParser().parseFromString(
			firstOutHtml,
			"text/html",
		);
		const maxOutboundPages = getMaxPages(firstOutDoc);

		scrapeProgress = { current: 1, total: maxOutboundPages, phase: "outbound" };
		renderModal();
		trades.push(...parseTradeRows(firstOutDoc, "outbound"));

		for (let page = 2; page <= maxOutboundPages; page++) {
			await delay(FETCH_DELAY_MS);
			const res = await fetch(`/trade/sent?page=${page}`);
			const html = await res.text();
			const doc = new DOMParser().parseFromString(html, "text/html");
			trades.push(...parseTradeRows(doc, "outbound"));
			scrapeProgress.current = page;
			renderModal();
		}

		scrapeProgress = { current: 0, total: 0, phase: "valuating" };
		renderModal();

		await valuateTrades(trades);

		scraping = false;
		renderModal();

		if (activeTab === "completed" && !scrapedCompleted) scrapeCompletedTrades();
		if (activeTab === "inactive" && !scrapedInactive) scrapeInactiveTrades();
	}

	const navPills = document.querySelector(
		".col-lg-2:has(.nav.flex-column.nav-pills)",
	);
	if (navPills) {
		const navBtn = document.createElement("button");
		navBtn.classList.add("btn", "btn-secondary", "w-100");
		navBtn.innerHTML = `<i class="fas fa-calendar-pen me-1"></i><span class="pilltitle">Kiln Trade Manager</span>`;
		navBtn.addEventListener("click", openManager);
		navPills.appendChild(navBtn);

		navPills.children[0].classList.remove("mb-3");
		navPills.children[0].classList.add("mb-2");
	}
}

export async function tradeViewedIndicators(
	tradeIds: number[],
	showDisclosures: boolean,
) {
	const container = document.querySelector(".col:has(.card-inbox)");
	if (!container) return;
	const cards = container.querySelectorAll(".card-inbox");

	for (const card of cards) {
		const viewBtn = card.getElementsByClassName(
			"btn-primary",
		)[0] as unknown as HTMLLinkElement;
		const tradeId = +new URL(viewBtn.href).pathname.split("/")[3];

		if (tradeIds.includes(tradeId)) {
			(card as HTMLDivElement).style.opacity = "50%";
			applyKilnDisclosureTitle(
				card as HTMLDivElement,
				showDisclosures,
				"Already viewed",
			);
		}
	}
}
