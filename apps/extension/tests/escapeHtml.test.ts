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
import { escapeHtml, safeHttpUrl } from "@/utils/escapeHtml";

describe("escapeHtml", () => {
	test("escapes all html-significant characters", () => {
		expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
			"&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
		);
	});

	test("escapes ampersand first, no double-escaping of its own output", () => {
		expect(escapeHtml("&lt;")).toBe("&amp;lt;");
	});

	test("null and undefined become empty string", () => {
		expect(escapeHtml(null)).toBe("");
		expect(escapeHtml(undefined)).toBe("");
	});

	test("non-strings are stringified", () => {
		expect(escapeHtml(0)).toBe("0");
		expect(escapeHtml(false)).toBe("false");
	});
});

describe("safeHttpUrl", () => {
	test("accepts http and https, case-insensitive, trimmed", () => {
		expect(safeHttpUrl("https://polytoria.com/x")).toBe(
			"https://polytoria.com/x",
		);
		expect(safeHttpUrl("  HTTP://example.com ")).toBe("HTTP://example.com");
	});

	test.each([
		"javascript:alert(1)",
		"data:text/html,<script>",
		"//evil.com",
		"ftp://x.com",
		" javascript:https://",
		"",
	])("rejects %p", (value) => {
		expect(safeHttpUrl(value)).toBe("");
	});

	test("rejects non-string nullish", () => {
		expect(safeHttpUrl(null)).toBe("");
		expect(safeHttpUrl(undefined)).toBe("");
	});
});
