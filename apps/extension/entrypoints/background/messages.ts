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
import { handle, safeFetch, withAuthSession } from "./shared";

const authHeaders = (token: string) => ({
	Authorization: `Bearer ${token}`,
	"x-kiln-version": browser.runtime.getManifest().version,
});

onMessage("getMessagingStatus", ({ data: userId }) =>
	handle(async () =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}messages/status`,
				Extension.MessagingStatusApi,
				{ headers: authHeaders(token) },
			),
		),
	),
);

onMessage("setMessagingEnabled", ({ data: { userId, enabled } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}messages/settings`,
				Extension.MessagingSettingsApi,
				{
					method: "PUT",
					headers: authHeaders(token),
					body: JSON.stringify({ enabled }),
				},
			),
		);
		return result.data.enabled;
	}),
);

onMessage("getDirectConversations", ({ data: userId }) =>
	handle(async () =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}messages/conversations`,
				Extension.DirectConversationsApi,
				{ headers: authHeaders(token) },
			),
		),
	),
);

onMessage("getDirectMessages", ({ data: { userId, partnerId, before } }) =>
	handle(async () =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}messages/conversations/${partnerId}${before ? `?before=${before}` : ""}`,
				Extension.DirectMessagesApi,
				{ headers: authHeaders(token) },
			),
		),
	),
);

onMessage(
	"sendDirectMessage",
	({ data: { userId, recipientId, body, imageAssetId } }) =>
		handle(async () =>
			withAuthSession(userId, (token, config) =>
				safeFetch(
					`${config.resolvedUrls.extension}messages/conversations/${recipientId}`,
					Extension.SendDirectMessageApi,
					{
						method: "POST",
						headers: authHeaders(token),
						body: JSON.stringify({ body, imageAssetId }),
					},
				),
			),
		),
);

onMessage("markDirectConversationRead", ({ data: { userId, partnerId } }) =>
	handle(async () => {
		await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}messages/conversations/${partnerId}/read`,
				Extension.NullDataApi,
				{ method: "POST", headers: authHeaders(token) },
			),
		);
		return null;
	}),
);

onMessage("setDirectMessageBlock", ({ data: { userId, partnerId, blocked } }) =>
	handle(async () => {
		await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}messages/blocks/${partnerId}`,
				Extension.NullDataApi,
				{
					method: blocked ? "PUT" : "DELETE",
					headers: authHeaders(token),
				},
			),
		);
		return null;
	}),
);

onMessage(
	"reportDirectMessage",
	({ data: { userId, messageId, reason, details } }) =>
		handle(async () =>
			withAuthSession(userId, (token, config) =>
				safeFetch(
					`${config.resolvedUrls.extension}messages/${messageId}/report`,
					Extension.ReportDirectMessageApi,
					{
						method: "POST",
						headers: authHeaders(token),
						body: JSON.stringify({ reason, details }),
					},
				),
			),
		),
);
