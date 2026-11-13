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

import { applyKilnDisclosureTitle } from "@/utils/utilities";
import { getClothingPreviewBodies } from "./view";

export async function clothingCreateBodyPreview(showDisclosures: boolean) {
	const nativeCanvas = document.querySelector<HTMLCanvasElement>(
		".avatarEditorCanvas",
	);
	const previewCard = nativeCanvas?.closest(".card");
	const dropzone = document.getElementById("store-dropzone");
	if (!previewCard || !dropzone) return;

	const previewBodies = await getClothingPreviewBodies();
	const wrapper = document.createElement("div");
	wrapper.className = "card text-start";
	wrapper.innerHTML = `
	<div class="card-body p-0" style="position: relative;">
		<select class="form-select form-select-sm" id="kiln-create-body-select" style="position: absolute; top: 8px; right: 8px; width: auto; z-index: 1;">
			${previewBodies.map((b) => `<option value="${b.id ?? ""}">${b.name}</option>`).join("")}
		</select>
		<canvas id="kiln-create-body-canvas" style="width: 100%; aspect-ratio: 1 / 1; display: block;"></canvas>
	</div>
	`;
	previewCard.replaceWith(wrapper);
	applyKilnDisclosureTitle(
		wrapper.querySelector<HTMLElement>("#kiln-create-body-select")!,
		showDisclosures,
		"Preview this upload on a different body type using Kiln's own renderer",
	);

	const canvas = wrapper.querySelector<HTMLCanvasElement>(
		"#kiln-create-body-canvas",
	)!;
	const bodySelect = wrapper.querySelector<HTMLSelectElement>(
		"#kiln-create-body-select",
	)!;

	const { AvatarRenderer } = await import("../account.content/avatarRenderer");
	const renderer = new AvatarRenderer(canvas, { transparent: true });

	let clothingUrl: string | null = null;
	const bodyMeshCache = new Map<number, string>();

	const setClothingFile = (file: File): void => {
		if (clothingUrl) URL.revokeObjectURL(clothingUrl);
		clothingUrl = URL.createObjectURL(file);
		renderAvatar();
	};

	const getBodyUrl = async (id: number | null): Promise<string> => {
		if (id === null) return "";
		const cached = bodyMeshCache.get(id);
		if (cached !== undefined) return cached;
		const meshResult = await sendMessage("getItemMesh", id);
		const url = meshResult.ok && meshResult.data.url ? meshResult.data.url : "";
		bodyMeshCache.set(id, url);
		return url;
	};

	const renderAvatar = async () => {
		const selectedId = bodySelect.value ? parseInt(bodySelect.value, 10) : null;
		const bodyUrl = await getBodyUrl(selectedId);
		await renderer.load({
			useCharacter: false,
			face: browser.runtime.getURL("/images/default-face.png"),
			clothing: clothingUrl ? [clothingUrl] : [],
			body: bodyUrl,
			tool: "",
			items: [],
			headColor: "#dce0e8",
			torsoColor: "#dce0e8",
			leftArmColor: "#dce0e8",
			rightArmColor: "#dce0e8",
			leftLegColor: "#dce0e8",
			rightLegColor: "#dce0e8",
		});
	};

	bodySelect.addEventListener("change", () => renderAvatar());

	document.addEventListener(
		"change",
		(event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement) || target.type !== "file")
				return;
			const file = target.files?.[0];
			if (file) setClothingFile(file);
		},
		true,
	);

	document.addEventListener(
		"drop",
		(event) => {
			const file = event.dataTransfer?.files?.[0];
			if (file) setClothingFile(file);
		},
		true,
	);

	await renderAvatar();
}
