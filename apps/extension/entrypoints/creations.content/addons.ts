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

import type { Extension } from "@kiln/schemas";
import { endpoints } from "@/utils/endpoints";
import { sendMessage } from "@/utils/messaging";
import { createKilnDisclosureBadge, getConfig } from "@/utils/utilities";

type LibraryAddon = Extension.AddonLibraryApi["data"][number];
type AddonCapability = LibraryAddon["capabilities"][number];
type MyAddon = Extension.MyAddonsApi["data"]["items"][number];

const ADDON_CATEGORY = "addon";
const MAX_PACKAGE_BYTES = 5 * 1024 * 1024;
const SEARCH_DEBOUNCE_MS = 250;
const NO_SESSION_MESSAGE =
	"Link your Kiln account in Settings → Kiln → Sync to do this.";
const DEFAULT_DISCLAIMER =
	"Addons are third-party code made by community members. Kiln scans and reviews each version, but can't guarantee an addon is safe. You are responsible for what you install.";

const CAPABILITY_ICONS: Record<string, string> = {
	http: "fa-globe",
	io_read: "fa-folder-open",
	io_write: "fa-file-pen",
	insert: "fa-cube",
	datastore: "fa-database",
	history: "fa-pen-ruler",
	selection: "fa-arrow-pointer",
	creator_ui: "fa-toolbox",
};

const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
	{ value: "malicious", label: "Malicious or unsafe" },
	{ value: "stolen", label: "Stolen or re-uploaded" },
	{ value: "broken", label: "Broken or misleading" },
	{ value: "inappropriate", label: "Inappropriate content" },
	{ value: "other", label: "Something else" },
];

type ReportCategory =
	| "malicious"
	| "stolen"
	| "broken"
	| "inappropriate"
	| "other";

type Attributes = Record<string, string | boolean | undefined>;

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attributes: Attributes = {},
	...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(attributes)) {
		if (value === undefined || value === false) continue;
		node.setAttribute(key, value === true ? "" : value);
	}
	for (const child of children) if (child != null) node.append(child);
	return node;
}

function icon(classes: string): HTMLElement {
	return el("i", { class: classes });
}

function capabilityClass(capability: AddonCapability): string {
	if (capability.risk === "high") return "text-warning";
	return "text-muted";
}

function capabilityIcon(capability: AddonCapability): HTMLElement {
	return icon(
		`fas ${CAPABILITY_ICONS[capability.id] ?? "fa-puzzle-piece"} fa-fw`,
	);
}

function capabilityBadges(capabilities: AddonCapability[]): HTMLElement {
	const row = el("div", {
		class: "d-flex flex-wrap gap-1 mt-1",
		style: "font-size: 0.75rem;",
	});
	for (const capability of capabilities) {
		const badge = el(
			"span",
			{
				class: capabilityClass(capability),
				title: capability.label,
				"aria-label": capability.label,
			},
			capabilityIcon(capability),
		);
		row.append(badge);
	}
	return row;
}

function authorName(addon: LibraryAddon): string {
	return addon.username ?? `User ${addon.userId}`;
}

function formatDate(value: string | null): string {
	if (!value) return "Unknown";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}

function injectLibraryStyles() {
	if (document.getElementById("kiln-addon-library-css")) return;
	const style = el("style", { id: "kiln-addon-library-css" });
	style.textContent = `
		#assets[data-kiln-addon-library] > :not([data-kiln-addon]) {
			display: none !important;
		}
		.kiln-addon-tile {
			width: 100%;
			aspect-ratio: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 3rem;
			opacity: 0.6;
		}
		.kiln-addon-modal {
			position: fixed;
			inset: 0;
			z-index: 1060;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 16px;
			background: rgba(0, 0, 0, 0.65);
		}
		.kiln-addon-modal > .card {
			width: 100%;
			max-width: 560px;
			max-height: 100%;
			overflow-y: auto;
		}
	`;
	document.head.append(style);
}

function openAddonModal(
	addon: LibraryAddon,
	disclaimer: string,
	userId: number,
) {
	const reportStatus = el("div", { class: "small mt-2" });
	const reportCategory = el(
		"select",
		{ class: "form-select form-select-sm mb-2", "aria-label": "Report reason" },
		...REPORT_CATEGORIES.map(({ value, label }) =>
			el("option", { value }, label),
		),
	);
	const reportDetails = el("textarea", {
		class: "form-control form-control-sm mb-2",
		rows: "3",
		maxlength: "500",
		placeholder: "Tell us what's wrong (optional)",
		"aria-label": "Report details",
	});
	const reportSubmit = el(
		"button",
		{ type: "submit", class: "btn btn-danger btn-sm" },
		"Send report",
	);
	const reportForm = el(
		"form",
		{ class: "mt-3 d-none" },
		reportCategory,
		reportDetails,
		reportSubmit,
		reportStatus,
	);
	reportForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		reportSubmit.disabled = true;
		reportStatus.className = "small mt-2 text-muted";
		reportStatus.textContent = "Sending…";
		const result = await sendMessage("reportAddon", {
			userId,
			id: addon.id,
			category: reportCategory.value as ReportCategory,
			details: reportDetails.value.trim() || undefined,
		});
		if (result.ok) {
			reportStatus.className = "small mt-2 text-success";
			reportStatus.textContent = "Thanks. Your report was sent for review.";
			return;
		}
		reportSubmit.disabled = false;
		reportStatus.className = "small mt-2 text-danger";
		reportStatus.textContent =
			result.code === "NO_SESSION" ? NO_SESSION_MESSAGE : result.message;
	});

	const reportToggle = el(
		"button",
		{ type: "button", class: "btn btn-outline-danger btn-sm" },
		icon("fas fa-flag me-1"),
		"Report",
	);
	reportToggle.addEventListener("click", () =>
		reportForm.classList.toggle("d-none"),
	);

	const accept = el("input", {
		type: "checkbox",
		class: "form-check-input",
		id: "kiln-addon-accept",
	});
	const download = el(
		"a",
		{
			class: "btn btn-primary btn-sm disabled",
			"aria-disabled": "true",
			href: `${endpoints.extension}addons/${encodeURIComponent(addon.id)}/download`,
			rel: "noopener",
		},
		icon("fas fa-download me-1"),
		"Download .ptaddon",
	);
	accept.addEventListener("change", () => {
		download.classList.toggle("disabled", !accept.checked);
		download.setAttribute("aria-disabled", String(!accept.checked));
	});
	download.addEventListener("click", (event) => {
		if (!accept.checked) event.preventDefault();
	});

	const capabilityList = el(
		"ul",
		{ class: "list-unstyled mb-3" },
		...addon.capabilities.map((capability) =>
			el(
				"li",
				{ class: "mb-2 d-flex gap-2" },
				el(
					"span",
					{ class: capabilityClass(capability) },
					capabilityIcon(capability),
				),
				el(
					"div",
					{},
					el("div", { class: "fw-semibold" }, capability.label),
					el("small", { class: "text-muted" }, capability.description),
				),
			),
		),
	);

	const closeButton = el("button", {
		type: "button",
		class: "btn-close btn-close-white",
		"aria-label": "Close",
	});

	const descriptionBlock = el(
		"p",
		{ class: "mb-3", style: "white-space: pre-wrap;" },
		addon.description,
	);

	const card = el(
		"div",
		{ class: "card mcard p-4" },
		el(
			"div",
			{ class: "d-flex justify-content-between align-items-start gap-3 mb-1" },
			el("h4", { class: "mb-0 text-break" }, addon.name),
			closeButton,
		),
		el(
			"small",
			{ class: "text-muted d-block mb-3" },
			"by ",
			el(
				"a",
				{ href: `/users/${addon.userId}`, class: "text-reset" },
				authorName(addon),
			),
			` · v${addon.version} · ${addon.downloads} download${addon.downloads === 1 ? "" : "s"} · Reviewed ${formatDate(addon.reviewedAt)}`,
		),
		descriptionBlock,
		addon.changelog
			? el(
					"p",
					{ class: "small text-muted mb-3", style: "white-space: pre-wrap;" },
					el("strong", {}, `What's new in v${addon.version}: `),
					addon.changelog,
				)
			: null,
		el("h6", {}, "What this addon can do"),
		addon.capabilities.length > 0
			? capabilityList
			: el(
					"p",
					{ class: "small text-muted mb-3" },
					"The scan didn't find any sensitive API use.",
				),
		addon.domains.length > 0
			? el(
					"div",
					{ class: "mb-3" },
					el("h6", {}, "Websites mentioned in its code"),
					el(
						"small",
						{ class: "text-muted text-break" },
						addon.domains.join(", "),
					),
				)
			: null,
		el(
			"div",
			{ class: "small text-muted mb-3 text-break" },
			`Addon ID: ${addon.identifier}`,
			el("br"),
			`SHA-256: ${addon.sha256}`,
		),
		el(
			"div",
			{ class: "alert alert-warning small mb-3", role: "alert" },
			icon("fas fa-triangle-exclamation me-1"),
			disclaimer,
		),
		el(
			"div",
			{ class: "form-check mb-3" },
			accept,
			el(
				"label",
				{ class: "form-check-label small", for: "kiln-addon-accept" },
				"I understand, and I'm responsible for what I install.",
			),
		),
		el("div", { class: "d-flex gap-2 flex-wrap" }, download, reportToggle),
		reportForm,
	);

	const overlay = el(
		"div",
		{
			class: "kiln-addon-modal",
			role: "dialog",
			"aria-modal": "true",
			"aria-label": addon.name,
		},
		card,
	);

	const close = () => {
		overlay.remove();
		document.removeEventListener("keydown", onKeydown);
	};
	const onKeydown = (event: KeyboardEvent) => {
		if (event.key === "Escape") close();
	};
	closeButton.addEventListener("click", close);
	overlay.addEventListener("click", (event) => {
		if (event.target === overlay) close();
	});
	document.addEventListener("keydown", onKeydown);

	document.body.append(overlay);
	closeButton.focus();
}

export function addonLibrary(userId: number, showDisclosures: boolean) {
	let active = false;
	let page = 1;
	let totalPages = 1;
	let requestToken = 0;
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let lastCards: HTMLElement[] = [];
	let disclaimer = DEFAULT_DISCLAIMER;
	let banner: HTMLElement | null = null;

	const getGrid = () => document.getElementById("assets");
	const getPagination = () => document.getElementById("pagination");
	const getAddonTab = () =>
		document.querySelector<HTMLElement>(
			`#categories [data-category="${ADDON_CATEGORY}"]`,
		);
	const isAddonTabActive = () => !!getAddonTab()?.classList.contains("active");
	const getSearch = () =>
		document.querySelector<HTMLInputElement>("#search-input")?.value.trim() ??
		"";

	const buildCard = (addon: LibraryAddon): HTMLElement => {
		const link = el(
			"a",
			{ class: "text-reset", href: `#kiln-addon-${addon.id}` },
			el(
				"div",
				{ class: "card mb-2" },
				el(
					"div",
					{ class: "p-2", style: "width: 128px; max-width: 100%;" },
					el("div", { class: "kiln-addon-tile" }, icon("fas fa-puzzle-piece")),
				),
			),
			el("h6", { class: "text-truncate mb-0" }, addon.name),
		);
		link.addEventListener("click", (event) => {
			event.preventDefault();
			openAddonModal(addon, disclaimer, userId);
		});

		return el(
			"div",
			{ class: "col-auto mb-3 itemCardCont", "data-kiln-addon": "card" },
			el(
				"div",
				{ style: "width: 150px; max-width: 150px;" },
				link,
				el(
					"small",
					{ class: "text-muted d-block text-truncate" },
					"by ",
					el(
						"a",
						{ href: `/users/${addon.userId}`, class: "text-reset" },
						authorName(addon),
					),
				),
				capabilityBadges(addon.capabilities),
			),
		);
	};

	const buildMessage = (message: string, withLink = false): HTMLElement =>
		el(
			"div",
			{ class: "col-12", "data-kiln-addon": "message" },
			el(
				"div",
				{ class: "card mcard p-5 text-center text-muted" },
				el("h6", { class: "mb-0" }, message),
				withLink
					? el(
							"a",
							{ href: "/create/addon", class: "small mt-2" },
							"Publish your addon",
						)
					: null,
			),
		);

	const setDisabled = (id: string, disabled: boolean) => {
		document.getElementById(id)?.classList.toggle("disabled", disabled);
	};

	const syncPagination = () => {
		const pagination = getPagination();
		if (!pagination) return;
		const hidden = totalPages <= 1;
		if (pagination.classList.contains("d-none") !== hidden)
			pagination.classList.toggle("d-none", hidden);

		const current = document.getElementById("pagination-current");
		if (current && current.textContent !== String(page))
			current.textContent = String(page);
		setDisabled("pagination-first", page <= 1);
		setDisabled("pagination-prev", page <= 1);
		setDisabled("pagination-next", page >= totalPages);
		setDisabled("pagination-last", page >= totalPages);
	};

	const showCards = () => {
		getGrid()?.replaceChildren(...lastCards);
		syncPagination();
	};

	const load = async (target: number) => {
		const token = ++requestToken;
		const result = await sendMessage("getLibraryAddons", {
			page: target,
			search: getSearch(),
		});
		if (token !== requestToken || !active) return;

		if (!result.ok) {
			page = 1;
			totalPages = 1;
			lastCards = [
				buildMessage(
					"The Kiln addon library couldn't be loaded. Try again later.",
				),
			];
			showCards();
			return;
		}

		const { data, meta } = result.data;
		page = meta.currentPage;
		totalPages = meta.totalPages;
		disclaimer = meta.disclaimer;
		lastCards =
			data.length > 0
				? data.map(buildCard)
				: [
						buildMessage(
							getSearch()
								? "No addons matched your search."
								: "No addons have been published to the Kiln library yet.",
							!getSearch(),
						),
					];
		showCards();
	};

	const buildBanner = (): HTMLElement => {
		const notice = el(
			"div",
			{ class: "alert alert-info small mb-3", role: "note" },
			icon("fas fa-puzzle-piece me-1"),
			"You're browsing Kiln's community library of 2.0 creator addons. Polytoria doesn't have an official one, so these aren't made or reviewed by Polytoria.",
		);
		if (showDisclosures) notice.append(" ", createKilnDisclosureBadge());
		return notice;
	};

	const activate = () => {
		const grid = getGrid();
		if (active || !grid) return;
		active = true;
		page = 1;
		totalPages = 1;
		grid.dataset.kilnAddonLibrary = "true";
		banner = buildBanner();
		grid.before(banner);
		lastCards = [buildMessage("Loading addons…")];
		showCards();
		load(1);
	};

	const deactivate = () => {
		if (!active) return;
		active = false;
		requestToken++;
		const grid = getGrid();
		if (grid) {
			delete grid.dataset.kilnAddonLibrary;
			for (const child of grid.querySelectorAll("[data-kiln-addon]"))
				child.remove();
		}
		banner?.remove();
		banner = null;
	};

	const sync = () => (isAddonTabActive() ? activate() : deactivate());

	const pageForButton = (id: string): number | null => {
		if (id === "pagination-first") return 1;
		if (id === "pagination-prev") return Math.max(1, page - 1);
		if (id === "pagination-next") return Math.min(totalPages, page + 1);
		if (id === "pagination-last") return totalPages;
		return null;
	};

	const interceptPagination = () => {
		document.addEventListener(
			"click",
			(event) => {
				const target = event.target as HTMLElement;
				if (target.closest?.(`[data-category="${ADDON_CATEGORY}"]`)) {
					const grid = getGrid();
					if (grid) grid.dataset.kilnAddonLibrary = "true";
					return;
				}
				if (!active) return;

				const item = target.closest?.<HTMLElement>("#pagination .page-item");
				if (!item) return;
				const next = pageForButton(item.id);
				if (next === null) return;

				event.preventDefault();
				event.stopImmediatePropagation();
				if (!item.classList.contains("disabled")) load(next);
			},
			true,
		);

		document.addEventListener(
			"keydown",
			(event) => {
				if (!active || event.key !== "Enter") return;
				const input = event.target as HTMLInputElement;
				if (!input.classList?.contains("kiln-page-jump-input")) return;

				event.preventDefault();
				event.stopImmediatePropagation();
				const target = Number.parseInt(input.value, 10);
				if (Number.isFinite(target) && target >= 1)
					load(Math.min(target, totalPages));
				input.blur();
			},
			true,
		);
	};

	const attach = () => {
		const categories = document.getElementById("categories");
		const grid = getGrid();
		if (!categories || !grid) return;

		injectLibraryStyles();
		interceptPagination();

		new MutationObserver(sync).observe(categories, {
			attributes: true,
			attributeFilter: ["class"],
			subtree: true,
		});

		new MutationObserver(() => {
			if (!active) return;
			const overwritten = [...grid.children].some(
				(child) => !(child as HTMLElement).dataset.kilnAddon,
			);
			if (overwritten || grid.children.length === 0) showCards();
		}).observe(grid, { childList: true });

		const pagination = getPagination();
		if (pagination)
			new MutationObserver(() => {
				if (active) syncPagination();
			}).observe(pagination, {
				attributes: true,
				attributeFilter: ["class"],
			});

		document.getElementById("search-input")?.addEventListener("input", () => {
			if (!active) return;
			if (searchTimer) clearTimeout(searchTimer);
			searchTimer = setTimeout(() => load(1), SEARCH_DEBOUNCE_MS);
		});

		sync();
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", attach);
	} else {
		attach();
	}
}

function readAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error);
		reader.onload = () => {
			const url = String(reader.result ?? "");
			resolve(url.slice(url.indexOf(",") + 1));
		};
		reader.readAsDataURL(file);
	});
}

function statusBadge(addon: MyAddon): HTMLElement {
	const badge = (classes: string, text: string) =>
		el("span", { class: `badge ${classes}` }, text);

	if (addon.status === "removed") return badge("bg-danger", "Removed");
	if (addon.latestStatus === "pending")
		return badge("bg-warning text-dark", "Pending review");
	if (addon.latestStatus === "declined") return badge("bg-danger", "Declined");
	return addon.listed
		? badge("bg-success", "Live")
		: badge("bg-secondary", "Not listed");
}

export async function addonPublisher(userId: number, showDisclosures: boolean) {
	const heading = [...document.querySelectorAll(".col-lg-10 h4")].find(
		(node) => node.textContent?.trim() === "Your Addons",
	);
	const headingRow = heading?.closest(".row");
	if (!headingRow) return;

	const emptyState = document.querySelector(
		".col-lg-10 .card.mcard .fa-question-circle",
	);
	if (emptyState) {
		headingRow.classList.add("d-none");
		emptyState.closest(".card")?.classList.add("d-none");
	}

	const config = await getConfig().catch(() => null);
	const fallbackLimit = config?.limits.maxPublishedAddons ?? 5;

	const status = el("div", { class: "small mt-2", role: "status" });
	const setStatus = (message: string, tone: "muted" | "success" | "danger") => {
		status.className = `small mt-2 text-${tone}`;
		status.textContent = message;
	};

	const fileInput = el("input", {
		type: "file",
		class: "form-control",
		id: "kiln-addon-file",
		accept: ".ptaddon",
		required: true,
	});
	const nameInput = el("input", {
		type: "text",
		class: "form-control",
		id: "kiln-addon-name",
		maxlength: "64",
		required: true,
	});
	const descriptionInput = el("textarea", {
		class: "form-control",
		id: "kiln-addon-description",
		rows: "4",
		maxlength: "2000",
		required: true,
		placeholder: "What does your addon do, and why does it need its access?",
	});
	const changelogInput = el("input", {
		type: "text",
		class: "form-control",
		id: "kiln-addon-changelog",
		maxlength: "1000",
		placeholder: "Only needed for updates",
	});
	const ownership = el("input", {
		type: "checkbox",
		class: "form-check-input",
		id: "kiln-addon-ownership",
		required: true,
	});
	const submit = el(
		"button",
		{ type: "submit", class: "btn btn-primary" },
		icon("fas fa-upload me-1"),
		"Submit for Review",
	);
	const usage = el("div", { class: "small text-muted mb-3" });
	const ineligible = el("div", {
		class: "alert alert-warning small d-none",
		role: "alert",
	});

	const field = (id: string, label: string, control: HTMLElement) =>
		el(
			"div",
			{ class: "mb-3" },
			el("label", { class: "form-label", for: id }, label),
			control,
		);

	const form = el(
		"form",
		{},
		ineligible,
		usage,
		field("kiln-addon-file", "Addon file (.ptaddon, up to 5 MB)", fileInput),
		field("kiln-addon-name", "Name", nameInput),
		field("kiln-addon-description", "Description", descriptionInput),
		field("kiln-addon-changelog", "What's new (optional)", changelogInput),
		el(
			"div",
			{ class: "form-check mb-3" },
			ownership,
			el(
				"label",
				{ class: "form-check-label small", for: "kiln-addon-ownership" },
				"I made this addon or have permission to publish it. It does nothing harmful or hidden.",
			),
		),
		submit,
		status,
	);

	const title = el(
		"h5",
		{ class: "mb-2" },
		icon("fas fa-puzzle-piece me-1"),
		"Publish to the Kiln Addon Library",
	);
	if (showDisclosures) title.append(" ", createKilnDisclosureBadge());

	const listBody = el("div", {});
	const panel = el(
		"div",
		{ id: "kiln-addon-publisher" },
		el(
			"div",
			{ class: "card mcard p-4 mb-4" },
			title,
			el(
				"p",
				{ class: "small text-muted mb-1" },
				"This form uploads to Kiln's community library for Polytoria 2.0 creator addons. Polytoria doesn't have an official addon library, so this isn't an official Polytoria upload, and your addon only appears to people using Kiln and Kiln's addon listings.",
			),
			el(
				"p",
				{ class: "small text-muted mb-3" },
				"Every version is scanned automatically, then reviewed by hand before it goes live, and its detected access (such as web requests or project files) is shown publicly. To update an addon, upload a new version that registers the same addon ID.",
			),
			form,
		),
		el(
			"h4",
			{ class: "mx-4 m-lg-0 pb-lg-2 text-center text-lg-start" },
			"Your Kiln Addons",
		),
		listBody,
	);
	headingRow.before(panel);

	const setFormEnabled = (enabled: boolean) => {
		for (const control of form.querySelectorAll<
			HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
		>("input, textarea, button"))
			control.disabled = !enabled;
	};

	const renderRow = (addon: MyAddon): HTMLElement => {
		const remove = el(
			"button",
			{ type: "button", class: "btn btn-outline-danger btn-sm" },
			"Delete",
		);
		remove.addEventListener("click", async () => {
			if (
				!confirm(
					`Remove "${addon.name}" from the Kiln addon library? Its files will be deleted.`,
				)
			)
				return;
			remove.disabled = true;
			const result = await sendMessage("deleteMyAddon", {
				userId,
				id: addon.id,
			});
			if (result.ok) return refresh();
			remove.disabled = false;
			setStatus(result.message, "danger");
		});

		const reason =
			addon.status === "removed" ? addon.removalReason : addon.declineReason;
		const live =
			addon.liveVersion && addon.latestVersion !== addon.liveVersion
				? `v${addon.latestVersion} · v${addon.liveVersion} is still live`
				: `v${addon.latestVersion ?? addon.liveVersion ?? "?"}`;

		return el(
			"div",
			{ class: "card mcard p-3 mb-2" },
			el(
				"div",
				{ class: "d-flex justify-content-between align-items-start gap-3" },
				el(
					"div",
					{ style: "min-width: 0;" },
					el(
						"div",
						{ class: "d-flex align-items-center gap-2 flex-wrap" },
						el("strong", { class: "text-break" }, addon.name),
						statusBadge(addon),
					),
					el(
						"small",
						{ class: "text-muted d-block text-break" },
						`${addon.identifier} · ${live} · ${addon.downloads} download${addon.downloads === 1 ? "" : "s"}`,
					),
					reason
						? el(
								"small",
								{ class: "text-danger d-block text-break" },
								`Reason: ${reason}`,
							)
						: null,
					capabilityBadges(addon.capabilities),
				),
				addon.status === "active" ? remove : null,
			),
		);
	};

	const refresh = async () => {
		const result = await sendMessage("getMyAddons", userId);
		if (!result.ok) {
			setFormEnabled(false);
			usage.textContent = `You can publish up to ${fallbackLimit} addons.`;
			ineligible.classList.remove("d-none");
			ineligible.textContent =
				result.code === "NO_SESSION" ? NO_SESSION_MESSAGE : result.message;
			listBody.replaceChildren();
			return;
		}

		const { items, used, limit, canPublish } = result.data.data;
		usage.textContent = `You're using ${used} of ${limit} addon slots. Updates to an existing addon don't use a new slot.`;
		setFormEnabled(canPublish);
		ineligible.classList.toggle("d-none", canPublish);
		ineligible.textContent = canPublish
			? ""
			: "Your account isn't eligible to publish addons right now. Keeping your account in good standing over time can change this.";
		listBody.replaceChildren(
			...(items.length > 0
				? items.map(renderRow)
				: [
						el(
							"div",
							{ class: "card mcard p-5 text-center text-muted" },
							el(
								"h6",
								{ class: "mb-0" },
								"You haven't published any addons to the Kiln library yet.",
							),
						),
					]),
		);
	};

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		const file = fileInput.files?.[0];
		if (!file) return;

		if (!file.name.toLowerCase().endsWith(".ptaddon"))
			return setStatus("Choose a .ptaddon file.", "danger");
		if (file.size > MAX_PACKAGE_BYTES)
			return setStatus("Addons can be at most 5 MB.", "danger");

		submit.disabled = true;
		setStatus("Uploading and scanning…", "muted");
		try {
			const result = await sendMessage("publishAddon", {
				userId,
				name: nameInput.value.trim(),
				description: descriptionInput.value.trim(),
				changelog: changelogInput.value.trim() || undefined,
				content: await readAsBase64(file),
			});
			if (!result.ok) {
				setStatus(
					result.code === "NO_SESSION" ? NO_SESSION_MESSAGE : result.message,
					"danger",
				);
				return;
			}

			const { version, capabilities } = result.data.data;
			const detected = capabilities.map((c) => c.label).join(", ");
			setStatus(
				`Version ${version} passed the scan and is waiting for review.${detected ? ` Detected: ${detected}.` : ""}`,
				"success",
			);
			form.reset();
			await refresh();
		} catch (err) {
			setStatus(err instanceof Error ? err.message : String(err), "danger");
		} finally {
			submit.disabled = false;
		}
	});

	await refresh();
}
