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

import { runFeature } from "@/utils/runFeature";
import { _showKilnDisclosures, preferences } from "@/utils/storage";
import * as discovery from "./discovery";
import * as models from "./models";
import * as uploads from "./uploads";
import * as worlds from "./worlds";

const PENDING_ASSET_APPROVAL_PATHS = [
	"/create/audio",
	"/create/image",
	"/create/mesh",
	"/create/gamePass",
	"/create/consumable",
];

export default defineContentScript({
	matches: [
		"https://polytoria.com/library",
		"https://polytoria.com/models/*",
		"https://polytoria.com/create*",
		"https://polytoria.com/create/place*",
	],
	main() {
		Promise.all([
			preferences.getPreferences(),
			_showKilnDisclosures.getValue(),
		]).then(([values, showDisclosures]) => {
			getUserDetails().then((user) => {
				if (!user) {
					console.warn("[Kiln] Failure to get logged in user details.");
					return;
				}

				if (window.location.pathname.includes("library")) {
					if (values.enabled.includes("audioToolboxPreviews")) {
						runFeature("audioToolboxPreviews", () =>
							discovery.audioPreviews(showDisclosures),
						);
					}
				} else if (window.location.pathname.includes("models")) {
					if (values.enabled.includes("modelTreeInspector")) {
						runFeature("modelTreeInspector", () =>
							models.modelTreeInspector(showDisclosures),
						);
					}
				} else {
					if (values.enabled.includes("v2WorldLabels")) {
						runFeature("v2WorldLabels", () =>
							worlds.v2WorldLabels(showDisclosures),
						);
					}

					if (values.enabled.includes("favoredDevelopmentGuild")) {
						runFeature("favoredDevelopmentGuild", () =>
							favoredDevelopmentGuild(
								values.config.favoredDevelopmentGuild.guildId,
							),
						);
					}

					if (
						values.enabled.includes("assetApprovedNotifications") &&
						PENDING_ASSET_APPROVAL_PATHS.some((path) =>
							window.location.pathname.startsWith(path),
						)
					) {
						runFeature("assetApprovedNotifications", () =>
							uploads.trackPendingAssetApprovals(),
						);
					}
				}
			});
		});
	},
});

function favoredDevelopmentGuild(favoredGuildId: number | null) {
	const getCurrentGuildId = (): number | null => {
		const guildId = new URLSearchParams(window.location.search).get("guildID");
		return guildId ? Number(guildId) : null;
	};

	const updateGuildsTabLink = (guildId: number): void => {
		const tab = document.querySelector<HTMLAnchorElement>("#guilds-tab");
		if (tab) tab.href = `/create?guildID=${guildId}`;
	};

	const saveFavoredGuild = async (guildId: number): Promise<void> => {
		const current = await preferences.getValue();
		await preferences.setValue({
			...current,
			config: {
				...current.config,
				favoredDevelopmentGuild: {
					...current.config.favoredDevelopmentGuild,
					guildId,
				},
			},
		});
	};

	const addFavoriteButton = (currentGuildId: number): void => {
		const select = document.querySelector<HTMLSelectElement>("#guild-select");
		if (!select) return;

		const button = document.createElement("button");
		button.type = "button";
		button.className = "btn btn-outline-primary w-100 mb-3";

		const refreshButtonState = (isFavored: boolean): void => {
			button.innerHTML = isFavored
				? '<i class="fas fa-star me-1"></i> Favored Guild'
				: '<i class="fad fa-star me-1"></i> Mark as Favored Guild';
			button.disabled = isFavored;
		};
		refreshButtonState(currentGuildId === favoredGuildId);

		button.addEventListener("click", async () => {
			await saveFavoredGuild(currentGuildId);
			favoredGuildId = currentGuildId;
			refreshButtonState(true);
			updateGuildsTabLink(currentGuildId);
		});

		select.insertAdjacentElement("afterend", button);
	};

	if (favoredGuildId !== null) {
		updateGuildsTabLink(favoredGuildId);
	}

	const currentGuildId = getCurrentGuildId();
	if (currentGuildId !== null) {
		addFavoriteButton(currentGuildId);
	}
}
