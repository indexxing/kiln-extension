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

export default defineContentScript({
	matches: [
		"https://polytoria.com/u/*/json",
		"https://polytoria.com/store/*/json",
		"https://polytoria.com/guilds/*/json",
		"https://polytoria.com/forum/post/*/json",
	],
	runAt: "document_start",
	main() {
		const [_, first, second, third] = window.location.pathname.split("/");

		if (first == "u") {
			resolveUserAPIURL(second)
				.then((url) => window.location.replace(url))
				.catch((err) =>
					console.error("[Kiln] Failed to resolve user API URL:", err),
				);
		} else if (first == "store") {
			window.location.replace(`https://api.polytoria.com/v1/store/${second}`);
		} else if (first == "guilds") {
			window.location.replace(`https://api.polytoria.com/v1/guild/${second}`);
		} else if (first == "forum" && second == "post") {
			window.location.replace(`https://api.polytoria.com/v1/forum/${third}`);
		}
	},
});

async function resolveUserAPIURL(username: string) {
	const userId = await sendMessage("findUserByUsername", username);
	if (!userId.ok)
		throw new Error("[Kiln] Failed to resolve user ID from username.");

	return `https://api.polytoria.com/v1/users/${userId.data}`;
}
