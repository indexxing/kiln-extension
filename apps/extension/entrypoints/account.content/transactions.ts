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

import _preferencesJson from "../../public/preferences.json";

const preferences = _preferencesJson.preferences;

import type { CurrencyCode } from "../../utils/types";
import {
	bricksToCurrency,
	kilnDisclosureBadgeHtml,
} from "../../utils/utilities";

const irlBrickPriceFeature = preferences.find((p) => p.id === "irlBrickPrice");
const currencyOptions =
	(
		irlBrickPriceFeature?.config?.[0] as
			| { options?: { value: string; label: string }[] }
			| undefined
	)?.options ?? [];

const datalistOptions = currencyOptions
	.map((opt) => `<option value="${opt.label}">`)
	.join("");

export async function irlBrickPrice(
	savedCurrency: CurrencyCode,
	showDisclosures: boolean,
) {
	const tabsSidebar = document.getElementsByClassName("nav-pills")[0];
	const section = document.createElement("div");
	section.innerHTML = `
    ${showDisclosures ? `<div class="small text-muted mb-1">Bricks Converter${kilnDisclosureBadgeHtml(true)}</div>` : ""}
    <input id="kiln-brickconverter-input" type="number" class="form-control bg-dark mb-2" placeholder="How many Bricks?">
    <input id="kiln-brickconverter-output" type="text" class="form-control bg-dark mb-2" placeholder="Result" disabled>
    <input id="kiln-brickconverter-type" type="text" class="form-control bg-dark mb-2" list="kiln-brickconverter-currencies" placeholder="Currency (e.g. USD)" value="${currencyOptions.find((o) => o.value === savedCurrency)?.label ?? savedCurrency}">
    <datalist id="kiln-brickconverter-currencies">${datalistOptions}</datalist>
    `;
	tabsSidebar.appendChild(document.createElement("hr"));
	tabsSidebar.appendChild(section);

	const input = document.getElementById(
		"kiln-brickconverter-input",
	)! as HTMLInputElement;
	const output = document.getElementById(
		"kiln-brickconverter-output",
	)! as HTMLInputElement;
	const type = document.getElementById(
		"kiln-brickconverter-type",
	)! as HTMLInputElement;

	input.addEventListener("input", () => {
		update();
	});

	type.addEventListener("change", () => {
		update();
	});

	let updateRequestId = 0;
	const update = async () => {
		if (input.value === "") {
			output.value = "";
			return;
		}
		const requestId = ++updateRequestId;
		const code = /\(([^)]+)\)$/.exec(type.value)?.[1] ?? type.value;
		const currency = await bricksToCurrency(+input.value, code);
		if (requestId !== updateRequestId) return;

		if (currency) {
			output.value = currency;
		} else {
			output.value = "unsure";
		}
	};
}
