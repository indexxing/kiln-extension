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

import { kilnDisclosureBadgeHtml } from "@/utils/utilities";

const userId = +window.location.pathname.split("/")[3];

export async function nftItems(showDisclosures: boolean) {
	const nfts = await sendMessage("getNFTItems", userId);
	if (!nfts.ok) return;

	const getCardHash = (card: Element): string | null => {
		const img = card.querySelector("img") as HTMLImageElement | null;
		if (!img?.src.includes("cdn.polytoria.com")) return null;
		const filename = img.src.split("/").pop();
		return filename?.replace(".png", "") ?? null;
	};

	const nftMap = new Map<number, number[] | null>();
	for (const item of nfts.data.data) {
		nftMap.set(item.itemId, item.serials);
	}

	const hashToItemId = new Map<string, number>();

	async function resolveHashes(cards: Element[]): Promise<void> {
		const unresolved = [
			...new Set(
				cards
					.map(getCardHash)
					.filter((h): h is string => h !== null && !hashToItemId.has(h)),
			),
		];
		if (unresolved.length === 0) return;

		for (let i = 0; i < unresolved.length; i += 100) {
			const result = await sendMessage(
				"resolveItemThumbnails",
				unresolved.slice(i, i + 100),
			);
			if (!result.ok) continue;
			for (const [hash, itemId] of Object.entries(result.data.data)) {
				if (itemId !== null) hashToItemId.set(hash, itemId);
			}
		}
	}

	function isNFT(card: Element): boolean {
		const hash = getCardHash(card);
		if (!hash) return false;
		const itemId = hashToItemId.get(hash);
		if (itemId === undefined || !nftMap.has(itemId)) return false;

		const serials = nftMap.get(itemId) as number[] | null;
		if (serials === null) return true;

		const serialEl = card.querySelector(".trd-box-val span[style]");
		if (!serialEl) return false;
		const serial = +(serialEl.textContent?.trim().replace(/^#/, "") ?? "");
		return serials.includes(serial);
	}

	const NFT_STYLE = Object.assign(document.createElement("style"), {
		textContent: `
        .trd-box.is-nft {
            border-color: orange !important;
            filter: opacity(0.3);
            background: repeating-linear-gradient(
                45deg,
                orange,
                orange 10px,
                transparent 10px,
                transparent 20px
            ) !important;
            pointer-events: none;
            position: relative;
        }
        .nft-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #000;
            font-weight: 700;
            font-size: 1.5rem;
            text-align: center;
            pointer-events: none;
        }
    `,
	});
	document.head.appendChild(NFT_STYLE);

	function markCard(card: Element) {
		if (isNFT(card)) {
			card.classList.add("is-nft");
			if (!card.querySelector(".nft-overlay")) {
				const overlay = document.createElement("div");
				overlay.className = "nft-overlay";
				overlay.innerHTML = `Not for Trade${kilnDisclosureBadgeHtml(showDisclosures)}`;
				card.appendChild(overlay);
			}
		} else {
			card.classList.remove("is-nft");
			card.querySelector(".nft-overlay")?.remove();
		}
	}

	await new Promise<void>((resolve) => {
		if (document.querySelector("#other-items .trd-box")) {
			resolve();
			return;
		}
		const observer = new MutationObserver(() => {
			if (document.querySelector("#other-items .trd-box")) {
				observer.disconnect();
				resolve();
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	});

	const otherItemsContainer = document.getElementById("other-items");
	if (!otherItemsContainer) return;

	const processCards = async (cards: Element[]) => {
		await resolveHashes(cards);
		cards.forEach(markCard);
	};

	await processCards([
		...otherItemsContainer.querySelectorAll<Element>(".trd-box"),
	]);

	new MutationObserver((records) => {
		const added: Element[] = [];
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (!(node instanceof Element)) continue;
				if (node.matches(".trd-box")) added.push(node);
				added.push(...node.querySelectorAll<Element>(".trd-box"));
			}
		}
		if (added.length) processCards(added);
	}).observe(otherItemsContainer, { childList: true, subtree: true });
}

export async function nlfItems(showDisclosures: boolean) {
	const nlf = await sendMessage("getNLFItems", userId);
	if (!nlf.ok) return;

	const nlfIds = new Set(nlf.data.data);
	if (!nlfIds.size) return;

	const container = await new Promise<Element>((resolve) => {
		const find = () =>
			document.querySelector("#user-items")?.querySelector(".trd-box")
				? document.getElementById("user-items")
				: null;
		const existing = find();
		if (existing) return resolve(existing);

		const observer = new MutationObserver(() => {
			const found = find();
			if (found) {
				observer.disconnect();
				resolve(found);
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	});

	const cards = [...container.querySelectorAll<Element>(".trd-box")];

	const getCardHash = (card: Element): string | null => {
		const img = card.querySelector("img") as HTMLImageElement | null;
		if (!img?.src.includes("cdn.polytoria.com")) return null;
		return img.src.split("/").pop()?.replace(".png", "") ?? null;
	};

	const hashes = [
		...new Set(cards.map(getCardHash).filter((h): h is string => h !== null)),
	];
	const hashToItemId = new Map<string, number>();
	for (let i = 0; i < hashes.length; i += 100) {
		const result = await sendMessage(
			"resolveItemThumbnails",
			hashes.slice(i, i + 100),
		);
		if (!result.ok) continue;
		for (const [hash, itemId] of Object.entries(result.data.data)) {
			if (itemId !== null) hashToItemId.set(hash, itemId);
		}
	}

	document.head.appendChild(
		Object.assign(document.createElement("style"), {
			textContent: `
        .trd-box.is-nlf {
            border-color: #dc3545 !important;
            filter: opacity(0.3);
            background: repeating-linear-gradient(
                45deg,
                #dc3545,
                #dc3545 10px,
                transparent 10px,
                transparent 20px
            ) !important;
            pointer-events: none;
            position: relative;
        }
        .nlf-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #000;
            font-weight: 700;
            font-size: 1.25rem;
            text-align: center;
            pointer-events: none;
        }
    `,
		}),
	);

	for (const card of cards) {
		const hash = getCardHash(card);
		const itemId = hash ? hashToItemId.get(hash) : undefined;
		if (itemId === undefined || !nlfIds.has(itemId)) continue;

		card.classList.add("is-nlf");
		const overlay = document.createElement("div");
		overlay.className = "nlf-overlay";
		overlay.innerHTML = `Not Looking For${kilnDisclosureBadgeHtml(showDisclosures)}`;
		card.appendChild(overlay);
	}
}
