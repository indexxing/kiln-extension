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
import type { Runtime } from "webextension-polyfill";
import z from "zod";
import { onMessage, sendMessage } from "@/utils/messaging";
import metadata from "@/utils/static/metadata.json";
import {
	DEFAULT_PLACE_THUMBNAILS,
	pullBulkKVCache,
	pullKVCache,
} from "@/utils/utilities";
import { fetchPlacesListing } from "./placesListing";
import {
	ApiDisabledError,
	ApiHttpError,
	checkRateLimit,
	fetchConfig,
	handle,
	resolveInjectableTabId,
	safeFetch,
	withApi,
	withAuthSession,
} from "./shared";

function renameInZip(
	buffer: ArrayBuffer,
	renames: Record<string, string>,
): ArrayBuffer {
	const bytes = new Uint8Array(buffer);
	const view = new DataView(buffer);

	let eocdOffset = -1;
	for (let i = bytes.length - 22; i >= 0; i--) {
		if (view.getUint32(i, true) === 0x06054b50) {
			eocdOffset = i;
			break;
		}
	}
	if (eocdOffset === -1) throw new Error("Not a valid ZIP file");

	const centralDirOffset = view.getUint32(eocdOffset + 16, true);
	const totalEntries = view.getUint16(eocdOffset + 10, true);

	const chunks: Uint8Array[] = [];
	const localHeaderOffsets: number[] = [];
	let writeOffset = 0;

	let cdOffset = centralDirOffset;
	for (let i = 0; i < totalEntries; i++) {
		if (view.getUint32(cdOffset, true) !== 0x02014b50)
			throw new Error("Bad central directory signature");

		const cdNameLen = view.getUint16(cdOffset + 28, true);
		const cdExtraLen = view.getUint16(cdOffset + 30, true);
		const cdCommentLen = view.getUint16(cdOffset + 32, true);
		const localOffset = view.getUint32(cdOffset + 42, true);
		const compressedSize = view.getUint32(cdOffset + 20, true);
		const entryName = new TextDecoder().decode(
			bytes.subarray(cdOffset + 46, cdOffset + 46 + cdNameLen),
		);

		console.log(
			`[renameInZip] entry: "${entryName}" compressedSize=${compressedSize}`,
		);

		cdOffset += 46 + cdNameLen + cdExtraLen + cdCommentLen;

		if (view.getUint32(localOffset, true) !== 0x04034b50)
			throw new Error("Bad local file header signature");

		const lhNameLen = view.getUint16(localOffset + 26, true);
		const lhExtraLen = view.getUint16(localOffset + 28, true);
		const lhFlags = view.getUint16(localOffset + 6, true);
		const hasDataDescriptor = (lhFlags & 0x0008) !== 0;

		const renamedTo = renames[entryName];
		const finalNameBytes =
			renamedTo !== undefined
				? new TextEncoder().encode(renamedTo)
				: new TextEncoder().encode(entryName);

		localHeaderOffsets.push(writeOffset);

		const lhFixed = new Uint8Array(30);
		lhFixed.set(bytes.subarray(localOffset, localOffset + 30));
		new DataView(lhFixed.buffer).setUint16(26, finalNameBytes.length, true);
		chunks.push(lhFixed);
		writeOffset += 30;

		chunks.push(finalNameBytes);
		writeOffset += finalNameBytes.length;

		const extra = bytes.subarray(
			localOffset + 30 + lhNameLen,
			localOffset + 30 + lhNameLen + lhExtraLen,
		);
		chunks.push(extra);
		writeOffset += lhExtraLen;

		const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
		const fileData = bytes.subarray(dataStart, dataStart + compressedSize);
		chunks.push(fileData);
		writeOffset += compressedSize;

		if (hasDataDescriptor) {
			const ddStart = dataStart + compressedSize;
			const hasSig = view.getUint32(ddStart, true) === 0x08074b50;
			const ddSize = hasSig ? 16 : 12;
			chunks.push(bytes.subarray(ddStart, ddStart + ddSize));
			writeOffset += ddSize;
		}
	}

	const newCdOffset = writeOffset;
	cdOffset = centralDirOffset;

	for (let i = 0; i < totalEntries; i++) {
		const cdNameLen = view.getUint16(cdOffset + 28, true);
		const cdExtraLen = view.getUint16(cdOffset + 30, true);
		const cdCommentLen = view.getUint16(cdOffset + 32, true);
		const entryName = new TextDecoder().decode(
			bytes.subarray(cdOffset + 46, cdOffset + 46 + cdNameLen),
		);
		const cdEntrySize = 46 + cdNameLen + cdExtraLen + cdCommentLen;

		const renamedTo = renames[entryName];
		const finalNameBytes =
			renamedTo !== undefined
				? new TextEncoder().encode(renamedTo)
				: new TextEncoder().encode(entryName);

		const cdFixed = new Uint8Array(46);
		cdFixed.set(bytes.subarray(cdOffset, cdOffset + 46));
		const cdView = new DataView(cdFixed.buffer);
		cdView.setUint16(28, finalNameBytes.length, true);
		cdView.setUint32(42, localHeaderOffsets[i], true);
		chunks.push(cdFixed);
		writeOffset += 46;

		chunks.push(finalNameBytes);
		writeOffset += finalNameBytes.length;

		const rest = bytes.subarray(
			cdOffset + 46 + cdNameLen,
			cdOffset + cdEntrySize,
		);
		chunks.push(rest);
		writeOffset += rest.length;

		cdOffset += cdEntrySize;
	}

	const newCdSize = writeOffset - newCdOffset;
	const eocd = new Uint8Array(22);
	eocd.set(bytes.subarray(eocdOffset, eocdOffset + 22));
	const eocdView = new DataView(eocd.buffer);
	eocdView.setUint32(16, newCdOffset, true);
	eocdView.setUint32(12, newCdSize, true);
	chunks.push(eocd);

	const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
	const out = new Uint8Array(totalSize);
	let pos = 0;
	for (const chunk of chunks) {
		out.set(chunk, pos);
		pos += chunk.length;
	}
	return out.buffer;
}

onMessage("getPlace", ({ data: id }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return pullKVCache(
			"places",
			String(id),
			() =>
				safeFetch(
					`${config.resolvedUrls.public}places/${id}`,
					Polytoria.PlaceApiSchema,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getPlaceGamepasses", ({ data: placeId }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return pullKVCache(
			"placeGamepasses",
			String(placeId),
			() =>
				safeFetch(
					`${config.resolvedUrls.public}places/${placeId}/gamepasses`,
					Polytoria.GamepassesApiSchema,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

function bufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

onMessage("downloadPlaceFile", async ({ data: id, sender }) => {
	checkRateLimit("internal_api", 100);
	const config = await fetchConfig();
	if (!config.apiAvailability.internal) throw new ApiDisabledError("internal");

	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) return;

	const injectionResults = await browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		args: [id],
		func: async (id: number) => {
			const getCookie = (name: string) => {
				const value = `; ${document.cookie}`;
				const parts = value.split(`; ${name}=`);
				if (parts.length === 2) return parts.pop()!.split(";").shift();
			};

			const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);
			const res = await fetch(`/api/places/edit`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-XSRF-TOKEN": xsrfToken,
				},
				body: JSON.stringify({ placeID: id }),
				credentials: "include",
			});
			const { token } = (await res.json()) as {
				success: boolean;
				token: string;
			};
			return token;
		},
	});

	const creatorToken = injectionResults[0]?.result;
	if (!creatorToken) throw new Error("Failed to retrieve creator token");

	const result = (await safeFetch(
		`${metadata.endpoints.public}places/get-place?id=${id}&tokenType=creator`,
		null,
		{
			headers: {
				Authorization: creatorToken as string,
			},
		},
		true,
	)) as Blob;

	const arrayBuffer = await result.arrayBuffer();
	const bytes4 = new Uint8Array(arrayBuffer, 0, 4);
	const isZip =
		bytes4[0] === 0x50 &&
		bytes4[1] === 0x4b &&
		bytes4[2] === 0x03 &&
		bytes4[3] === 0x04;

	let finalBuffer = arrayBuffer;
	let ext: string;

	if (isZip) {
		try {
			finalBuffer = renameInZip(arrayBuffer, {
				"meta.json": "project.ptproj",
				"index.json": "file-lock.json",
			});
		} catch (e) {
			console.error("ZIP rename failed:", e);
		}
		ext = "zip";
	} else {
		ext = "poly";
	}

	const base64 = bufferToBase64(finalBuffer);

	await browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		args: [base64, id, ext],
		func: (base64: string, id: number, ext: string) => {
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			const blob = new Blob([bytes], {
				type: "application/octet-stream",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${id}.${ext}`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		},
	});
});

onMessage("getModelFile", async ({ data: id }) => {
	checkRateLimit("public_api", 100);
	const config = await fetchConfig();
	if (!config.apiAvailability.public) throw new ApiDisabledError("public");

	const result = (await safeFetch(
		`${config.resolvedUrls.public}models/get-model?id=${id}`,
		null,
		{},
		true,
	)) as Blob;

	return await result.text();
});

onMessage("joinPlace", ({ data: { placeId, serverId, version }, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No active tab");

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [placeId, version, serverId ?? 0],
			func: async (placeID: number, version: 1 | 2, serverID?: number) => {
				const getCookie = (name: string) => {
					const value = `; ${document.cookie}`;
					const parts = value.split(`; ${name}=`);
					if (parts.length === 2) return parts.pop()!.split(";").shift();
				};

				const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);
				const result = await fetch("/api/places/join", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-XSRF-TOKEN": xsrfToken,
					},
					credentials: "include",
					body: JSON.stringify({
						placeID,
						serverID: serverID != 0 ? serverID : null,
						isBeta: version == 2,
					}),
				});

				const data = await result.json().catch(() => null);
				if (data?.token) {
					window.location.href = `polytoria://${version == 2 ? "clientbeta" : "client"}/${data.token}`;
					return true;
				}
				console.error("Join failed:", data);
				return false;
			},
		});

		const ok = results[0]?.result;
		if (!ok) throw new Error("Failed to join place");
		return true;
	}),
);

onMessage("openCreator", async ({ data: version, sender }) => {
	checkRateLimit("internal_api", 100);
	const config = await fetchConfig();
	if (!config.apiAvailability.internal) throw new ApiDisabledError("internal");

	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) return;

	await browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		args: [version],
		func: async (version: 1 | 2) => {
			const getCookie = (name: string) => {
				const value = `; ${document.cookie}`;
				const parts = value.split(`; ${name}=`);
				if (parts.length === 2) return parts.pop()!.split(";").shift();
			};

			const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);
			const res = await fetch(`/api/places/edit`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-XSRF-TOKEN": xsrfToken,
				},
				body: JSON.stringify({ placeID: null, isBeta: version == 2 }),
				credentials: "include",
			});
			const { token } = (await res.json()) as {
				success: boolean;
				token: string;
			};
			window.location.href = `polytoria://${version == 2 ? "creatorbeta" : "creator"}/${token}`;
			return token;
		},
	});
});

onMessage("bulkWhitelist", async ({ data: { placeId, usernames }, sender }) => {
	checkRateLimit("internal_api", 100);
	const config = await fetchConfig();
	if (!config.apiAvailability.internal) throw new ApiDisabledError("internal");

	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) return;

	await browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		args: [placeId, usernames],
		func: async (placeId: number, usernames: string[]) => {
			const getCookie = (name: string) => {
				const value = `; ${document.cookie}`;
				const parts = value.split(`; ${name}=`);
				if (parts.length === 2) return parts.pop()!.split(";").shift();
			};

			const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN")!);

			for (const username of usernames) {
				await fetch(`/api/create/whitelist`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-XSRF-TOKEN": xsrfToken,
					},
					body: JSON.stringify({ placeID: placeId, username }),
					credentials: "include",
				});
			}
		},
	});
});

const RANDOM_PLACE_SORTS = [
	"rating",
	"recommended",
	"trending",
	"topThisWeek",
	"updated",
] as const;
const RANDOM_PLACE_POOL_PAGES = 50;
const MAX_RANDOM_PLACE_PAGE_ATTEMPTS = 6;
const MAX_RANDOM_PLACE_CANDIDATES_PER_PAGE = 8;

function shuffle<T>(items: T[]): T[] {
	const shuffled = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

const MIN_PLACE_VISITS = 100;
const MAX_PLACE_VISITS = 100_000;
const MIN_PLACE_VOTES = 5;
const MIN_PLACE_LIKE_RATIO = 0.5;
const MIN_PLACE_AGE_MS = 24 * 60 * 60 * 1000;

function isLowQualityPlace(place: Polytoria.PlaceApi): boolean {
	if (place.updatedAt === null) return true;
	if (DEFAULT_PLACE_THUMBNAILS.includes(place.thumbnail)) return true;
	if (!place.description.trim()) return true;

	if (place.visits < MIN_PLACE_VISITS || place.visits > MAX_PLACE_VISITS)
		return true;

	const totalVotes = place.rating.likes + place.rating.dislikes;
	if (totalVotes < MIN_PLACE_VOTES) return true;
	if (place.rating.likes / totalVotes < MIN_PLACE_LIKE_RATIO) return true;

	if (!place.isActive) return true;
	if (place.accessType !== "everyone") return true;
	if (place.accessPrice !== null && place.accessPrice !== 0) return true;

	if (Date.now() - new Date(place.createdAt).getTime() < MIN_PLACE_AGE_MS)
		return true;

	return false;
}

onMessage("rollRandomPlace", ({ sender }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");

		const tabId = await resolveInjectableTabId(sender);

		const reportStatus = (status: string) => {
			if (tabId)
				sendMessage("rollRandomPlaceStatus", status, tabId).catch(() => {});
		};

		reportStatus("Finding a place...");

		let place: Polytoria.PlaceApi | undefined;
		for (
			let pageAttempt = 0;
			pageAttempt < MAX_RANDOM_PLACE_PAGE_ATTEMPTS && !place;
			pageAttempt++
		) {
			const sort =
				RANDOM_PLACE_SORTS[
					Math.floor(Math.random() * RANDOM_PLACE_SORTS.length)
				];
			const page = 1 + Math.floor(Math.random() * RANDOM_PLACE_POOL_PAGES);

			reportStatus("Browsing places...");
			const listing = await fetchPlacesListing(
				{
					page,
					search: "",
					genre: "all",
					sort,
					branch: "all",
				},
				sender,
			).catch(() => null);
			if (!listing?.data.length) continue;

			const candidates = shuffle(
				listing.data.filter(
					(entry) =>
						entry.rating !== null && !entry.iconUrl.includes("placeholders"),
				),
			).slice(0, MAX_RANDOM_PLACE_CANDIDATES_PER_PAGE);
			if (!candidates.length) continue;

			reportStatus(`Checking ${candidates.length} places...`);
			const fetched = await Promise.all(
				candidates.map((candidate) =>
					safeFetch(
						`${config.resolvedUrls.public}places/${candidate.id}`,
						Polytoria.PlaceApiSchema,
					).catch(() => null),
				),
			);

			place = fetched.find(
				(candidate): candidate is Polytoria.PlaceApi =>
					candidate !== null && !isLowQualityPlace(candidate),
			);
		}
		if (!place) {
			throw new Error("Couldn't find a random place, please try again");
		}

		reportStatus("Found one!");
		if (!tabId) return;

		browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [place],
			func: async (place: Polytoria.PlaceApi) => {
				const card = document.createElement("a");

				card.href = `/places/${place.id}`;
				card.style.textDecoration = "none";
				card.style.color = "inherit";
				card.style.display = "block";

				card.classList.add("mcard", "card", "place-card", "mx-auto");
				card.style.textAlign = "left";
				card.innerHTML = `
					<div class="card-body">
						<img src="${place.thumbnail}" class="place-card-image">
						<div class="flex-grow-1 mx-2 mx-lg-1">
							<div class="mt-2 mb-1 place-card-title"></div>
							<div class="place-card-details">
								<span class="text-muted mx-e">
									<i class="fas fa-user"></i>
									<span class="place-playing"></span>
								</span>
								<span class="mx-1">
									<i class="fas fa-thumbs-up"></i>
									<span class="place-rating"></span>
								</span>
							</div>
						</div>
					</div>
				`;

				card.querySelector(".place-card-title")!.textContent = place.name;
				card.querySelector(".place-playing")!.textContent = String(
					place.playing,
				);
				card.querySelector(".place-rating")!.textContent = String(
					place.rating.percent,
				);

				//@ts-expect-error
				window.Swal.fire({
					title: "The random place is...",
					html: card,
				});
			},
		});
	}),
);

onMessage(
	"getWorldStatsChart",
	({ data: { placeId, metric, start, stop, window: win = "2h" } }) =>
		handle(() =>
			pullKVCache(
				"worldStatsChart",
				`${placeId}-${metric}-${start}-${stop}-${win}`,
				() =>
					safeFetch(
						`https://polytrack.top/api/charts/world/${placeId}/stats?metric=${metric}&start=${encodeURIComponent(start)}&stop=${encodeURIComponent(stop)}&window=${win}`,
						PolyTrack.WorldStatsChartApiSchema,
					),
				60 * 1000,
				false,
			),
		),
);

onMessage(
	"getWorldIngameChart",
	({ data: { placeId, start, stop, window: win = "2h" } }) =>
		handle(() =>
			pullKVCache(
				"worldIngameChart",
				`${placeId}-${start}-${stop}-${win}`,
				() =>
					safeFetch(
						`https://polytrack.top/api/charts/world/${placeId}/ingame?start=${encodeURIComponent(start)}&stop=${encodeURIComponent(stop)}&window=${win}`,
						PolyTrack.WorldIngameChartApiSchema,
					),
				60 * 1000,
				false,
			),
		),
);

onMessage("getPlaceReviews", ({ data: { placeId, userId } }) =>
	handle(async () =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}places/reviews/${placeId}`,
				Extension.PlaceReviewsApi,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		),
	),
);

onMessage(
	"getPlaceReviewPlaytimes",
	({ data: { placeId, userId, reviewIds } }) =>
		handle(async () =>
			withAuthSession(userId, (token, config) =>
				safeFetch(
					`${config.resolvedUrls.extension}places/reviews/playtimes/${placeId}`,
					Extension.PlaceReviewPlaytimesApi,
					{
						method: "POST",
						body: JSON.stringify({ reviewIds }),
						headers: {
							Authorization: `Bearer ${token}`,
							"x-kiln-version": browser.runtime.getManifest().version,
						},
					},
				),
			),
		),
);

async function showReviewErrorAlert(
	message: string,
	sender?: Runtime.MessageSender,
) {
	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) return;

	await browser.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		args: [message],
		func: (message: string) => {
			//@ts-expect-error
			window.Swal.fire({
				icon: "error",
				title: "Couldn't submit review",
				text: message,
			});
		},
	});
}

onMessage(
	"submitPlaceReview",
	({ data: { placeId, userId, rating, body, anonymous }, sender }) =>
		handle(async () => {
			try {
				return await withAuthSession(userId, (token, config) =>
					safeFetch(
						`${config.resolvedUrls.extension}places/reviews/${placeId}/me`,
						Extension.PlaceReviewApi,
						{
							method: "PUT",
							body: JSON.stringify({
								rating,
								body: body ?? null,
								anonymous: anonymous ?? false,
							}),
							headers: {
								Authorization: `Bearer ${token}`,
								"x-kiln-version": browser.runtime.getManifest().version,
							},
						},
					),
				);
			} catch (err) {
				await showReviewErrorAlert(
					err instanceof ApiHttpError
						? err.message
						: "Something went wrong submitting your review.",
					sender,
				);
				throw err;
			}
		}),
);

onMessage("deleteMyPlaceReview", ({ data: { placeId, userId } }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}places/reviews/${placeId}/me`,
				null,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		),
	),
);

onMessage("submitReviewReply", ({ data: { userId, reviewId, body }, sender }) =>
	handle(async () => {
		try {
			return await withAuthSession(userId, (token, config) =>
				safeFetch(
					`${config.resolvedUrls.extension}places/reviews/${reviewId}/replies`,
					Extension.PlaceReviewReplyApi,
					{
						method: "POST",
						body: JSON.stringify({ body }),
						headers: {
							Authorization: `Bearer ${token}`,
							"x-kiln-version": browser.runtime.getManifest().version,
						},
					},
				),
			);
		} catch (err) {
			await showReviewErrorAlert(
				err instanceof ApiHttpError
					? err.message
					: "Something went wrong submitting your reply.",
				sender,
			);
			throw err;
		}
	}),
);

onMessage("deleteReviewReply", ({ data: { userId, replyId } }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}places/reviews/replies/${replyId}`,
				null,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		),
	),
);

onMessage("getMigratablePlaceReviews", ({ data: userId }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}places/reviews/mine`,
				Extension.MigratablePlaceReviewsApi,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		),
	),
);

onMessage("markPlaceReviewMigrated", ({ data: { userId, reviewId } }) =>
	handle(() =>
		withAuthSession(userId, (token, config) =>
			safeFetch(
				`${config.resolvedUrls.extension}places/reviews/${encodeURIComponent(reviewId)}/migrated`,
				Extension.MigratePlaceReviewApi,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"x-kiln-version": browser.runtime.getManifest().version,
					},
				},
			),
		),
	),
);

onMessage("createPolytoriaPlaceReview", ({ data, sender }) =>
	handle(async () => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) throw new Error("No active tab to post the review from");

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [data],
			func: async (data: {
				placeId: number;
				value: "like" | "dislike";
				content: string;
			}) => {
				const getCookie = (name: string) => {
					const value = `; ${document.cookie}`;
					const parts = value.split(`; ${name}=`);
					if (parts.length === 2) return parts.pop()!.split(";").shift();
				};

				const xsrfToken = decodeURIComponent(getCookie("XSRF-TOKEN") ?? "");

				try {
					const res = await fetch("/api/places/reviews/create", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-XSRF-TOKEN": xsrfToken,
							Accept: "application/json",
						},
						body: JSON.stringify({
							placeID: data.placeId,
							value: data.value,
							content: data.content,
						}),
						credentials: "include",
					});

					const raw = await res.text().catch(() => "");
					let json: {
						id?: string | number;
						message?: string;
						errors?: { message?: string }[];
					} | null = null;
					try {
						json = JSON.parse(raw);
					} catch {}

					if (!res.ok) {
						if (/already rated/i.test(raw)) {
							return {
								success: false as const,
								error:
									"Either you already made a review on this world yourself, or Polytoria thinks you did (it may be a phantom review on their end)",
							};
						}
						return {
							success: false as const,
							error:
								json?.message ??
								json?.errors?.[0]?.message ??
								`Polytoria returned ${res.status} ${res.statusText}`,
						};
					}

					return {
						success: true as const,
						id: json?.id != null ? String(json.id) : null,
					};
				} catch (err) {
					return {
						success: false as const,
						error: err instanceof Error ? err.message : String(err),
					};
				}
			},
		});

		const result = results[0]?.result as
			| { success: true; id: string | null }
			| { success: false; error: string }
			| undefined;
		if (!result?.success) {
			throw new Error(result?.error ?? "Failed to post review to Polytoria");
		}
		return { id: result.id };
	}),
);

onMessage("getTopReviewers", () =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"leaderboards",
			"top-reviewers",
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}places/leaderboards/top-reviewers`,
					Extension.TopReviewersApi,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getRatedWorldsLeaderboard", ({ data: order }) =>
	handle(async () => {
		const config = await withApi("kiln_api", "extension");
		return pullKVCache(
			"leaderboards",
			`rated-worlds-${order}`,
			() =>
				safeFetch(
					`${config.resolvedUrls.extension}places/leaderboards/rated-worlds?order=${order}`,
					Extension.RatedWorldsLeaderboardApi,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);

onMessage(
	"setNativeRankingsLoadingPaused",
	async ({ data: paused, sender }) => {
		const tabId = await resolveInjectableTabId(sender);
		if (tabId == null) return;

		await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [paused],
			func: (paused: boolean) => {
				const win = window as typeof window & {
					__kilnRankingsPaused?: boolean;
					__kilnRankingsPatched?: boolean;
				};

				if (!win.__kilnRankingsPatched) {
					//@ts-expect-error axios is a global injected by the page
					const pageAxios = window.axios;
					if (pageAxios?.get) {
						const originalGet = pageAxios.get.bind(pageAxios);
						pageAxios.get = (url: string, config?: unknown) => {
							if (
								win.__kilnRankingsPaused &&
								String(url).startsWith("/api/rankings")
							) {
								return Promise.resolve({
									data: { data: [], meta: { nextPageURL: null } },
								});
							}
							return originalGet(url, config);
						};
					}

					const nav = document.getElementById("ranking-category");
					nav?.addEventListener(
						"click",
						(e) => {
							const target = (e.target as HTMLElement).closest?.(
								"a[data-ranking-category]",
							) as HTMLElement | null;
							if (
								target &&
								!target.dataset.rankingCategory?.startsWith("kiln-")
							) {
								win.__kilnRankingsPaused = false;
							}
						},
						true,
					);

					win.__kilnRankingsPatched = true;
				}

				win.__kilnRankingsPaused = paused;
			},
		});
	},
);

onMessage("getWorldVersions", ({ data }) =>
	handle(async () => {
		const cached = await pullBulkKVCache(
			"worldVersions",
			data.map((x) => `world-${x}`),
			async (missingKeys) => {
				const missingIds = missingKeys.map((key) => key.replace(/^world-/, ""));
				const versions = await safeFetch(
					`https://polytrack.top/api/worlds/kiln/world-version`,
					z.record(z.string(), z.enum(["1.0", "2.0"]).nullable()),
					{
						method: "POST",
						body: JSON.stringify(missingIds),
					},
				);
				const result: Record<string, "1.0" | "2.0" | null> = {};
				for (const key of missingKeys) {
					result[key] = versions[key.replace(/^world-/, "")] ?? null;
				}
				return result;
			},
			60 * 1000,
			false,
		);

		const result: Record<string, "1.0" | "2.0" | null> = {};
		for (const id of data) result[id] = cached[`world-${id}`] ?? null;
		return result;
	}),
);
