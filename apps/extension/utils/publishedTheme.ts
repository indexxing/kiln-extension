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

import type { Extension } from "@kiln/schemas";
import type { SavedTheme } from "@/utils/storage";

type PublishedTheme = Extension.GetPublishedThemeApi["data"];

export type PublishedThemeFields = Pick<
	SavedTheme,
	| "name"
	| "accentColor"
	| "navbarColor"
	| "fontFamily"
	| "customCss"
	| "backgroundImage"
	| "backgroundOverlayColor"
	| "backgroundOverlayOpacity"
	| "effects"
	| "navbarIconColor"
	| "cursorUrl"
	| "colorTokens"
	| "ambient"
	| "cardStyle"
	| "pointerEffects"
>;

export function publishedThemeFields(
	fetched: PublishedTheme,
): PublishedThemeFields {
	return {
		name: fetched.name,
		accentColor: fetched.accentColor,
		navbarColor: fetched.navbarColor,
		fontFamily: fetched.fontFamily ?? undefined,
		customCss: fetched.customCss ?? undefined,
		backgroundImage: fetched.backgroundImage ?? undefined,
		backgroundOverlayColor: fetched.backgroundOverlayColor ?? undefined,
		backgroundOverlayOpacity: fetched.backgroundOverlayOpacity ?? undefined,
		effects: fetched.effects?.length ? fetched.effects : undefined,
		navbarIconColor: fetched.navbarIconColor ?? undefined,
		cursorUrl: fetched.cursorUrl ?? undefined,
		colorTokens: fetched.colorTokens ?? undefined,
		ambient: fetched.ambient ?? undefined,
		cardStyle: fetched.cardStyle ?? undefined,
		pointerEffects: fetched.pointerEffects ?? undefined,
	};
}
