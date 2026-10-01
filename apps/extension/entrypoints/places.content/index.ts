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
import {
	_condensedTabBars,
	_showKilnDisclosures,
	preferences,
} from "@/utils/storage";
import * as discovery from "./discovery";
import * as manage from "./manage";
import * as view from "./view";

export default defineContentScript({
	matches: [
		"https://polytoria.com/places",
		"https://polytoria.com/places?*",
		"https://polytoria.com/places/*",
		"https://polytoria.com/create/place/*",
	],
	main() {
		Promise.all([
			preferences.getPreferences(),
			_showKilnDisclosures.getValue(),
			_condensedTabBars.getValue(),
		]).then(async ([values, showDisclosures, condensedTabBars]) => {
			const user = await getUserDetails();
			if (!user) {
				console.warn("[Kiln] Failure to get logged in user details.");
				return;
			}

			const [_, first, second] = window.location.pathname.split("/");

			if (second !== undefined && /^\d+$/.test(second)) {
				if (import.meta.env.MODE == "development") {
					console.log("[Kiln] Running view page functions: ", view);
				}

				const creatorAnchor = document.querySelector<HTMLAnchorElement>(
					'.place-hero-content a:has([class^="userlink-"])',
				);
				const creatorId =
					creatorAnchor?.getAttribute("href")?.split("/")[2] ?? null;

				if (values.enabled.includes("legacyWorldViewLayout")) {
					runFeature("legacyWorldViewLayout", () =>
						view.legacyPlaceViewLayout(
							showDisclosures,
							values.config.legacyWorldViewLayout.newerFeatures,
						),
					);
				}
				if (values.enabled.includes("favoritedPlaces")) {
					runFeature("favoritedPlaces", () =>
						view.favoritedPlaces(user.userId, showDisclosures),
					);
				}
				if (values.enabled.includes("downloadableCopyableWorlds")) {
					runFeature("downloadableCopyableWorlds", () =>
						view.downloadableCopyableWorlds(showDisclosures),
					);
				}
				if (values.enabled.includes("placeRevenue")) {
					runFeature("placeRevenue", () =>
						view.approxPlaceRevenue(
							values.enabled.includes("irlBrickPrice"),
							values.config.irlBrickPrice.currency,
							showDisclosures,
						),
					);
				}
				if (values.enabled.includes("playtimeTracking")) {
					runFeature("playtimeTracking", () =>
						view.playtimeTracking(user.userId, showDisclosures),
					);
				}
				if (values.enabled.includes("activeChallengesDisplay")) {
					runFeature("activeChallengesDisplay", () =>
						view.activeChallenges(showDisclosures),
					);
				}
				if (values.enabled.includes("improvedAchievements")) {
					if (values.config.improvedAchievements.progressBar) {
						runFeature("improvedAchievements.progressBar", () =>
							view.achievementsProgressBar(showDisclosures),
						);
					}
					if (values.config.improvedAchievements.opacity) {
						runFeature("improvedAchievements.opacity", () =>
							view.fadedUnearnedAchievements(),
						);
					}
					if (values.config.improvedAchievements.percentages) {
						runFeature("improvedAchievements.percentages", () =>
							view.achievementEarnedPercentages(showDisclosures),
						);
					}
				}
				if (values.enabled.includes("serverShareLinks")) {
					runFeature("serverShareLinks", () =>
						view.serverShareLinks(showDisclosures),
					);
				}
				if (values.enabled.includes("serverRefreshing")) {
					runFeature("serverRefreshing", () =>
						view.serverRefreshing(
							values.enabled.includes("serverShareLinks")
								? (serverList) =>
										view.attachServerShareButtons(serverList, showDisclosures)
								: undefined,
							showDisclosures,
						),
					);
				}
				if (values.enabled.includes("serverUserSearch")) {
					runFeature("serverUserSearch", () =>
						view.serverUserSearch(showDisclosures),
					);
				}

				if (
					values.enabled.includes("creatorCommentLabels") &&
					values.config.creatorCommentLabels.worlds &&
					creatorId
				) {
					runFeature("creatorCommentLabels", () =>
						view.creatorCommentLabels(creatorId),
					);
				}

				if (values.enabled.includes("autoRefreshData")) {
					runFeature("autoRefreshData", () =>
						view.autoRefreshData(
							values.config.autoRefreshData.interval as "30s" | "1m" | "5m",
							showDisclosures,
						),
					);
				}
				if (values.enabled.includes("detailedPlaceReviews")) {
					runFeature("detailedPlaceReviews", () =>
						view.detailedPlaceReviews(
							user.userId,
							showDisclosures,
							condensedTabBars,
							user.userId === 2782,
						),
					);
				}
				if (values.enabled.includes("placeConsumablesTab") && creatorId) {
					runFeature("placeConsumablesTab", () =>
						view.placeConsumablesTab(creatorId, showDisclosures),
					);
				}
			} else if (first === "create") {
				if (import.meta.env.MODE == "development") {
					console.log("[Kiln] Running manage page functions: ", manage);
				}

				if (values.enabled.includes("placeManagement")) {
					if (
						(window.location.pathname.includes("about") ||
							window.location.pathname.split("/").length == 4) &&
						values.config.placeManagement.download
					) {
						runFeature("placeManagement.download", () =>
							manage.placeFileExport(showDisclosures),
						);
					}

					if (
						window.location.pathname.includes("access") &&
						values.config.placeManagement.bulkWhitelist
					) {
						runFeature("placeManagement.bulkWhitelist", () =>
							manage.bulkWhitelist(showDisclosures),
						);
					}

					if (
						window.location.pathname.includes("stats") &&
						values.enabled.includes("worldTrends")
					) {
						runFeature("worldTrends", () => manage.worldTrends());
					}
				}
			} else if (first === "places" && !second) {
				if (import.meta.env.MODE == "development") {
					console.log("[Kiln] Running discovery page functions: ", discovery);
				}

				if (values.enabled.includes("legacyWorldDiscoveryLayout")) {
					runFeature("legacyWorldDiscoveryLayout", () =>
						discovery.legacyWorldDiscoveryLayout(
							showDisclosures,
							values.enabled.includes("disableInfiniteScrolling") &&
								values.config.disableInfiniteScrolling.places,
						),
					);

					if (values.enabled.includes("subtleV2Labels")) {
						runFeature("subtleV2Labels", () =>
							discovery.legacySubtleV2Labels(
								values.config.subtleV2Labels.mode,
								showDisclosures,
							),
						);
					}

					if (values.enabled.includes("randomPlace")) {
						runFeature("randomPlace", () =>
							discovery.legacyRandomPlace(showDisclosures),
						);
					}
				} else if (values.enabled.includes("randomPlace")) {
					runFeature("randomPlace", () =>
						discovery.randomPlace(showDisclosures),
					);
				}
			}
		});
	},
});
