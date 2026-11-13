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

import { sendMessage } from "@/utils/messaging";
import { getApiSession, openVerificationModal } from "@/utils/utilities";

export function createDonationLink(
	selfUserId: number | null,
	userId: number,
	initialUrl: string | null,
) {
	const isOwner = selfUserId === userId;
	let url = initialUrl;

	const link = document.createElement("a");
	link.href = "#";

	const render = () => {
		if (url) {
			link.textContent = new URL(url).hostname.replace(/^www\./, "");
			link.title = isOwner ? "Click to change your donation link" : url;
		} else {
			link.textContent = "[set link]";
			link.title = "";
		}
	};
	render();

	link.addEventListener("click", async (event) => {
		event.preventDefault();

		if (isOwner) {
			const session = await getApiSession(userId);
			if (session?.state !== "verified") {
				openVerificationModal();
				return;
			}

			const prompt = await sendMessage("showDonationLinkPrompt", {
				currentUrl: url,
			});
			if (!prompt.ok || prompt.data === null) return;

			const saved =
				prompt.data === ""
					? await sendMessage("clearUserDonation", userId)
					: await sendMessage("setUserDonation", {
							userId,
							url: prompt.data,
						});
			if (!saved.ok) return;

			url = prompt.data === "" ? null : new URL(prompt.data).href;
			render();
			return;
		}

		if (!url) return;
		const warning = await sendMessage("showDonationWarning", { url });
		if (warning.ok && warning.data) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
	});

	return link;
}
