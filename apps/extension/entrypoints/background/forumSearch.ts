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

import { PolyTrack } from "@kiln/schemas";
import { onMessage } from "@/utils/messaging";
import { handle, resolveInjectableTabId, safeFetch } from "./shared";

onMessage("getForumSearch", ({ data: filters }) =>
	handle(async () => {
		const query = new URLSearchParams({ page: String(filters.page) });
		if (filters.search) query.set("search", filters.search);
		if (filters.sort) query.set("sort", filters.sort);
		if (filters.type) query.set("type", filters.type);
		if (filters.authorIds.length)
			query.set("authorIds", filters.authorIds.join(","));
		if (filters.categoryIds.length)
			query.set("categoryIds", filters.categoryIds.join(","));
		if (filters.postedAfter) query.set("postedAfter", filters.postedAfter);
		if (filters.postedBefore) query.set("postedBefore", filters.postedBefore);
		if (filters.literal) query.set("literal", "true");

		return safeFetch(
			`https://polytrack.top/api/forums?${query.toString()}`,
			PolyTrack.ForumSearchApiSchema,
		);
	}),
);

onMessage("getForumReplyRedirect", ({ data: replyId }) =>
	handle(async () => {
		const response = await fetch(
			`https://polytrack.top/forums/${replyId}?_data=routes%2Fforums.%24threadId`,
			{ credentials: "include" },
		);

		const redirect = response.headers.get("x-remix-redirect");
		if (!redirect) throw new Error("No redirect found for this reply");

		return redirect;
	}),
);

onMessage("showHiddenCategoryAlert", ({ sender }) => {
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) return;

		await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			func: () => {
				//@ts-expect-error
				window.Swal.fire({
					icon: "error",
					title: "Category Hidden",
					text: "This forum category is hidden and can no longer be viewed.",
				});
			},
		});
	});
});
