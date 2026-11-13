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
import { onMessage } from "@/utils/messaging";
import { pullKVCache } from "@/utils/utilities";
import { handle, safeFetch, withApi } from "./shared";

onMessage("getGuildCreations", ({ data: { guildId, page, limit } }) =>
	handle(async () => {
		const config = await withApi("public_api", "public");
		const resolvedPage = page ?? 1;
		const resolvedLimit = limit ?? 12;
		return pullKVCache(
			"guildCreations",
			`${guildId}-${resolvedPage}-${resolvedLimit}`,
			() =>
				safeFetch(
					`${config.resolvedUrls.public}guilds/${guildId}/store?page=${resolvedPage}&limit=${resolvedLimit}`,
					Polytoria.GuildCreationsApiSchema,
				),
			5 * 60 * 1000,
			false,
		);
	}),
);
