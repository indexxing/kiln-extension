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

import { onMessage } from "@/utils/messaging";
import type { StoreListingApi, StoreListingFilters } from "@/utils/types";
import { handle, resolveInjectableTabId } from "./shared";

onMessage("getStoreListing", ({ data: filters, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No active tab");

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [filters],
			func: async (filters: StoreListingFilters) => {
				const query = new URLSearchParams();
				for (const type of filters.types) query.append("types[]", type);
				for (const accessoryType of filters.accessoryTypes)
					query.append("accessoryTypes[]", accessoryType);
				if (filters.currency) query.set("currency", filters.currency);
				query.set("page", String(filters.page));
				if (filters.search) query.set("search", filters.search);
				query.set("sort", filters.sort);
				query.set("order", filters.order);
				query.set("showOffsale", String(filters.showOffsale));
				query.set("collectiblesOnly", String(filters.collectiblesOnly));
				if (
					typeof filters.minPrice === "number" &&
					Number.isFinite(filters.minPrice)
				)
					query.set("minPrice", String(filters.minPrice));
				if (
					typeof filters.maxPrice === "number" &&
					Number.isFinite(filters.maxPrice)
				)
					query.set("maxPrice", String(filters.maxPrice));
				if (filters.creatorName) query.set("creatorName", filters.creatorName);

				try {
					const res = await fetch(`/api/store/items?${query.toString()}`, {
						credentials: "include",
					});
					const body = await res.json().catch(() => null);
					if (!res.ok) {
						return { ok: false as const, status: res.status, body };
					}
					return { ok: true as const, data: body };
				} catch (err) {
					return { ok: false as const, status: 0, body: String(err) };
				}
			},
		});

		const injected = results[0]?.result as
			| { ok: true; data: StoreListingApi }
			| { ok: false; status: number; body: unknown }
			| undefined;

		if (!injected?.ok) {
			console.error("[Kiln] getStoreListing failed:", injected);
			throw new Error(
				`Failed to load store items (status ${injected?.status ?? "unknown"})`,
			);
		}

		if (!Array.isArray(injected.data?.data) || !injected.data?.meta) {
			console.error(
				"[Kiln] getStoreListing unexpected response shape:",
				injected.data,
			);
			throw new Error("Unexpected store items response shape");
		}

		return injected.data;
	}),
);
