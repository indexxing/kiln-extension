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
import { kilnDisclosureBadgeHtml } from "@/utils/utilities";
import * as discovery from "./discovery";
import * as inventory from "./inventory";
import * as view from "./view";

function isProfileNotFoundPage(): boolean {
	return Array.from(document.querySelectorAll("h1.display-4")).some(
		(el) => el.textContent?.trim() === "Page Not Found",
	);
}

export default defineContentScript({
	matches: [
		"https://polytoria.com/u/*",
		"https://polytoria.com/users",
		"https://polytoria.com/users?*",
		"https://polytoria.com/users/*",
	],
	main() {
		Promise.all([
			preferences.getPreferences(),
			_showKilnDisclosures.getValue(),
			_condensedTabBars.getValue(),
		]).then(async ([values, showDisclosures, condensedTabBars]) => {
			const segment = window.location.pathname.split("/")[2];
			const isLegacyUrl = window.location.pathname.split("/")[1] === "users";

			if (isLegacyUrl && (!segment || Number.isNaN(Number(segment)))) {
				if (values.enabled.includes("collectibleOwnerLabels")) {
					runFeature("collectibleOwnerLabels", () =>
						discovery.userLabels(
							values.config.collectibleOwnerLabels?.inactiveDays ?? 30,
							values.config.collectibleOwnerLabels?.ogYear ?? 2023,
							showDisclosures,
						),
					);
				}
				return;
			}

			let userId: number;
			if (isLegacyUrl) {
				userId = Number(segment);
			} else {
				const username = decodeURIComponent(segment);

				if (
					values.enabled.includes("bannedUserDetail") &&
					isProfileNotFoundPage()
				) {
					const search = await sendMessage("searchUsersByActivity", username);
					const match =
						search.ok &&
						search.data.find(
							(u) => u.username.toLowerCase() === username.toLowerCase(),
						);

					if (match) {
						(async () => {
							const result = await sendMessage("showBannedUserAlert", match);
							if (!result.ok) {
								console.warn(
									"[Kiln] Failed to show banned user alert:",
									result.message,
								);
							}
						})();
						return;
					}
				}

				const r = await sendMessage("findUserByUsername", segment);
				if (!r.ok) throw new Error(r.message);
				userId = r.data;
			}

			if (import.meta.env.MODE === "development") {
				console.log("[Kiln] Running view page functions: ", view);
			}

			if (
				window.location.pathname.includes("inventory") &&
				values.enabled.includes("inventoryCollectibles")
			) {
				runFeature("inventoryCollectibles", () => {
					const nav = document.getElementsByClassName("nav-pills")[0];
					const parts = window.location.pathname.split("/");
					const profileBase = `/${parts[1]}/${parts[2]}`;
					const collectibleNav = document.createElement("li");
					collectibleNav.classList.add("nav-item");
					collectibleNav.innerHTML = `
					<a href="${profileBase}/inventory/collectibles/" class="nav-link">
						<i class="fa-regular fa-sparkles me-1"></i>
						<span class="pilltitle">Collectibles</span>${kilnDisclosureBadgeHtml(showDisclosures)}
					</a>
					`;
					nav.appendChild(collectibleNav);

					if (window.location.pathname.split("/")[4] === "collectibles") {
						Array.from(nav.children).forEach((element) => {
							element = element.children[0];
							if (!(element === collectibleNav)) {
								if (element.classList.contains("active")) {
									element.classList.remove("active");
								}
							}
						});
						collectibleNav.children[0].classList.add("active");

						const hoardedItemsCard = document.createElement("li");
						hoardedItemsCard.classList.add("nav-item", "text-center");
						hoardedItemsCard.innerHTML = `
						<h6 class="section-title mt-3 px-2">
							Hoarded Items${kilnDisclosureBadgeHtml(showDisclosures)}
						</h6>
						<div class="card bg-dark mt-2">
							<div class="card-body" id="p+hoarded_card"></div>
						</div>
						`;
						nav.appendChild(hoardedItemsCard);

						inventory.collectibleInventoryCategory(userId);
					}
				});
			} else {
				const blocked = document.querySelector(".card-body:has(.fa-ban)");

				if (!blocked) {
					if (values.enabled.includes("userIdDisplay"))
						runFeature("userIdDisplay", () =>
							view.displayId(userId, false, showDisclosures),
						);
					if (values.enabled.includes("collectibleOwnerLabels"))
						runFeature("collectibleOwnerLabels", () =>
							view.userLabels(
								userId,
								values.config.collectibleOwnerLabels?.inactiveDays ?? 30,
								values.config.collectibleOwnerLabels?.ogYear ?? 2023,
								showDisclosures,
							),
						);
					if (values.enabled.includes("outfitCost"))
						runFeature("outfitCost", () =>
							view.outfitCost(
								userId,
								values.enabled.includes("irlBrickPrice"),
								values.config.irlBrickPrice.currency,
								showDisclosures,
							),
						);
					if (values.enabled.includes("rankingPositions"))
						runFeature("rankingPositions", () =>
							view.rankingPositions(userId, showDisclosures),
						);
					if (values.enabled.includes("tgdStats"))
						runFeature("tgdStats", () =>
							view.greatDivideStats(userId, showDisclosures),
						);
					if (values.enabled.includes("classicAvatarPerspective")) {
						runFeature("classicAvatarPerspective", () =>
							document.getElementById("avatarToggleBtn")?.click(),
						);
					}
					if (values.enabled.includes("avatarVersions")) {
						runFeature("avatarVersions", () =>
							view.avatarVersions(userId, showDisclosures),
						);
					}
					if (values.enabled.includes("pinnedAchievements")) {
						runFeature("pinnedAchievements", () =>
							view.pinnedAchievements(userId, showDisclosures),
						);
					}
					if (values.enabled.includes("likeUser")) {
						runFeature("likeUser", () =>
							getUserDetails().then((self) => {
								if (self) view.likeButton(self.userId, userId, showDisclosures);
							}),
						);
					}
					if (
						values.enabled.includes("customProfileThemes") &&
						/^\/(u\/[^/]+|users\/\d+)\/?$/.test(window.location.pathname)
					) {
						runFeature("customProfileThemes", () =>
							getUserDetails().then((self) =>
								view.customProfileThemes(
									self?.userId ?? null,
									userId,
									showDisclosures,
									values.config.customProfileThemes ?? {},
								),
							),
						);
					}
					if (values.enabled.includes("userAliases")) {
						runFeature("userAliases", () =>
							_userAliases.getValue().then((aliases) => {
								view.userAliases(userId, aliases, showDisclosures);
							}),
						);
					}
					if (values.enabled.includes("userCreationsTab")) {
						runFeature("userCreationsTab", () =>
							view.creationsTab(userId, condensedTabBars),
						);
					}
					if (values.enabled.includes("publicAvatarOutfits")) {
						runFeature("publicAvatarOutfits", () =>
							view.publicAvatarOutfits(
								userId,
								showDisclosures,
								condensedTabBars,
							),
						);
					}
					if (values.enabled.includes("userNotes")) {
						runFeature("userNotes", () =>
							view.userNotes(userId, showDisclosures),
						);
					}
					if (values.enabled.includes("avatarMeshDownloader")) {
						runFeature("avatarMeshDownloader", () =>
							view.avatarMeshDownloader(userId),
						);
					}
					if (values.enabled.includes("kilnRegistrationDate")) {
						runFeature("kilnRegistrationDate", () =>
							view.kilnRegistrationDate(userId, showDisclosures),
						);
					}
					if (values.enabled.includes("timezoneSharing")) {
						runFeature("timezoneSharing", () =>
							view.publicTimezone(userId, showDisclosures),
						);
					}
				} else if (values.enabled.includes("basicBlockedInfo")) {
					runFeature("basicBlockedInfo", () => {
						blocked.appendChild(document.createElement("hr"));

						view.displayId(userId, true, showDisclosures);
						view.basicBlockedInfo(userId, showDisclosures);
					});
				}
			}
		});
	},
});
