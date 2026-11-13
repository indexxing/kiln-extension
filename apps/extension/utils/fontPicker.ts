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

import { escapeHtml } from "@/utils/escapeHtml";
import { FONTS } from "@/utils/theme";
import { createModal } from "@/utils/utilities";

export type FontPickerButton = HTMLButtonElement & { value: string };

const DEFAULT_PREVIEW_TEXT = "The quick brown fox jumps over the lazy dog";
const FONTS_LINK_ID = "kiln-font-picker-fonts";
const FONTS_STYLE_ID = "kiln-font-picker-faces";

export function fontPickerHtml(id: string): string {
	return `<button type="button" id="${id}" class="btn btn-sm btn-outline-secondary w-100 d-flex justify-content-between align-items-center text-start">
		<span class="text-truncate"></span><i class="fas fa-chevron-right small ms-2"></i>
	</button>`;
}

function ensurePreviewFontsLoaded(): void {
	if (!document.getElementById(FONTS_LINK_ID)) {
		const families = Object.values(FONTS)
			.filter((f) => f.googleFamily)
			.map((f) => `family=${f.googleFamily}`)
			.join("&");
		const link = document.createElement("link");
		link.id = FONTS_LINK_ID;
		link.rel = "stylesheet";
		link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
		document.head.appendChild(link);
	}
	if (!document.getElementById(FONTS_STYLE_ID)) {
		const style = document.createElement("style");
		style.id = FONTS_STYLE_ID;
		style.textContent = Object.values(FONTS)
			.filter((f) => f.localFile)
			.map((f) => {
				const name = f.stack.match(/^'([^']+)'/)?.[1] ?? "KilnCustomFont";
				return `@font-face { font-family: '${name}'; src: url('${browser.runtime.getURL(f.localFile as any)}') format('truetype'); }`;
			})
			.join("\n");
		document.head.appendChild(style);
	}
}

export function openFontPickerModal(
	current: string,
	onPick: (key: string) => void,
	previewText?: string,
): void {
	ensurePreviewFontsLoaded();
	const modal = createModal("lg");
	modal.addEventListener("close", () => modal.remove());
	modal.innerHTML = `
		<div class="d-flex justify-content-between align-items-center mb-3">
			<h5 class="mb-0 fw-bold">Choose a Font</h5>
			<button class="btn-close" data-close aria-label="Close"></button>
		</div>
		<input type="text" class="form-control form-control-sm mb-3" data-preview-text
		       maxlength="80" placeholder="Type your own preview text…" />
		<div class="d-flex flex-column gap-2" data-list style="max-height:60vh;overflow-y:auto;"></div>
	`;

	const input = modal.querySelector<HTMLInputElement>("[data-preview-text]")!;
	const list = modal.querySelector<HTMLElement>("[data-list]")!;
	const previews: HTMLElement[] = [];
	const initialText = previewText || DEFAULT_PREVIEW_TEXT;
	input.value = previewText ?? "";

	for (const [key, font] of Object.entries(FONTS)) {
		const row = document.createElement("button");
		row.type = "button";
		row.className = `btn w-100 text-start ${key === current ? "btn-primary" : "btn-outline-secondary"}`;
		row.style.cssText =
			"flex:0 0 auto;height:auto;min-height:max-content;white-space:normal;";
		row.innerHTML = `
			<div class="small opacity-75">${escapeHtml(font.name)}</div>
			<div data-preview style="font-size:1.35rem;line-height:1.3;${font.stack ? `font-family:${font.stack};` : ""}overflow-wrap:anywhere;"></div>
		`;
		const preview = row.querySelector<HTMLElement>("[data-preview]")!;
		preview.textContent = initialText;
		previews.push(preview);
		row.addEventListener("click", () => {
			onPick(key);
			modal.close();
		});
		list.appendChild(row);
	}

	input.addEventListener("input", () => {
		const text = input.value || DEFAULT_PREVIEW_TEXT;
		for (const p of previews) p.textContent = text;
	});
	modal
		.querySelector("[data-close]")!
		.addEventListener("click", () => modal.close());

	modal.showModal();
}

export function initFontPicker(
	btn: HTMLButtonElement,
	getPreviewText?: () => string | undefined,
): FontPickerButton {
	const label = btn.querySelector<HTMLElement>("span")!;
	let value = "default";
	const render = () => {
		label.textContent = FONTS[value]?.name ?? FONTS.default.name;
		label.style.fontFamily = FONTS[value]?.stack ?? "";
	};
	Object.defineProperty(btn, "value", {
		get: () => value,
		set: (v: string) => {
			value = v in FONTS ? v : "default";
			render();
		},
	});
	btn.addEventListener("click", () =>
		openFontPickerModal(
			value,
			(key) => {
				btn.value = key;
				btn.dispatchEvent(new Event("change"));
			},
			getPreviewText?.(),
		),
	);
	render();
	return btn as FontPickerButton;
}
