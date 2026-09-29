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
	_forumFeedbackRedirectBanner,
	_kilnUpdatesCategory,
	_showKilnDisclosures,
	_viewedForumThreads,
	preferences,
} from "@/utils/storage";
import * as create from "./create";
import * as search from "./search";
import * as view from "./view";

const MAX_VIEWED_FORUM_THREADS = 500;

function composerFeatures(
	values: Awaited<ReturnType<typeof preferences.getPreferences>>,
	showDisclosures: boolean,
) {
	if (values.enabled.includes("forumMarkdownButtons"))
		runFeature("forumMarkdownButtons", () =>
			create.forumMarkdownButtons(showDisclosures),
		);
	if (values.enabled.includes("forumPostPreview"))
		runFeature("forumPostPreview", () =>
			create.forumPostPreview(
				values.config.forumPostPreview.autoShow,
				showDisclosures,
				values.enabled.includes("forumImageLibrary"),
			),
		);
	if (values.enabled.includes("forumCharacterCount"))
		runFeature("forumCharacterCount", () => create.forumCharacterCount());
	if (values.enabled.includes("forumImageLibrary"))
		runFeature("forumImageLibrary", () => create.forumImageLibrary());
	if (values.enabled.includes("forumFilteredWordHighlight"))
		runFeature("forumFilteredWordHighlight", () =>
			create.forumFilteredWordHighlight(),
		);
}

export default defineContentScript({
	matches: [
		"https://polytoria.com/forum",
		"https://polytoria.com/forum?*",
		"https://polytoria.com/forum/*",
	],
	main() {
		Promise.all([
			preferences.getPreferences(),
			_showKilnDisclosures.getValue(),
			_forumFeedbackRedirectBanner.getValue(),
			_kilnUpdatesCategory.getValue(),
		]).then(
			([
				values,
				showDisclosures,
				forumFeedbackRedirectBanner,
				kilnUpdatesCategory,
			]) => {
				const [_, _first, second, third] = window.location.pathname.split("/");

				if (second == "post") {
					if (import.meta.env.MODE == "development") {
						console.log("[Kiln] Running view page functions: ", view);
					}

					_viewedForumThreads.getValue().then((threads) => {
						const next = [...threads, +third];
						const deduped = Array.from(new Set(next));
						_viewedForumThreads.setValue(
							deduped.slice(
								Math.max(0, deduped.length - MAX_VIEWED_FORUM_THREADS),
							),
						);
					});

					if (values.enabled.includes("forumMentions"))
						runFeature("forumMentions", () =>
							view.forumMentions(showDisclosures),
						);
					if (values.enabled.includes("aiBotForumWarnings"))
						runFeature("aiBotForumWarnings", () =>
							view.aiBotForumWarnings(showDisclosures),
						);
					if (values.enabled.includes("copyPostContents"))
						runFeature("copyPostContents", () => view.copyPostContents());
					if (values.enabled.includes("bookmarkedThreads"))
						runFeature("bookmarkedThreads", () =>
							view.bookmarkedThreads(showDisclosures),
						);
					if (values.enabled.includes("collectibleOwnerLabels"))
						runFeature("collectibleOwnerLabels", () =>
							view.forumUserLabels(
								values.config.collectibleOwnerLabels?.inactiveDays ?? 30,
								values.config.collectibleOwnerLabels?.ogYear ?? 2023,
								showDisclosures,
							),
						);
					composerFeatures(values, showDisclosures);
					if (values.enabled.includes("forumImageLibrary"))
						runFeature("forumImageStarring", () =>
							view.forumImageStarring(showDisclosures),
						);
				} else if (second == "new") {
					if (import.meta.env.MODE == "development") {
						console.log("[Kiln] Running create page functions: ", create);
					}

					composerFeatures(values, showDisclosures);
					if (values.enabled.includes("forumDrafts"))
						runFeature("forumDrafts", () =>
							create.forumDrafts(
								showDisclosures,
								values.config.forumDrafts.autoRestore,
							),
						);
					if (forumFeedbackRedirectBanner)
						runFeature("forumFeedbackRedirectBanner", () =>
							create.forumFeedbackRedirectBanner(),
						);
				} else if (!second || second == "category") {
					if (values.enabled.includes("advancedForumSearch")) {
						_viewedForumThreads.getValue().then((threads) => {
							runFeature("advancedForumSearch", () =>
								search.advancedForumSearch(threads, showDisclosures),
							);
						});
					}
					if (values.enabled.includes("myPosts"))
						runFeature("myPosts", () => search.myPosts(showDisclosures));
					if (values.enabled.includes("bookmarkedThreads"))
						runFeature("bookmarkedThreads", () =>
							view.bookmarkedThreads(showDisclosures),
						);
					if (kilnUpdatesCategory)
						runFeature("kilnUpdatesCategory", () =>
							view.kilnUpdatesCategory(showDisclosures),
						);
				}
			},
		);
	},
});
