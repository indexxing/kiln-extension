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

import { describe, expect, test } from "bun:test";
import { screenTrade } from "@/utils/tradeScreening";
import type { ParsedTrade, TradeItem } from "@/utils/types";

const item = (storeId: number, serial: number | null = null): TradeItem => ({
	storeId,
	serial,
	brickValue: 0,
	thumbnailUrl: "",
});

const side = (username: string, items: TradeItem[]) => ({
	username,
	items,
	totalValue: 0,
	bricksAdded: 0,
	bricksAfterFees: 0,
	netValue: 0,
});

const trade = (
	mine: TradeItem[],
	theirs: TradeItem[],
	overrides: Partial<ParsedTrade> = {},
): ParsedTrade => ({
	status: "pending",
	counterparty: "Them",
	sides: [side("Them", theirs), side("Me", mine)],
	...overrides,
});

describe("screenTrade", () => {
	test("ignores non-pending trades", () => {
		const t = trade([item(1)], [], { status: "completed" } as any);
		expect(
			screenTrade(t, "Me", [{ itemId: 1, serials: null }] as any, null),
		).toBeNull();
	});

	test("nft: whole item blocked when serials null", () => {
		expect(
			screenTrade(
				trade([item(1, 5)], []),
				"Me",
				[{ itemId: 1, serials: null }] as any,
				null,
			),
		).toBe("nft");
	});

	test("nft: only listed serials blocked", () => {
		const nft = [{ itemId: 1, serials: [7] }] as any;
		expect(screenTrade(trade([item(1, 7)], []), "Me", nft, null)).toBe("nft");
		expect(screenTrade(trade([item(1, 8)], []), "Me", nft, null)).toBeNull();
		expect(screenTrade(trade([item(1, null)], []), "Me", nft, null)).toBeNull();
	});

	test("nlf: blocks when counterparty offers a listed item", () => {
		expect(screenTrade(trade([], [item(9)]), "Me", null, new Set([9]))).toBe(
			"nlf",
		);
		expect(
			screenTrade(trade([], [item(8)]), "Me", null, new Set([9])),
		).toBeNull();
	});

	test("nlf only checks their side, nft only mine", () => {
		expect(
			screenTrade(trade([item(9)], []), "Me", null, new Set([9])),
		).toBeNull();
		expect(
			screenTrade(
				trade([], [item(1)]),
				"Me",
				[{ itemId: 1, serials: null }] as any,
				null,
			),
		).toBeNull();
	});

	test("username match is case-insensitive", () => {
		expect(screenTrade(trade([], [item(9)]), "ME", null, new Set([9]))).toBe(
			"nlf",
		);
	});

	test("falls back to counterparty when username not on either side", () => {
		expect(
			screenTrade(trade([], [item(9)]), "Unknown", null, new Set([9])),
		).toBe("nlf");
	});

	test("null when neither user nor counterparty found", () => {
		const t = trade([item(1)], [item(9)], { counterparty: "Nobody" });
		expect(
			screenTrade(
				t,
				"Unknown",
				[{ itemId: 1, serials: null }] as any,
				new Set([9]),
			),
		).toBeNull();
	});

	test("nft takes priority over nlf", () => {
		expect(
			screenTrade(
				trade([item(1)], [item(9)]),
				"Me",
				[{ itemId: 1, serials: null }] as any,
				new Set([9]),
			),
		).toBe("nft");
	});
});
