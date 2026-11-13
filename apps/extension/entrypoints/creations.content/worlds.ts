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

export async function v2WorldLabels(showDisclosures: boolean) {
	const worldIds: number[] = [];
	const cards = document.querySelectorAll(".card.mcard");
	cards.forEach((card) => {
		const editLink = card.querySelector('[onclick^="editPlace"]');
		if (editLink) {
			const dataId = editLink.getAttribute("data-id");
			if (dataId) {
				worldIds.push(parseInt(dataId, 10));
			}
		}
	});

	const versions = await sendMessage("getWorldVersions", worldIds);
	if (!versions.ok) return;

	const versionData = versions.data;

	cards.forEach((card) => {
		const editLink = card.querySelector('[onclick^="editPlace"]');
		if (editLink) {
			const dataId = editLink.getAttribute("data-id");
			if (dataId) {
				const id = parseInt(dataId, 10);
				const version = versionData[id];
				const titleElement = card.querySelector(".card-title");
				if (titleElement) {
					const badge = document.createElement("span");
					badge.className = "badge ms-2";
					badge.style.float = "inline-end";
					badge.style.fontSize = "1.2rem";
					if (version === "1.0") {
						badge.classList.add("bg-warning");
						badge.textContent = "1.0";
					} else if (version === "2.0") {
						badge.classList.add("bg-primary");
						badge.textContent = "2.0";
					} else {
						badge.classList.add("bg-secondary");
						badge.textContent = "Unknown Version";
					}
					applyKilnDisclosureTitle(
						badge,
						showDisclosures,
						"World engine version",
					);
					titleElement.appendChild(badge);
				}
			}
		}
	});
}

function formatEditTime(totalSeconds: number): string {
	const minutes = Math.floor(totalSeconds / 60);
	if (minutes < 1) return "< 1m";
	const hours = Math.floor(minutes / 60);
	if (hours < 1) return `${minutes}m`;
	return `${hours}h ${minutes % 60}m`;
}

function normalizeWorldName(name: string): string {
	return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function worldEditTime(userId: number, showDisclosures: boolean) {
	const result = await sendMessage("getWorldEditTime", userId);
	if (!result.ok) return;

	const totals = new Map<string, number>();
	for (const world of result.data.data) {
		const key = normalizeWorldName(world.name);
		totals.set(key, (totals.get(key) ?? 0) + world.totalSeconds);
	}
	if (totals.size === 0) return;

	document.querySelectorAll(".card.mcard").forEach((card) => {
		const titleElement = card.querySelector<HTMLElement>(".card-title");
		if (!titleElement || card.querySelector('[data-kiln="world-edit-time"]'))
			return;

		const titleClone = titleElement.cloneNode(true) as HTMLElement;
		titleClone.querySelectorAll(".badge").forEach((badge) => {
			badge.remove();
		});

		const totalSeconds = totals.get(normalizeWorldName(titleClone.textContent));
		if (totalSeconds === undefined) return;

		const line = document.createElement("small");
		line.classList.add("d-block", "text-muted");
		line.dataset.kiln = "world-edit-time";
		line.innerHTML = `<i class="fad fa-clock me-1"></i>${formatEditTime(totalSeconds)} edited`;
		applyKilnDisclosureTitle(line, showDisclosures, "Edit time");
		titleElement.insertAdjacentElement("afterend", line);
	});
}
