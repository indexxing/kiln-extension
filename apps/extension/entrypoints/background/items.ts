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

import { Polytoria } from "@kiln/schemas";
import { POLYTORIA_CDN_URL } from "@/utils/decal";
import { onMessage } from "@/utils/messaging";
import { pullKVCache } from "@/utils/utilities";
import { handle, safeFetch, withApi } from "./shared";

onMessage("getStore", ({ data: params }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		const query = new URLSearchParams();
		if (params.order !== undefined) query.set("order", params.order);
		if (params.sort !== undefined) query.set("sort", params.sort);
		if (params.showOffsale !== undefined)
			query.set("showOffsale", String(params.showOffsale));
		for (const type of params.types || []) query.append("types[]", type);
		if (params.search !== undefined) query.set("search", params.search);
		query.set("page", String(params.page || 1));
		if (params.limit !== undefined) query.set("limit", String(params.limit));

		return safeFetch(
			`${config.resolvedUrls.public}store/?${query.toString()}`,
			Polytoria.StoreApiSchema,
		);
	}),
);

onMessage("getItem", ({ data: id }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return pullKVCache(
			"items",
			String(id),
			() =>
				safeFetch(
					`${config.resolvedUrls.public}store/${id}`,
					Polytoria.ItemApiSchema,
				),
			10 * 60 * 1000,
			false,
		);
	}),
);

onMessage("getItemMesh", ({ data: id }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return safeFetch(
			`${config.resolvedUrls.public}assets/serve-mesh/${id}`,
			Polytoria.MeshApiSchema,
		);
	}),
);

onMessage("getItemTexture", ({ data: id }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return safeFetch(
			`${config.resolvedUrls.public}assets/serve/${id}/Asset`,
			Polytoria.MeshApiSchema,
		);
	}),
);

const MAX_CDN_IMAGE_BYTES = 5 * 1024 * 1024;

onMessage("fetchCdnImageDataUrl", ({ data: url }) =>
	handle(async () => {
		if (!POLYTORIA_CDN_URL.test(url)) throw new Error("Not a Polytoria image");
		const response = await fetch(url);
		if (!response.ok)
			throw new Error(`Image request failed (${response.status})`);
		const type = response.headers.get("content-type") ?? "";
		if (!type.startsWith("image/")) throw new Error("Not an image");
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length > MAX_CDN_IMAGE_BYTES) throw new Error("Image too large");
		let binary = "";
		for (let i = 0; i < bytes.length; i += 0x8000)
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		return `data:${type};base64,${btoa(binary)}`;
	}),
);

onMessage("getAssetAudio", ({ data: id }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return pullKVCache(
			"assetAudio",
			String(id),
			() =>
				safeFetch(
					`${config.resolvedUrls.public}assets/serve-audio/${id}`,
					Polytoria.AudioApiSchema,
				),
			-1,
			false,
		);
	}),
);

onMessage("getItemOwners", ({ data: { itemId, limit, page } }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		const cacheKey =
			limit !== undefined ? `${itemId}-${limit}-${page ?? 1}` : `${itemId}-all`;
		return pullKVCache(
			"ownerCount",
			cacheKey,
			async () => {
				const BATCH_LIMIT = 100;

				if (limit !== undefined && limit <= BATCH_LIMIT) {
					return safeFetch(
						`${config.resolvedUrls.public}store/${itemId}/owners?limit=${limit}&page=${page ?? 1}`,
						Polytoria.OwnersApiSchema,
					);
				}

				const firstRes = await safeFetch(
					`${config.resolvedUrls.public}store/${itemId}/owners?limit=${BATCH_LIMIT}&page=1`,
					Polytoria.OwnersApiSchema,
				);

				const total = limit ?? firstRes.total;
				const finalResults = {
					inventories: [...(firstRes.inventories || [])],
					pages: Math.ceil(total / BATCH_LIMIT),
					total: firstRes.total,
				};

				for (let page = 2; page <= finalResults.pages; page++) {
					const res = await safeFetch(
						`${config.resolvedUrls.public}store/${itemId}/owners?limit=${BATCH_LIMIT}&page=${page}`,
						Polytoria.OwnersApiSchema,
					);
					finalResults.inventories.push(...(res.inventories || []));
				}

				finalResults.inventories = finalResults.inventories.slice(0, total);

				return finalResults;
			},
			60 * 1000,
			false,
		);
	}),
);

onMessage("getItemCopy", ({ data: { itemId, userId } }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		return pullKVCache(
			"individualOwners",
			`${String(userId)}-${String(itemId)}`,
			() =>
				safeFetch(
					`${config.resolvedUrls.public}store/${itemId}/owner?userID=${userId}`,
					Polytoria.IndividualOwnerApiSchema,
				),
			30 * 1000,
			false,
		);
	}),
);
