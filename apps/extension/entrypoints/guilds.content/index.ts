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
import * as view from "./view";

export default defineContentScript({
	matches: [
		"https://polytoria.com/guilds",
		"https://polytoria.com/guilds?*",
		"https://polytoria.com/guilds/*",
	],
	main() {
		Promise.all([
			preferences.getPreferences(),
			_showKilnDisclosures.getValue(),
		]).then(async ([values, showDisclosures]) => {
			const user = await getUserDetails();
			if (!user) {
				console.warn("[Kiln] Failure to get logged in user details.");
				return;
			}

			const [_, _first, second] = window.location.pathname.split("/");

			if (!second) {
				if (import.meta.env.MODE == "development") {
					console.log("[Kiln] Running discovery page functions: ", discovery);
				}

				if (values.enabled.includes("condensedJoinedGuildsList")) {
					runFeature("condensedJoinedGuildsList", () =>
						discovery.condensedJoinedGuildsList(showDisclosures),
					);
				}
			} else if (/^\d+$/.test(second)) {
				if (import.meta.env.MODE == "development") {
					console.log("[Kiln] Running view page functions: ", view);
				}

				if (
					values.enabled.includes("creatorCommentLabels") &&
					values.config.creatorCommentLabels.guilds
				) {
					runFeature("creatorCommentLabels", () =>
						view.creatorCommentLabels(showDisclosures),
					);
				}
			}
		});
	},
});
