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

import type { Extension } from "@kiln/schemas";
import { _screenedNotificationIds } from "@/utils/storage";
import type { ParsedTrade, UserDetails } from "@/utils/types";
import { applyKilnDisclosureTitle, parseTrade } from "@/utils/utilities";

export type TradeVerdict = "nft" | "nlf";

const TRADE_NOTIFICATION = /received a trade request/i;
const SCREEN_DELAY_MS = 500;
const MAX_TRACKED_NOTIFICATIONS = 500;

const VERDICT_REASONS: Record<TradeVerdict, string> = {
	nft: "Trade auto-rejected: it asks for an item marked Not for Trade",
	nlf: "Trade auto-rejected: it offers an item marked Not Looking For",
};

export function screenTrade(
	trade: ParsedTrade,
	username: string,
	nft: Extension.NFTItemsApi["data"] | null,
	nlf: Set<number> | null,
): TradeVerdict | null {
	if (trade.status !== "pending") return null;

	const lower = username.toLowerCase();
	let myIndex = trade.sides.findIndex(
		(s) => s.username.toLowerCase() === lower,
	);
	if (myIndex === -1) {
		const theirIndex = trade.sides.findIndex(
			(s) => s.username.toLowerCase() === trade.counterparty.toLowerCase(),
		);
		if (theirIndex === -1) return null;
		myIndex = theirIndex === 0 ? 1 : 0;
	}

	const mine = trade.sides[myIndex].items;
	const theirs = trade.sides[myIndex === 0 ? 1 : 0].items;

	if (nft) {
		for (const { storeId, serial } of mine) {
			const entry = nft.find((e) => e.itemId === storeId);
			if (!entry) continue;
			if (entry.serials === null) return "nft";
			if (serial !== null && entry.serials.includes(serial)) return "nft";
		}
	}

	if (nlf && theirs.some((item) => nlf.has(item.storeId))) return "nlf";

	return null;
}

export async function screenTradeNotifications(
	user: UserDetails,
	features: { nft: boolean; nlf: boolean },
	showDisclosures: boolean,
): Promise<void> {
	const popup = document.querySelector<HTMLElement>(".notifications-popup");
	if (!popup) return;

	const getNotifications = () =>
		[
			...popup.querySelectorAll<HTMLAnchorElement>(
				':scope > a[href^="/my/notifications/"]',
			),
		].flatMap((anchor) => {
			const id = anchor
				.getAttribute("href")
				?.match(/^\/my\/notifications\/(\d+)\/?$/)?.[1];
			return id ? [{ id: Number(id), anchor }] : [];
		});

	const stored = await _screenedNotificationIds.getValue();
	const isFirstRun = stored[user.userId] === undefined;
	const screened = new Set(
		stored[user.userId] ?? getNotifications().map((n) => n.id),
	);
	if (isFirstRun) {
		await _screenedNotificationIds.setValue({
			...stored,
			[user.userId]: [...screened],
		});
	}

	async function screenOne(id: number, anchor: HTMLAnchorElement) {
		const message = anchor.textContent ?? "";
		if (!TRADE_NOTIFICATION.test(message)) return;

		const res = await fetch(`/my/notifications/${id}`, {
			credentials: "include",
		});
		const tradeId = new URL(res.url).pathname.match(
			/^\/trade\/view\/(\d+)/,
		)?.[1];
		if (!tradeId) return;

		const doc = new DOMParser().parseFromString(await res.text(), "text/html");
		let trade: ParsedTrade;
		try {
			trade = parseTrade(doc);
		} catch {
			return;
		}

		const [nftResult, nlfResult] = await Promise.all([
			features.nft
				? sendMessage("getNFTItems", user.userId)
				: Promise.resolve(null),
			features.nlf
				? sendMessage("getNLFItems", user.userId)
				: Promise.resolve(null),
		]);

		const verdict = screenTrade(
			trade,
			user.username,
			nftResult?.ok ? nftResult.data.data : null,
			nlfResult?.ok ? new Set(nlfResult.data.data) : null,
		);
		if (!verdict) return;

		const result = await sendMessage("rejectTrade", Number(tradeId));
		if (result.ok) {
			anchor.style.opacity = "0.5";
			applyKilnDisclosureTitle(
				anchor,
				showDisclosures,
				VERDICT_REASONS[verdict],
			);
		} else {
			applyKilnDisclosureTitle(
				anchor,
				showDisclosures,
				"Kiln couldn't auto-reject this trade",
			);
		}
	}

	async function run() {
		const all = await _screenedNotificationIds.getValue();
		for (const id of all[user.userId] ?? []) screened.add(id);

		const fresh = getNotifications().filter((n) => !screened.has(n.id));
		if (!fresh.length) return;

		for (const { id } of fresh) screened.add(id);
		await _screenedNotificationIds.setValue({
			...all,
			[user.userId]: [...screened].slice(-MAX_TRACKED_NOTIFICATIONS),
		});

		for (let i = 0; i < fresh.length; i++) {
			if (i > 0) await new Promise((r) => setTimeout(r, SCREEN_DELAY_MS));
			try {
				await screenOne(fresh[i].id, fresh[i].anchor);
			} catch (err) {
				console.warn("[Kiln] Failed to screen trade notification", err);
			}
		}
	}

	let chain: Promise<void> = Promise.resolve();
	const scan = () => {
		chain = chain.then(run).catch(() => {});
	};

	new MutationObserver(scan).observe(popup, { childList: true });
	if (!isFirstRun) scan();
}
