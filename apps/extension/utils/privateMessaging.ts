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

import { Extension } from "@kiln/schemas";
import {
	POLYTORIA_CDN_URL,
	parseAssetId,
	resolveDecalUrl,
} from "@/utils/decal";
import { syncMessagingOptIn } from "@/utils/privateMessagingOptIn";
import { _messagingUiState } from "@/utils/storage";
import {
	createKilnDisclosureBadge,
	getApiSession,
	getConfig,
	getFlag,
	getKilnBan,
} from "@/utils/utilities";

type Conversation = Extension.DirectConversation;
type Message = Extension.DirectMessage;
type DraftImage = { assetId: number; url: string };

type Thread = {
	userId: number;
	username: string;
	thumbnail: string | null;
	blocked: boolean;
	unavailableReason: string | null;
	messages: Message[];
	hasMore: boolean;
	loading: boolean;
};

type Outgoing = {
	localId: number;
	partnerId: number;
	body: string;
	image: DraftImage | null;
	createdAt: string;
	state: "sending" | "failed";
	error: string | null;
};

type Row = {
	key: string;
	senderId: number;
	body: string;
	imageAssetId: number | null;
	imageUrl: string | null;
	createdAt: string;
	status: Message["status"] | Outgoing["state"];
	error: string | null;
	message: Message | null;
	outgoing: Outgoing | null;
};

const REPORT_REASONS: Record<Extension.MessageReportReason, string> = {
	harassment: "Harassment or bullying",
	hate: "Hate speech",
	sexual: "Sexual content",
	threat: "Threats or self-harm",
	scam: "Scam or phishing",
	spam: "Spam",
	other: "Something else",
};

const STATUS_POLL_MS = 60_000;
const LIST_POLL_MS = 20_000;
const THREAD_POLL_MS = 8_000;
const ACTIVE_THREAD_POLL_MS = 3_000;
const ACTIVE_WINDOW_MS = 60_000;
const GROUP_WINDOW_MS = 5 * 60_000;
const COUNTER_THRESHOLD = 0.8;
const NEAR_BOTTOM_PX = 40;
const FLASH_MS = 5000;
const IMAGE_PREVIEW = "Sent an image";

function h<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Partial<Record<string, string | boolean>> = {},
	...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (value === false || value === undefined) continue;
		if (key === "class") el.className = String(value);
		else el.setAttribute(key, value === true ? "" : String(value));
	}
	for (const child of children) {
		if (child === null || child === undefined || child === false) continue;
		el.append(child);
	}
	return el;
}

function icon(name: string): HTMLElement {
	return h("i", { class: `fas ${name}`, "aria-hidden": "true" });
}

function iconButton(name: string, label: string): HTMLButtonElement {
	return h(
		"button",
		{
			class: "kiln-pm-iconbtn",
			type: "button",
			title: label,
			"aria-label": label,
		},
		icon(name),
	);
}

function spinner(label: string): HTMLElement {
	return h(
		"div",
		{ class: "kiln-pm-empty", role: "status" },
		h("span", {
			class: "spinner-border spinner-border-sm",
			"aria-hidden": "true",
		}),
		label,
	);
}

function formatClock(date: Date): string {
	return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDay(date: Date): string {
	const now = new Date();
	if (date.toDateString() === now.toDateString()) return "Today";
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
	return date.toLocaleDateString([], {
		month: "short",
		day: "numeric",
		year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
	});
}

function formatListTime(iso: string): string {
	const date = new Date(iso);
	return date.toDateString() === new Date().toDateString()
		? formatClock(date)
		: formatDay(date);
}

function avatar(url: string | null, size = 36): HTMLImageElement {
	const img = h("img", {
		class: "kiln-pm-avatar",
		width: String(size),
		height: String(size),
		alt: "",
	});
	if (url) img.src = url;
	return img;
}

function isStuckToBottom(body: HTMLElement): boolean {
	return (
		body.scrollHeight - body.scrollTop - body.clientHeight < NEAR_BOTTOM_PX
	);
}

function messageImage(
	assetId: number | null,
	url: string | null,
	onLoad: () => void,
): HTMLElement | null {
	if (!url || !POLYTORIA_CDN_URL.test(url)) return null;
	const img = h("img", { src: url, alt: "Polytoria image", loading: "lazy" });
	img.addEventListener("load", onLoad, { once: true });
	img.addEventListener(
		"error",
		() => {
			img.replaceWith(
				h("div", { class: "kiln-pm-image-missing" }, "Image unavailable"),
			);
		},
		{ once: true },
	);
	if (assetId === null) return h("div", { class: "kiln-pm-image" }, img);
	return h(
		"a",
		{
			class: "kiln-pm-image",
			href: `https://polytoria.com/store/${assetId}`,
			target: "_blank",
			rel: "noopener noreferrer",
			title: "View on Polytoria",
		},
		img,
	);
}

class MessagingWidget {
	private readonly host: HTMLElement;
	private open = false;
	private view: "list" | "thread" | "report" = "list";
	private unread = 0;
	private canMessage = true;
	private conversations: Conversation[] = [];
	private conversationsLoaded = false;
	private thread: Thread | null = null;
	private reporting: Message | null = null;
	private knownNames = new Map<number, string>();
	private pollTimer: ReturnType<typeof setTimeout> | undefined;
	private draft = "";
	private draftImage: DraftImage | null = null;
	private pickerOpen = false;
	private confirmingBlock = false;
	private persistChain: Promise<unknown> = Promise.resolve();
	private draftTimer: ReturnType<typeof setTimeout> | undefined;
	private outbox: Outgoing[] = [];
	private sendChain: Promise<unknown> = Promise.resolve();
	private nextLocalId = 1;
	private sendVersion = 0;
	private lastActivity = 0;
	private stuckToBottom = true;
	private focusComposerOnRender = false;
	private animatePanel = false;
	private rowCache = new Map<string, { signature: string; el: HTMLElement }>();

	constructor(
		private readonly userId: number,
		private readonly showDisclosures: boolean,
	) {
		this.host = h("div", { id: "kiln-private-messaging", class: "kiln-pm" });

		for (const type of ["keydown", "keyup", "keypress"] as const)
			this.host.addEventListener(type, (e) => {
				e.stopPropagation();
				if (type === "keydown" && (e as KeyboardEvent).key === "Escape")
					this.close();
			});
	}

	async start(): Promise<boolean> {
		if (!(await this.refreshStatus())) return false;
		document.body.append(this.host);
		await this.restore();
		this.schedulePoll();
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") this.schedulePoll(0);
		});
		return true;
	}

	private persist(): void {
		clearTimeout(this.draftTimer);
		const inThread = this.open && this.thread !== null && this.view !== "list";
		const state = {
			open: this.open,
			partnerId: inThread ? this.thread!.userId : null,
			partnerName: inThread ? this.thread!.username : null,
			draft: inThread ? this.draft : "",
			draftImage: inThread ? this.draftImage : null,
		};
		this.persistChain = this.persistChain
			.then(() => _messagingUiState.getValue())
			.then((all) =>
				_messagingUiState.setValue({ ...all, [this.userId]: state }),
			)
			.catch(() => {});
	}

	private persistSoon(): void {
		clearTimeout(this.draftTimer);
		this.draftTimer = setTimeout(() => this.persist(), 400);
	}

	private async restore(): Promise<void> {
		const state = (await _messagingUiState.getValue())[this.userId];
		if (!state?.open) {
			this.render();
			return;
		}

		this.open = true;
		this.view = "list";
		if (state.partnerId !== null) {
			if (state.partnerName)
				this.knownNames.set(state.partnerId, state.partnerName);
			this.draft = state.draft;
			this.draftImage =
				state.draftImage && POLYTORIA_CDN_URL.test(state.draftImage.url)
					? state.draftImage
					: null;
			void this.loadConversations();
			await this.openThread(state.partnerId, false);
			if (this.thread) return;
			this.draft = "";
			this.draftImage = null;
		}
		this.renderPanel();
		await this.loadConversations();
		if (this.open && this.view === "list") this.renderPanel();
	}

	private pollInterval(): number {
		if (!this.open) return STATUS_POLL_MS;
		if (this.view !== "thread") return LIST_POLL_MS;
		return Date.now() - this.lastActivity < ACTIVE_WINDOW_MS
			? ACTIVE_THREAD_POLL_MS
			: THREAD_POLL_MS;
	}

	private schedulePoll(delay?: number): void {
		clearTimeout(this.pollTimer);
		this.pollTimer = setTimeout(async () => {
			if (document.visibilityState === "visible") await this.poll();
			this.schedulePoll();
		}, delay ?? this.pollInterval());
	}

	private async poll(): Promise<void> {
		if (!this.open) {
			await this.refreshStatus();
			this.renderLauncher();
			return;
		}
		if (this.view === "list") {
			await this.loadConversations();
			const items = this.host.querySelector<HTMLElement>(".kiln-pm-convos");
			if (this.view === "list" && this.open && items)
				this.fillConversations(items);
		} else if (this.view === "thread" && this.thread && !this.thread.loading) {
			const { changed, chromeChanged } = await this.refreshThread();
			if (this.view !== "thread") return;
			if (chromeChanged) this.renderPanel();
			else if (changed) this.updateMessages();
		}
	}

	private async refreshStatus(): Promise<boolean> {
		const result = await sendMessage("getMessagingStatus", this.userId);
		if (!result.ok) return false;
		this.unread = result.data.data.unread;
		this.canMessage = result.data.data.canMessage;
		return true;
	}

	private async loadConversations(): Promise<void> {
		const result = await sendMessage("getDirectConversations", this.userId);
		if (!result.ok) return;
		this.conversations = result.data.data;
		this.conversationsLoaded = true;
		this.unread = this.conversations.reduce((sum, c) => sum + c.unread, 0);
		for (const c of this.conversations)
			this.knownNames.set(c.userId, c.username);
	}

	private async openThread(partnerId: number, focus: boolean): Promise<void> {
		const known = this.conversations.find((c) => c.userId === partnerId);
		this.thread = {
			userId: partnerId,
			username: known?.username ?? this.knownNames.get(partnerId) ?? "Messages",
			thumbnail: known?.thumbnail ?? null,
			blocked: known?.blocked ?? false,
			unavailableReason: null,
			messages: [],
			hasMore: false,
			loading: true,
		};
		const pending = this.thread;
		this.view = "thread";
		this.stuckToBottom = true;
		this.pickerOpen = false;
		this.confirmingBlock = false;
		this.focusComposerOnRender = focus;
		this.rowCache.clear();
		this.render();

		const result = await sendMessage("getDirectMessages", {
			userId: this.userId,
			partnerId,
		});
		if (this.thread !== pending) return;
		if (!result.ok) {
			this.thread = null;
			this.view = "list";
			this.renderPanel();
			this.flash(result.message);
			this.persist();
			this.schedulePoll();
			return;
		}

		const data = result.data.data;
		const knownName = this.knownNames.get(partnerId);
		this.thread = {
			...data,
			loading: false,
			username:
				data.username.startsWith("User ") && knownName
					? knownName
					: data.username,
		};
		this.render();
		this.schedulePoll();
		this.markRead(partnerId);
		this.persist();
	}

	private markRead(partnerId: number): void {
		const convo = this.conversations.find((c) => c.userId === partnerId);
		if (convo?.unread) {
			this.unread = Math.max(0, this.unread - convo.unread);
			convo.unread = 0;
		}
		sendMessage("markDirectConversationRead", {
			userId: this.userId,
			partnerId,
		}).then(() => this.renderLauncher());
	}

	private async refreshThread(): Promise<{
		changed: boolean;
		chromeChanged: boolean;
	}> {
		const none = { changed: false, chromeChanged: false };
		const thread = this.thread;
		if (!thread) return none;
		const version = this.sendVersion;
		const result = await sendMessage("getDirectMessages", {
			userId: this.userId,
			partnerId: thread.userId,
		});
		if (
			!result.ok ||
			this.thread !== thread ||
			version !== this.sendVersion ||
			this.outbox.some(
				(o) => o.partnerId === thread.userId && o.state === "sending",
			)
		)
			return none;

		const latest = result.data.data.messages;
		const known = new Map(thread.messages.map((m) => [m.id, m]));
		let changed = latest.length > 0 && !known.has(latest[latest.length - 1].id);
		for (const m of latest) {
			const existing = known.get(m.id);
			if (existing && existing.status !== m.status) changed = true;
			known.set(m.id, m);
		}
		const visibleIds = new Set(latest.map((m) => m.id));
		const oldestLatest = latest[0]?.id ?? Infinity;
		for (const [id] of known)
			if (id >= oldestLatest && !visibleIds.has(id)) {
				known.delete(id);
				changed = true;
			}

		thread.messages = [...known.values()].sort((a, b) => a.id - b.id);
		const chromeChanged =
			thread.blocked !== result.data.data.blocked ||
			thread.unavailableReason !== result.data.data.unavailableReason;
		thread.blocked = result.data.data.blocked;
		thread.unavailableReason = result.data.data.unavailableReason;
		if (changed) {
			this.lastActivity = Date.now();
			this.markRead(thread.userId);
		}
		return { changed, chromeChanged };
	}

	private async loadOlder(button: HTMLButtonElement): Promise<void> {
		const thread = this.thread;
		if (!thread || thread.messages.length === 0) return;
		button.disabled = true;
		const result = await sendMessage("getDirectMessages", {
			userId: this.userId,
			partnerId: thread.userId,
			before: thread.messages[0].id,
		});
		if (this.thread !== thread) return;
		if (!result.ok) {
			button.disabled = false;
			this.flash(result.message);
			return;
		}
		thread.messages = [...result.data.data.messages, ...thread.messages];
		thread.hasMore = result.data.data.hasMore;

		const list = this.host.querySelector<HTMLElement>(".kiln-pm-thread");
		const body = this.host.querySelector<HTMLElement>(".kiln-pm-body");
		if (!list || !body) return;
		const previousHeight = body.scrollHeight;
		const previousTop = body.scrollTop;
		this.fillMessages(list);
		body.scrollTop = previousTop + body.scrollHeight - previousHeight;
	}

	private async startConversation(username: string): Promise<string | null> {
		const name = username.trim();
		if (!name) return "Enter a username";
		const found = await sendMessage("findUserByUsername", name);
		if (!found.ok) return "Couldn't find that user";
		if (found.data === this.userId) return "You can't message yourself";
		this.knownNames.set(found.data, name);
		await this.openThread(found.data, true);
		return null;
	}

	private queueMessage(body: string, image: DraftImage | null): void {
		const thread = this.thread;
		if (!thread) return;
		this.enqueue({
			localId: this.nextLocalId++,
			partnerId: thread.userId,
			body,
			image,
			createdAt: new Date().toISOString(),
			state: "sending",
			error: null,
		});
	}

	private enqueue(item: Outgoing): void {
		this.outbox.push(item);
		this.sendVersion++;
		this.lastActivity = Date.now();
		this.stuckToBottom = true;
		this.updateMessages();
		this.schedulePoll();
		this.sendChain = this.sendChain.then(() => this.deliver(item));
	}

	private async deliver(item: Outgoing): Promise<void> {
		const result = await sendMessage("sendDirectMessage", {
			userId: this.userId,
			recipientId: item.partnerId,
			body: item.body,
			imageAssetId: item.image?.assetId,
		}).catch((err: unknown) => ({
			ok: false as const,
			message: err instanceof Error ? err.message : "Couldn't send message",
		}));

		this.sendVersion++;
		if (result.ok) {
			this.outbox = this.outbox.filter((o) => o !== item);
			if (this.thread?.userId === item.partnerId) {
				const sent = result.data.data;
				this.thread.messages = [
					...this.thread.messages.filter((m) => m.id !== sent.id),
					sent,
				].sort((a, b) => a.id - b.id);
			}
		} else {
			item.state = "failed";
			item.error = result.message;
		}
		this.renderLauncher();
		if (this.open && this.view === "thread") this.updateMessages();
		else if (this.open && this.view === "list") {
			await this.loadConversations();
			if (this.open && this.view === "list") this.renderPanel();
		}
	}

	private retry(item: Outgoing): void {
		this.outbox = this.outbox.filter((o) => o !== item);
		item.state = "sending";
		item.error = null;
		item.createdAt = new Date().toISOString();
		this.enqueue(item);
	}

	private discard(item: Outgoing): void {
		this.outbox = this.outbox.filter((o) => o !== item);
		this.renderLauncher();
		this.updateMessages();
	}

	private async setBlocked(next: boolean): Promise<void> {
		const thread = this.thread;
		if (!thread) return;
		const result = await sendMessage("setDirectMessageBlock", {
			userId: this.userId,
			partnerId: thread.userId,
			blocked: next,
		});
		if (this.thread !== thread) return;
		if (!result.ok) {
			this.flash(result.message);
			return;
		}
		thread.blocked = next;
		this.confirmingBlock = false;
		this.renderPanel();
	}

	private flash(message: string): void {
		this.host.querySelector(".kiln-pm-flash")?.remove();
		const note = h("div", { class: "kiln-pm-flash", role: "alert" }, message);
		this.host.querySelector(".kiln-pm-panel")?.append(note);
		setTimeout(() => note.remove(), FLASH_MS);
	}

	private toggle(): void {
		this.open ? this.close() : this.openPanel();
	}

	private async openPanel(): Promise<void> {
		this.open = true;
		this.view = "list";
		this.render();
		this.persist();
		await this.loadConversations();
		if (this.open && this.view === "list") this.renderPanel();
		this.schedulePoll();
	}

	private close(): void {
		if (!this.open) return;
		this.open = false;
		this.thread = null;
		this.reporting = null;
		this.draft = "";
		this.draftImage = null;
		this.pickerOpen = false;
		this.confirmingBlock = false;
		this.view = "list";
		this.render();
		this.persist();
		this.schedulePoll();
	}

	private back(): void {
		this.thread = null;
		this.reporting = null;
		this.draft = "";
		this.draftImage = null;
		this.pickerOpen = false;
		this.confirmingBlock = false;
		this.view = "list";
		this.openPanel();
	}

	private render(): void {
		if (this.open) this.renderPanel();
		else this.renderLauncher();
	}

	private renderLauncher(): void {
		if (this.open) return;
		const failed = this.outbox.some((o) => o.state === "failed");
		const launcher = h(
			"button",
			{
				class: "btn btn-primary kiln-pm-launcher",
				type: "button",
				"aria-label": "Open Kiln messages",
			},
			icon("fa-comments"),
			h("span", {}, "Messages"),
			failed && icon("fa-circle-exclamation"),
			this.unread > 0 &&
				h(
					"span",
					{ class: "kiln-pm-count" },
					this.unread > 99 ? "99+" : String(this.unread),
				),
		);
		launcher.addEventListener("click", () => {
			this.animatePanel = true;
			this.toggle();
		});
		this.host.replaceChildren(launcher);
	}

	private renderHeader(): HTMLElement {
		const thread = this.view === "list" ? null : this.thread;
		const header = h("div", { class: "kiln-pm-header" });

		if (this.view !== "list") {
			const backBtn = iconButton("fa-chevron-left", "Back");
			backBtn.addEventListener("click", () => {
				if (this.view === "report") {
					this.reporting = null;
					this.view = "thread";
					this.renderPanel();
					this.schedulePoll();
				} else this.back();
			});
			header.append(backBtn);
		}

		if (this.view === "thread" && thread) {
			header.append(
				avatar(thread.thumbnail, 30),
				h(
					"a",
					{
						class: "kiln-pm-title",
						href: `/users/${thread.userId}`,
						title: "View profile",
					},
					thread.username,
				),
			);
		} else {
			header.append(
				h(
					"div",
					{ class: "kiln-pm-title" },
					this.view === "report" ? "Report message" : "Messages",
				),
			);
		}

		if (this.showDisclosures) header.append(createKilnDisclosureBadge());

		if (this.view === "thread" && thread && !thread.loading) {
			const blockBtn = iconButton(
				"fa-ban",
				thread.blocked
					? `Unblock ${thread.username}`
					: `Block ${thread.username}`,
			);
			blockBtn.classList.toggle("kiln-pm-iconbtn--active", thread.blocked);
			blockBtn.addEventListener("click", () => {
				if (thread.blocked) {
					this.setBlocked(false);
					return;
				}
				this.confirmingBlock = !this.confirmingBlock;
				this.renderPanel();
			});
			header.append(blockBtn);
		}

		const closeBtn = iconButton("fa-xmark", "Close");
		closeBtn.addEventListener("click", () => this.close());
		header.append(closeBtn);
		return header;
	}

	private renderBlockConfirm(): HTMLElement | null {
		const thread = this.thread;
		if (!this.confirmingBlock || !thread || this.view !== "thread") return null;
		const cancel = h(
			"button",
			{ class: "btn btn-sm btn-secondary", type: "button" },
			"Cancel",
		);
		cancel.addEventListener("click", () => {
			this.confirmingBlock = false;
			this.renderPanel();
		});
		const confirm = h(
			"button",
			{ class: "btn btn-sm btn-danger", type: "button" },
			"Block",
		);
		confirm.addEventListener("click", () => {
			confirm.disabled = true;
			this.setBlocked(true);
		});
		return h(
			"div",
			{ class: "kiln-pm-confirm", role: "alert" },
			`Block ${thread.username}? Neither of you will be able to send messages to the other.`,
			h("div", { class: "d-flex justify-content-end gap-2" }, cancel, confirm),
		);
	}

	private renderPanel(): void {
		const previousBody = this.host.querySelector<HTMLElement>(".kiln-pm-body");
		const previousTop = previousBody?.scrollTop ?? 0;
		const composerHadFocus =
			document.activeElement?.closest(".kiln-pm-composer") != null;

		const body = h("div", { class: "kiln-pm-body" });
		const panel = h(
			"div",
			{
				class: `kiln-pm-panel${this.animatePanel ? " kiln-pm-panel--enter" : ""}`,
				role: "dialog",
				"aria-label": "Kiln messages",
			},
			this.renderHeader(),
			this.renderBlockConfirm(),
			body,
		);
		this.animatePanel = false;

		if (this.view === "list") this.renderList(body);
		else if (this.view === "thread") this.renderThread(body, panel);
		else this.renderReport(body);

		this.host.replaceChildren(panel);

		if (this.view === "thread") {
			body.addEventListener("scroll", () => {
				this.stuckToBottom = isStuckToBottom(body);
			});
			body.scrollTop = this.stuckToBottom ? body.scrollHeight : previousTop;
			if (this.focusComposerOnRender || composerHadFocus)
				this.host.querySelector<HTMLTextAreaElement>("textarea")?.focus();
			if (this.thread && !this.thread.loading)
				this.focusComposerOnRender = false;
		} else {
			body.scrollTop = previousTop;
		}
	}

	private renderList(body: HTMLElement): void {
		if (!this.canMessage)
			body.append(
				h(
					"div",
					{ class: "kiln-pm-notice" },
					"Messaging isn't available for your account right now. You can still read messages you've already received.",
				),
			);

		const input = h("input", {
			class: "form-control form-control-sm",
			type: "text",
			placeholder: "Message a user by username",
			maxlength: "40",
			"aria-label": "Username",
		});
		const goBtn = h(
			"button",
			{ class: "btn btn-sm btn-primary", type: "button" },
			"Chat",
		);
		const error = h("div", { class: "kiln-pm-error", role: "alert" });
		const submit = async () => {
			if (goBtn.disabled) return;
			goBtn.disabled = true;
			error.textContent = "";
			const problem = await this.startConversation(input.value);
			goBtn.disabled = false;
			if (problem) error.textContent = problem;
		};
		goBtn.addEventListener("click", submit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") submit();
		});
		body.append(h("div", { class: "kiln-pm-new" }, input, goBtn), error);

		const items = h("div", { class: "kiln-pm-convos" });
		this.fillConversations(items);
		body.append(items);
	}

	private fillConversations(items: HTMLElement): void {
		items.replaceChildren();
		if (!this.conversationsLoaded) {
			items.append(spinner("Loading conversations…"));
			return;
		}
		if (this.conversations.length === 0) {
			items.append(
				h(
					"div",
					{ class: "kiln-pm-empty" },
					"No conversations yet. Enter a username above to start one.",
				),
			);
			return;
		}

		for (const convo of this.conversations) {
			const text = convo.lastMessage.body || IMAGE_PREVIEW;
			const preview =
				convo.lastMessage.senderId === this.userId ? `You: ${text}` : text;
			const item = h(
				"button",
				{
					class: `kiln-pm-convo${convo.unread > 0 ? " kiln-pm-convo--unread" : ""}`,
					type: "button",
				},
				avatar(convo.thumbnail),
				h(
					"div",
					{ class: "kiln-pm-convo-text" },
					h(
						"div",
						{ class: "kiln-pm-convo-top" },
						h("div", { class: "kiln-pm-convo-name" }, convo.username),
						h(
							"div",
							{ class: "kiln-pm-convo-time" },
							formatListTime(convo.lastMessage.createdAt),
						),
					),
					h("div", { class: "kiln-pm-convo-preview" }, preview),
				),
				convo.unread > 0 &&
					h("span", { class: "kiln-pm-count" }, String(convo.unread)),
			);
			item.addEventListener("click", () => this.openThread(convo.userId, true));
			items.append(item);
		}
	}

	private renderThread(body: HTMLElement, panel: HTMLElement): void {
		const thread = this.thread;
		if (!thread) return;

		if (thread.loading) {
			body.append(spinner("Loading messages…"));
			return;
		}

		const list = h("div", { class: "kiln-pm-thread" });
		this.fillMessages(list);
		body.append(list);

		const blockedNotice = thread.blocked
			? "You've blocked this user. Unblock them to send messages."
			: (thread.unavailableReason ??
				(this.canMessage
					? null
					: "Messaging isn't available for your account right now."));
		if (blockedNotice) {
			panel.append(
				h("div", { class: "kiln-pm-composer kiln-pm-status" }, blockedNotice),
			);
			return;
		}

		panel.append(this.renderComposer());
	}

	private renderComposer(): HTMLElement {
		const composer = h("div", { class: "kiln-pm-composer" });
		const attachmentSlot = h("div", {});
		const pickerSlot = h("div", {});

		const input = h("textarea", {
			class: "form-control",
			rows: "1",
			placeholder: "Write a message…",
			maxlength: String(Extension.MAX_DIRECT_MESSAGE_LENGTH),
			"aria-label": "Message",
		});
		input.value = this.draft;

		const imageBtn = iconButton("fa-image", "Add a Polytoria image");
		const sendBtn = h(
			"button",
			{
				class: "btn btn-primary kiln-pm-send",
				type: "button",
				"aria-label": "Send",
				title: "Send",
			},
			icon("fa-paper-plane"),
		);
		const counter = h("div", { class: "kiln-pm-counter" });

		const update = () => {
			const length = input.value.length;
			const limit = Extension.MAX_DIRECT_MESSAGE_LENGTH;
			counter.textContent =
				length >= limit * COUNTER_THRESHOLD ? `${length}/${limit}` : "";
			input.style.height = "auto";
			input.style.height = `${Math.min(input.scrollHeight + 2, 96)}px`;
			sendBtn.disabled = !input.value.trim() && !this.draftImage;
			imageBtn.classList.toggle("kiln-pm-iconbtn--active", this.pickerOpen);
			imageBtn.disabled = !!this.draftImage;
		};

		const renderAttachment = () => {
			attachmentSlot.replaceChildren();
			if (!this.draftImage) return;
			const remove = iconButton("fa-xmark", "Remove image");
			remove.addEventListener("click", () => {
				this.draftImage = null;
				renderAttachment();
				update();
				this.persistSoon();
				input.focus();
			});
			attachmentSlot.append(
				h(
					"div",
					{ class: "kiln-pm-attachment" },
					h("img", { src: this.draftImage.url, alt: "" }),
					h("span", {}, `Decal ${this.draftImage.assetId}`),
					remove,
				),
			);
		};

		const renderPicker = () => {
			pickerSlot.replaceChildren();
			if (!this.pickerOpen) return;
			const idInput = h("input", {
				class: "form-control form-control-sm",
				type: "text",
				placeholder: "Decal ID or store link…",
				"aria-label": "Decal ID or store link",
			});
			const addBtn = h(
				"button",
				{ class: "btn btn-sm btn-primary", type: "button" },
				"Add",
			);
			const status = h("div", { class: "kiln-pm-status", role: "status" });
			const lookup = async () => {
				if (addBtn.disabled) return;
				const assetId = parseAssetId(idInput.value);
				if (assetId === null) {
					status.textContent = "Enter a decal ID or store link.";
					return;
				}
				addBtn.disabled = true;
				status.textContent = "Looking up decal…";
				const url = await resolveDecalUrl(idInput.value);
				addBtn.disabled = false;
				if (!url) {
					status.textContent =
						"Couldn't find that decal. Check the ID and try again.";
					return;
				}
				if (!this.pickerOpen) return;
				this.draftImage = { assetId, url };
				this.pickerOpen = false;
				renderPicker();
				renderAttachment();
				update();
				this.persist();
				input.focus();
			};
			addBtn.addEventListener("click", lookup);
			idInput.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					lookup();
				} else if (e.key === "Escape") {
					e.stopPropagation();
					this.pickerOpen = false;
					renderPicker();
					update();
					input.focus();
				}
			});
			pickerSlot.append(
				h("div", { class: "d-flex gap-2" }, idInput, addBtn),
				status,
			);
			queueMicrotask(() => idInput.focus());
		};

		const submit = () => {
			const text = input.value.trim();
			const image = this.draftImage;
			if (!text && !image) return;
			this.draft = "";
			this.draftImage = null;
			this.pickerOpen = false;
			input.value = "";
			renderPicker();
			renderAttachment();
			update();
			this.persist();
			this.queueMessage(text, image);
			input.focus();
		};

		input.addEventListener("input", () => {
			this.draft = input.value;
			update();
			this.persistSoon();
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
				e.preventDefault();
				submit();
			}
		});
		imageBtn.addEventListener("click", () => {
			this.pickerOpen = !this.pickerOpen;
			renderPicker();
			update();
			if (!this.pickerOpen) input.focus();
		});
		sendBtn.addEventListener("click", submit);

		renderAttachment();
		renderPicker();
		composer.append(
			pickerSlot,
			attachmentSlot,
			h("div", { class: "kiln-pm-composer-row" }, imageBtn, input, sendBtn),
			counter,
		);
		queueMicrotask(update);
		return composer;
	}

	private updateMessages(): void {
		const list = this.host.querySelector<HTMLElement>(".kiln-pm-thread");
		const body = this.host.querySelector<HTMLElement>(".kiln-pm-body");
		if (!list || !body) return;
		this.fillMessages(list);
		if (this.stuckToBottom) body.scrollTop = body.scrollHeight;
	}

	private rows(thread: Thread): Row[] {
		const delivered: Row[] = thread.messages.map((message) => ({
			key: `m${message.id}`,
			senderId: message.senderId,
			body: message.body,
			imageAssetId: message.imageAssetId,
			imageUrl: message.imageUrl,
			createdAt: message.createdAt,
			status: message.status,
			error: null,
			message,
			outgoing: null,
		}));
		const queued: Row[] = this.outbox
			.filter((o) => o.partnerId === thread.userId)
			.map((outgoing) => ({
				key: `o${outgoing.localId}`,
				senderId: this.userId,
				body: outgoing.body,
				imageAssetId: outgoing.image?.assetId ?? null,
				imageUrl: outgoing.image?.url ?? null,
				createdAt: outgoing.createdAt,
				status: outgoing.state,
				error: outgoing.error,
				message: null,
				outgoing,
			}));
		return [...delivered, ...queued];
	}

	private fillMessages(list: HTMLElement): void {
		const thread = this.thread;
		if (!thread) return;

		const nodes: HTMLElement[] = [];
		if (thread.hasMore) {
			const more = h(
				"button",
				{ class: "btn btn-sm btn-secondary kiln-pm-older", type: "button" },
				"Load earlier messages",
			);
			more.addEventListener("click", () => this.loadOlder(more));
			nodes.push(more);
		}

		const rows = this.rows(thread);
		if (rows.length === 0)
			nodes.push(
				h("div", { class: "kiln-pm-empty" }, `Say hi to ${thread.username}.`),
			);

		const grouped = (a: Row | undefined, b: Row | undefined): boolean => {
			if (!a || !b || a.senderId !== b.senderId) return false;
			const [dateA, dateB] = [new Date(a.createdAt), new Date(b.createdAt)];
			return (
				dateA.toDateString() === dateB.toDateString() &&
				dateB.getTime() - dateA.getTime() < GROUP_WINDOW_MS &&
				a.status === b.status
			);
		};

		const seen = new Set<string>();
		rows.forEach((row, index) => {
			const previous = rows[index - 1];
			const date = new Date(row.createdAt);
			if (
				!previous ||
				new Date(previous.createdAt).toDateString() !== date.toDateString()
			)
				nodes.push(h("div", { class: "kiln-pm-day" }, formatDay(date)));

			const joined = grouped(previous, row);
			const showMeta =
				!grouped(row, rows[index + 1]) || row.status === "failed";
			const signature = JSON.stringify([
				row.status,
				row.error,
				joined,
				showMeta,
			]);
			seen.add(row.key);
			const cached = this.rowCache.get(row.key);
			if (cached?.signature === signature) {
				nodes.push(cached.el);
				return;
			}
			const el = this.renderRow(row, joined, showMeta);
			this.rowCache.set(row.key, { signature, el });
			nodes.push(el);
		});
		for (const key of this.rowCache.keys())
			if (!seen.has(key)) this.rowCache.delete(key);

		list.replaceChildren(...nodes);
	}

	private renderRow(row: Row, joined: boolean, showMeta: boolean): HTMLElement {
		const mine = row.senderId === this.userId;
		const bubbleKind = !mine
			? "kiln-pm-bubble--theirs"
			: row.status === "failed"
				? "kiln-pm-bubble--failed"
				: row.status === "pending" || row.status === "declined"
					? "kiln-pm-bubble--held"
					: row.status === "sending"
						? "kiln-pm-bubble--mine kiln-pm-bubble--sending"
						: "kiln-pm-bubble--mine";

		const bubble = h(
			"div",
			{ class: `kiln-pm-bubble ${bubbleKind}` },
			messageImage(row.imageAssetId, row.imageUrl, () => this.onImageLoad()),
			row.body && h("div", { class: "kiln-pm-text" }, row.body),
		);

		const meta = h("div", { class: "kiln-pm-meta" });
		if (row.status === "failed" && row.outgoing) {
			const outgoing = row.outgoing;
			const retry = h(
				"button",
				{ class: "kiln-pm-link", type: "button" },
				"Retry",
			);
			retry.addEventListener("click", () => this.retry(outgoing));
			const discard = h(
				"button",
				{ class: "kiln-pm-link", type: "button" },
				"Discard",
			);
			discard.addEventListener("click", () => this.discard(outgoing));
			meta.append(
				h(
					"span",
					{ class: "kiln-pm-meta-alert" },
					row.error ?? "Couldn't send message",
				),
				retry,
				discard,
			);
		} else if (showMeta) {
			meta.append(
				h(
					"span",
					{},
					row.status === "sending"
						? "Sending…"
						: formatClock(new Date(row.createdAt)),
				),
			);
			if (mine && row.status === "pending")
				meta.append(h("span", {}, "Under review, not yet delivered"));
			if (mine && row.status === "declined")
				meta.append(
					h("span", { class: "kiln-pm-meta-alert" }, "Removed by moderators"),
				);
		}

		const message = row.message;
		if (!mine && message) {
			const reportBtn = h(
				"button",
				{ class: "kiln-pm-link kiln-pm-report-link", type: "button" },
				"Report",
			);
			reportBtn.addEventListener("click", () => {
				this.reporting = message;
				this.view = "report";
				this.renderPanel();
			});
			meta.append(reportBtn);
		}

		return h(
			"div",
			{
				class: `kiln-pm-row${mine ? " kiln-pm-row--mine" : ""}${joined ? " kiln-pm-row--grouped" : ""}`,
			},
			bubble,
			meta.childElementCount > 0 && meta,
		);
	}

	private onImageLoad(): void {
		const body = this.host.querySelector<HTMLElement>(".kiln-pm-body");
		if (body && this.view === "thread" && this.stuckToBottom)
			body.scrollTop = body.scrollHeight;
	}

	private renderReport(body: HTMLElement): void {
		const target = this.reporting;
		const thread = this.thread;
		if (!target || !thread) return;

		const reason = h("select", {
			class: "form-select form-select-sm",
			"aria-label": "Reason",
		});
		for (const [value, label] of Object.entries(REPORT_REASONS))
			reason.append(h("option", { value }, label));
		const details = h("textarea", {
			class: "form-control form-control-sm",
			rows: "3",
			maxlength: "500",
			placeholder: "Anything else the moderators should know? (optional)",
			"aria-label": "Details",
		});
		const status = h("div", { class: "kiln-pm-status", role: "status" });
		const submitBtn = h(
			"button",
			{ class: "btn btn-sm btn-danger", type: "button" },
			"Submit report",
		);
		const cancelBtn = h(
			"button",
			{ class: "btn btn-sm btn-secondary", type: "button" },
			"Cancel",
		);

		cancelBtn.addEventListener("click", () => {
			this.reporting = null;
			this.view = "thread";
			this.renderPanel();
			this.schedulePoll();
		});
		submitBtn.addEventListener("click", async () => {
			submitBtn.disabled = true;
			status.textContent = "";
			const result = await sendMessage("reportDirectMessage", {
				userId: this.userId,
				messageId: target.id,
				reason: reason.value as Extension.MessageReportReason,
				details: details.value.trim() || undefined,
			});
			if (!result.ok) {
				status.textContent = result.message;
				submitBtn.disabled = false;
				return;
			}
			status.textContent =
				"Thanks, your report was sent to the Kiln moderators.";
			cancelBtn.textContent = "Back";
		});

		body.append(
			h(
				"div",
				{ class: "kiln-pm-report" },
				h("div", {}, `Reporting a message from ${thread.username}:`),
				h(
					"div",
					{ class: "kiln-pm-bubble kiln-pm-bubble--theirs" },
					messageImage(target.imageAssetId, target.imageUrl, () => {}),
					target.body && h("div", { class: "kiln-pm-text" }, target.body),
				),
				h(
					"label",
					{ class: "form-label fw-bold mb-0" },
					"Why are you reporting this?",
				),
				reason,
				details,
				status,
				h(
					"div",
					{ class: "d-flex gap-2 justify-content-end" },
					cancelBtn,
					submitBtn,
				),
				h(
					"div",
					{ class: "kiln-pm-report-footnote" },
					"Reports include the last few messages of this conversation so moderators can see the context. You can also block this user.",
				),
			),
		);
	}
}

export async function initPrivateMessaging(
	userId: number,
	showDisclosures: boolean,
): Promise<void> {
	if (document.getElementById("kiln-private-messaging")) return;

	const session = await getApiSession(userId);
	if (session?.state !== "verified") return;
	if (await getKilnBan(userId)) return;

	const config = await getConfig();
	if (!getFlag(config.flags, "features.privateMessaging.enabled", false))
		return;

	if (!(await syncMessagingOptIn(userId, true))) return;

	await new MessagingWidget(userId, showDisclosures).start();
}
