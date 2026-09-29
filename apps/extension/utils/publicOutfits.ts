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

import { Polytoria } from "@kiln/schemas";
import { _reportedOutfits } from "@/utils/storage";
import { getApiSession } from "@/utils/utilities";

const CRAWL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REUPLOAD_MS = 7 * 24 * 60 * 60 * 1000;
const CLAIM_MS = 2 * 60 * 1000;

const MAX_OUTFITS = 100;
const MAX_PAGES = 20;

type SyncedOutfit = { id: number; name: string; thumbnail: string };

async function crawlOutfits(): Promise<SyncedOutfit[]> {
	const outfits: SyncedOutfit[] = [];

	for (let page = 1; page <= MAX_PAGES; page++) {
		const res = await fetch(`/api/avatar/outfits?page=${page}`, {
			credentials: "include",
		});
		if (!res.ok) throw new Error(`Failed to fetch outfits (${res.status})`);
		const json = Polytoria.OutfitsApiSchema.parse(await res.json());

		for (const outfit of json.data) {
			outfits.push({
				id: outfit.id,
				name: outfit.name,
				thumbnail: outfit.avatar.thumbnail,
			});
		}

		if (json.meta.currentPage >= json.meta.lastPage) break;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	return outfits.slice(0, MAX_OUTFITS);
}

async function signatureOf(outfits: SyncedOutfit[]): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(outfits));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

export async function syncPublicOutfits(
	userId: number,
	share: boolean,
	{ force = false }: { force?: boolean } = {},
) {
	const reported = await _reportedOutfits.getValue();
	const last = reported[userId];

	if (!share) {
		if (!last && !force) return;
		const result = await sendMessage("clearPublicOutfits", userId);
		if (!result.ok) {
			console.warn("[Kiln] Failed to stop sharing outfits:", result);
			return;
		}
		const { [userId]: _removed, ...rest } = await _reportedOutfits.getValue();
		await _reportedOutfits.setValue(rest);
		return;
	}

	if (!force && last && Date.now() - last.checkedAt < CRAWL_INTERVAL_MS) return;

	const session = await getApiSession(userId);
	if (session?.state !== "verified") {
		if (force)
			console.warn("[Kiln] Not sharing outfits: Kiln account isn't verified");
		return;
	}

	const claim = {
		signature: last?.signature ?? "",
		uploadedAt: last?.uploadedAt ?? 0,
		checkedAt: Date.now() - CRAWL_INTERVAL_MS + CLAIM_MS,
	};
	await _reportedOutfits.setValue({ ...reported, [userId]: claim });

	const restore = async () => {
		const current = await _reportedOutfits.getValue();
		const { [userId]: _removed, ...rest } = current;
		await _reportedOutfits.setValue(last ? { ...rest, [userId]: last } : rest);
	};

	try {
		const outfits = await crawlOutfits();
		const signature = await signatureOf(outfits);

		const unchanged =
			!force &&
			last?.signature === signature &&
			Date.now() - last.uploadedAt < REUPLOAD_MS;
		if (unchanged) {
			await _reportedOutfits.setValue({
				...(await _reportedOutfits.getValue()),
				[userId]: { ...claim, checkedAt: Date.now() },
			});
			return;
		}

		const result = await sendMessage("syncPublicOutfits", { userId, outfits });
		if (!result.ok) {
			console.warn("[Kiln] Failed to sync public outfits:", result);
			return await restore();
		}

		await _reportedOutfits.setValue({
			...(await _reportedOutfits.getValue()),
			[userId]: { signature, checkedAt: Date.now(), uploadedAt: Date.now() },
		});
	} catch (err) {
		console.warn("[Kiln] Failed to sync public outfits:", err);
		await restore();
	}
}
