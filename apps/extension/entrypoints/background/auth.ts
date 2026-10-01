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
import { apiSessions } from "@/utils/storage";
import { expireKVCache, getKilnBan, pullKVCache } from "@/utils/utilities";
import {
	clearKilnBan,
	dedupe,
	fetchKilnBanStatus,
	handle,
	isBannedError,
	NoSessionError,
	recordKilnBan,
	safeFetch,
	saveKilnBan,
	withApi,
	withAuthSession,
} from "./shared";

function isJwtExpired(token: string): boolean {
	try {
		const payload = JSON.parse(atob(token.split(".")[1]));
		return typeof payload.exp !== "number" || Date.now() >= payload.exp * 1000;
	} catch {
		return true;
	}
}

onMessage("getApiSession", ({ data: userId }) =>
	handle(() =>
		pullKVCache(
			"currentSession",
			String(userId),
			() =>
				withAuthSession(userId, (token, config) =>
					safeFetch(
						`${config.resolvedUrls.extension}auth/me`,
						Extension.CurrentSessionApi,
						{
							headers: {
								Authorization: `Bearer ${token}`,
								"x-kiln-version": browser.runtime.getManifest().version,
							},
						},
					),
				),
			5 * 60 * 1000,
			false,
		),
	),
);

onMessage("startKilnVerification", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		const sessionStore = await apiSessions.getValue();
		const session = sessionStore.find((session) => session.userId == userId);
		const blocked =
			session &&
			(session.state === "verified" ||
				(session.state === "pending" &&
					!!session.verificationToken &&
					!isJwtExpired(session.verificationToken)));
		if (blocked) throw new Error("Session already exists for user");
		if (await getKilnBan(userId)) throw new Error("ACCOUNT_BANNED");
		try {
			return await safeFetch(
				`${config.resolvedUrls.extension}auth/flow/start`,
				Extension.AuthStartApi,
				{
					credentials: "include",
					method: "POST",
					body: JSON.stringify({ userId }),
				},
			);
		} catch (err) {
			if (isBannedError(err)) await recordKilnBan(userId, config);
			throw err;
		}
	}),
);

onMessage("finishKilnVerification", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		const sessionStore = await apiSessions.getValue();
		const session = sessionStore.find((session) => session.userId == userId);
		if (!session?.verificationToken)
			throw new Error("No pending verification for user");
		let result: Extension.AuthEndApi;
		try {
			result = await safeFetch(
				`${config.resolvedUrls.extension}auth/flow/end`,
				Extension.AuthEndApi,
				{
					credentials: "include",
					method: "POST",
					headers: { Authorization: `Bearer ${session.verificationToken}` },
				},
			);
		} catch (err) {
			if (isBannedError(err)) await recordKilnBan(userId, config);
			throw err;
		}
		await clearKilnBan(userId);
		await expireKVCache("currentSession", String(userId));
		return result;
	}),
);

onMessage("checkKilnBan", ({ data: userId }) =>
	handle(() =>
		dedupe(`checkKilnBan:${userId}`, async () => {
			const ban = await getKilnBan(userId);
			if (!ban?.refreshToken) return ban;

			const config = await withApi("kiln_api", "extension");
			let status: Awaited<ReturnType<typeof fetchKilnBanStatus>>;
			try {
				status = await fetchKilnBanStatus(ban.refreshToken, config);
			} catch {
				return ban;
			}

			if (!status.banned) {
				await clearKilnBan(userId);
				return null;
			}

			const updated = {
				...ban,
				reason: status.reason,
				bannedAt: status.bannedAt,
			};
			await saveKilnBan(updated);
			return updated;
		}),
	),
);

onMessage("terminateKilnSession", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		const sessionStore = await apiSessions.getValue();
		const session = sessionStore.find((s) => s.userId == userId);
		if (!session?.accessToken || !session?.refreshToken)
			throw new NoSessionError();
		await safeFetch(`${config.resolvedUrls.extension}auth/terminate`, null, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${session.accessToken}`,
				"x-kiln-refresh-token": session.refreshToken,
			},
		});
		await apiSessions.setValue(sessionStore.filter((s) => s.userId != userId));
		await expireKVCache("currentSession", String(userId));
		return null;
	}),
);

onMessage("getKilnSessions", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}auth/sessions`,
				Extension.AuthSessionsApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);

onMessage("terminateKilnSessionById", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}auth/sessions/${encodeURIComponent(data.sessionId)}`,
				null,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			).then(() => null),
		),
	),
);

onMessage("getPublishedTheme", ({ data: id }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return safeFetch(
			`${config.resolvedUrls.extension}themes/${encodeURIComponent(id)}`,
			Extension.GetPublishedThemeApi,
		);
	}),
);

onMessage("getThemeGallery", ({ data: page }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return safeFetch(
			`${config.resolvedUrls.extension}themes/gallery?page=${page ?? 1}`,
			Extension.ThemeGalleryApi,
		);
	}),
);

onMessage("publishTheme", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}themes`,
				Extension.PublishThemeApi,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: data.name,
						accentColor: data.accentColor,
						navbarColor: data.navbarColor,
						...(data.fontFamily ? { fontFamily: data.fontFamily } : {}),
						...(data.customCss ? { customCss: data.customCss } : {}),
						...(data.backgroundImage
							? { backgroundImage: data.backgroundImage }
							: {}),
						...(data.effects?.length ? { effects: data.effects } : {}),
						...(data.existingId ? { existingId: data.existingId } : {}),
						...(data.navbarIconColor
							? { navbarIconColor: data.navbarIconColor }
							: {}),
						...(data.colorTokens && Object.keys(data.colorTokens).length
							? { colorTokens: data.colorTokens }
							: {}),
						...(data.ambient ? { ambient: data.ambient } : {}),
						...(data.cardStyle ? { cardStyle: data.cardStyle } : {}),
						...(data.pointerEffects
							? { pointerEffects: data.pointerEffects }
							: {}),
						...(data.cursorUrl ? { cursorUrl: data.cursorUrl } : {}),
						...(data.backgroundOverlayColor
							? { backgroundOverlayColor: data.backgroundOverlayColor }
							: {}),
						...(data.backgroundOverlayOpacity !== undefined
							? { backgroundOverlayOpacity: data.backgroundOverlayOpacity }
							: {}),
					}),
				},
			),
		),
	),
);

onMessage("unpublishTheme", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}themes/${data.id}/unpublish`,
				Extension.UnpublishThemeApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("deletePublishedTheme", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}themes/${data.id}`,
				Extension.UnpublishThemeApi,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("reportTheme", ({ data }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return safeFetch(
			`${config.resolvedUrls.extension}themes/${encodeURIComponent(data.id)}/report`,
			Extension.ReportThemeApi,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reason: data.reason }),
			},
		);
	}),
);

onMessage("adminGetPendingThemes", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/themes/pending`,
				Extension.AdminPendingThemesApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);

onMessage("adminReviewTheme", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/themes/${encodeURIComponent(data.id)}/${data.action}`,
				Extension.AdminReviewThemeApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminGetPendingProfileThemes", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/profile-themes/pending`,
				Extension.AdminPendingProfileThemesApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);

onMessage("adminReviewProfileTheme", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/profile-themes/${data.targetUserId}/${data.action}`,
				Extension.ProfileThemeOkApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminDeleteProfileTheme", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/profile-themes/${data.targetUserId}`,
				Extension.ProfileThemeOkApi,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminListConfigs", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/config`,
				Extension.AdminConfigListApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);

onMessage("adminGetConfig", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (_token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}data/config?v=${encodeURIComponent(data.version)}`,
				Extension.ExtensionConfigSchema,
				{},
			),
		),
	),
);

onMessage("adminUpdateConfig", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/config/${encodeURIComponent(data.version)}`,
				Extension.AdminConfigApi,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(data.patch),
				},
			),
		),
	),
);

onMessage("adminDeleteConfig", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/config/${encodeURIComponent(data.version)}`,
				Extension.AdminDeleteConfigApi,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminDeleteTheme", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/themes/${encodeURIComponent(data.id)}`,
				Extension.AdminDeleteThemeApi,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminDeletePlaceReview", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/reviews/${encodeURIComponent(data.id)}`,
				Extension.AdminDeletePlaceReviewApi,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminBanUser", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/users/${data.targetUserId}/ban`,
				Extension.AdminBanUserApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
					body: JSON.stringify(data.reason ? { reason: data.reason } : {}),
				},
			),
		),
	),
);

onMessage("adminUnbanUser", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/users/${data.targetUserId}/unban`,
				Extension.AdminBanUserApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminGetBannedUsers", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) => {
			const params = new URLSearchParams();
			if (data.search) params.set("search", data.search);
			if (data.page) params.set("page", String(data.page));

			return safeFetch(
				`${config.resolvedUrls.extension}admin/users/banned?${params.toString()}`,
				Extension.AdminBannedUsersApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			);
		}),
	),
);

onMessage("adminGetFeedback", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) => {
			const params = new URLSearchParams();
			if (data.type) params.set("type", data.type);
			if (data.status) params.set("status", data.status);
			if (data.unanswered) params.set("unanswered", "true");
			if (data.search) params.set("search", data.search);
			if (data.page) params.set("page", String(data.page));

			return safeFetch(
				`${config.resolvedUrls.extension}admin/feedback?${params.toString()}`,
				Extension.AdminFeedbackListApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			);
		}),
	),
);

onMessage("adminRespondFeedback", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/feedback/${encodeURIComponent(data.id)}/respond`,
				Extension.AdminFeedbackApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
					body: JSON.stringify({ response: data.response }),
				},
			),
		),
	),
);

onMessage("adminResolveFeedback", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/feedback/${encodeURIComponent(data.id)}/resolve`,
				Extension.AdminFeedbackApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminReopenFeedback", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/feedback/${encodeURIComponent(data.id)}/reopen`,
				Extension.AdminFeedbackApi,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminDeleteFeedback", ({ data }) =>
	handle(() =>
		withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/feedback/${encodeURIComponent(data.id)}`,
				Extension.AdminDeleteFeedbackApi,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("adminGetStats", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}admin/stats`,
				Extension.AdminStatsApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);
