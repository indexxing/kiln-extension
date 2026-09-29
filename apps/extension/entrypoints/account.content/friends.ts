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
import { kilnDisclosureBadgeHtml } from "@/utils/utilities";

export function actions(showDisclosures: boolean) {
	const container = document.getElementById("friends-container");
	if (!container) return;

	const actionBtns = document.createElement("div");
	actionBtns.classList.add("row", "mb-3");
	actionBtns.innerHTML = `
    <div class="col">
        <button class="btn btn-success w-100">
          Accept All
        </button>
    </div>
    <div class="col">
        <button class="btn btn-danger w-100">
            Decline All
        </button>
    </div>
    `;

	const acceptAll: HTMLButtonElement =
		actionBtns.querySelector(".btn-success")!;
	const declineAll: HTMLButtonElement =
		actionBtns.querySelector(".btn-danger")!;

	const setDisabled = (value: boolean) => {
		acceptAll.disabled = value;
		declineAll.disabled = value;
	};

	setDisabled(true);

	if (showDisclosures) {
		const label = document.createElement("div");
		label.className = "small text-muted mb-1";
		label.innerHTML = `Friend Request Actions${kilnDisclosureBadgeHtml(true)}`;
		container.parentElement!.insertBefore(label, container);
	}
	container.parentElement!.insertBefore(actionBtns, container);

	const setup = () => {
		const firstPage = Array.from(
			container.getElementsByClassName("text-reset"),
		).map((link) => link.getAttribute("href")?.split("/")[2]);

		console.log(firstPage);
		if (firstPage.length == 0) return;

		observer.disconnect();

		setDisabled(false);

		acceptAll.addEventListener("click", async () => {
			setDisabled(true);
			await sendMessage("manageFriendRequests", "acceptAll");
		});

		declineAll.addEventListener("click", async () => {
			setDisabled(true);
			await sendMessage("manageFriendRequests", "declineAll");
		});
	};

	const observer = new MutationObserver(setup);
	observer.observe(container, { childList: true, subtree: true });

	setup();
}
