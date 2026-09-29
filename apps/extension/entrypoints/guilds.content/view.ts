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

export function creatorCommentLabels(showDisclosures: boolean) {
	const creatorAnchor = document.querySelector(
		'.col-12:has(#guild-btn, #guild-notifications-button) a[class^="userlink-"]',
	);
	const creatorId = creatorAnchor?.getAttribute("href")?.split("/")[2];
	if (!creatorId) return;

	const container = document.getElementById("wall-posts");
	if (!container) return;

	const tag = (Card: Element): void => {
		const usernameElement =
			Card.querySelector<HTMLAnchorElement>('[href^="/users/"]');
		if (!usernameElement) return;

		if (usernameElement.getAttribute("href")?.split("/")[2] != creatorId)
			return;

		const badge = document.createElement("span");
		badge.classList.add("badge", "bg-primary");
		badge.style.marginLeft = "5px";
		badge.style.verticalAlign = "text-top";
		badge.innerText = "LEADER";

		badge.setAttribute("data-bs-toggle", "tooltip");
		badge.setAttribute("data-bs-title", "This user leads this guild.");

		usernameElement.appendChild(badge);

		if (showDisclosures) {
			usernameElement.appendChild(createKilnDisclosureBadge());
		}

		sendMessage("registerBootstrapElements");
	};

	Array.from(container.children).forEach(tag);

	new MutationObserver((Records) => {
		for (const Record of Records)
			for (const Node of Record.addedNodes)
				if (Node instanceof Element && Node.classList.contains("col-12"))
					tag(Node);
	}).observe(container, { attributes: false, childList: true, subtree: false });
}
