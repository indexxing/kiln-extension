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

import type { Runtime } from "webextension-polyfill";
import { onMessage } from "@/utils/messaging";
import type {
	FeaturedPlacesApi,
	PlacesListingApi,
	PlacesListingFilters,
} from "@/utils/types";
import { handle, resolveInjectableTabId } from "./shared";

export async function fetchPlacesListing(
	filters: PlacesListingFilters,
	sender?: Runtime.MessageSender,
): Promise<PlacesListingApi> {
	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) throw new Error("No active tab");

	const results = await browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		args: [filters],
		func: async (filters: PlacesListingFilters) => {
			const query = new URLSearchParams();
			query.set("page", String(filters.page));
			query.set("search", filters.search);
			query.set("genre", filters.genre);
			query.set("sort", filters.sort);
			query.set("branch", filters.branch);

			try {
				const res = await fetch(`/api/places?${query.toString()}`, {
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
		| { ok: true; data: PlacesListingApi }
		| { ok: false; status: number; body: unknown }
		| undefined;

	if (!injected?.ok) {
		console.error("[Kiln] getPlacesListing failed:", injected);
		throw new Error(
			`Failed to load places (status ${injected?.status ?? "unknown"})`,
		);
	}

	if (!Array.isArray(injected.data?.data) || !injected.data?.meta) {
		console.error(
			"[Kiln] getPlacesListing unexpected response shape:",
			injected.data,
		);
		throw new Error("Unexpected places response shape");
	}

	return injected.data;
}

onMessage("getPlacesListing", ({ data: filters, sender }) =>
	handle(() => fetchPlacesListing(filters, sender)),
);

onMessage("getFeaturedPlaces", ({ sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No active tab");

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			func: async () => {
				try {
					const res = await fetch("/api/places/featured", {
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
			| { ok: true; data: FeaturedPlacesApi }
			| { ok: false; status: number; body: unknown }
			| undefined;

		if (!injected?.ok) {
			console.error("[Kiln] getFeaturedPlaces failed:", injected);
			throw new Error(
				`Failed to load featured places (status ${injected?.status ?? "unknown"})`,
			);
		}

		if (!Array.isArray(injected.data)) {
			console.error(
				"[Kiln] getFeaturedPlaces unexpected response shape:",
				injected.data,
			);
			throw new Error("Unexpected featured places response shape");
		}

		return injected.data;
	}),
);
