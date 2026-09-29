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
import * as avatar from "./avatar";
import * as friends from "./friends";
import * as settings from "./settings";
import * as transactions from "./transactions";

export default defineContentScript({
	matches: ["https://polytoria.com/my/*"],
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

				if (window.location.pathname.includes("settings")) {
					runFeature("injectKilnTab", () => settings.injectKilnTab());
					if (window.location.pathname.includes("kiln-debug")) {
						runFeature("kilnDebug", () => settings.kilnDebug());
					} else if (window.location.pathname.includes("kiln")) {
						runFeature("kilnSettings", () => settings.kilnSettings());
					} else if (
						window.location.pathname.includes("account") &&
						values.enabled.includes("securityKeyRenaming")
					) {
						runFeature("securityKeyRenaming", () =>
							settings.securityKeyRenaming(),
						);
					} else if (
						window.location.pathname.includes("transactions") &&
						values.enabled.includes("irlBrickPrice")
					) {
						runFeature("irlBrickPrice", () =>
							transactions.irlBrickPrice(
								values.config.irlBrickPrice.currency,
								showDisclosures,
							),
						);
					} else {
						runFeature("checkForVerificationCode", () =>
							settings.checkForVerificationCode(user.userId),
						);
					}
				} else if (window.location.pathname.includes("friends")) {
					if (values.enabled.includes("improvedFriendLists")) {
						runFeature("improvedFriendLists", () =>
							friends.actions(showDisclosures),
						);
					}
				} else if (window.location.pathname.includes("avatar")) {
					if (values.enabled.includes("avatarSandbox")) {
						if (new URLSearchParams(window.location.search).has("sandbox")) {
							document.title = "Kiln Character Sandbox";
							runFeature("avatarSandbox", () => avatar.avatarSandbox());

							return;
						} else {
							runFeature("avatarSandboxButton", () => {
								const contMove = document.getElementById("cont-move");
								if (!contMove?.parentElement) return;
								const sandboxButton = document.createElement("a");
								sandboxButton.classList.value =
									"btn btn-outline-success w-100 mt-3";
								sandboxButton.href = "?sandbox=true";
								sandboxButton.innerHTML =
									'<i class="fas fa-shirt"></i> Kiln Character Sandbox';
								contMove.parentElement.appendChild(sandboxButton);
							});
						}
					}

					if (values.enabled.includes("customBodyColorHexCodes")) {
						runFeature("customBodyColorHexCodes", () =>
							avatar.customBodyColorHexCodes(showDisclosures),
						);
					}

					if (values.enabled.includes("outfitManagement")) {
						runFeature("outfitManagement", () =>
							avatar.outfitManagement(showDisclosures),
						);
					}
				}
			});
		});
	},
});
