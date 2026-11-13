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

import { fetchAllCreations, renderCreationsBrowser } from "@/utils/creations";

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

const EVENTS_GUILD_ID = 713;

export async function creationsTab(guildId: number) {
	const ITEMS_PER_PAGE = 28;

	if (guildId === EVENTS_GUILD_ID) {
		const config = await getConfig().catch(() => null);
		if (
			!getFlag(
				config?.flags,
				"features.guildCreationsTab.showOnEventsGuild",
				true,
			)
		)
			return;
	}

	const tabList = document.getElementById("guild-wall-tab")?.closest("ul");
	const tabContent = document.getElementById("guild-wall")?.parentElement;
	if (!tabList || !tabContent) return;

	const navItem = document.createElement("li");
	navItem.classList.add("nav-item");
	navItem.setAttribute("role", "presentation");
	navItem.innerHTML = `
		<a class="nav-link" href="#!" id="kiln-guild-creations-tab" data-bs-toggle="tab" role="tab" data-bs-target="#kiln-guild-creations" aria-controls="kiln-guild-creations" aria-selected="false" tabindex="-1">
			<i class="fad fa-paint-brush me-1"></i>
			Creations
		</a>
	`;
	tabList.appendChild(navItem);

	const pane = document.createElement("div");
	pane.id = "kiln-guild-creations";
	pane.className = "tab-pane fade mb-3";
	pane.setAttribute("role", "tabpanel");
	pane.setAttribute("aria-labelledby", "kiln-guild-creations-tab");
	pane.innerHTML = `<div class="row"><div class="col-12 text-center py-4"><i class="fas fa-spinner fa-spin"></i></div></div>`;
	tabContent.appendChild(pane);

	const row = pane.querySelector<HTMLDivElement>(".row")!;
	const activeAudio: { current: HTMLAudioElement | null } = { current: null };
	const link = navItem.querySelector("a")!;
	let loaded = false;

	link.addEventListener("hidden.bs.tab", () => {
		activeAudio.current?.pause();
	});

	link.addEventListener("click", async () => {
		if (loaded) return;
		loaded = true;

		const assets = await fetchAllCreations((page) =>
			sendMessage("getGuildCreations", { guildId, page, limit: 100 }),
		);
		if (!assets) {
			loaded = false;
			row.innerHTML = `<p class="text-muted text-center py-3">Failed to load creations.</p>`;
			return;
		}

		if (assets.length === 0) {
			row.innerHTML = `<p class="text-muted text-center py-3">No creations found.</p>`;
			pane.classList.remove("mb-3");
			return;
		}

		renderCreationsBrowser(row, assets, activeAudio, ITEMS_PER_PAGE, 3);
	});
}
