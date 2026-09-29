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
import { expireKVCache, pullKVCache } from "@/utils/utilities";
import {
	dedupe,
	handle,
	requireApi,
	safeFetch,
	withApi,
	withAuthSession,
} from "./shared";

const PROFILE_THEME_CACHE_TTL = 60 * 1000;

onMessage("getProfileTheme", ({ data: userId }) =>
	handle(async () => {
		const config = await requireApi("extension");
		return dedupe(`profileTheme:${userId}`, () =>
			pullKVCache(
				"profileThemes",
				String(userId),
				() =>
					safeFetch(
						`${config.resolvedUrls.extension}profile-themes/${userId}`,
						Extension.ProfileThemeApi,
					),
				PROFILE_THEME_CACHE_TTL,
				false,
			),
		);
	}),
);

onMessage("getMyProfileTheme", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}profile-themes/me`,
				Extension.ProfileThemeApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);

onMessage("saveProfileTheme", ({ data }) =>
	handle(async () => {
		const result = await withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}profile-themes`,
				Extension.ProfileThemeApi,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						accentColor: data.accentColor,
						navbarColor: data.navbarColor,
						...(data.fontFamily && data.fontFamily !== "default"
							? { fontFamily: data.fontFamily }
							: {}),
						...(data.customCss ? { customCss: data.customCss } : {}),
						...(data.backgroundImage
							? { backgroundImage: data.backgroundImage }
							: {}),
						...(data.backgroundOverlayColor
							? { backgroundOverlayColor: data.backgroundOverlayColor }
							: {}),
						...(data.backgroundOverlayOpacity !== undefined
							? { backgroundOverlayOpacity: data.backgroundOverlayOpacity }
							: {}),
						...(data.effects?.length ? { effects: data.effects } : {}),
						...(data.navbarIconColor
							? { navbarIconColor: data.navbarIconColor }
							: {}),
						...(data.cursorUrl ? { cursorUrl: data.cursorUrl } : {}),
						...(data.colorTokens && Object.keys(data.colorTokens).length
							? { colorTokens: data.colorTokens }
							: {}),
						...(data.layout ? { layout: data.layout } : {}),
						...(data.usernameStyle
							? { usernameStyle: data.usernameStyle }
							: {}),
						...(data.banner ? { banner: data.banner } : {}),
						...(data.ambient ? { ambient: data.ambient } : {}),
						...(data.stickers?.length ? { stickers: data.stickers } : {}),
						...(data.notes?.length ? { notes: data.notes } : {}),
						...(data.cardStyle ? { cardStyle: data.cardStyle } : {}),
						...(data.avatarBackdrop
							? { avatarBackdrop: data.avatarBackdrop }
							: {}),
						...(data.pointerEffects
							? { pointerEffects: data.pointerEffects }
							: {}),
					}),
				},
			),
		);
		await expireKVCache("profileThemes", String(data.userId));
		return result;
	}),
);

onMessage("setProfileThemeEnabled", ({ data }) =>
	handle(async () => {
		const result = await withAuthSession(data.userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}profile-themes/me/enabled`,
				Extension.ProfileThemeOkApi,
				{
					method: "PATCH",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ enabled: data.enabled }),
				},
			),
		);
		await expireKVCache("profileThemes", String(data.userId));
		return result;
	}),
);

onMessage("deleteProfileTheme", ({ data: userId }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}profile-themes/me`,
				Extension.ProfileThemeOkApi,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		);
		await expireKVCache("profileThemes", String(userId));
		return result;
	}),
);

onMessage("reportProfileTheme", ({ data }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return safeFetch(
			`${config.resolvedUrls.extension}profile-themes/${data.userId}/report`,
			Extension.ProfileThemeOkApi,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reason: data.reason }),
			},
		);
	}),
);
