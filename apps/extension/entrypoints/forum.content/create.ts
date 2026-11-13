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
import { sendMessage } from "@/utils/messaging";
import {
	_forumDrafts,
	_forumImages,
	type ForumDraft,
	removeForumImage,
	type SavedForumImage,
} from "@/utils/storage";
import {
	applyKilnDisclosureTitle,
	createKilnDisclosureBadge,
	createModal,
	formatNotificationRelativeTime,
	getProfanityFilter,
	kilnDisclosureBadgeHtml,
	onBrokenImage,
} from "@/utils/utilities";

const DEFAULT_MAX_CHARS = 5000;
const DRAFT_AUTOSAVE_DELAY = 1500;

function getComposerTextarea(): HTMLTextAreaElement | null {
	return document.querySelector<HTMLTextAreaElement>(
		'textarea[name="content"]',
	);
}

interface ComposerToolbar {
	start: HTMLElement;
	end: HTMLElement;
}

interface ComposerEditor {
	wrapper: HTMLElement;
	container: HTMLElement;
}

const composerToolbars = new WeakMap<HTMLTextAreaElement, ComposerToolbar>();
const composerEditors = new WeakMap<HTMLTextAreaElement, ComposerEditor>();

function getComposerToolbar(
	textarea: HTMLTextAreaElement,
	showDisclosures: boolean,
): ComposerToolbar {
	const existing = composerToolbars.get(textarea);
	if (existing) return existing;

	const root = document.createElement("div");
	root.className = "d-flex align-items-center gap-1 mb-1 flex-wrap";

	const start = document.createElement("div");
	start.className = "d-flex align-items-center gap-1 flex-wrap";

	const end = document.createElement("div");
	end.className = "ms-auto d-flex align-items-center gap-1";

	if (showDisclosures) end.appendChild(createKilnDisclosureBadge());

	root.append(start, end);

	const anchor = composerEditors.get(textarea)?.wrapper ?? textarea;
	anchor.parentElement?.insertBefore(root, anchor);

	const toolbar = { start, end };
	composerToolbars.set(textarea, toolbar);
	return toolbar;
}

interface ComposerActions {
	host: HTMLElement;
	buttonClass: string;
}

function getComposerActions(
	textarea: HTMLTextAreaElement,
	showDisclosures: boolean,
): ComposerActions {
	const nativeBar = textarea
		.closest("form")
		?.querySelector<HTMLElement>(".markdown-toolbar");
	if (!nativeBar) {
		return {
			host: getComposerToolbar(textarea, showDisclosures).end,
			buttonClass: "btn btn-sm btn-secondary",
		};
	}

	let host = nativeBar.querySelector<HTMLElement>(
		":scope > .kiln-composer-actions",
	);
	if (!host) {
		host = document.createElement("div");
		host.className = "kiln-composer-actions d-flex align-items-center ms-auto";
		nativeBar.appendChild(host);
	}
	return { host, buttonClass: "markdown-toolbar-btn" };
}

function getComposerEditor(textarea: HTMLTextAreaElement): ComposerEditor {
	const existing = composerEditors.get(textarea);
	if (existing) return existing;

	const wrapper = document.createElement("div");
	wrapper.className = "d-flex gap-2";
	wrapper.style.minHeight =
		textarea.style.height || `${textarea.offsetHeight}px`;

	const container = document.createElement("div");
	container.style.cssText = "position: relative; width: 100%;";

	textarea.parentElement?.insertBefore(wrapper, textarea);
	container.appendChild(textarea);
	wrapper.appendChild(container);

	const editor = { wrapper, container };
	composerEditors.set(textarea, editor);
	return editor;
}

export function forumMarkdownButtons(showDisclosures: boolean) {
	const textarea = getComposerTextarea();
	if (!textarea) return;

	const buttons = [
		{
			icon: "fa-bold",
			title: "Bold",
			prefix: "__",
			suffix: "__",
			placeholder: "bold text",
		},
		{
			icon: "fa-italic",
			title: "Italic",
			prefix: "_",
			suffix: "_",
			placeholder: "italic text",
		},
		{
			icon: "fa-strikethrough",
			title: "Strikethrough",
			prefix: "~~",
			suffix: "~~",
			placeholder: "strikethrough",
		},
		{
			icon: "fa-code",
			title: "Inline Code",
			prefix: "`",
			suffix: "`",
			placeholder: "code",
		},
		{
			icon: "fa-file-code",
			title: "Code Block",
			prefix: "```\n",
			suffix: "\n```",
			placeholder: "code",
		},
	];

	const { start } = getComposerToolbar(textarea, showDisclosures);
	for (const btn of buttons) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "btn btn-sm btn-outline-secondary";
		button.innerHTML = `<i class="fas ${btn.icon}"></i>`;
		button.title = btn.title;
		button.addEventListener("click", () => {
			wrapSelection(textarea, btn.prefix, btn.suffix, btn.placeholder);
			textarea.focus();
		});
		start.appendChild(button);
	}
}

export function forumCharacterCount() {
	const textarea = getComposerTextarea();
	if (!textarea) return;

	const MAX_CHARS =
		textarea.maxLength > 0 ? textarea.maxLength : DEFAULT_MAX_CHARS;

	const counter = document.createElement("span");
	counter.className = "text-muted small";
	counter.style.cssText =
		"position: absolute; left: 0.5rem; bottom: 0.25rem; z-index: 2; pointer-events: none; padding: 0 0.35rem; border-radius: 0.25rem; background-color: rgba(0, 0, 0, 0.45); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);";

	const updateCounter = () => {
		const len = textarea.value.length;
		counter.textContent = `${len}/${MAX_CHARS}`;
		if (len > MAX_CHARS) {
			counter.classList.replace("text-muted", "text-danger");
		} else {
			counter.classList.replace("text-danger", "text-muted");
		}
	};

	textarea.addEventListener("input", updateCounter);
	updateCounter();
	getComposerEditor(textarea).container.appendChild(counter);
}

const mentionSelectorTextareas = new WeakSet<HTMLTextAreaElement>();

export function forumMentionSelector() {
	const textarea = getComposerTextarea();
	if (!textarea || mentionSelectorTextareas.has(textarea)) return;
	mentionSelectorTextareas.add(textarea);

	const { container } = getComposerEditor(textarea);

	const dropdown = document.createElement("div");
	dropdown.className =
		"kiln-mention-dropdown list-group position-absolute shadow-sm d-none";
	dropdown.style.cssText =
		"z-index: 1000; max-height: 220px; overflow-y: auto;";
	container.appendChild(dropdown);

	const caretMirror = document.createElement("div");
	caretMirror.setAttribute("aria-hidden", "true");
	caretMirror.style.cssText =
		"position: fixed; top: 0; left: 0; visibility: hidden; pointer-events: none;";
	document.body.appendChild(caretMirror);

	const caretStyleProps = [
		"boxSizing",
		"paddingTop",
		"paddingRight",
		"paddingBottom",
		"paddingLeft",
		"borderTopWidth",
		"borderRightWidth",
		"borderBottomWidth",
		"borderLeftWidth",
		"borderStyle",
		"fontFamily",
		"fontSize",
		"fontWeight",
		"fontStyle",
		"fontVariant",
		"letterSpacing",
		"wordSpacing",
		"lineHeight",
		"textAlign",
		"textIndent",
		"textTransform",
		"whiteSpace",
		"overflowWrap",
		"wordBreak",
		"tabSize",
		"direction",
	] as const;

	let users: Extension.ActivitySearchApi["data"] = [];
	let activeIndex = -1;
	let requestId = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	const cancelPendingSearch = () => {
		clearTimeout(debounceTimer);
		requestId++;
	};

	const hideSuggestions = () => {
		cancelPendingSearch();
		dropdown.classList.add("d-none");
		dropdown.innerHTML = "";
		users = [];
		activeIndex = -1;
	};

	const findMentionToken = (): { start: number; query: string } | null => {
		if (textarea.selectionStart !== textarea.selectionEnd) return null;

		const cursor = textarea.selectionStart;
		const before = textarea.value.slice(0, cursor);
		const atIndex = before.lastIndexOf("@");
		if (atIndex === -1) return null;

		const preceding = before[atIndex - 1];
		if (preceding && /[\w@]/.test(preceding)) return null;

		const query = before.slice(atIndex + 1);
		if (!/^[\w.]*$/.test(query) || !/\w/.test(query)) return null;

		const beforeMention = before.slice(0, atIndex);
		if ((beforeMention.match(/```/g)?.length ?? 0) % 2 === 1) return null;

		return { start: atIndex, query };
	};

	const getCaretPosition = () => {
		if (textarea.selectionStart !== textarea.selectionEnd) return null;

		const cursor = textarea.selectionStart;
		const style = window.getComputedStyle(textarea);
		for (const prop of caretStyleProps) {
			caretMirror.style[prop] = style[prop];
		}
		caretMirror.style.boxSizing = "border-box";
		caretMirror.style.width = `${
			textarea.clientWidth +
			(Number.parseFloat(style.borderLeftWidth) || 0) +
			(Number.parseFloat(style.borderRightWidth) || 0)
		}px`;
		caretMirror.style.height = "auto";
		caretMirror.style.overflow = "hidden";
		caretMirror.textContent = textarea.value.slice(0, cursor);

		const marker = document.createElement("span");
		marker.textContent = "\u200b";
		caretMirror.appendChild(marker);

		const markerRect = marker.getBoundingClientRect();
		const textareaRect = textarea.getBoundingClientRect();
		const lineHeight =
			markerRect.height || Number.parseFloat(style.lineHeight) || 20;

		const position = {
			left: textareaRect.left + markerRect.left - textarea.scrollLeft,
			top: textareaRect.top + markerRect.top - textarea.scrollTop,
			lineHeight,
		};
		caretMirror.textContent = "";
		return position;
	};

	const positionDropdown = () => {
		if (dropdown.classList.contains("d-none")) return;

		const caret = getCaretPosition();
		if (!caret) return;

		const containerRect = container.getBoundingClientRect();
		const width = Math.min(280, container.clientWidth);
		const left = Math.max(
			0,
			Math.min(caret.left - containerRect.left, container.clientWidth - width),
		);
		let top = caret.top - containerRect.top + caret.lineHeight + 2;

		const dropdownHeight = Math.min(
			220,
			users.length > 0 ? users.length * 38 : 220,
		);
		if (
			caret.top + caret.lineHeight + dropdownHeight > window.innerHeight &&
			caret.top - dropdownHeight > 0
		) {
			top = caret.top - containerRect.top - dropdownHeight - 2;
		}

		dropdown.style.width = `${width}px`;
		dropdown.style.left = `${left}px`;
		dropdown.style.top = `${top}px`;
	};

	const setActive = (index: number) => {
		activeIndex = index;
		const items = dropdown.querySelectorAll<HTMLElement>(".list-group-item");
		items.forEach((item, itemIndex) => {
			item.classList.toggle("active", itemIndex === index);
		});
		items[index]?.scrollIntoView({ block: "nearest" });
	};

	const selectUser = (user: Extension.ActivitySearchApi["data"][number]) => {
		const token = findMentionToken();
		if (!token) {
			hideSuggestions();
			return;
		}

		const value = textarea.value;
		const after = value.slice(textarea.selectionStart);
		const needsSpace = !/^\s/.test(after);
		const insertion = `@${user.username}${needsSpace ? " " : ""}`;

		textarea.value = value.slice(0, token.start) + insertion + after;
		const cursor = token.start + insertion.length;
		textarea.setSelectionRange(cursor, cursor);

		hideSuggestions();
		textarea.dispatchEvent(new Event("input", { bubbles: true }));
		textarea.focus();
	};

	const renderSuggestions = () => {
		dropdown.innerHTML = "";

		for (const user of users) {
			const item = document.createElement("button");
			item.type = "button";
			item.className =
				"kiln-mention-item list-group-item list-group-item-action py-1 px-2 d-flex align-items-center gap-2";

			if (user.thumbnailUrl) {
				const image = document.createElement("img");
				image.src = user.thumbnailUrl;
				image.width = 24;
				image.height = 24;
				image.className = "rounded";
				image.addEventListener("error", () => image.remove());
				item.appendChild(image);
			}

			const label = document.createElement("span");
			label.textContent = user.username;
			item.appendChild(label);

			item.addEventListener("mousedown", (event) => {
				event.preventDefault();
				selectUser(user);
			});

			dropdown.appendChild(item);
		}

		dropdown.classList.remove("d-none");
		positionDropdown();
		setActive(0);
	};

	const searchUsers = async (query: string) => {
		const currentRequest = ++requestId;
		const result = await sendMessage("searchUsersByActivity", query);
		if (currentRequest !== requestId) return;

		const token = findMentionToken();
		if (!token || token.query !== query) return;

		if (!result.ok || result.data.length === 0) {
			hideSuggestions();
			return;
		}

		users = result.data.slice(0, 8);
		renderSuggestions();
	};

	const updateSuggestions = () => {
		cancelPendingSearch();
		const token = findMentionToken();
		if (!token) {
			hideSuggestions();
			return;
		}

		positionDropdown();
		debounceTimer = setTimeout(() => searchUsers(token.query), 250);
	};

	textarea.addEventListener("input", updateSuggestions);
	textarea.addEventListener("click", updateSuggestions);
	textarea.addEventListener("scroll", positionDropdown);
	window.addEventListener("resize", positionDropdown);
	textarea.addEventListener("keyup", (event) => {
		if (
			event.key === "ArrowLeft" ||
			event.key === "ArrowRight" ||
			event.key === "Home" ||
			event.key === "End"
		)
			updateSuggestions();
	});
	textarea.addEventListener("keydown", (event) => {
		const open = !dropdown.classList.contains("d-none") && users.length > 0;
		if (!open) return;

		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActive((activeIndex + 1) % users.length);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActive((activeIndex - 1 + users.length) % users.length);
		} else if (event.key === "Escape") {
			event.preventDefault();
			hideSuggestions();
		} else if (event.key === "Enter" || event.key === "Tab") {
			if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)
				return;
			event.preventDefault();
			const user = users[activeIndex];
			if (user) selectUser(user);
		}
	});
	textarea.addEventListener("blur", hideSuggestions);
}

export function forumPostPreview(autoShow: boolean, showDisclosures: boolean) {
	const textarea = getComposerTextarea();
	if (!textarea) return;

	const actions = getComposerActions(textarea, showDisclosures);
	const { wrapper, container } = getComposerEditor(textarea);

	const previewBtn = document.createElement("button");
	previewBtn.type = "button";
	previewBtn.className = actions.buttonClass;
	previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
	previewBtn.title = "Toggle Preview";
	actions.host.prepend(previewBtn);

	const preview = document.createElement("div");
	preview.className =
		"form-control bg-transparent border border-secondary d-none";
	preview.style.cssText =
		"overflow-y: auto; white-space: pre-wrap; word-break: break-word;";
	wrapper.appendChild(preview);

	const syncHeight = () => {
		preview.style.height = `${textarea.offsetHeight}px`;
	};

	let filters: RegExp[] = [];

	const updatePreview = () => {
		preview.innerHTML = renderMarkdown(
			censorFilteredWords(textarea.value, filters),
		);
		syncHeight();
	};

	textarea.addEventListener("input", updatePreview);

	let previewOpen = false;

	getProfanityFilter().then((loadedFilters) => {
		filters = loadedFilters;
		if (previewOpen) updatePreview();
	});

	const openPreview = () => {
		if (previewOpen) return;
		previewOpen = true;
		container.style.width = "50%";
		preview.classList.remove("d-none");
		preview.style.width = "50%";
		updatePreview();
	};

	const closePreview = () => {
		previewOpen = false;
		container.style.width = "100%";
		preview.classList.add("d-none");
	};

	let userToggledPreview = false;

	if (autoShow) {
		let autoOpened = false;
		textarea.addEventListener("input", () => {
			if (autoOpened || userToggledPreview) return;
			if (textarea.value.length > 0) {
				autoOpened = true;
				openPreview();
			}
		});
	}

	previewBtn.addEventListener("click", () => {
		userToggledPreview = true;
		if (previewOpen) closePreview();
		else openPreview();
	});
}

export function forumFilteredWordHighlight() {
	const textarea = getComposerTextarea();
	if (!textarea) return;

	initFilterHighlighting(textarea, getComposerEditor(textarea).container);
	initTitleFilterHighlighting(textarea);
}

export function forumImageLibrary() {
	const textarea = getComposerTextarea();
	if (!textarea) return;

	const imageLibraryBtn = document.createElement("button");
	imageLibraryBtn.type = "button";
	const actions = getComposerActions(textarea, false);
	imageLibraryBtn.className = actions.buttonClass;
	imageLibraryBtn.innerHTML = '<i class="fas fa-images"></i>';
	imageLibraryBtn.title = "Starred Images";
	imageLibraryBtn.addEventListener("click", () => {
		openImageLibrary(textarea);
	});
	actions.host.appendChild(imageLibraryBtn);
}

const IMAGES_PER_PAGE = 24;

let imageLibraryModal: HTMLDialogElement | undefined;
let imageLibraryImages: SavedForumImage[] = [];
let imageLibraryPage = 1;

function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
	const start = textarea.selectionStart;
	const end = textarea.selectionEnd;
	const val = textarea.value;

	textarea.value = val.slice(0, start) + text + val.slice(end);
	const pos = start + text.length;
	textarea.selectionStart = textarea.selectionEnd = pos;

	textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderImageEntry(
	image: SavedForumImage,
	textarea: HTMLTextAreaElement,
	onChanged: () => void,
): HTMLElement {
	const entry = document.createElement("div");
	entry.className = "col-6 col-md-4 col-lg-3";
	entry.innerHTML = `
		<div class="border border-secondary rounded p-1 position-relative" role="button" data-kiln="insert-image" style="cursor:pointer;">
			<img src="https://polytoria.com/markdown/image/${image.imageId}" alt="Saved image ${image.imageId}" class="w-100 rounded" style="aspect-ratio:1;object-fit:cover;" loading="lazy" />
			<button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 m-2" data-kiln="remove-image" aria-label="Remove saved image"><i class="fas fa-trash"></i></button>
		</div>
	`;

	onBrokenImage(entry.querySelector("img")!, () => {
		entry.style.display = "none";
	});

	entry
		.querySelector<HTMLElement>('[data-kiln="insert-image"]')!
		.addEventListener("click", (event) => {
			if ((event.target as HTMLElement).closest('[data-kiln="remove-image"]'))
				return;
			insertAtCursor(textarea, `[[image:${image.imageId}]]`);
			textarea.focus();
			imageLibraryModal?.close();
		});

	entry
		.querySelector<HTMLButtonElement>('[data-kiln="remove-image"]')!
		.addEventListener("click", async (event) => {
			event.stopPropagation();
			await removeForumImage(image.imageId);
			onChanged();
		});

	return entry;
}

function renderImageLibraryPage(textarea: HTMLTextAreaElement): void {
	const body =
		imageLibraryModal?.querySelector<HTMLElement>("#kiln-images-body");
	const prevBtn = imageLibraryModal?.querySelector<HTMLButtonElement>(
		'[data-kiln="images-prev"]',
	);
	const nextBtn = imageLibraryModal?.querySelector<HTMLButtonElement>(
		'[data-kiln="images-next"]',
	);
	const pageLabel = imageLibraryModal?.querySelector<HTMLElement>(
		'[data-kiln="images-page"]',
	);
	if (!body || !prevBtn || !nextBtn || !pageLabel) return;

	if (imageLibraryImages.length === 0) {
		body.innerHTML = `<div class="text-center text-muted py-3">No starred images yet. Hover an image in a forum post and click the star to save it here.</div>`;
		pageLabel.textContent = "";
		prevBtn.disabled = true;
		nextBtn.disabled = true;
		return;
	}

	const totalPages = Math.max(
		1,
		Math.ceil(imageLibraryImages.length / IMAGES_PER_PAGE),
	);
	imageLibraryPage = Math.min(Math.max(imageLibraryPage, 1), totalPages);

	const start = (imageLibraryPage - 1) * IMAGES_PER_PAGE;
	const pageImages = imageLibraryImages.slice(start, start + IMAGES_PER_PAGE);

	const onChanged = () => renderImageLibraryList(textarea);
	const grid = document.createElement("div");
	grid.className = "row g-2";
	for (const image of pageImages) {
		grid.appendChild(renderImageEntry(image, textarea, onChanged));
	}
	body.innerHTML = "";
	body.appendChild(grid);

	pageLabel.textContent = `Page ${imageLibraryPage} of ${totalPages}`;
	prevBtn.disabled = imageLibraryPage <= 1;
	nextBtn.disabled = imageLibraryPage >= totalPages;
}

async function renderImageLibraryList(
	textarea: HTMLTextAreaElement,
): Promise<void> {
	imageLibraryImages = Object.values(await _forumImages.getValue()).sort(
		(a, b) => b.starredAt.localeCompare(a.starredAt),
	);
	imageLibraryPage = 1;
	renderImageLibraryPage(textarea);
}

function openImageLibrary(textarea: HTMLTextAreaElement) {
	if (!imageLibraryModal) {
		imageLibraryModal = createModal("lg");
		imageLibraryModal.innerHTML = `
			<div class="d-flex justify-content-between align-items-center mb-3">
				<h5 class="mb-0 text-white">
					<i class="fas fa-images me-2"></i>Starred Images
				</h5>
				<button type="button" class="btn btn-sm btn-secondary" data-kiln="close-images">✕</button>
			</div>
			<div id="kiln-images-body"></div>
			<div class="d-flex justify-content-between align-items-center mt-3">
				<button type="button" class="btn btn-sm btn-outline-secondary" data-kiln="images-prev" disabled>‹ Prev</button>
				<span data-kiln="images-page" class="small text-muted"></span>
				<button type="button" class="btn btn-sm btn-outline-secondary" data-kiln="images-next" disabled>Next ›</button>
			</div>
		`;
		imageLibraryModal
			.querySelector<HTMLButtonElement>('[data-kiln="close-images"]')!
			.addEventListener("click", () => imageLibraryModal?.close());
		imageLibraryModal
			.querySelector<HTMLButtonElement>('[data-kiln="images-prev"]')!
			.addEventListener("click", () => {
				imageLibraryPage -= 1;
				renderImageLibraryPage(textarea);
			});
		imageLibraryModal
			.querySelector<HTMLButtonElement>('[data-kiln="images-next"]')!
			.addEventListener("click", () => {
				imageLibraryPage += 1;
				renderImageLibraryPage(textarea);
			});
	}

	renderImageLibraryList(textarea).then(() => imageLibraryModal?.showModal());
}

const FEEDBACK_REDIRECT_KEYWORDS = [
	"feature suggestion",
	"feature request",
	"bug report",
	"bug",
	"suggestion",
	"feedback",
];

function textSuggestsKilnFeedbackPost(text: string): boolean {
	const lower = text.toLowerCase();
	if (!lower.includes("kiln")) return false;
	return FEEDBACK_REDIRECT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function forumFeedbackRedirectBanner() {
	const textarea = getComposerTextarea();
	if (!textarea) return;

	const titleInput = textarea
		.closest("form")
		?.querySelector<HTMLInputElement>('input[name="title"]');

	const { wrapper } = getComposerEditor(textarea);

	const banner = document.createElement("div");
	banner.className = "alert alert-secondary small py-2 px-2 mt-2 mb-0 d-none";
	banner.innerHTML = `
		<i class="fas fa-info-circle me-1"></i>
		Got feedback about Kiln? Submit it through the
		<a href="https://polytoria.com/my/settings/kiln?tab=about" target="_blank" rel="noopener" class="alert-link text-muted">feedback form</a>
		instead of posting here.
	`;
	wrapper.insertAdjacentElement("afterend", banner);

	const updateBanner = () => {
		const combined = `${titleInput?.value ?? ""} ${textarea.value}`;
		banner.classList.toggle("d-none", !textSuggestsKilnFeedbackPost(combined));
	};

	textarea.addEventListener("input", updateBanner);
	titleInput?.addEventListener("input", updateBanner);
	updateBanner();
}

export function forumDrafts(showDisclosures: boolean, autoRestore: boolean) {
	const form = document.querySelector<HTMLFormElement>("#create-form");
	const titleInput = form?.querySelector<HTMLInputElement>(
		'input[name="title"]',
	);
	const contentTextarea = form?.querySelector<HTMLTextAreaElement>(
		'textarea[name="content"]',
	);
	const categoryInput = form?.querySelector<HTMLInputElement>(
		'input[name="categoryID"]',
	);
	const submitButton = form?.querySelector<HTMLButtonElement>("#submit");
	if (
		!form ||
		!titleInput ||
		!contentTextarea ||
		!categoryInput ||
		!submitButton
	)
		return;

	const getDraftId = (): string => String(Number(categoryInput.value) || 0);

	const hasUnsavedContent = (): boolean =>
		titleInput.value.trim().length > 0 ||
		contentTextarea.value.trim().length > 0;

	const writeDraft = async (): Promise<void> => {
		const id = getDraftId();
		const current = await _forumDrafts.getValue();
		await _forumDrafts.setValue({
			...current,
			[id]: {
				id,
				categoryId: Number(categoryInput.value) || 0,
				title: titleInput.value,
				content: contentTextarea.value,
				updatedAt: new Date().toISOString(),
			},
		});
	};

	const deleteDraft = async (id: string): Promise<void> => {
		const current = await _forumDrafts.getValue();
		const { [id]: _removed, ...rest } = current;
		await _forumDrafts.setValue(rest);
	};

	const loadDraftIntoForm = (draft: ForumDraft): void => {
		titleInput.value = draft.title;
		contentTextarea.value = draft.content;
		categoryInput.value = String(draft.categoryId);
		titleInput.dispatchEvent(new Event("input", { bubbles: true }));
		contentTextarea.dispatchEvent(new Event("input", { bubbles: true }));
	};

	const draftsButton = document.createElement("button");
	draftsButton.type = "button";
	draftsButton.className = "btn btn-outline-secondary me-2";
	draftsButton.innerHTML = `<i class="fas fa-box-archive me-1"></i>Drafts${kilnDisclosureBadgeHtml(showDisclosures)}`;
	applyKilnDisclosureTitle(draftsButton, showDisclosures);

	submitButton.insertAdjacentElement("beforebegin", draftsButton);

	let modal: HTMLDialogElement | undefined;

	const renderDraftEntry = (
		draft: ForumDraft,
		onChanged: () => void,
	): HTMLElement => {
		const entry = document.createElement("div");
		entry.className = "border border-secondary rounded p-2 mb-2";

		const preview = draft.content.replace(/\s+/g, " ").trim();
		const truncatedPreview =
			preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;

		entry.innerHTML = `
			<div class="d-flex justify-content-between align-items-start gap-2">
				<div>
					<h6 class="mb-1">${escapeHtml(draft.title || "Untitled draft")}</h6>
					<div class="text-muted small">${escapeHtml(truncatedPreview) || "No content"}</div>
					<small class="text-muted">Updated ${formatNotificationRelativeTime(new Date(draft.updatedAt))}</small>
				</div>
				<div class="d-flex gap-1">
					<button type="button" class="btn btn-sm btn-outline-primary" data-kiln="load-draft">Load</button>
					<button type="button" class="btn btn-sm btn-outline-danger" data-kiln="delete-draft"><i class="fas fa-trash"></i></button>
				</div>
			</div>
		`;

		entry
			.querySelector<HTMLButtonElement>('[data-kiln="load-draft"]')!
			.addEventListener("click", () => {
				loadDraftIntoForm(draft);
				modal?.close();
			});

		entry
			.querySelector<HTMLButtonElement>('[data-kiln="delete-draft"]')!
			.addEventListener("click", async () => {
				await deleteDraft(draft.id);
				onChanged();
			});

		return entry;
	};

	const renderDraftsList = async (): Promise<void> => {
		const body = modal?.querySelector<HTMLElement>("#kiln-drafts-body");
		if (!body) return;

		const all = await _forumDrafts.getValue();
		const drafts = Object.values(all).sort((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt),
		);

		body.innerHTML = "";
		if (drafts.length === 0) {
			body.innerHTML = `<div class="text-center text-muted py-3">No saved drafts yet.</div>`;
			return;
		}

		for (const draft of drafts) {
			body.appendChild(renderDraftEntry(draft, renderDraftsList));
		}
	};

	draftsButton.addEventListener("click", async () => {
		if (!modal) {
			modal = createModal("lg");
			modal.innerHTML = `
				<div class="d-flex justify-content-between align-items-center mb-3">
					<h5 class="mb-0 text-white">
						<i class="fas fa-box-archive me-2"></i>Forum Drafts${kilnDisclosureBadgeHtml(showDisclosures)}
					</h5>
					<button type="button" class="btn btn-sm btn-secondary" data-kiln="close-drafts">✕</button>
				</div>
				<div id="kiln-drafts-body"></div>
			`;
			modal
				.querySelector<HTMLButtonElement>('[data-kiln="close-drafts"]')!
				.addEventListener("click", () => modal?.close());
		}

		await renderDraftsList();
		modal.showModal();
	});

	let submitted = false;
	form.addEventListener("submit", () => {
		submitted = true;
		clearTimeout(autosaveTimer);
		deleteDraft(getDraftId());
	});

	let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
	const scheduleAutosave = (): void => {
		clearTimeout(autosaveTimer);
		if (submitted) return;
		autosaveTimer = setTimeout(() => {
			if (hasUnsavedContent()) writeDraft();
			else deleteDraft(getDraftId());
		}, DRAFT_AUTOSAVE_DELAY);
	};

	titleInput.addEventListener("input", scheduleAutosave);
	contentTextarea.addEventListener("input", scheduleAutosave);

	if (autoRestore) {
		_forumDrafts.getValue().then((all) => {
			const draft = all[getDraftId()];
			if (draft && !hasUnsavedContent()) loadDraftIntoForm(draft);
		});
	}
}

type FilterField = HTMLTextAreaElement | HTMLInputElement;

function initTitleFilterHighlighting(textarea: HTMLTextAreaElement) {
	const title = textarea
		.closest("form")
		?.querySelector<HTMLInputElement>('input[name="title"]');
	const container = title?.parentElement;
	if (!title || !container) return;

	if (getComputedStyle(container).position === "static") {
		container.style.position = "relative";
	}

	initFilterHighlighting(title, container);
}

function initFilterHighlighting(field: FilterField, container: HTMLElement) {
	const isInput = field instanceof HTMLInputElement;

	const backdrop = document.createElement("div");
	backdrop.setAttribute("aria-hidden", "true");
	backdrop.style.cssText = `
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
		overflow: hidden;
		color: transparent;
		pointer-events: none;
	`;

	const copiedProps = [
		"boxSizing",
		"paddingTop",
		"paddingRight",
		"paddingBottom",
		"paddingLeft",
		"borderTopWidth",
		"borderRightWidth",
		"borderBottomWidth",
		"borderLeftWidth",
		"borderStyle",
		"borderRadius",
		"fontFamily",
		"fontSize",
		"fontWeight",
		"fontStyle",
		"fontVariant",
		"letterSpacing",
		"wordSpacing",
		"lineHeight",
		"textAlign",
		"textIndent",
		"textTransform",
		"whiteSpace",
		"overflowWrap",
		"wordBreak",
		"direction",
	] as const;

	const syncGeometry = () => {
		const cs = getComputedStyle(field);
		for (const prop of copiedProps) {
			backdrop.style[prop] = cs[prop];
		}
		backdrop.style.borderColor = "transparent";
		if (isInput) backdrop.style.whiteSpace = "pre";

		const borderX =
			Number.parseFloat(cs.borderLeftWidth) +
			Number.parseFloat(cs.borderRightWidth);
		const borderY =
			Number.parseFloat(cs.borderTopWidth) +
			Number.parseFloat(cs.borderBottomWidth);

		const scrollbarX = Math.max(
			0,
			field.offsetWidth - field.clientWidth - borderX,
		);
		const scrollbarY = Math.max(
			0,
			field.offsetHeight - field.clientHeight - borderY,
		);

		backdrop.style.paddingRight = `${Number.parseFloat(cs.paddingRight) + scrollbarX}px`;
		backdrop.style.paddingBottom = `${Number.parseFloat(cs.paddingBottom) + scrollbarY}px`;
		backdrop.style.top = `${field.offsetTop}px`;
		backdrop.style.left = `${field.offsetLeft}px`;
		backdrop.style.width = `${field.offsetWidth}px`;
		backdrop.style.height = `${field.offsetHeight}px`;
	};

	container.insertBefore(backdrop, field);
	syncGeometry();

	let filters: RegExp[] = [];

	const syncScroll = () => {
		backdrop.scrollTop = field.scrollTop;
		backdrop.scrollLeft = field.scrollLeft;
	};

	const render = () => {
		const text = field.value;
		if (filters.length === 0) {
			backdrop.innerHTML = "";
			return;
		}

		const ranges = findFilteredRanges(text, filters);
		let html = "";
		let lastIndex = 0;

		for (const [start, end] of ranges) {
			html += escapeHtml(text.slice(lastIndex, start));
			html += `<mark class="kiln-filtered-word">${escapeHtml(text.slice(start, end))}</mark>`;
			lastIndex = end;
		}
		html += escapeHtml(text.slice(lastIndex));

		backdrop.innerHTML = text.endsWith("\n") ? `${html} ` : html;
		syncScroll();
	};

	field.addEventListener("input", render);
	for (const event of ["scroll", "keyup", "click", "select", "focus", "blur"]) {
		field.addEventListener(event, () => {
			syncScroll();
			requestAnimationFrame(syncScroll);
		});
	}

	new ResizeObserver(() => {
		syncGeometry();
		syncScroll();
	}).observe(field);

	getProfanityFilter().then((loadedFilters) => {
		filters = loadedFilters;
		if (import.meta.env.MODE == "development") {
			console.log(
				`[Kiln] Filter highlighting initialized on ${isInput ? "title" : "content"} with ${filters.length} pattern(s)`,
			);
		}
		render();
	});
}

function censorFilteredWords(text: string, filters: RegExp[]): string {
	if (filters.length === 0) return text;

	const ranges = findFilteredRanges(text, filters);
	if (ranges.length === 0) return text;

	let censored = "";
	let lastIndex = 0;
	for (const [start, end] of ranges) {
		censored += text.slice(lastIndex, start) + "*".repeat(end - start);
		lastIndex = end;
	}
	return censored + text.slice(lastIndex);
}

function findFilteredRanges(
	text: string,
	filters: RegExp[],
): [number, number][] {
	const raw: [number, number][] = [];

	for (const re of filters) {
		re.lastIndex = 0;
		let match: RegExpExecArray | null = re.exec(text);
		while (match) {
			if (match[0].length === 0) {
				re.lastIndex++;
			} else {
				raw.push([match.index, match.index + match[0].length]);
			}
			match = re.exec(text);
		}
	}

	raw.sort((a, b) => a[0] - b[0] || b[1] - a[1]);

	const merged: [number, number][] = [];
	for (const range of raw) {
		const last = merged[merged.length - 1];
		if (last && range[0] < last[1]) {
			last[1] = Math.max(last[1], range[1]);
		} else {
			merged.push(range);
		}
	}

	return merged
		.map(([start, end]): [number, number] => {
			while (start < end && /\s/.test(text[start])) start++;
			while (end > start && /\s/.test(text[end - 1])) end--;
			return [start, end];
		})
		.filter(([start, end]) => end > start);
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function renderMarkdown(text: string): string {
	const escaped = text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

	const tokens: string[] = [];
	const tokenize = (html: string): string => {
		tokens.push(html);
		return `<kilnmd-${tokens.length - 1}>`;
	};

	const withoutLiterals = escaped
		.replace(/```\w*\n?([\s\S]*?)```/g, (_match, code: string) =>
			tokenize(
				`<pre class="hljs markdown-code"><code>${code.replace(/\n/g, "<br>")}</code></pre>`,
			),
		)
		.replace(/`([^`]+)`/g, (_match, code: string) =>
			tokenize(`<code>${code}</code>`),
		)
		.replace(/\[\[image:(\d+)\]\]/g, (_match, id: string) =>
			tokenize(
				`<img src="https://polytoria.com/markdown/image/${id}" alt="" loading="lazy" style="max-width:100%;">`,
			),
		);

	const rendered = withoutLiterals
		.replace(/^###### (.+)$/gm, "<h6>$1</h6>")
		.replace(/^##### (.+)$/gm, "<h5>$1</h5>")
		.replace(/^#### (.+)$/gm, "<h4>$1</h4>")
		.replace(/^### (.+)$/gm, "<h3>$1</h3>")
		.replace(/^## (.+)$/gm, "<h2>$1</h2>")
		.replace(/^# (.+)$/gm, "<h1>$1</h1>")
		.replace(/__(.+?)__/g, "<strong>$1</strong>")
		.replace(/_(.+?)_/g, "<em>$1</em>")
		.replace(/~~(.+?)~~/g, "<s>$1</s>")
		.replace(/^(?:&gt; ?.*(?:\n|$))+/gm, (block) => {
			const lines = block.replace(/\n$/, "").split("\n");
			const content = lines
				.map((line) => line.replace(/^&gt; ?/, ""))
				.join("<br>");
			return `<blockquote style="border-left:3px solid rgba(255,255,255,0.25);padding-left:0.75rem;margin:0.25rem 0;">${content}</blockquote>`;
		})
		.replace(/\n/g, "<br>");

	return rendered.replace(
		/<kilnmd-(\d+)>/g,
		(_match, idx: string) => tokens[Number(idx)],
	);
}

function hasDelimiterAt(value: string, index: number, delim: string): boolean {
	if (index < 0 || value.slice(index, index + delim.length) !== delim)
		return false;

	const char = delim[0];
	if (![...delim].every((c) => c === char)) return true;

	return value[index - 1] !== char && value[index + delim.length] !== char;
}

function wrapSelection(
	textarea: HTMLTextAreaElement,
	prefix: string,
	suffix: string,
	placeholder: string,
) {
	const start = textarea.selectionStart;
	const end = textarea.selectionEnd;
	const val = textarea.value;

	const insideWrapped =
		hasDelimiterAt(val, start, prefix) &&
		(suffix === "" || hasDelimiterAt(val, end - suffix.length, suffix));

	const outsideWrapped =
		hasDelimiterAt(val, start - prefix.length, prefix) &&
		(suffix === "" || hasDelimiterAt(val, end, suffix));

	if (insideWrapped) {
		const inner = val.slice(start + prefix.length, end - (suffix.length || 0));
		textarea.value = val.slice(0, start) + inner + val.slice(end);
		textarea.selectionStart = start;
		textarea.selectionEnd = start + inner.length;
	} else if (outsideWrapped) {
		const inner = val.slice(start, end);
		const removeStart = start - prefix.length;
		const removeEnd = end + suffix.length;
		textarea.value = val.slice(0, removeStart) + inner + val.slice(removeEnd);
		textarea.selectionStart = removeStart;
		textarea.selectionEnd = removeStart + inner.length;
	} else {
		const inner = val.slice(start, end) || placeholder;
		textarea.value =
			val.slice(0, start) + prefix + inner + suffix + val.slice(end);
		const innerStart = start + prefix.length;
		textarea.selectionStart = innerStart;
		textarea.selectionEnd = innerStart + inner.length;
	}

	textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
