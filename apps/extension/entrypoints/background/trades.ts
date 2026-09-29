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

import { LOVE } from "@kiln/schemas";
import { onMessage } from "@/utils/messaging";
import { pullBulkKVCache, pullKVCache } from "@/utils/utilities";
import {
	checkRateLimit,
	handle,
	resolveInjectableTabId,
	safeFetch,
} from "./shared";

onMessage("rejectTrade", ({ data: tradeId, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No active tab");

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [tradeId],
			func: async (tradeId: number) => {
				const getCookie = (name: string) => {
					const value = `; ${document.cookie}`;
					const parts = value.split(`; ${name}=`);
					if (parts.length === 2) return parts.pop()!.split(";").shift();
				};

				const xsrfCookie = getCookie("XSRF-TOKEN");
				if (!xsrfCookie) return false;
				const xsrfToken = decodeURIComponent(xsrfCookie);

				const res = await fetch("/api/trade/decline", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-XSRF-Token": xsrfToken,
					},
					body: JSON.stringify({ id: tradeId }),
					credentials: "include",
				});
				return res.ok;
			},
		});

		const ok = results[0]?.result;
		if (!ok) throw new Error("Failed to decline trade");
		return true;
	}),
);

onMessage("getPolytoriaTradeItems", ({ data: itemIds }) =>
	handle(async () => {
		checkRateLimit("polytoria_trade", 100);
		if (itemIds.length === 0) return [];

		const cached = await pullBulkKVCache(
			"polytoriaTradeItems",
			itemIds.map(String),
			async (missing) => {
				const missingIds = missing.map(Number);
				const input = Object.fromEntries(
					missingIds.map((id, i) => [i.toString(), id]),
				);
				const params = missingIds.map(() => "getItemWithTags").join(",");
				const url = `https://polytoria.trade/api/trpc/${params}?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`;

				const res = await safeFetch(url, null);
				const parsed = LOVE.PolytoriaTradeBatchResponse.safeParse(
					JSON.parse(res as string),
				);
				if (!parsed.success) {
					console.warn(
						"[Kiln] polytoria.trade response failed validation",
						parsed.error,
					);
					return Object.fromEntries(missingIds.map((id) => [String(id), null]));
				}
				return Object.fromEntries(
					missingIds.map((id, i) => [
						String(id),
						parsed.data[i]?.result.data ?? null,
					]),
				);
			},
			5 * 60 * 1000,
			false,
		);

		return itemIds.map((itemId) => ({
			itemId,
			data: cached[String(itemId)] ?? null,
		}));
	}),
);

onMessage("getItemOwnerHistory", ({ data: itemId }) =>
	handle(async () => {
		checkRateLimit("polytoria_trade", 100);

		const inputParam = encodeURIComponent(
			JSON.stringify({ "0": itemId, "1": itemId }),
		);

		const cached = await pullKVCache(
			"itemOwnerHistory",
			itemId?.toString(),
			async () =>
				safeFetch(
					`https://polytoria.trade/api/trpc/getRecentItemHistory?batch=1&input=${inputParam}`,
					LOVE.PolytoriaTradeOwnerHistory,
					{
						method: "GET",
					},
				),
			60 * 1000,
			false,
		);

		return cached;
	}),
);
