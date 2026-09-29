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
import { onMessage } from "@/utils/messaging";
import { pullCache, withJitter } from "@/utils/utilities";
import {
	ApiDisabledError,
	checkRateLimit,
	dedupe,
	fetchConfig,
	handle,
	safeFetch,
} from "./shared";

onMessage("getConfig", () => handle(async () => fetchConfig()));

onMessage("getChangelog", () =>
	handle(async () =>
		pullCache(
			"changelogMd",
			async () => {
				const res = await fetch("https://kiln.indexx.dev/changelog.md");
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.text();
			},
			60 * 60 * 1000,
			false,
		),
	),
);

onMessage("getCurrencyRates", () =>
	handle(async () => {
		checkRateLimit("rates_api", 100);
		return dedupe("getCurrencyRates", async () => {
			const config = await fetchConfig();
			if (!config.apiAvailability.currencyRates)
				throw new ApiDisabledError("currencyRates");
			return pullCache(
				"currencyRates",
				() =>
					safeFetch(
						`${config.resolvedUrls.currencyRates}`,
						Extension.CurrencyExchangeRate,
						{ method: "GET" },
					),
				withJitter(24 * 60 * 60 * 1000),
				false,
			);
		});
	}),
);

onMessage("getProfanityFilter", () =>
	handle(async () =>
		pullCache(
			"profanityFilter",
			async () => {
				const res = await fetch(
					"https://api.polytoria.com/v1/game/server/profanity",
				);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);

				const text = await res.text();
				if (/^\s*<(!doctype|html)/i.test(text)) {
					throw new Error("Received HTML instead of the profanity filter");
				}

				return text;
			},
			60 * 60 * 1000,
			false,
		),
	),
);
