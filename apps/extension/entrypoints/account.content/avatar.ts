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

import sadFace from "@/assets/sad-face.webp";
import pageContent from "@/public/avatar-sandbox.html?raw";
import { escapeHtml, safeHttpUrl } from "@/utils/escapeHtml";
import retroItemsData from "@/utils/static/retroItems.json";
import type {
	AccessoryTransform,
	AvatarIFrameState,
	AvatarSandboxOutfit,
} from "@/utils/types";
import {
	applyKilnDisclosureTitle,
	createModal,
	getUserDetails,
} from "@/utils/utilities";
import { AvatarRenderer } from "./avatarRenderer";

interface CreatorInfo {
	name: string;
	id: number;
}

interface CachedItem {
	type: string;
	accessoryType?: string;
	name: string;
	price: number | null | false;
	creator: CreatorInfo | null;
	thumbnail: string;
	asset: string | undefined;
	ribbon?: string;
	isLimited?: boolean;
	createdAt?: string;
	id?: number;
}

interface StoreApiItem {
	type: string;
	name: string;
	price: number | null;
	creator: CreatorInfo;
	thumbnail: string;
	accessoryType?: string | null;
	isLimited?: boolean;
	createdAt?: string;
	sales?: number;
	id: number;
	path?: string;
	description?: string;
	tags?: string[];
	updatedAt?: string;
}

interface StoreApiResponse {
	assets: StoreApiItem[];
	pages: number;
	total?: number;
}

const DEFAULT_AVATAR: AvatarIFrameState = {
	useCharacter: true,
	items: [24122],
	clothing: [34910],
	face: 177726,
	headColor: "#e0e0e0",
	torsoColor: "#e0e0e0",
	leftArmColor: "#e0e0e0",
	rightArmColor: "#e0e0e0",
	leftLegColor: "#e0e0e0",
	rightLegColor: "#e0e0e0",
};

const DEFAULT_TRANSFORM: AccessoryTransform = {
	position: [0, 0, 0],
	rotation: [0, 0, 0],
	scale: 1,
};

const BODY_COLOR_KEYS = [
	"headColor",
	"torsoColor",
	"leftArmColor",
	"rightArmColor",
	"leftLegColor",
	"rightLegColor",
] as const;

const HEX_COLOR = /^#?([0-9a-fA-F]{6})$/;
const SHORTHAND_HEX_COLOR = /^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
const RGB_COLOR = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/;

function toHexColor(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const color = value.trim();

	const full = HEX_COLOR.exec(color);
	if (full) return `#${full[1].toLowerCase()}`;

	const shorthand = SHORTHAND_HEX_COLOR.exec(color);
	if (shorthand) {
		const [, r, g, b] = shorthand;
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}

	const rgb = RGB_COLOR.exec(color);
	if (rgb) {
		return `#${rgb
			.slice(1, 4)
			.map((channel) =>
				Math.min(255, Math.max(0, Math.round(parseFloat(channel))))
					.toString(16)
					.padStart(2, "0"),
			)
			.join("")}`;
	}

	return null;
}

function normalizeBodyColors(state: AvatarIFrameState): AvatarIFrameState {
	const record = state as Record<string, unknown>;
	for (const key of BODY_COLOR_KEYS) {
		record[key] = toHexColor(record[key]) ?? DEFAULT_AVATAR[key];
	}
	return state;
}

function sanitizeAssetId(value: unknown): number | string | undefined {
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined;
	if (typeof value === "string") {
		if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
		const num = Number(value);
		return Number.isFinite(num) ? num : undefined;
	}
	return undefined;
}

function sanitizeImportedAvatar(state: AvatarIFrameState): AvatarIFrameState {
	state.items = (state.items ?? [])
		.map(sanitizeAssetId)
		.filter((x): x is number | string => x !== undefined);
	if (state.clothing) {
		state.clothing = state.clothing
			.map(sanitizeAssetId)
			.filter((x): x is number | string => x !== undefined);
	}
	state.face = sanitizeAssetId(state.face);
	state.body = sanitizeAssetId(state.body);
	state.tool = sanitizeAssetId(state.tool);
	return state;
}

export function customBodyColorHexCodes(showDisclosures: boolean) {
	const bodyPartButtons = document.querySelectorAll<HTMLButtonElement>(
		".avatarAction.bodypart",
	);

	bodyPartButtons.forEach((button) => {
		button.addEventListener("click", () => {
			const bodyPart = button.id;

			const modalObserver = new MutationObserver(() => {
				const swalContent = document.querySelector<HTMLElement>(
					".swal2-html-container, .swal2-content",
				);
				if (!swalContent) return;

				const customTab =
					swalContent.querySelector<HTMLElement>("#custom-color");
				if (!customTab || customTab.querySelector("#hex-code-input")) return;

				customTab.style.cssText = "display: block; text-align: center;";

				const wheelContainer =
					customTab.querySelector<HTMLElement>(".wheel-container");
				if (wheelContainer) {
					wheelContainer.style.cssText = "display: inline-block; margin: auto;";
				}

				const wrapper = document.createElement("div");
				wrapper.style.cssText = "margin-top: 12px; display: block;";

				const label = document.createElement("label");
				label.htmlFor = "hex-code-input";
				label.textContent = "Hex:";
				label.style.cssText = "font-weight: 600; font-size: 14px;";
				applyKilnDisclosureTitle(
					label,
					showDisclosures,
					"Custom hex color input",
				);

				const input = document.createElement("input");
				input.type = "text";
				input.id = "hex-code-input";
				input.classList.add("form-control", "form-control-sm");
				input.placeholder = "#abcdef";
				input.maxLength = 7;

				const colorPicker = document.querySelector<HTMLInputElement>(
					'.swal2-container input[type="color"]',
				);
				if (colorPicker) {
					input.value = colorPicker.value;
					colorPicker.addEventListener("input", () => {
						input.value = colorPicker.value;
					});
				}

				const updateBtn = document.createElement("button");
				updateBtn.textContent = "Update";
				updateBtn.classList.add("btn", "btn-primary", "btn-sm");

				updateBtn.addEventListener("mousedown", async (e) => {
					e.preventDefault();
					e.stopPropagation();

					const color = input.value.trim();

					if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
						return;
					}

					// @ts-expect-error
					if (typeof Swal !== "undefined") Swal.close();

					await sendMessage("updateBodyColor", { bodyPart, color });

					window.location.reload();
				});

				wrapper.appendChild(label);
				wrapper.appendChild(input);
				wrapper.appendChild(updateBtn);
				customTab.appendChild(wrapper);
				modalObserver.disconnect();
			});

			modalObserver.observe(document.body, { childList: true, subtree: true });
		});
	});
}

export function avatarSandbox(
	avatar: AvatarIFrameState = structuredClone(DEFAULT_AVATAR),
) {
	const container = document.querySelector(
		".container.p-0.p-lg-5",
	) as HTMLElement;

	const itemCache: Record<number | string, CachedItem> = {
		24122: {
			type: "hat",
			accessoryType: "hat",
			name: "Polytoria Cap",
			price: 0,
			creator: { name: "Polytoria", id: 1 },
			thumbnail:
				"https://cdn.polytoria.com/thumbnails/assets/RR0VPd5hX30Fx5APwRBGObotf1xD1DRT.png",
			asset:
				"https://cdn.polytoria.com/assets/Z8NbTA8HdRgGI3G6ZZec6yk5i1IK11f8.glb",
		},
		177726: {
			type: "face",
			name: "Classic Smirk",
			price: 0,
			creator: { name: "Polytoria", id: 1 },
			thumbnail:
				"https://cdn.polytoria.com/thumbnails/assets/1pAAH07VDGyypN66PdwP7glnFrVPPvwC.png",
			asset:
				"https://cdn.polytoria.com/assets/T2iRSGfF-USjCej5fq_-P1HNrNX8Grx4.png",
		},
		34910: {
			type: "clothing",
			name: "Treehugging",
			price: 0,
			creator: { name: "Polytoria", id: 1 },
			thumbnail:
				"https://cdn.polytoria.com/thumbnails/assets/xdlc4TPwiMaWhNZDwWe00ahhapazlyPs.png",
			asset:
				"https://cdn.polytoria.com/assets/auYuxLt30lqoNXhJjUz28Al5G7c1jYWs.png",
		},
	};

	let page = 1;
	let pageCount = 1;
	let loadItemsRequestId = 0;
	let search = "";
	let sort = "createdAt";
	let order = "desc";
	const showOffsale = true;
	let tabSelected = "hat";
	let retroItems: unknown[][] | null = null;
	let outfits: AvatarSandboxOutfit[] | null = null;
	let selectedBodyPart: string;
	let kilnUserId: number | null = null;
	let isVerified = false;
	const storeCache = new Map<
		string,
		{
			items: StoreApiItem[];
			nextApiPage: number;
			totalApiPages: number;
			total?: number;
		}
	>();

	container.innerHTML = pageContent;
	sendMessage("registerBootstrapElements");
	const viewCanvas = document.getElementById("viewCanvas") as HTMLCanvasElement;
	const renderer = new AvatarRenderer(viewCanvas);

	const bodyColorsModal = createModal();
	const colorSwatches = [
		"#f8f8f8",
		"#cdcdcd",
		"#111111",
		"#ff0000",
		"#a34b4b",
		"#ffc9c9",
		"#957977",
		"#c4281c",
		"#da867a",
		"#694028",
		"#cc8e69",
		"#a05f35",
		"#7c5c46",
		"#eab892",
		"#da8541",
		"#aa5500",
		"#ffcc99",
		"#e29b40",
		"#ffaf00",
		"#ffb000",
		"#d7c59a",
		"#f5cd30",
		"#fdea8d",
		"#e5e4df",
		"#c1be42",
		"#ffff00",
		"#ffffcc",
		"#a4bd47",
		"#7f8e64",
		"#a1c48c",
		"#3a7d15",
		"#4b974b",
		"#00ff00",
		"#ccffcc",
		"#27462d",
		"#287f47",
		"#789082",
		"#9ff3e9",
		"#12eed4",
		"#f2f3f3",
		"#00ffff",
		"#008f9c",
		"#04afec",
		"#80bbdb",
		"#b4d2e4",
		"#0d69ac",
		"#1b2a35",
		"#afddff",
		"#6e99ca",
		"#74869d",
		"#2154b9",
		"#002060",
		"#0000ff",
		"#b1a7ff",
		"#a3a2a5",
		"#6225d1",
		"#b480ff",
		"#8c5b9f",
		"#6b327c",
		"#aa00aa",
		"#635f62",
		"#ff00bf",
		"#ff66cc",
		"#e8bac8",
	]
		.map(
			(c) =>
				`<div class="colorpicker-color" data-color="${c}" style="background-color: ${c}"></div>`,
		)
		.join("");
	bodyColorsModal.innerHTML = `
<div class="row text-muted mb-4" style="font-size: 0.8rem;">
	<div class="col">
		<h5 class="mb-0" style="color: #fff;">Modify Body Colors</h5>
		Selected Body Part: <i id="p+selected_bodypart" class="kiln-bodycolor-target">none</i>
	</div>
	<div class="col-md-3">
		<button type="button" class="btn btn-info w-100 mx-auto">X</button>
	</div>
</div>
<div class="modal-body">
	<div class="wrapper">${colorSwatches}</div>
	<div class="input-group mt-2">
		<input type="text" class="form-control bg-dark kiln-bodycolor-hex" placeholder="HEX Code.." maxlength="7" spellcheck="false" autocomplete="off">
		<button type="button" class="btn btn-primary kiln-bodycolor-set">Set</button>
		<div class="invalid-feedback">Enter a hex code like #ffb000.</div>
	</div>
</div>`;
	bodyColorsModal
		.querySelector<HTMLButtonElement>(".btn-info")!
		.addEventListener("click", () => bodyColorsModal.close());

	const bodyColorTargetLabel = bodyColorsModal.querySelector<HTMLElement>(
		".kiln-bodycolor-target",
	)!;
	const bodyColorHexInput = bodyColorsModal.querySelector<HTMLInputElement>(
		".kiln-bodycolor-hex",
	)!;

	function applyBodyColor(hex: string): void {
		(avatar as Record<string, unknown>)[`${selectedBodyPart}Color`] = hex;
		bodyColorsModal.close();
		updateAvatar();
	}

	function submitBodyColorHex(): void {
		const hex = toHexColor(bodyColorHexInput.value);
		if (hex === null) {
			bodyColorHexInput.classList.add("is-invalid");
			return;
		}
		bodyColorHexInput.value = "";
		applyBodyColor(hex);
	}

	bodyColorHexInput.addEventListener("input", () =>
		bodyColorHexInput.classList.remove("is-invalid"),
	);
	bodyColorHexInput.addEventListener("keydown", (e) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		submitBodyColorHex();
	});
	bodyColorsModal
		.querySelector<HTMLButtonElement>(".kiln-bodycolor-set")!
		.addEventListener("click", submitBodyColorHex);

	const repositionModal = createModal();
	const repositionSliderIds = [
		"pos-x",
		"pos-y",
		"pos-z",
		"rot-x",
		"rot-y",
		"rot-z",
		"scale",
	] as const;
	type RepositionSliderId = (typeof repositionSliderIds)[number];
	const repositionSlider = (
		id: RepositionSliderId,
		label: string,
		min: number,
		max: number,
		step: number,
	) => `
<div class="mb-2">
	<label class="text-muted d-block mb-1" style="font-size: 0.75rem;">${label}: <span id="reposition-${id}-val">0</span></label>
	<input type="range" class="form-range" id="reposition-${id}" min="${min}" max="${max}" step="${step}" value="0">
</div>`;
	repositionModal.innerHTML = `
<div class="row text-muted mb-4" style="font-size: 0.8rem;">
	<div class="col">
		<h5 class="mb-0" style="color: #fff;">Reposition Accessory</h5>
		Adjusting: <span class="kiln-reposition-target">none</span>
	</div>
	<div class="col-md-3">
		<button type="button" class="btn btn-info w-100 mx-auto">X</button>
	</div>
</div>
<div class="modal-body">
	${repositionSlider("pos-x", "Position X", -2, 2, 0.01)}
	${repositionSlider("pos-y", "Position Y", -2, 2, 0.01)}
	${repositionSlider("pos-z", "Position Z", -2, 2, 0.01)}
	${repositionSlider("rot-x", "Rotation X", -180, 180, 1)}
	${repositionSlider("rot-y", "Rotation Y", -180, 180, 1)}
	${repositionSlider("rot-z", "Rotation Z", -180, 180, 1)}
	${repositionSlider("scale", "Scale", 0.1, 3, 0.01)}
	<button type="button" class="btn btn-outline-warning btn-sm w-100 mt-2" id="reposition-reset">
		<i class="fa-duotone fa-arrow-rotate-left"></i>
		Reset
	</button>
</div>`;
	repositionModal
		.querySelector<HTMLButtonElement>(".btn-info")!
		.addEventListener("click", () => repositionModal.close());
	const repositionTargetLabel = repositionModal.querySelector<HTMLElement>(
		".kiln-reposition-target",
	)!;
	let repositionTargetId: string | null = null;

	const repositionInput = (id: RepositionSliderId) =>
		repositionModal.querySelector<HTMLInputElement>(`#reposition-${id}`)!;
	const repositionValueLabel = (id: RepositionSliderId) =>
		repositionModal.querySelector<HTMLElement>(`#reposition-${id}-val`)!;

	function readTransformFromSliders(): AccessoryTransform {
		const value = (id: RepositionSliderId) =>
			parseFloat(repositionInput(id).value);
		return {
			position: [value("pos-x"), value("pos-y"), value("pos-z")],
			rotation: [value("rot-x"), value("rot-y"), value("rot-z")],
			scale: value("scale"),
		};
	}

	function writeTransformToSliders(transform: AccessoryTransform): void {
		const values: Record<RepositionSliderId, number> = {
			"pos-x": transform.position[0],
			"pos-y": transform.position[1],
			"pos-z": transform.position[2],
			"rot-x": transform.rotation[0],
			"rot-y": transform.rotation[1],
			"rot-z": transform.rotation[2],
			scale: transform.scale,
		};
		for (const id of repositionSliderIds) {
			repositionInput(id).value = String(values[id]);
			repositionValueLabel(id).innerText = String(values[id]);
		}
	}

	function applyReposition(): void {
		if (repositionTargetId === null) return;
		const transform = readTransformFromSliders();
		avatar.itemTransforms ??= {};
		avatar.itemTransforms[repositionTargetId] = transform;
		const url = itemCache[repositionTargetId]?.asset;
		if (url) renderer.setAccessoryTransform(url, transform);
	}

	for (const id of repositionSliderIds) {
		repositionInput(id).addEventListener("input", () => {
			repositionValueLabel(id).innerText = repositionInput(id).value;
			applyReposition();
		});
	}

	repositionModal
		.querySelector<HTMLButtonElement>("#reposition-reset")!
		.addEventListener("click", () => {
			writeTransformToSliders(DEFAULT_TRANSFORM);
			applyReposition();
		});

	function openRepositionModal(id: number | string, name: string): void {
		repositionTargetId = id.toString();
		repositionTargetLabel.innerText = name;
		writeTransformToSliders(
			avatar.itemTransforms?.[repositionTargetId] ?? DEFAULT_TRANSFORM,
		);
		repositionModal.showModal();
	}

	const outfitCreateModal = createModal();
	outfitCreateModal.innerHTML = `
<div class="row text-muted mb-4" style="font-size: 0.8rem;">
	<div class="col">
		<h5 class="mb-0" style="color: #fff;">Create Outfit</h5>
		Save this avatar for later!
	</div>
	<div class="col-md-2">
		<button type="button" class="btn btn-info w-100 mx-auto">X</button>
	</div>
</div>
<div class="modal-body">
	<div class="input-group mb-2">
		<input type="text" class="form-control" placeholder="Outfit Name...">
		<button type="button" class="btn btn-success">Save</button>
	</div>
	<b class="text-muted" style="font-size: 0.85rem;"><i class="fa-duotone fa-square-question mr-1"></i> ...</b>
</div>`;
	outfitCreateModal
		.querySelector<HTMLButtonElement>(".btn-info")!
		.addEventListener("click", () => outfitCreateModal.close());
	const outfitCreateButton =
		outfitCreateModal.querySelector<HTMLButtonElement>(".btn-success")!;
	const outfitCreateError = outfitCreateModal.querySelector<HTMLElement>("b")!;

	const outfitRenameModal = createModal();
	outfitRenameModal.innerHTML = `
<div class="row text-muted mb-4" style="font-size: 0.8rem;">
	<div class="col">
		<h5 class="mb-0" style="color: #fff;">Rename Outfit</h5>
		Renaming Outfit "<span class="kiln-rename-target">none</span>"
	</div>
	<div class="col-md-2">
		<button type="button" class="btn btn-info w-100 mx-auto">X</button>
	</div>
</div>
<div class="modal-body">
	<div class="input-group mb-2">
		<input type="text" class="form-control" placeholder="New Outfit Name...">
		<button type="button" class="btn btn-success">Save</button>
	</div>
	<b class="text-muted" style="font-size: 0.85rem;"><i class="fa-duotone fa-square-question mr-1"></i> ...</b>
</div>`;
	outfitRenameModal
		.querySelector<HTMLButtonElement>(".btn-info")!
		.addEventListener("click", () => outfitRenameModal.close());
	const outfitRenameButton =
		outfitRenameModal.querySelector<HTMLButtonElement>(".btn-success")!;
	const outfitRenameError = outfitRenameModal.querySelector<HTMLElement>("b")!;
	const outfitRenameNameEl = outfitRenameModal.querySelector<HTMLElement>(
		".kiln-rename-target",
	)!;

	let renameTargetId: string | null = null;
	outfitRenameButton.addEventListener("click", async () => {
		const renameInput =
			outfitRenameButton.previousElementSibling as HTMLInputElement;
		let outfitName = renameInput.value.trim();
		renameInput.value = "";

		if (outfitName === "") {
			outfitRenameError.className = "text-danger";
			outfitRenameError.innerHTML =
				'<i class="fa-duotone fa-circle-exclamation mr-1"></i> You cannot name an outfit nothing.';
			return;
		}

		if (outfitName.length > 25) outfitName = outfitName.substring(0, 25);

		if (outfits!.some((x) => x.name.trim() === outfitName)) {
			outfitRenameError.className = "text-danger";
			outfitRenameError.innerHTML = `<i class="fa-duotone fa-circle-exclamation mr-1"></i> You already have an outfit with the name "${outfitName}".`;
			return;
		}

		if (kilnUserId === null || renameTargetId === null) return;
		const target = outfits!.find((o) => o.id === renameTargetId);
		if (!target) return;
		const result = await sendMessage("updateAvatarOutfit", {
			userId: kilnUserId,
			outfitId: target.id,
			name: outfitName,
		});
		if (!result.ok) return;

		outfitRenameModal.close();
		target.name = outfitName;
		if (tabSelected === "outfit") loadItems();
	});

	(async () => {
		const userDetails = await getUserDetails();
		if (!userDetails) return;
		kilnUserId = userDetails.userId;

		const sessionResult = await sendMessage("getApiSession", kilnUserId);
		if (!sessionResult.ok || sessionResult.data.data.state !== "verified") {
			return;
		}

		isVerified = true;

		const outfitsResult = await sendMessage("getAvatarOutfits", kilnUserId);
		if (!outfitsResult.ok) return;

		outfits = outfitsResult.data.data;
		if (tabSelected === "outfit") loadItems();
	})();

	updateAvatar();
	loadItems();

	const tabs = document.getElementById("tabs")!;
	Array.from(tabs.children).forEach((element) => {
		element.addEventListener("click", () => {
			const link = element.getElementsByTagName("a")[0];
			if (!link.classList.contains("active")) {
				link.classList.add("active");
				(
					tabs.querySelector(`[data-tab="${tabSelected}"]`) as HTMLElement
				).classList.remove("active");
				tabSelected = link.getAttribute("data-tab")!;
				(itemSearch.previousElementSibling as HTMLInputElement).value = "";
				page = 1;
				search = "";
				loadItems();
			}
		});
	});

	(
		Array.from(document.getElementsByClassName("bodypart")) as HTMLElement[]
	).forEach((part) => {
		part.addEventListener("click", () => {
			selectedBodyPart = part.id;
			bodyColorTargetLabel.innerText = formatBodyPartName(selectedBodyPart);
			bodyColorHexInput.classList.remove("is-invalid");
			bodyColorHexInput.value =
				toHexColor(
					(avatar as Record<string, unknown>)[`${selectedBodyPart}Color`],
				) ?? "";
			bodyColorsModal.showModal();
		});
	});

	(
		Array.from(
			document.getElementsByClassName("colorpicker-color"),
		) as HTMLElement[]
	).forEach((color) => {
		color.addEventListener("click", () => {
			const hex = color.dataset.color;
			if (hex === undefined) return;
			applyBodyColor(hex);
		});
	});

	const itemSearch = document.getElementById("search-btn") as HTMLButtonElement;
	itemSearch.addEventListener("click", () => {
		search = (itemSearch.previousElementSibling as HTMLInputElement).value;
		page = 1;
		loadItems();
	});

	const itemSort = document.getElementById("item-sort") as HTMLSelectElement;
	itemSort.addEventListener("change", () => {
		sort = itemSort.options[itemSort.selectedIndex].value;
		page = 1;
		loadItems();
	});

	const itemOrder = document.getElementById("item-order") as HTMLSelectElement;
	itemOrder.addEventListener("change", () => {
		order = itemOrder.options[itemOrder.selectedIndex].value;
		page = 1;
		loadItems();
	});

	const paginationFirst = document.getElementById("pagination-first")!;
	const paginationPrev = document.getElementById("pagination-prev")!;
	const paginationNext = document.getElementById("pagination-next")!;
	const paginationLast = document.getElementById("pagination-last")!;

	function updatePaginationState(): void {
		const atStart = page <= 1;
		const atEnd = page >= pageCount;
		paginationPrev.classList.toggle("disabled", atStart);
		paginationFirst.classList.toggle("disabled", atStart);
		paginationNext.classList.toggle("disabled", atEnd);
		paginationLast.classList.toggle("disabled", atEnd);
	}

	updatePaginationState();

	paginationFirst.addEventListener("click", () => {
		if (page > 1) {
			page = 1;
			loadItems();
		}
	});
	paginationPrev.addEventListener("click", () => {
		if (page > 1) {
			page--;
			loadItems();
		}
	});
	paginationNext.addEventListener("click", () => {
		if (page < pageCount) {
			page++;
			loadItems();
		}
	});
	paginationLast.addEventListener("click", () => {
		if (page < pageCount) {
			page = pageCount;
			loadItems();
		}
	});

	(document.getElementById("clear") as HTMLButtonElement).addEventListener(
		"click",
		() => {
			avatar = structuredClone(DEFAULT_AVATAR);
			updateAvatar();
		},
	);

	(document.getElementById("myself") as HTMLButtonElement).addEventListener(
		"click",
		async () => {
			const userDetails = await getUserDetails();
			if (!userDetails) return;
			loadUser(userDetails.userId);
		},
	);

	const jsonUploadButton = document.getElementById(
		"jsonUpload",
	) as HTMLInputElement;
	jsonUploadButton.addEventListener("change", () => {
		const reader = new FileReader();
		reader.addEventListener("loadend", () => {
			avatar = normalizeBodyColors(
				sanitizeImportedAvatar(
					JSON.parse(reader.result as string) as AvatarIFrameState,
				),
			);
			updateAvatar();
			jsonUploadButton.value = "";
		});
		reader.readAsText(jsonUploadButton.files![0]);
	});

	(document.getElementById("jsonSave") as HTMLButtonElement).addEventListener(
		"click",
		() => {
			const download = document.createElement("a");
			download.href = URL.createObjectURL(
				new Blob([JSON.stringify(avatar)], { type: "application/json" }),
			);
			download.setAttribute("download", "AvatarSandbox.json");
			document.body.appendChild(download);
			download.click();
			document.body.removeChild(download);
		},
	);

	(document.getElementById("glbExport") as HTMLButtonElement).addEventListener(
		"click",
		async (e) => {
			const btn = e.currentTarget as HTMLButtonElement;
			const icon = btn.querySelector("i")!;
			const originalClass = icon.className;
			icon.className = "fa-duotone fa-spinner fa-spin";

			try {
				const glb = await renderer.exportGLB();
				const download = document.createElement("a");
				download.href = URL.createObjectURL(
					new Blob([glb], { type: "model/gltf-binary" }),
				);
				download.setAttribute("download", "AvatarSandbox.glb");
				document.body.appendChild(download);
				download.click();
				document.body.removeChild(download);
				URL.revokeObjectURL(download.href);
			} finally {
				icon.className = originalClass;
			}
		},
	);

	(
		document.getElementById("viewFullscreen") as HTMLButtonElement
	).addEventListener("click", () => viewCanvas.requestFullscreen());

	const loadAsset = document.getElementById("load-asset") as HTMLButtonElement;
	const loadAssetType = document.getElementById(
		"load-asset-type",
	) as HTMLSelectElement;
	loadAsset.addEventListener("click", () => {
		const selectedType =
			loadAssetType.options[loadAssetType.selectedIndex].value;
		const inputEl = loadAsset.previousElementSibling as HTMLInputElement;

		if (inputEl.value === "trofie") inputEl.value = "31501";

		if (selectedType !== "user") {
			const parsedVal = Number.isNaN(Number(inputEl.value))
				? inputEl.value
				: parseInt(inputEl.value, 10);
			if (selectedType === "hat") {
				avatar.items.push(parsedVal);
			} else if (selectedType === "clothing") {
				avatar.clothing ??= [];
				avatar.clothing.push(parsedVal);
			} else {
				(avatar as Record<string, unknown>)[selectedType] = parsedVal;
			}
			updateAvatar();
		} else {
			loadUser(inputEl.value);
		}

		inputEl.value = "";
	});

	(document.getElementById("saveOutfit") as HTMLButtonElement).addEventListener(
		"click",
		() => {
			if (!isVerified) {
				const outfitTab = tabs.querySelector<HTMLElement>(
					'[data-tab="outfit"]',
				)!;
				if (!outfitTab.classList.contains("active")) {
					outfitTab.classList.add("active");
					tabs
						.querySelector<HTMLElement>(`[data-tab="${tabSelected}"]`)!
						.classList.remove("active");
					tabSelected = "outfit";
					page = 1;
					search = "";
					loadItems();
				}
				return;
			}
			console.log(outfits);
			outfitCreateModal.showModal();
		},
	);

	outfitCreateButton.addEventListener("click", async () => {
		const nameInput =
			outfitCreateButton.previousElementSibling as HTMLInputElement;
		let outfitName = nameInput.value.trim();
		nameInput.value = "";

		if (outfitName === "") {
			outfitCreateError.className = "text-danger";
			outfitCreateError.innerHTML =
				'<i class="fa-duotone fa-circle-exclamation mr-1"></i> You cannot name an outfit nothing.';
			return;
		}

		if (outfitName.length > 25) outfitName = outfitName.substring(0, 25);

		if ((outfits ?? []).some((x) => x.name.trim() === outfitName)) {
			outfitCreateError.className = "text-danger";
			outfitCreateError.innerHTML = `<i class="fa-duotone fa-circle-exclamation mr-1"></i> You already have an outfit with the name "${outfitName}".`;
			return;
		}

		if (kilnUserId === null) return;
		const result = await sendMessage("createAvatarOutfit", {
			userId: kilnUserId,
			name: outfitName,
			avatarData: avatar,
		});
		if (!result.ok) return;

		outfitCreateModal.close();
		outfits ??= [];
		outfits.push(result.data.data);
		if (tabSelected === "outfit") loadItems();
	});

	document.getElementById("view-cache")!.addEventListener("click", () => {
		console.log("Cache: ", itemCache);
	});

	function initRetroItems(): void {
		const PAGE_SIZE = 12;
		const allItems: CachedItem[] = [];
		for (const [idStr, data] of Object.entries(retroItemsData)) {
			const numId = parseInt(idStr, 10);
			const negId = numId * -1;
			const item: CachedItem = {
				id: negId,
				type: data.type,
				accessoryType: data.accessoryType || undefined,
				name: data.name,
				price: data.price as number | null | false,
				creator: { id: 1, name: "Polytoria" },
				thumbnail: `https://poly-archive.pages.dev/assets/thumbnails/${numId}.png`,
				asset:
					(data as { asset?: string }).asset ??
					`https://poly-upd-archival.pages.dev/glb/${numId}.glb`,
				ribbon: "retro",
				createdAt: (data as { createdAt?: string }).createdAt,
			};
			itemCache[negId] = item;
			allItems.push(item);
		}
		const pages: CachedItem[][] = [];
		for (let i = 0; i < allItems.length; i += PAGE_SIZE) {
			pages.push(allItems.slice(i, i + PAGE_SIZE));
		}
		retroItems = pages as unknown[][];
	}

	async function updateAvatar(): Promise<void> {
		const formattedAvatar: AvatarIFrameState = structuredClone(avatar);
		formattedAvatar.itemTransforms = {};

		if (retroItems === null && avatar.items.some((id) => (id as number) < 0)) {
			initRetroItems();
		}

		const isPendingAsset = (x: unknown): x is number | string =>
			x != null &&
			!x.toString().startsWith("http") &&
			!x.toString().startsWith("data:");

		const resolveAccessoryCache = async (
			key: number | string,
		): Promise<void> => {
			if (itemCache[key] === undefined) {
				const itemResult = await sendMessage("getItem", +key);
				if (itemResult.ok) {
					const itemDetails = itemResult.data;
					itemCache[key] = {
						type: itemDetails.type,
						name: itemDetails.name,
						price: itemDetails.price,
						creator: {
							name: itemDetails.creator.name,
							id: itemDetails.creator.id,
						},
						thumbnail: itemDetails.thumbnail,
						asset: undefined,
					};
					if (itemDetails.type === "hat") {
						//@ts-expect-error
						itemCache[key].accessoryType = itemDetails.accessoryType;
					}
				} else {
					itemCache[key] = {
						type: "unknown",
						name: `#${key}`,
						price: null,
						creator: null,
						thumbnail:
							"https://cdn.polytoria.com/static/images/broken.136e44ee.png",
						asset: undefined,
						ribbon: "unknown",
					};
				}

				if (["mesh", "decal", "audio"].includes(itemCache[key].type)) {
					itemCache[key].type =
						loadAssetType.options[loadAssetType.selectedIndex].value;
					itemCache[key].ribbon = "custom";
				}
			}

			if (itemCache[key].asset === undefined) {
				const meshResult = await sendMessage("getItemMesh", +key);
				if (meshResult.ok && meshResult.data.success)
					itemCache[key].asset = meshResult.data.url;
			}
		};

		const accessoryPromise = [
			...avatar.items
				.filter(isPendingAsset)
				.map((x) => resolveAccessoryCache(x)),
			...[avatar.tool, avatar.body].filter(isPendingAsset).map(async (x) => {
				await resolveAccessoryCache(x);
				if (itemCache[x].asset !== undefined && itemCache[x].type !== "hat") {
					(formattedAvatar as Record<string, unknown>)[itemCache[x].type] =
						itemCache[x].asset;
				}
			}),
		];

		const loadTexture = async (x: number | string): Promise<void> => {
			const key = x as number | string;
			if (itemCache[key] === undefined) {
				const itemResult = await sendMessage("getItem", +key);
				if (itemResult.ok) {
					const itemDetails = itemResult.data;
					itemCache[key] = {
						type: itemDetails.type,
						name: itemDetails.name,
						price: itemDetails.price,
						creator: {
							name: itemDetails.creator.name,
							id: itemDetails.creator.id,
						},
						thumbnail: itemDetails.thumbnail,
						asset: undefined,
					};
					if (itemDetails.price === 0 && itemDetails.sales === 0) {
						itemCache[key].price = null;
					}
				} else {
					itemCache[key] = {
						type: "unknown",
						name: `#${key}`,
						price: null,
						creator: null,
						thumbnail:
							"https://cdn.polytoria.com/static/images/broken.136e44ee.png",
						asset: undefined,
						ribbon: "unknown",
					};
				}
				if (["mesh", "decal", "audio"].includes(itemCache[key].type)) {
					itemCache[key].ribbon = "custom";
				}
			}
			if (itemCache[key].asset === undefined) {
				const textureResult = await sendMessage("getItemTexture", +key);
				if (textureResult.ok && textureResult.data.success)
					itemCache[key].asset = textureResult.data.url;
			}
		};

		const facePromise =
			avatar.face !== undefined &&
			!avatar.face.toString().startsWith("http") &&
			!avatar.face.toString().startsWith("data:")
				? loadTexture(avatar.face).then(() => {
						if (itemCache[avatar.face!]?.asset !== undefined)
							formattedAvatar.face = itemCache[avatar.face!].asset;
					})
				: Promise.resolve();

		const clothingPromise = Promise.all(
			(avatar.clothing ?? [])
				.filter(
					(x) =>
						!x.toString().startsWith("http") &&
						!x.toString().startsWith("data:"),
				)
				.map(loadTexture),
		);

		formattedAvatar.face ??=
			"https://cdn.polytoria.com/static/3dview/DefaultFace.png";

		await Promise.all(accessoryPromise);
		await facePromise;
		await clothingPromise;

		formattedAvatar.items = avatar.items.flatMap((x) => {
			if (x.toString().startsWith("http") || x.toString().startsWith("data:"))
				return [x as string];
			const cached = itemCache[x];
			if (cached?.asset === undefined || cached.type !== "hat") return [];
			const transform = avatar.itemTransforms?.[x.toString()];
			if (transform) formattedAvatar.itemTransforms![cached.asset] = transform;
			return [cached.asset];
		});

		formattedAvatar.clothing = (avatar.clothing ?? []).flatMap((x) => {
			if (x.toString().startsWith("http") || x.toString().startsWith("data:"))
				return [x as string];
			const asset = itemCache[x]?.asset;
			return asset !== undefined ? [asset] : [];
		});

		console.log("Real Avatar: ", avatar);
		console.log("Formatted: ", formattedAvatar);

		renderer.load(formattedAvatar);

		updateBodyColors();
		loadWearing();
	}

	async function loadUser(id: string | number): Promise<void> {
		const dataResult = await sendMessage("getUserAvatar", +id);
		if (!dataResult.ok) return;
		const data = dataResult.data;

		avatar = {
			useCharacter: true,
			items: [],
			headColor: `#${data.colors.head}` || "#cdcdcd",
			torsoColor: `#${data.colors.torso}` || "#cdcdcd",
			leftArmColor: `#${data.colors.leftArm}` || "#cdcdcd",
			rightArmColor: `#${data.colors.rightArm}` || "#cdcdcd",
			leftLegColor: `#${data.colors.leftLeg}` || "#cdcdcd",
			rightLegColor: `#${data.colors.rightLeg}` || "#cdcdcd",
		};

		data.assets.forEach(
			//@ts-expect-error: TODO
			(item: {
				id: number;
				type: string;
				accessoryType?: string;
				name: string;
				thumbnail: string;
				path?: string;
			}) => {
				if (itemCache[item.id] === undefined) {
					itemCache[item.id] = {
						type: item.type,
						name: item.name,
						price: null,
						creator: ["hat", "tool", "torso"].includes(item.type)
							? { id: 1, name: "Polytoria" }
							: null,
						thumbnail: item.thumbnail,
						asset: item.path,
					};
				}

				if (item.type === "hat") {
					itemCache[item.id].accessoryType = item.accessoryType;
					avatar.items.push(item.id);
				} else if (item.type === "clothing") {
					avatar.clothing ??= [];
					avatar.clothing.push(item.id);
				} else {
					(avatar as Record<string, unknown>)[item.type] = item.id;
				}
			},
		);

		updateAvatar();
	}

	async function loadItems(): Promise<void> {
		const requestId = ++loadItemsRequestId;
		document.getElementById("inventory")!.innerHTML = "";

		const isRetro = tabSelected === "retro";
		for (const filter of Array.from(
			document.getElementsByClassName("retro-items-disable"),
		) as HTMLInputElement[]) {
			filter.disabled = isRetro;
			filter.classList.toggle("unavailable", isRetro);
		}

		let items: StoreApiResponse;

		if (!["retro", "outfit"].includes(tabSelected)) {
			const FETCH_LIMIT = 100;
			const DISPLAY_SIZE = 12;
			const cacheKey = `${tabSelected}|${search}|${sort}|${order}`;
			let cache = storeCache.get(cacheKey);

			if (!cache) {
				const result = await sendMessage("getStore", {
					order,
					sort,
					showOffsale,
					types: [tabSelected],
					search,
					page: 1,
					limit: FETCH_LIMIT,
				});
				if (!result.ok) return;
				if (requestId !== loadItemsRequestId) return;
				//@ts-expect-error: To-fix
				const data: StoreApiResponse = result.data;
				cache = {
					items: data.assets ?? [],
					nextApiPage: 2,
					totalApiPages: data.pages,
					total: data.total,
				};
				storeCache.set(cacheKey, cache);
			}

			let cachedDisplayPages =
				Math.ceil(cache.items.length / DISPLAY_SIZE) || 1;
			while (
				page >= cachedDisplayPages &&
				cache.nextApiPage <= cache.totalApiPages
			) {
				const result = await sendMessage("getStore", {
					order,
					sort,
					showOffsale,
					types: [tabSelected],
					search,
					page: cache.nextApiPage,
					limit: FETCH_LIMIT,
				});
				if (!result.ok) break;
				if (requestId !== loadItemsRequestId) return;
				//@ts-expect-error: To-fix
				const data: StoreApiResponse = result.data;
				cache.items.push(...(data.assets ?? []));
				cache.nextApiPage++;
				cache.totalApiPages = data.pages;
				cache.total ??= data.total;
				cachedDisplayPages = Math.ceil(cache.items.length / DISPLAY_SIZE) || 1;
			}

			const start = (page - 1) * DISPLAY_SIZE;
			const hasMoreApiData = cache.nextApiPage <= cache.totalApiPages;
			items = {
				assets: cache.items.slice(
					start,
					start + DISPLAY_SIZE,
				) as unknown as StoreApiItem[],
				pages:
					cache.total !== undefined
						? Math.ceil(cache.total / DISPLAY_SIZE)
						: hasMoreApiData
							? Math.ceil(cache.items.length / DISPLAY_SIZE) + 1
							: Math.ceil(cache.items.length / DISPLAY_SIZE),
				total: cache.total,
			};
		} else if (tabSelected === "outfit") {
			if (!isVerified) {
				pageCount = 1;
				updatePaginationState();
				document.getElementById("pagination-current")!.innerText = "1";
				const inv = document.getElementById("inventory")!;
				inv.classList.remove("itemgrid");
				inv.innerHTML = `
<div class="card mcard w-100">
  <div class="card-body text-center p-4">
    <img class="m-2" src="${sadFace}" width="75" height="75" style="filter: grayscale(1)">
    <p class="text-muted mb-0"><a href="/my/settings/kiln?tab=sync">Verify your Kiln account</a> to save and sync outfits across devices.</p>
  </div>
</div>`;
				return;
			}
			if (!outfits || outfits.length === 0) {
				pageCount = 1;
				updatePaginationState();
				document.getElementById("pagination-current")!.innerText = "1";
				const inv = document.getElementById("inventory")!;
				inv.classList.remove("itemgrid");
				inv.innerHTML = `
<div class="card mcard w-100">
  <div class="card-body text-center p-4">
    <img class="m-2" src="${sadFace}" width="75" height="75" style="filter: grayscale(1)">
    <p class="text-muted mb-0">You haven't saved any outfits yet!</p>
  </div>
</div>`;
				return;
			}
			const outfitsClone = structuredClone(outfits!);
			const groups: AvatarSandboxOutfit[][] = [];
			while (outfitsClone.length > 0) groups.push(outfitsClone.splice(0, 12));
			items = {
				assets: groups[page - 1] as unknown as StoreApiItem[],
				pages: groups.length,
			};
		} else {
			pageCount = 1;
			updatePaginationState();
			document.getElementById("pagination-current")!.innerText = "1";
			const inv = document.getElementById("inventory")!;
			inv.classList.remove("itemgrid");
			inv.innerHTML = `
<div class="card mcard w-100">
  <div class="card-body text-center p-4">
    <img class="m-2" src="${sadFace}" width="75" height="75" style="filter: grayscale(1)">
    <p class="text-muted mb-0">Retro items are temporarily unavailable.</p>
  </div>
</div>`;
			return;
		}

		if (requestId !== loadItemsRequestId) return;

		pageCount = items.pages;
		updatePaginationState();
		document.getElementById("pagination-current")!.innerText = String(page);

		items.assets ??= [];

		const inventory = document.getElementById("inventory")!;

		if (items.assets.length > 0) {
			inventory.classList.add("itemgrid");

			if (tabSelected !== "outfit") {
				(items.assets as StoreApiItem[]).forEach((item) => {
					if (tabSelected !== "retro" && item.price === null) {
						(item as unknown as { price: false }).price = false;
					}

					const ribbon = chooseRibbon(item as unknown as CachedItem, false);

					const itemColumn = document.createElement("div");
					itemColumn.classList.value = "col-auto";
					itemColumn.innerHTML = `
<div style="max-width: 150px;">
  <div class="card mb-2 avatar-item-container">
    ${ribbon ?? ""}
    <div class="p-2">
      <img src="${escapeHtml(safeHttpUrl(item.thumbnail))}" class="img-fluid" style="border-radius: 10px;">
      <button class="avatarAction btn btn-success btn-sm position-absolute rounded-circle text-center" style="top: -10px; right: -16px; width: 32px; height: 32px; z-index: 1;"><i class="fas fa-plus"></i></button>
    </div>
  </div>
  <a href="${item.id > 0 ? `/store/${item.id}` : `https://poly-archive.vercel.app/archive/${Math.abs(item.id)}`}" class="text-reset">
    <h6 class="text-truncate mb-0">${escapeHtml(item.name)}</h6>
  </a>
  <small class="text-muted d-block text-truncate">${formatTypeDisplay(item as unknown as CachedItem)}</small>
  <small style="font-size: 0.8rem;" class="d-block text-truncate mb-2 ${formatPrice(item.price as number | null | false)}
</div>`;
					inventory.appendChild(itemColumn);

					if (itemCache[item.id] === undefined && tabSelected !== "retro") {
						itemCache[item.id] = {
							type: item.type,
							name: item.name,
							price: item.price,
							creator: { name: item.creator.name, id: item.creator.id },
							thumbnail: item.thumbnail,
							asset: undefined,
							accessoryType:
								item.type === "hat"
									? (item.accessoryType ?? undefined)
									: undefined,
							ribbon: item.isLimited ? "limited" : undefined,
						};
					}

					itemColumn
						.getElementsByClassName("p-2")[0]
						.addEventListener("click", () => {
							wearAsset(item as unknown as CachedItem, item.id);
						});

					if (ribbon !== null) {
						itemColumn
							.getElementsByClassName("ribbon")[0]
							.addEventListener("click", () => {
								wearAsset(item as unknown as CachedItem, item.id);
							});
					}
				});
			} else {
				(items.assets as unknown as AvatarSandboxOutfit[]).forEach((outfit) => {
					const colorBtn = (color: string, padding: string) =>
						`<button style="border:0;border-radius:5px;cursor:default;background-color:${color};padding:${padding};"></button>`;

					const itemColumn = document.createElement("div");
					itemColumn.classList.value = "col-auto";
					itemColumn.innerHTML = `
<div style="max-width: 150px;">
  <div class="card mb-2">
    <div class="p-2 text-center">
      <div class="mb-1">${colorBtn(outfit.data.headColor, "15px")}</div>
      <div class="mb-1">
        ${colorBtn(outfit.data.leftArmColor, "10px 10px 20px")}
        ${colorBtn(outfit.data.torsoColor, "20px")}
        ${colorBtn(outfit.data.rightArmColor, "10px 10px 20px")}
      </div>
      ${colorBtn(outfit.data.leftLegColor, "10px 10px 20px")}
      ${colorBtn(outfit.data.rightLegColor, "10px 10px 20px")}
    </div>
  </div>
  <h6 class="text-truncate mb-0 text-reset text-center mb-2">${escapeHtml(outfit.name)}</h6>
  <div class="btn-group w-100">
    <button class="btn btn-primary btn-sm p+outfit_wear_button">Wear</button>
    <div class="btn-group">
      <button type="button" class="btn btn-warning dropdown-toggle btn-sm" data-bs-toggle="dropdown" aria-expanded="false">
        <i class="fa-duotone fa-wrench"></i>
      </button>
      <ul class="dropdown-menu">
        <li><a class="dropdown-item text-primary p+outfit_rename_button" href="#"><i class="fa-solid fa-signature"></i> Rename</a></li>
        <li><span class="p+outfit_overwrite_button dropdown-item text-warning"><i class="fa-solid fa-wand-magic-sparkles"></i> <span>Overwrite</span></span></li>
        <li><hr class="dropdown-divider"></li>
        <li><span class="p+outfit_delete_button dropdown-item text-danger"><i class="fa-duotone fa-trash"></i> <span>Delete</span></span></li>
      </ul>
    </div>
  </div>
</div>`;
					inventory.appendChild(itemColumn);

					itemColumn
						.getElementsByClassName("p+outfit_wear_button")[0]
						.addEventListener("click", () => {
							console.log("Equipped Outfit: ", outfit);
							avatar = structuredClone(outfit.data);
							updateAvatar();
						});

					itemColumn
						.getElementsByClassName("p+outfit_rename_button")[0]
						.addEventListener("click", () => {
							if (!isVerified) return;
							renameTargetId = outfit.id;
							outfitRenameModal.showModal();
							outfitRenameNameEl.innerText = outfit.name;
							(
								outfitRenameButton.previousElementSibling as HTMLInputElement
							).value = outfit.name;
						});

					setupPendingButton(
						itemColumn.getElementsByClassName(
							"p+outfit_overwrite_button",
						)[0] as HTMLElement,
						"Overwrite",
						async () => {
							if (!isVerified || kilnUserId === null) return;
							const result = await sendMessage("updateAvatarOutfit", {
								userId: kilnUserId,
								outfitId: outfit.id,
								avatarData: avatar,
							});
							if (!result.ok) return;
							const target = outfits!.find((o) => o.id === outfit.id);
							if (target) target.data = structuredClone(avatar);
							if (tabSelected === "outfit") loadItems();
						},
					);

					setupPendingButton(
						itemColumn.getElementsByClassName(
							"p+outfit_delete_button",
						)[0] as HTMLElement,
						"Delete",
						async () => {
							if (!isVerified || kilnUserId === null) return;
							const result = await sendMessage("deleteAvatarOutfit", {
								userId: kilnUserId,
								outfitId: outfit.id,
							});
							if (!result.ok) return;
							const targetIndex = outfits!.findIndex((o) => o.id === outfit.id);
							if (targetIndex !== -1) outfits!.splice(targetIndex, 1);
							if (tabSelected === "outfit") loadItems();
						},
					);
				});
			}
		} else {
			inventory.classList.remove("itemgrid");
			inventory.innerHTML = `
<div class="text-muted" style="padding: 37px 30px;">
  <h1 class="display-3"><i class="fas fa-box-open"></i></h1>
  <h6 class="mb-0">You do not have any items matching this type or search query. Find new items in the <a href="/store">store</a>!</h6>
</div>`;
		}
	}

	function loadWearing(): void {
		document.getElementById("wearing")!.innerHTML = "";

		[
			...avatar.items,
			...(avatar.clothing ?? []),
			avatar.face,
			avatar.tool,
			avatar.body,
		]
			.filter((x): x is number | string => x !== undefined)
			.forEach((id) => {
				const cached = itemCache[id.toString()];
				if (cached === undefined) return;

				cached.creator ??= { id: 1, name: "-" };
				cached.price ??= "???" as unknown as null;

				const ribbon = chooseRibbon(cached, true);

				const itemColumn = document.createElement("div");
				itemColumn.classList.value = "col-auto";
				itemColumn.innerHTML = `
<div style="max-width: 150px;">
  <div class="card mb-2 avatar-item-container">
    ${ribbon ?? ""}
    <div class="p-2">
      <img src="${escapeHtml(safeHttpUrl(cached.thumbnail))}" class="img-fluid" style="border-radius: 10px;">
      <button class="avatarAction btn btn-danger btn-sm position-absolute rounded-circle text-center" style="top: -10px; right: -16px; width: 32px; height: 32px; z-index: 1;"><i class="fas fa-minus"></i></button>
      ${
				cached.type === "hat"
					? `<button class="avatarAction btn btn-primary btn-sm position-absolute rounded-circle text-center kiln-reposition-btn" style="bottom: -10px; right: -16px; width: 32px; height: 32px; z-index: 1;" data-bs-toggle="tooltip" data-bs-title="Reposition"><i class="fa-duotone fa-arrows-up-down-left-right"></i></button>`
					: ""
			}
    </div>
  </div>
  <a href="${(id as number) > 0 ? `/store/${id}` : `https://poly-archive.vercel.app/archive/${Math.abs(id as number)}`}" class="text-reset">
    <h6 class="text-truncate mb-0">${escapeHtml(cached.name)}</h6>
  </a>
  <small class="text-muted d-block text-truncate">${formatTypeDisplay(cached)}</small>
  <small style="font-size: 0.8rem;" class="d-block text-truncate mb-2 ${formatPrice(cached.price)}
</div>`;
				document.getElementById("wearing")!.appendChild(itemColumn);

				itemColumn
					.getElementsByClassName("p-2")[0]
					.addEventListener("click", () => {
						wearAsset(cached, id);
					});

				if (ribbon !== null) {
					itemColumn
						.getElementsByClassName("ribbon")[0]
						.addEventListener("click", () => {
							wearAsset(cached, id);
						});
				}

				const repositionBtn = itemColumn.getElementsByClassName(
					"kiln-reposition-btn",
				)[0];
				repositionBtn?.addEventListener("click", (e) => {
					e.stopPropagation();
					openRepositionModal(id, cached.name);
				});
			});
	}

	function wearAsset(details: CachedItem, id: number | string): void {
		const avatarRecord = avatar as Record<string, unknown>;
		const numericId = typeof id === "string" ? parseInt(id, 10) : id;

		if (details.type === "hat") {
			const isEquipped = avatar.items.indexOf(numericId) !== -1;
			if (!isEquipped) avatar.items.push(id);
			else avatar.items.splice(avatar.items.indexOf(numericId), 1);
		} else if (details.type === "clothing") {
			avatar.clothing ??= [];
			const isEquipped = avatar.clothing.indexOf(numericId) !== -1;
			if (!isEquipped) avatar.clothing.push(id);
			else avatar.clothing.splice(avatar.clothing.indexOf(numericId), 1);
		} else {
			const isEquipped = avatarRecord[details.type] === id;
			if (!isEquipped) avatarRecord[details.type] = id;
			else avatarRecord[details.type] = undefined;
		}

		updateAvatar();
		loadWearing();
	}

	function updateBodyColors(): void {
		const bodyColorMap: Record<string, string> = {
			head: avatar.headColor,
			torso: avatar.torsoColor,
			leftArm: avatar.leftArmColor,
			rightArm: avatar.rightArmColor,
			leftLeg: avatar.leftLegColor,
			rightLeg: avatar.rightLegColor,
		};

		Object.entries(bodyColorMap).forEach(([elementId, color]) => {
			const el = document.getElementById(elementId);
			if (el) el.style.backgroundColor = color;
		});
	}

	function setupPendingButton(
		el: HTMLElement,
		defaultLabel: string,
		onConfirm: () => void,
	): void {
		let pending = false;
		el.addEventListener("click", (e) => {
			e.stopPropagation();
			if (!pending) {
				pending = true;
				(el.children[1] as HTMLElement).innerText = "Are you sure?";
				setTimeout(() => {
					if (pending) {
						(el.children[1] as HTMLElement).innerText = defaultLabel;
						pending = false;
					}
				}, 3000);
			} else {
				pending = false;
				onConfirm();
			}
		});
	}

	function formatBodyPartName(part: string): string {
		const spaced = part.replace(/([A-Z])/g, " $1");
		return spaced.charAt(0).toUpperCase() + spaced.slice(1);
	}

	function cleanAccessoryType(type: string): string {
		const map: Record<string, string> = {
			hat: "Hat",
			backAccessory: "Back Accessory",
			faceAccessory: "Face Accessory",
			headAttachment: "Head Attachment",
			hair: "Hair",
			neckAccessory: "Neck Accessory",
			headCover: "Head Cover",
			headAccessory: "Head Accessory",
			frontAccessory: "Front Accessory",
		};
		return map[type] ?? type;
	}

	function formatPrice(price: number | null | false | string): string {
		if (price === 0) return 'text-primary fw-bold">Free</small>';
		if (price === false) return 'text-muted fw-bold">Offsale</small>';
		if (price === null || price === "???") return 'text-muted">???</small>';
		return `text-success"><i class="pi mr-1">$</i> ${price}</small>`;
	}

	function chooseRibbon(item: CachedItem, wearing: boolean): string | null {
		const threeDaysAgo = new Date();
		threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

		if (item.ribbon === "custom")
			return '<div class="ribbon ribbon-polyplus-custom ribbon-top-right"><span>Custom</span></div>';
		if (item.ribbon === "unknown")
			return '<div class="ribbon ribbon-polyplus-unknown ribbon-top-right"><span><i>?</i></span></div>';
		if (item.ribbon === "retro" && wearing)
			return '<div class="ribbon ribbon-polyplus-retro ribbon-top-right"><span>Retro</span></div>';
		if (item.isLimited)
			return '<div class="ribbon ribbon-limited ribbon-top-right"><span><i class="fas fa-star" style="display: inline-block"></i></span></div>';
		if (item.createdAt !== undefined && new Date(item.createdAt) > threeDaysAgo)
			return '<div class="ribbon ribbon-new ribbon-top-right"><span>New</span></div>';
		return null;
	}

	function formatTypeDisplay(item: CachedItem): string {
		if (["hat", "tool", "face", "torso"].includes(item.type)) {
			if (item.type === "hat")
				return cleanAccessoryType(item.accessoryType ?? "hat");
			if (item.type === "torso") return "Body Part";
			return item.type[0].toUpperCase() + item.type.slice(1);
		}
		return `by <a class="text-muted" href="/u/${item.creator!.name}">${item.creator!.name}</a>`;
	}
}

export function outfitManagement(showDisclosures: boolean) {
	const outfitsTab = document.getElementById("outfits-tab");
	if (!outfitsTab) return;

	const _outfitsTab: HTMLElement = outfitsTab;

	function processOutfitCards() {
		if (!_outfitsTab.classList.contains("active")) return;

		const wardrobeAssets = document.getElementById("wardrobe-assets");
		if (!wardrobeAssets) return;

		const cards =
			wardrobeAssets.querySelectorAll<HTMLElement>("div.col-auto.mb-3");

		cards.forEach((card) => {
			if (card.querySelector(".kiln-outfit-dropdown")) return;

			const deleteBtn = card.querySelector<HTMLElement>(
				'[onclick^="deleteOutfit("]',
			);
			if (!deleteBtn) return;

			const match = deleteBtn
				.getAttribute("onclick")
				?.match(/deleteOutfit\((\d+)\)/);
			if (!match) return;
			const outfitId = parseInt(match[1], 10);

			const nameEl = card.querySelector("h6.text-truncate");
			if (!nameEl) return;
			const outfitName = nameEl.textContent?.trim() ?? "";

			const imageCard = card.querySelector<HTMLElement>(".card.mb-2 .p-2");
			if (!imageCard) return;
			imageCard.style.position = "relative";

			imageCard.innerHTML += `
<div class="btn-group position-absolute" style="bottom: 4px; right: 4px; z-index: 1;">
  <button type="button" class="btn btn-sm btn-secondary dropdown-toggle kiln-outfit-dropdown" data-bs-toggle="dropdown" aria-expanded="false" style="line-height: 1; padding: 2px 6px; font-size: 0.75rem;">
    ...
  </button>
  <ul class="dropdown-menu dropdown-menu-end" style="min-width: 100px;">
    <li><a class="dropdown-item text-secondary kiln-outfit-rename disabled" href="#"><i class="fa-solid fa-signature"></i> Rename (UNAVAILABLE)</a></li>
    <li><a class="dropdown-item text-warning kiln-outfit-update" href="#"><i class="fa-solid fa-upload"></i> Update</a></li>
  </ul>
</div>`;

			applyKilnDisclosureTitle(
				imageCard.querySelector<HTMLElement>(".kiln-outfit-dropdown")!,
				showDisclosures,
				"Kiln outfit actions",
			);

			imageCard
				.querySelector<HTMLElement>(".kiln-outfit-rename")!
				.addEventListener("click", (e) => {
					e.preventDefault();
				});

			imageCard
				.querySelector<HTMLElement>(".kiln-outfit-update")!
				.addEventListener("click", async (e) => {
					e.preventDefault();
					const result = await sendMessage("updateOutfit", {
						id: outfitId,
						name: outfitName,
					});
					if (result.ok) {
						window.location.reload();
					}
				});
		});

		sendMessage("registerBootstrapElements");
	}

	const tabObserver = new MutationObserver(() => {
		if (_outfitsTab.classList.contains("active")) {
			processOutfitCards();
		}
	});
	tabObserver.observe(_outfitsTab, {
		attributes: true,
		attributeFilter: ["class"],
	});

	const wardrobeAssets = document.getElementById("wardrobe-assets");
	if (wardrobeAssets?.parentElement) {
		const contentObserver = new MutationObserver(() => processOutfitCards());
		contentObserver.observe(wardrobeAssets, {
			childList: true,
			subtree: false,
		});
	}

	processOutfitCards();
}
