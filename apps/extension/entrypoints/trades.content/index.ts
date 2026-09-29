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

import { _showKilnDisclosures, preferences } from "@/utils/storage";
import { getUserDetails, parseTrade } from "@/utils/utilities";
import * as newTrade from "./newTrade";
import * as overview from "./overview";
import * as view from "./view";

const MAX_VIEWED_TRADE_IDS = 1000;

type TradePage =
	| { type: "overview"; tab: "received" | "sent" | "completed" | "inactive" }
	| { type: "view"; tradeId: string }
	| { type: "new"; userId: string }
	| { type: "unknown" };

function parseTradePage(): TradePage {
	const [, , segment, id] = window.location.pathname.split("/");

	if (!segment) return { type: "overview", tab: "received" };
	if (segment === "sent") return { type: "overview", tab: "sent" };
	if (segment === "completed") return { type: "overview", tab: "completed" };
	if (segment === "inactive") return { type: "overview", tab: "inactive" };
	if (segment === "view" && id) return { type: "view", tradeId: id };
	if (segment === "new" && id) return { type: "new", userId: id };

	return { type: "unknown" };
}

export default defineContentScript({
	matches: [
		"https://polytoria.com/trade",
		"https://polytoria.com/trade?*",
		"https://polytoria.com/trade/*",
	],
	main() {
		Promise.all([
			preferences.getPreferences(),
			_showKilnDisclosures.getValue(),
		]).then(([values, showDisclosures]) => {
			getUserDetails().then((user) => {
				if (!user) {
					console.warn("[Kiln] Failure to get logged in user details.");
					return;
				}

				const page = parseTradePage();

				if (import.meta.env.MODE === "development") {
					console.log(`[Kiln] Trade page: ${page.type}`, page);
				}

				if (page.type === "new") {
					if (values.enabled.includes("nftItems")) {
						newTrade.nftItems(showDisclosures);
					}

					if (values.enabled.includes("nlfItems")) {
						newTrade.nlfItems(showDisclosures);
					}
				} else if (page.type === "view") {
					const trade = parseTrade(document);

					_viewedTradeIds.getValue().then((tradeIds) => {
						const tradeId = +window.location.pathname.split("/")[3];
						const deduped = tradeIds.filter((id) => id !== tradeId);
						deduped.push(tradeId);
						_viewedTradeIds.setValue(deduped.slice(-MAX_VIEWED_TRADE_IDS));
					});

					if (values.enabled.includes("irlBrickPrice")) {
						view.irlBrickPrice(
							trade,
							values.config.irlBrickPrice.currency,
							showDisclosures,
						);
					}
				} else if (page.type === "overview") {
					if (page.tab === "received") {
						if (values.enabled.includes("blockedTraders")) {
							overview.blockedTraders(user, showDisclosures);
						}

						if (values.enabled.includes("nftItems")) {
							overview.nftItems(user, showDisclosures);
						}

						if (values.enabled.includes("nlfItems")) {
							overview.nlfItems(user, showDisclosures);
						}

						if (values.enabled.includes("quickCounterTrades")) {
							overview.quickCounterTrades(showDisclosures);
						}
					}

					if (
						page.tab === "sent" &&
						values.enabled.includes("quickCancelOutboundTrades")
					) {
						overview.quickCancelOutboundTrades(showDisclosures);
					}

					if (values.enabled.includes("tradeManager")) {
						overview.tradeManager(user);
					}

					if (
						values.enabled.includes("tradeViewedIndicators") &&
						page.tab != "sent"
					) {
						_viewedTradeIds
							.getValue()
							.then((tradeIds) =>
								overview.tradeViewedIndicators(tradeIds, showDisclosures),
							);
					}
				}
			});
		});
	},
});
