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

import { Extension, PolyTrack, Polytoria } from "@kiln/schemas";
import z from "zod";
import { onMessage } from "@/utils/messaging";
import { getFlag, pullKVCache } from "@/utils/utilities";
import {
	ApiDisabledError,
	checkRateLimit,
	fetchConfig,
	handle,
	resolveInjectableTabId,
	safeFetch,
	withApi,
	withAuthSession,
} from "./shared";

onMessage("getUser", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return pullKVCache(
			"users",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.public}users/${userId}`,
					Polytoria.UserApiSchema,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("findUserByUsername", ({ data: username }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return pullKVCache(
			"userIDs",
			username,
			async () => {
				const resolution = await safeFetch(
					`${config.resolvedUrls.public}users/find?username=${encodeURIComponent(username)}`,
					Polytoria.FindUserByUsernameApiSchema,
				);
				if ("id" in resolution) return resolution.id as number;
				throw new Error("Failed to resolve user");
			},
			24 * 60 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getBestFriends", ({ data: userIds }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		const cacheKey = [...userIds].sort((a, b) => a - b).join(",");
		return pullKVCache(
			"bestFriends",
			cacheKey,
			async () => {
				const useProxy = getFlag(config.flags, "apis.usePublicApiProxy", false);

				if (!useProxy) {
					const res: Record<string, any> = {};
					for (const id of userIds) {
						res[id] = await safeFetch(
							`${config.resolvedUrls.public}users/${id}`,
							Polytoria.BatchApiSchema,
						);
					}
					return Object.values(res);
				}

				const res = await safeFetch(
					`${config.resolvedUrls.public}multiple-users?ids=${userIds.join(",")}`,
					z.array(Polytoria.UserApiSchema),
				);
				return Object.values(
					res.reduce((acc: Record<string, any>, user: any) => {
						if (user?.id) acc[user.id] = user;
						return acc;
					}, {}),
				);
			},
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage(
	"getUserInventory",
	({ data: { userId, limit, page, collectiblesOnly } }) =>
		handle(async () => {
			const config = await withApi("public_api", "public");
			const resolvedPage = page ?? 1;
			const cacheKey = `${userId}-${limit}-${resolvedPage}-${collectiblesOnly ?? false}`;
			return pullKVCache(
				"inventory",
				cacheKey,
				async () => {
					const BATCH_LIMIT = 100;
					const suffix = collectiblesOnly ? "&limited=true" : "";

					if (limit <= BATCH_LIMIT) {
						return safeFetch(
							`${config.resolvedUrls.public}users/${userId}/inventory?limit=${limit}&page=${resolvedPage}${suffix}`,
							Polytoria.InventoryApiSchema,
						);
					}

					const offset = (resolvedPage - 1) * limit;
					const skip = offset % BATCH_LIMIT;
					let batchPage = Math.floor(offset / BATCH_LIMIT) + 1;

					const finalResults = { inventory: [] as any[], pages: 0, total: 0 };

					while (finalResults.inventory.length < skip + limit) {
						const res = await safeFetch(
							`${config.resolvedUrls.public}users/${userId}/inventory?limit=${BATCH_LIMIT}&page=${batchPage}${suffix}`,
							Polytoria.InventoryApiSchema,
						);
						finalResults.inventory.push(...res.inventory);
						finalResults.pages = res.pages;
						finalResults.total = res.total;
						if (res.inventory.length < BATCH_LIMIT) break;
						batchPage++;
					}

					finalResults.inventory = finalResults.inventory.slice(
						skip,
						skip + limit,
					);

					return finalResults;
				},
				5 * 60 * 1000,
				false,
			);
		}),
);

onMessage("getOwnedAssetMap", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		const inventoryResult = await pullKVCache(
			"inventory",
			`${userId}-all`,
			async () => {
				const BATCH_LIMIT = 100;
				const firstPage = await safeFetch(
					`${config.resolvedUrls.public}users/${userId}/inventory?limit=${BATCH_LIMIT}&page=1`,
					Polytoria.InventoryApiSchema,
				);

				const finalResults = {
					inventory: [...firstPage.inventory],
					pages: firstPage.pages,
					total: firstPage.total,
				};

				for (let page = 2; page <= firstPage.pages; page++) {
					const res = await safeFetch(
						`${config.resolvedUrls.public}users/${userId}/inventory?limit=${BATCH_LIMIT}&page=${page}`,
						Polytoria.InventoryApiSchema,
					);
					finalResults.inventory.push(...res.inventory);
				}

				return finalResults;
			},
			5 * 60 * 1000,
			false,
		);

		return inventoryResult.inventory.reduce(
			(acc: any, inv: any) => {
				acc[inv.asset.id] ??= { isLimited: inv.asset.isLimited, serials: [] };
				if (inv.serial !== null) acc[inv.asset.id].serials.push(inv.serial);
				return acc;
			},
			{} as Record<number, { isLimited: boolean; serials: number[] }>,
		);
	}),
);

onMessage("getUserAvatar", ({ data: userId }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return pullKVCache(
			"avatars",
			String(userId),
			() =>
				safeFetch(
					`${config.resolvedUrls.public}users/${userId}/avatar`,
					Polytoria.AvatarApiSchema,
				),
			60 * 1000,
			false,
		);
	}),
);

onMessage("manageFriendRequests", ({ data: action, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) return;

		await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			func: async (action: "acceptAll" | "declineAll") => {
				const getCookie = (name: string) => {
					const value = `; ${document.cookie}`;
					const parts = value.split(`; ${name}=`);
					if (parts.length === 2) return parts.pop()!.split(";").shift();
				};

				const getXsrfToken = async () => {
					await fetch(window.location.href, { credentials: "include" });
					return decodeURIComponent(getCookie("XSRF-TOKEN")!);
				};

				const requests: { id: number; senderID: number }[] = [];
				let page = 1;

				while (true) {
					const res = await fetch(`/api/friends/requests?page=${page}`);
					const json = await res.json();

					requests.push(
						...json.data.map((r: { id: number; senderID: number }) => ({
							id: r.id,
							senderID: r.senderID,
						})),
					);

					if (json.meta.currentPage >= json.meta.lastPage) break;
					page++;
				}

				const endpoint =
					action === "acceptAll" ? "/api/friends/send" : "/api/friends/remove";

				let xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);

				await Promise.allSettled(
					requests.map(async (r) => {
						const res = await fetch(endpoint, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								"X-XSRF-Token": xsrfToken,
							},
							body: JSON.stringify({ userID: String(r.senderID) }),
						});

						const json = await res.json().catch(() => null);
						const isCsrfError = json?.errors?.some(
							(e: { code: string }) => e.code === "E_BAD_CSRF_TOKEN",
						);

						if (isCsrfError) {
							xsrfToken = await getXsrfToken();
							await fetch(endpoint, {
								method: "POST",
								headers: {
									"Content-Type": "application/json",
									"X-XSRF-Token": xsrfToken,
								},
								body: JSON.stringify({ userID: String(r.senderID) }),
							});
						}
					}),
				);

				window.location.reload();
			},
			args: [action],
		});
	}),
);

onMessage("acceptFriendRequest", ({ data: senderUserId, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No active tab");

		await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [senderUserId],
			func: async (senderUserId: number) => {
				const getCookie = (name: string) => {
					const value = `; ${document.cookie}`;
					const parts = value.split(`; ${name}=`);
					if (parts.length === 2) return parts.pop()!.split(";").shift();
				};
				const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);
				const res = await fetch("/api/friends/send", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-XSRF-Token": xsrfToken,
					},
					body: JSON.stringify({ userID: String(senderUserId) }),
					credentials: "include",
				});
				if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
			},
		});
	}),
);

onMessage("declineFriendRequest", ({ data: senderUserId, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No active tab");

		await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [senderUserId],
			func: async (senderUserId: number) => {
				const getCookie = (name: string) => {
					const value = `; ${document.cookie}`;
					const parts = value.split(`; ${name}=`);
					if (parts.length === 2) return parts.pop()!.split(";").shift();
				};
				const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);
				const res = await fetch("/api/friends/remove", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-XSRF-Token": xsrfToken,
					},
					body: JSON.stringify({ userID: String(senderUserId) }),
					credentials: "include",
				});
				if (!res.ok) throw new Error(`Decline failed: ${res.status}`);
			},
		});
	}),
);

onMessage("getProfileVersions", ({ data: userId }) =>
	handle(async () => {
		return pullKVCache(
			"profileVersions",
			String(userId),
			() =>
				safeFetch(
					`https://polytrack.top/users/${userId}?_data=routes%2Fusers.%24id`,
					PolyTrack.UserApiSchema,
				),
			60 * 1000,
			false,
		);
	}),
);

onMessage("getUserCreations", ({ data: { userId, page, limit } }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		const resolvedPage = page ?? 1;
		const resolvedLimit = limit ?? 12;
		return pullKVCache(
			"userCreations",
			`${userId}-${resolvedPage}-${resolvedLimit}`,
			() =>
				safeFetch(
					`${config.resolvedUrls.public}users/${userId}/store?page=${resolvedPage}&limit=${resolvedLimit}`,
					Polytoria.UserCreationsApiSchema,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("updateBodyColor", async ({ data: { bodyPart, color }, sender }) => {
	checkRateLimit("internal_api", 100);
	const config = await fetchConfig();
	if (!config.apiAvailability.internal) throw new ApiDisabledError("internal");

	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) return;

	await browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		args: [bodyPart, color],
		func: async (bodyPart: string, color: string) => {
			const getCookie = (name: string) => {
				const value = `; ${document.cookie}`;
				const parts = value.split(`; ${name}=`);
				if (parts.length === 2) return parts.pop()!.split(";").shift();
			};

			const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);

			await fetch(`/api/avatar/paint`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-XSRF-TOKEN": xsrfToken,
				},
				body: JSON.stringify({
					bodyPart,
					color,
					ignoreRender: true,
				}),
				credentials: "include",
			});
		},
	});
});

onMessage("updateOutfit", ({ data: { id, name }, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) return;

		await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [id, name],
			func: async (outfitId: number, outfitName: string) => {
				const getCookie = (name: string) => {
					const value = `; ${document.cookie}`;
					const parts = value.split(`; ${name}=`);
					if (parts.length === 2) return parts.pop()!.split(";").shift();
				};

				const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);

				const createResponse = await fetch(
					"https://polytoria.com/api/avatar/outfits/create",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-XSRF-TOKEN": xsrfToken,
						},
						body: JSON.stringify({ name: outfitName }),
						credentials: "include",
					},
				);
				if (!createResponse.ok) {
					throw new Error("Failed to create outfit");
				}

				const deleteResponse = await fetch(`/api/avatar/outfits/delete`, {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
						"X-XSRF-TOKEN": xsrfToken,
					},
					body: JSON.stringify({ id: outfitId }),
				});
				if (!deleteResponse.ok) {
					throw new Error("Failed to delete old outfit");
				}
			},
		});
	}),
);

onMessage("changeUserAlias", ({ data: { userId, currentAlias }, sender }) => {
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) return;

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [currentAlias ?? null],
			func: async (currentAlias: string) => {
				// @ts-expect-error
				const { value, isConfirmed } = await window.Swal.fire({
					title: "Change alias",
					input: "text",
					inputLabel: "New alias",
					inputValue: currentAlias ?? "",
					inputPlaceholder: "Enter alias...",
					showCancelButton: true,
					confirmButtonText: "Save",
				});

				if (!isConfirmed) return null;
				return value as string;
			},
		});

		const newAlias = results[0]?.result;
		if (newAlias === null || newAlias === undefined) return;
		if (typeof newAlias !== "string") return;

		const aliases = await _userAliases.getValue();
		aliases[userId] = newAlias;
		await _userAliases.setValue(aliases);

		await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [newAlias],
			func: (newAlias: string) => {
				// @ts-expect-error
				window.Swal.fire({
					icon: "success",
					title: "Alias changed!",
					text: newAlias || "Alias removed",
					timer: 3000,
					timerProgressBar: true,
					showConfirmButton: false,
					toast: true,
					position: "bottom-end",
				});
			},
		});
	});
});

onMessage("getAvatarOutfits", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/outfits`,
				Extension.AvatarOutfitsApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);

onMessage("createAvatarOutfit", ({ data: { userId, name, avatarData } }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/outfits`,
				Extension.AvatarOutfitApi,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name, data: avatarData }),
				},
			),
		),
	),
);

onMessage(
	"updateAvatarOutfit",
	({ data: { userId, outfitId, name, avatarData } }) =>
		handle(() =>
			withAuthSession(userId, (token, config) =>
				safeFetch(
					`${config.resolvedUrls.extension}users/${userId}/outfits/${outfitId}`,
					Extension.AvatarOutfitApi,
					{
						method: "PATCH",
						headers: {
							Authorization: `Bearer ${token}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ name, data: avatarData }),
					},
				),
			),
		),
);

onMessage("deleteAvatarOutfit", ({ data: { userId, outfitId } }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/outfits/${outfitId}`,
				null,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${token}` },
				},
			),
		),
	),
);

onMessage("exportUserData", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}users/${userId}/export`,
				Extension.DataExportApi,
				{ headers: { Authorization: `Bearer ${token}` } },
			),
		),
	),
);

onMessage("getUserCharts", ({ data: userId }) =>
	handle(async () => {
		return pullKVCache(
			"userCharts",
			String(userId),
			() =>
				safeFetch(
					`https://polytrack.top/api/charts/user/${userId}/range?metric=allranks&start=${new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()}&stop=${new Date().toISOString()}&window=raw`,
					PolyTrack.UserChartsApiSchema,
				),
			60 * 1000,
			false,
		);
	}),
);
