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

import { Extension, Polytoria } from "@kiln/schemas";
import z from "zod";
import { onMessage } from "@/utils/messaging";
import {
	expireKVCache,
	getFlag,
	pullBulkKVCache,
	pullCache,
	pullKVCache,
} from "@/utils/utilities";
import {
	handle,
	resolveInjectableTabId,
	safeFetch,
	withApi,
	withAuthSession,
} from "./shared";

onMessage("getRetroItems", ({ data: page = 1 }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return safeFetch(
			`${config.resolvedUrls.extension}items/retro?page=${page}`,
			Extension.RetroItemsApi,
		);
	}),
);

onMessage("getEventForItem", ({ data: itemId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"eventForItem",
			String(itemId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}events/by-item/${itemId}`,
					Extension.EventForItemApi,
				),
			24 * 60 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getEvents", () =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullCache(
			"eventsList",
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}events`,
					Extension.EventsListApi,
				),
			24 * 60 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getEventItems", ({ data: eventId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"eventItems",
			String(eventId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}events/${eventId}/items`,
					Extension.EventItemsApi,
				),
			24 * 60 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getGreatDivideStats", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("extension_api", "extension");
		return pullKVCache(
			"greatDivideStats",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}events/tgd/${userId}`,
					Extension.GreatDivideStatsApi,
				),
			6 * 60 * 60 * 1000,
			false,
		);
	}),
);

onMessage("checkUserActivity", ({ data: { userIds, days } }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullBulkKVCache(
			`userActivity_${days}`,
			userIds.map(String),
			async (missing) => {
				const response = await safeFetch(
					`${config.resolvedUrls.extension}activity`,
					z.object({
						data: z.record(
							z.string(),
							z.object({
								active: z.boolean(),
								registeredAt: z.string().nullable(),
							}),
						),
					}),
					{
						method: "POST",
						body: JSON.stringify({ userIds: missing.map(Number), days }),
					},
				);
				return response.data;
			},
			60 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getAvatarHashes", ({ data: userIds }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		const response = await safeFetch(
			`${config.resolvedUrls.extension}activity/avatars`,
			Extension.AvatarHashesApi,
			{
				method: "POST",
				body: JSON.stringify({ userIds }),
			},
		);
		return response.data;
	}),
);

onMessage("showSecurityKeyRenamePrompt", ({ data: { currentName }, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) return null;

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [currentName],
			func: async (currentName: string) => {
				// @ts-expect-error
				const { value, isConfirmed } = await window.Swal.fire({
					title: "Rename Security Key",
					input: "text",
					inputLabel: "New name",
					inputValue: currentName,
					inputPlaceholder: "Enter new name...",
					showCancelButton: true,
					confirmButtonText: "Save",
				});
				if (!isConfirmed || !value?.trim()) return null;
				const newName = value.trim();
				// @ts-expect-error
				window.Swal.fire({
					icon: "success",
					title: "Security key renamed!",
					text: newName,
					timer: 3000,
					timerProgressBar: true,
					showConfirmButton: false,
					toast: true,
					position: "bottom-end",
				});
				return newName;
			},
		});

		return (results[0]?.result as string | null) ?? null;
	}),
);

function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;

		const cleanup = () => {
			browser.tabs.onUpdated.removeListener(updateListener);
			browser.tabs.onRemoved.removeListener(removeListener);
			clearTimeout(timer);
		};

		const updateListener = (
			updatedTabId: number,
			changeInfo: { status?: string },
		) => {
			if (settled || updatedTabId !== tabId || changeInfo.status !== "complete")
				return;
			settled = true;
			cleanup();
			resolve();
		};

		const removeListener = (removedTabId: number) => {
			if (settled || removedTabId !== tabId) return;
			settled = true;
			cleanup();
			reject(new Error("Tab was closed before it finished loading"));
		};

		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(new Error("Timed out waiting for tab to load"));
		}, timeoutMs);

		browser.tabs.onUpdated.addListener(updateListener);
		browser.tabs.onRemoved.addListener(removeListener);
	});
}

onMessage("showBannedUserAlert", ({ data: user, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No injectable tab found");

		const loadPromise = waitForTabLoad(tabId);
		await browser.tabs.update(tabId, { url: "https://polytoria.com/home" });
		await loadPromise;

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [user],
			func: async (user: {
				userId: number;
				username: string;
				thumbnailUrl: string | null;
				isStaff: boolean;
				userRoleClass: string | null;
				registeredAt: string;
				lastSeenAt: string;
			}) => {
				const escapeHtml = (value: unknown) => {
					const div = document.createElement("div");
					div.textContent = String(value ?? "");
					return div.innerHTML;
				};

				const safeHttpsUrl = (value: unknown) => {
					const url = String(value ?? "").trim();
					return /^https:\/\//i.test(url) ? url : "";
				};

				const formatDate = (iso: string) =>
					new Date(iso).toLocaleDateString(undefined, {
						year: "numeric",
						month: "short",
						day: "numeric",
					});

				const thumbnailUrl = safeHttpsUrl(user.thumbnailUrl);
				const bodyHtml = `
					<p>This profile leads nowhere, but Kiln's search index still has a record of this exact username, which usually means the account has been permanently banned.</p>
					<div class="card">
						<div class="card-body">
							${
								thumbnailUrl
									? `<img src="${escapeHtml(thumbnailUrl)}" style="width: 48px; height: 48px; border-radius: 6px;">`
									: ""
							}
							<p class="mb-2 text-strong">${escapeHtml(user.username)}</p>
							<small class="d-block">User ID: ${escapeHtml(user.userId)}</small>
							<small class="d-block">Registered: ${escapeHtml(formatDate(user.registeredAt))}</small>
							<small class="d-block">Last seen: ${escapeHtml(formatDate(user.lastSeenAt))}</small>
						</div>
					</div>
				`;

				try {
					// @ts-expect-error
					if (window.Swal?.fire) {
						// @ts-expect-error
						await window.Swal.fire({
							icon: "error",
							title: "User Banned",
							html: bodyHtml,
							confirmButtonText: "Got it",
							allowOutsideClick: false,
						});
						return;
					}
				} catch (err) {
					console.warn(
						"[Kiln] Swal alert failed, falling back to manual modal:",
						err,
					);
				}

				await new Promise<void>((resolve) => {
					const overlay = document.createElement("div");
					overlay.style.cssText =
						"position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:sans-serif;";

					const modal = document.createElement("div");
					modal.style.cssText =
						"background:#1e1e1e;color:#fff;padding:24px;border-radius:8px;max-width:400px;width:90%;text-align:center;";
					modal.innerHTML = `<h2 style="margin-top:0;color:#dc3545;">User Banned</h2>${bodyHtml}`;

					const button = document.createElement("button");
					button.textContent = "Got it";
					button.style.cssText =
						"margin-top:16px;padding:8px 16px;border:none;border-radius:4px;background:#0d6efd;color:#fff;cursor:pointer;";
					button.onclick = () => {
						overlay.remove();
						resolve();
					};

					modal.appendChild(button);
					overlay.appendChild(modal);
					document.body.appendChild(overlay);
				});
			},
		});

		if (results[0]?.error) throw results[0].error;
	}),
);

onMessage("showHomepageReorderModal", ({ data: { sections }, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) return null;

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [sections],
			func: async (
				sections: Array<{
					id: string;
					label: string;
					locked?: boolean;
					group?: string;
				}>,
			) => {
				// @ts-expect-error
				const Swal = window.Swal;

				const { value, isDenied } = await Swal.fire({
					title: "Reorder Homepage",
					html: '<div id="kiln-reorder-root" style="text-align: left;"></div>',
					showCancelButton: true,
					showDenyButton: true,
					confirmButtonText: "Save",
					denyButtonText: "Reset to Default",
					cancelButtonText: "Cancel",
					width: 500,
					didOpen: () => {
						const root = document.getElementById(
							"kiln-reorder-root",
						) as HTMLElement;

						let list: HTMLElement;

						const flip = (el: HTMLElement, firstRect: DOMRect) => {
							const lastRect = el.getBoundingClientRect();
							const dy = firstRect.top - lastRect.top;
							if (!dy) return;

							el.style.transition = "none";
							el.style.transform = `translateY(${dy}px)`;
							el.getBoundingClientRect();
							requestAnimationFrame(() => {
								el.style.transition = "transform 150ms ease";
								el.style.transform = "";
							});
						};

						let dragEl: HTMLElement | null = null;
						let placeholder: HTMLElement | null = null;
						let grabOffsetX = 0;
						let grabOffsetY = 0;

						const onPointerMove = (e: PointerEvent) => {
							if (!dragEl || !placeholder) return;
							dragEl.style.left = `${e.clientX - grabOffsetX}px`;
							dragEl.style.top = `${e.clientY - grabOffsetY}px`;

							const dragRect = dragEl.getBoundingClientRect();
							const dragMiddle = dragRect.top + dragRect.height / 2;
							const siblings = Array.from(list.children) as HTMLElement[];
							const placeholderIndex = siblings.indexOf(placeholder);

							for (let i = 0; i < siblings.length; i++) {
								const sib = siblings[i];
								if (sib === placeholder || sib.dataset.locked === "true")
									continue;

								const rect = sib.getBoundingClientRect();
								const middle = rect.top + rect.height / 2;

								if (i < placeholderIndex && dragMiddle < middle) {
									const first = sib.getBoundingClientRect();
									list.insertBefore(placeholder, sib);
									flip(sib, first);
									break;
								}
								if (i > placeholderIndex && dragMiddle > middle) {
									const first = sib.getBoundingClientRect();
									list.insertBefore(placeholder, sib.nextElementSibling);
									flip(sib, first);
									break;
								}
							}
						};

						const onPointerUp = () => {
							document.removeEventListener("pointermove", onPointerMove);
							document.removeEventListener("pointerup", onPointerUp);
							document.body.style.userSelect = "";
							if (!dragEl || !placeholder) return;

							const finalRect = placeholder.getBoundingClientRect();
							const finishedDragEl = dragEl;
							const finishedPlaceholder = placeholder;
							const finishedList = list;
							dragEl = null;
							placeholder = null;

							finishedDragEl.style.transition =
								"left 150ms ease, top 150ms ease, box-shadow 150ms ease";
							finishedDragEl.style.left = `${finalRect.left}px`;
							finishedDragEl.style.top = `${finalRect.top}px`;
							finishedDragEl.style.boxShadow = "none";

							const cleanup = () => {
								finishedList.insertBefore(finishedDragEl, finishedPlaceholder);
								finishedPlaceholder.remove();
								finishedDragEl.style.cssText = "";
								finishedDragEl.classList.remove("kiln-reorder-dragging");
							};
							finishedDragEl.addEventListener("transitionend", cleanup, {
								once: true,
							});
							setTimeout(cleanup, 200);
						};

						const startDrag = (e: PointerEvent, row: HTMLElement) => {
							e.preventDefault();

							list = row.parentElement as HTMLElement;
							const rect = row.getBoundingClientRect();
							grabOffsetX = e.clientX - rect.left;
							grabOffsetY = e.clientY - rect.top;

							placeholder = document.createElement("div");
							placeholder.style.height = `${rect.height}px`;
							const cs = getComputedStyle(row);
							placeholder.style.marginTop = cs.marginTop;
							placeholder.style.marginBottom = cs.marginBottom;
							placeholder.style.border = "2px dashed rgba(255, 255, 255, 0.25)";
							placeholder.style.borderRadius = cs.borderRadius;
							placeholder.style.boxSizing = "border-box";
							list.insertBefore(placeholder, row);

							document.body.appendChild(row);
							Object.assign(row.style, {
								position: "fixed",
								zIndex: "100000",
								width: `${rect.width}px`,
								left: `${rect.left}px`,
								top: `${rect.top}px`,
								margin: "0",
								pointerEvents: "none",
								boxShadow: "0 10px 25px rgba(0, 0, 0, 0.4)",
							});
							row.classList.add("kiln-reorder-dragging");

							dragEl = row;
							document.body.style.userSelect = "none";
							document.addEventListener("pointermove", onPointerMove);
							document.addEventListener("pointerup", onPointerUp);
						};

						const groupNames = [...new Set(sections.map((s) => s.group ?? ""))];
						const lists = new Map<string, HTMLElement>();
						for (const name of groupNames) {
							if (groupNames.length > 1) {
								const heading = document.createElement("div");
								heading.className = "small text-muted fw-semibold mb-2 mt-3";
								heading.textContent = name;
								root.appendChild(heading);
							}
							const groupList = document.createElement("div");
							root.appendChild(groupList);
							lists.set(name, groupList);
						}

						for (const section of sections) {
							const row = document.createElement("div");
							row.className =
								"d-flex align-items-center gap-2 mb-2 p-2 rounded bg-dark border border-secondary";
							if (section.locked) row.classList.add("opacity-50");
							row.dataset.id = section.id;
							if (section.locked) row.dataset.locked = "true";
							row.innerHTML = section.locked
								? `
								<i class="fas fa-lock text-muted" style="width: 1em;"></i>
								<span class="flex-grow-1">${section.label}</span>
								<button type="button" class="btn btn-sm btn-outline-secondary" disabled><i class="fas fa-chevron-up"></i></button>
								<button type="button" class="btn btn-sm btn-outline-secondary" disabled><i class="fas fa-chevron-down"></i></button>
							`
								: `
								<i class="fas fa-grip-vertical text-muted kiln-reorder-handle" style="cursor: grab; touch-action: none;"></i>
								<span class="flex-grow-1">${section.label}</span>
								<button type="button" class="btn btn-sm btn-outline-secondary" data-dir="up"><i class="fas fa-chevron-up"></i></button>
								<button type="button" class="btn btn-sm btn-outline-secondary" data-dir="down"><i class="fas fa-chevron-down"></i></button>
							`;
							lists.get(section.group ?? "")!.appendChild(row);

							if (section.locked) continue;

							row
								.querySelector('[data-dir="up"]')!
								.addEventListener("click", () => {
									const prev = row.previousElementSibling as HTMLElement | null;
									if (!prev) return;
									const firstRow = row.getBoundingClientRect();
									const firstPrev = prev.getBoundingClientRect();
									row.parentElement!.insertBefore(row, prev);
									flip(row, firstRow);
									flip(prev, firstPrev);
								});
							row
								.querySelector('[data-dir="down"]')!
								.addEventListener("click", () => {
									const next = row.nextElementSibling as HTMLElement | null;
									if (!next || next.dataset.locked === "true") return;
									const firstRow = row.getBoundingClientRect();
									const firstNext = next.getBoundingClientRect();
									row.parentElement!.insertBefore(next, row);
									flip(row, firstRow);
									flip(next, firstNext);
								});

							row
								.querySelector<HTMLElement>(".kiln-reorder-handle")!
								.addEventListener("pointerdown", (e) => startDrag(e, row));
						}
					},
					preConfirm: () => {
						const root = document.getElementById(
							"kiln-reorder-root",
						) as HTMLElement;
						return Array.from(
							root.querySelectorAll<HTMLElement>("[data-id]"),
						).map((el) => el.dataset.id as string);
					},
				});

				if (isDenied) return [];
				return value ?? null;
			},
		});

		return (results[0]?.result as string[] | null) ?? null;
	}),
);

onMessage("searchUsersByActivity", ({ data: query }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		const response = await safeFetch(
			`${config.resolvedUrls.extension}activity/search?q=${encodeURIComponent(query)}`,
			Extension.ActivitySearchApi,
		);
		return response.data;
	}),
);

onMessage("getNFTItems", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("extension_api", "extension");
		return pullKVCache(
			"nftItems",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}users/${userId}/nfts`,
					Extension.NFTItems,
				),
			6 * 60 * 60 * 1000,
			false,
		);
	}),
);

onMessage("markItemAsNFT", ({ data: { userId, itemId, serials } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}items/${itemId}/nft`,
				z.object({ success: z.boolean() }),
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
					body: JSON.stringify({ serials }),
				},
			),
		);
		expireKVCache("nftItems", String(userId));
		return result;
	}),
);

onMessage("unmarkItemAsNFT", ({ data: { userId, itemId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}items/${itemId}/nft`,
				z.object({ success: z.boolean() }),
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("nftItems", String(userId));
		return result;
	}),
);

onMessage("getNLFItems", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("extension_api", "extension");
		return pullKVCache(
			"nlfItems",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}users/${userId}/nlfs`,
					Extension.NLFItems,
				),
			6 * 60 * 60 * 1000,
			false,
		);
	}),
);

onMessage("markItemAsNLF", ({ data: { userId, itemId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}items/${itemId}/nlf`,
				z.object({ success: z.boolean() }),
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("nlfItems", String(userId));
		return result;
	}),
);

onMessage("unmarkItemAsNLF", ({ data: { userId, itemId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}items/${itemId}/nlf`,
				z.object({ success: z.boolean() }),
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("nlfItems", String(userId));
		return result;
	}),
);

onMessage("getPinnedAchievements", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"pinnedAchievements",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}users/${userId}/pinned-achievements`,
					Extension.PinnedAchievementsApi,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("pinAchievement", ({ data: { userId, achievementId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/pinned-achievements/${achievementId}`,
				null,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("pinnedAchievements", String(userId));
		return result as null;
	}),
);

onMessage("unpinAchievement", ({ data: { userId, achievementId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/pinned-achievements/${achievementId}`,
				null,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("pinnedAchievements", String(userId));
		return result as null;
	}),
);

onMessage("getLikeCount", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"userLikeCount",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}users/${userId}/likes`,
					Extension.LikeCountApi,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getKilnUsage", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"userKilnUsage",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}users/${userId}/kiln-usage`,
					Extension.KilnUsageApi,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getUserTimezone", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"userTimezone",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}users/${userId}/timezone`,
					Extension.UserTimezoneApi,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("setUserTimezone", ({ data: { userId, timezone } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/timezone`,
				z.object({ success: z.boolean() }),
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
					body: JSON.stringify({ timezone }),
				},
			),
		);
		expireKVCache("userTimezone", String(userId));
		return result;
	}),
);

onMessage("clearUserTimezone", ({ data: userId }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/timezone`,
				z.object({ success: z.boolean() }),
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("userTimezone", String(userId));
		return result;
	}),
);

onMessage("getPublicOutfits", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"publicOutfits",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}users/${userId}/public-outfits`,
					Extension.PublicOutfitsApi,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("syncPublicOutfits", ({ data: { userId, outfits } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/public-outfits`,
				z.object({ success: z.boolean() }),
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
					body: JSON.stringify({ outfits }),
				},
			),
		);
		expireKVCache("publicOutfits", String(userId));
		return result;
	}),
);

onMessage("clearPublicOutfits", ({ data: userId }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/public-outfits`,
				z.object({ success: z.boolean() }),
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("publicOutfits", String(userId));
		return result;
	}),
);

onMessage("getLikeStatus", ({ data: { userId, targetUserId } }) =>
	handle(async () =>
		pullKVCache(
			"likeStatus",
			`${userId}_${targetUserId}`,
			() =>
				withAuthSession(userId, (token, config) =>
					safeFetch(
						`${config.resolvedUrls.extension}users/${userId}/likes/${targetUserId}`,
						Extension.LikeStatusApi,
						{
							headers: {
								Authorization: `Bearer ${token}`,
								"x-kiln-version": browser.runtime.getManifest().version,
							},
						},
					),
				),
			5 * 60 * 1000,
			false,
		),
	),
);

onMessage("likeUser", ({ data: { userId, targetUserId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/likes/${targetUserId}`,
				z.object({ success: z.boolean() }),
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("likeStatus", `${userId}_${targetUserId}`);
		expireKVCache("userLikeCount", String(targetUserId));
		return result;
	}),
);

onMessage("unlikeUser", ({ data: { userId, targetUserId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/likes/${targetUserId}`,
				z.object({ success: z.boolean() }),
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("likeStatus", `${userId}_${targetUserId}`);
		expireKVCache("userLikeCount", String(targetUserId));
		return result;
	}),
);

onMessage("getBlockedTraders", ({ data: userId }) =>
	handle(async () =>
		pullKVCache(
			"blockedTraders",
			String(userId),
			() =>
				withAuthSession(userId, (token, config) =>
					safeFetch(
						`${config.resolvedUrls.extension}users/${userId}/blocked-traders`,
						Extension.BlockedTraders,
						{
							headers: {
								Authorization: `Bearer ${token}`,
								"x-kiln-version": browser.runtime.getManifest().version,
							},
						},
					),
				),
			6 * 60 * 60 * 1000,
			false,
		),
	),
);

onMessage("blockTrader", ({ data: { userId, blockedUserId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/blocked-traders/${blockedUserId}`,
				z.object({ success: z.boolean() }),
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("blockedTraders", String(userId));
		return result;
	}),
);

onMessage("unblockTrader", ({ data: { userId, blockedUserId } }) =>
	handle(async () => {
		const result = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/blocked-traders/${blockedUserId}`,
				z.object({ success: z.boolean() }),
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);
		expireKVCache("blockedTraders", String(userId));
		return result;
	}),
);

onMessage("resolveItemThumbnails", ({ data: hashes }) =>
	handle(async () => {
		const config = await withApi("extension_api", "extension");
		const data = await pullBulkKVCache<number | null>(
			"itemThumbnails",
			hashes,
			(missing) =>
				safeFetch(
					`${config.resolvedUrls.extension}items/resolve-thumbnails`,
					Extension.ItemThumbnailMap,
					{
						method: "POST",
						body: JSON.stringify({ hashes: missing }),
					},
				).then((r) => r.data),
			24 * 60 * 60 * 1000,
			false,
		);
		return { data };
	}),
);

onMessage("getFavoritedPlaces", ({ data: userId }) =>
	handle(async () => {
		const idsResult = await withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}places/favorites`,
				Extension.FavoritedPlaceIdsApi,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		);

		const publicConfig = await withApi("public_api", "public");
		const useProxy = getFlag(
			publicConfig.flags,
			"apis.usePublicApiProxy",
			false,
		);
		const placeIds = idsResult.data;

		if (!useProxy) {
			const res: Record<string, any> = {};
			for (const id of placeIds) {
				res[id] = await pullKVCache(
					"places",
					String(id),
					() =>
						safeFetch(
							`${publicConfig.resolvedUrls.public}places/${id}`,
							Polytoria.PlaceApiSchema,
						),
					5 * 60 * 1000,
					false,
				);
			}
			return Object.values(res);
		}

		return safeFetch(
			`${publicConfig.resolvedUrls.public}multiple-places?ids=${placeIds.join(",")}`,
			z.array(Polytoria.PlaceApiSchema),
		);
	}),
);

onMessage("favoritePlace", ({ data: { placeId, userId } }) =>
	handle(() =>
		withAuthSession(userId, async (token, config) => {
			await safeFetch(
				`${config.resolvedUrls.extension}places/favorites/${placeId}`,
				null,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			);
			return null;
		}),
	),
);

onMessage("unfavoritePlace", ({ data: { placeId, userId } }) =>
	handle(() =>
		withAuthSession(userId, async (token, config) => {
			await safeFetch(
				`${config.resolvedUrls.extension}places/favorites/${placeId}`,
				null,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			);
			return null;
		}),
	),
);
