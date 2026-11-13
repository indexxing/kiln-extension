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

import { describe, expect, mock, test } from "bun:test";

let response: unknown = { ok: true, data: { success: true, url: "" } };
mock.module("@/utils/messaging", () => ({
	sendMessage: async () => {
		if (response instanceof Error) throw response;
		return response;
	},
}));

const { parseAssetId, resolveDecalUrl, POLYTORIA_CDN_URL } = await import(
	"@/utils/decal"
);

describe("parseAssetId", () => {
	test("plain id", () => expect(parseAssetId("123")).toBe(123));
	test("trailing slash url", () =>
		expect(parseAssetId("https://polytoria.com/store/456/")).toBe(456));
	test("trailing id with whitespace", () =>
		expect(parseAssetId("  789  ")).toBe(789));
	test("falls back to first number", () =>
		expect(parseAssetId("12/slug")).toBe(12));
	test("rejects zero", () => expect(parseAssetId("0")).toBeNull());
	test("rejects no digits", () => expect(parseAssetId("abc")).toBeNull());
	test("rejects empty", () => expect(parseAssetId("")).toBeNull());
});

describe("POLYTORIA_CDN_URL", () => {
	test("accepts cdn urls", () =>
		expect(POLYTORIA_CDN_URL.test("https://cdn.polytoria.com/a/b.png")).toBe(
			true,
		));
	test.each([
		"http://cdn.polytoria.com/a.png",
		"https://cdn.polytoria.com.evil.com/a.png",
		"https://evil.com/https://cdn.polytoria.com/a.png",
		"https://cdn.polytoria.com/a.png?x=1",
	])("rejects %p", (u) => expect(POLYTORIA_CDN_URL.test(u)).toBe(false));
});

describe("resolveDecalUrl", () => {
	test("returns cdn url on success", async () => {
		response = {
			ok: true,
			data: { success: true, url: "https://cdn.polytoria.com/t.png" },
		};
		expect(await resolveDecalUrl("5")).toBe("https://cdn.polytoria.com/t.png");
	});

	test("rejects non-cdn url", async () => {
		response = { ok: true, data: { success: true, url: "https://evil.com/t" } };
		expect(await resolveDecalUrl("5")).toBeNull();
	});

	test("null on failure result", async () => {
		response = { ok: false };
		expect(await resolveDecalUrl("5")).toBeNull();
	});

	test("null when message throws", async () => {
		response = new Error("boom");
		expect(await resolveDecalUrl("5")).toBeNull();
	});

	test("null on unparsable id", async () => {
		expect(await resolveDecalUrl("nope")).toBeNull();
	});
});
