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

import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import {
	formatNotificationRelativeTime,
	parseFormattedNumber,
	parseNotificationRelativeTime,
	withJitter,
} from "@/utils/utilities";

const NOW = new Date("2026-01-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

afterEach(() => setSystemTime());

describe("formatNotificationRelativeTime", () => {
	test.each([
		[0, "Just now"],
		[59_000, "Just now"],
		[60_000, "1 minute ago"],
		[5 * 60_000, "5 minutes ago"],
		[3_600_000, "1 hour ago"],
		[86_400_000, "1 day ago"],
		[2 * 604_800_000, "2 weeks ago"],
		[2_592_000_000, "1 month ago"],
		[31_536_000_000, "1 year ago"],
	])("%p ms -> %p", (ms, expected) => {
		setSystemTime(NOW);
		expect(formatNotificationRelativeTime(ago(ms))).toBe(expected);
	});
});

describe("parseNotificationRelativeTime", () => {
	test("just now", () => {
		setSystemTime(NOW);
		expect(parseNotificationRelativeTime(" Just Now ")?.getTime()).toBe(
			NOW.getTime(),
		);
	});

	test.each([
		["1 second ago", 1_000],
		["5 minutes ago", 300_000],
		["3 hours ago", 3 * 3_600_000],
		["2 days ago", 2 * 86_400_000],
		["1 week ago", 604_800_000],
	])("%p", (text, ms) => {
		setSystemTime(NOW);
		expect(parseNotificationRelativeTime(text)?.getTime()).toBe(
			NOW.getTime() - ms,
		);
	});

	test("round-trips with formatter", () => {
		setSystemTime(NOW);
		const parsed = parseNotificationRelativeTime("4 hours ago") as Date;
		expect(formatNotificationRelativeTime(parsed)).toBe("4 hours ago");
	});

	test("absolute dates", () => {
		expect(
			parseNotificationRelativeTime("2025-03-01T00:00:00Z")?.toISOString(),
		).toBe("2025-03-01T00:00:00.000Z");
	});

	test("garbage -> null", () => {
		expect(parseNotificationRelativeTime("whenever")).toBeNull();
	});
});

describe("parseFormattedNumber", () => {
	test("strips thousands separators", () => {
		expect(parseFormattedNumber("1,234,567")).toBe(1234567);
		expect(parseFormattedNumber("42")).toBe(42);
	});
	test("non-numeric -> NaN", () => {
		expect(parseFormattedNumber("abc")).toBeNaN();
	});
});

describe("withJitter", () => {
	test("stays within ratio bounds", () => {
		for (let i = 0; i < 200; i++) {
			const v = withJitter(1000, 0.1);
			expect(v).toBeGreaterThanOrEqual(900);
			expect(v).toBeLessThanOrEqual(1100);
		}
	});
	test("zero ratio is identity", () => {
		expect(withJitter(500, 0)).toBe(500);
	});
});
