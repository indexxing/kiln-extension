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

import type { PolyTrack } from "@kiln/schemas";
import { _forumMentionChecks, _kilnNotifications } from "@/utils/storage";
import type { Result, UserDetails } from "@/utils/types";
import {
	fireKilnNotification,
	injectNotification,
	markKilnNotificationRead,
} from "@/utils/utilities";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const MAX_MENTION_PAGES = 10;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function checkForumMentions(user: UserDetails): Promise<void> {
	const checks = await _forumMentionChecks.getValue();
	const previous = checks[user.userId];
	const now = Date.now();
	if (previous && now - previous.checkedAt < CHECK_INTERVAL_MS) return;

	const since = previous?.since ?? new Date(now).toISOString();
	await _forumMentionChecks.setValue({
		...checks,
		[user.userId]: { since, checkedAt: now },
	});

	const mention = new RegExp(
		`(?<!\\w)@${escapeRegExp(user.username)}(?!\\w)`,
		"i",
	);
	const sinceDate = new Date(since);
	const existing = await _kilnNotifications.getValue();

	let page: number | null = 1;
	let pagesFetched = 0;
	let reachedSeen = false;

	while (page !== null && pagesFetched < MAX_MENTION_PAGES && !reachedSeen) {
		const currentPage: number = page;
		pagesFetched++;

		const result: Result<PolyTrack.ForumSearchApi> = await sendMessage(
			"getForumSearch",
			{
				page: currentPage,
				search: `@${user.username}`,
				sort: "newest",
				type: "both",
				authorIds: [],
				categoryIds: [],
				postedAfter: "",
				postedBefore: "",
				literal: true,
			},
		);
		if (!result.ok) return;

		for (const entry of result.data.entries) {
			if (entry.author.polytoriaId === user.userId) continue;

			const postedAt = new Date(entry.postedAt);
			if (postedAt < sinceDate) {
				reachedSeen = true;
				break;
			}

			const id = `forum-mention-${entry.kind}-${entry.id}`;
			if (id in existing) continue;

			if (!mention.test(`${entry.title}\n${entry.content}`)) continue;

			const title =
				(entry.kind === "reply" ? entry.thread.title : entry.title) ||
				"Untitled thread";
			const url =
				entry.kind === "reply"
					? `/forum/post/${entry.threadId}#reply-${entry.id}`
					: `/forum/post/${entry.id}`;
			const message = `${entry.author.username} mentioned you in "${title}"`;

			await fireKilnNotification({
				userId: user.userId,
				id,
				message,
				date: postedAt,
				url,
				avatarUrl: entry.author.avatarUrl,
			});
			injectNotification({
				message,
				date: postedAt,
				url,
				avatarUrl: entry.author.avatarUrl,
				unread: true,
				lightBell: true,
				onClick: () => markKilnNotificationRead(id),
			});
		}

		page = result.data.nextPage;
	}
}
