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

import { Extension } from "@kiln/schemas";
import { onMessage } from "@/utils/messaging";
import { handle, safeFetch, withApi, withAuthSession } from "./shared";

onMessage("getLibraryAddons", ({ data }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		const params = new URLSearchParams({ page: String(data.page) });
		if (data.search) params.set("search", data.search);
		return safeFetch(
			`${config.resolvedUrls.extension}addons?${params.toString()}`,
			Extension.AddonLibraryApi,
		);
	}),
);

onMessage("getMyAddons", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}addons/mine`,
				Extension.MyAddonsApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);

onMessage("publishAddon", ({ data: { userId, ...body } }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}addons`,
				Extension.PublishAddonApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
					body: JSON.stringify(body),
				},
			),
		),
	),
);

onMessage("reportAddon", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}addons/${encodeURIComponent(data.id)}/report`,
				Extension.AddonOkApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
					body: JSON.stringify({
						category: data.category,
						details: data.details,
					}),
				},
			),
		),
	),
);

onMessage("deleteMyAddon", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}addons/${encodeURIComponent(data.id)}`,
				Extension.AddonOkApi,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);
