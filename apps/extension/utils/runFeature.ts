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

import { sendMessage } from "@/utils/messaging";

function report(name: string, err: unknown) {
	console.error(`[Kiln] Feature "${name}" failed:`, err);
	sendMessage("reportError", {
		type: "content",
		message: `${name}: ${err instanceof Error ? err.message : String(err)}`,
		stack: err instanceof Error ? err.stack : undefined,
		url: location.href,
	}).catch(() => {});
}

export function runFeature(name: string, fn: () => unknown): void {
	try {
		const result = fn();
		if (result instanceof Promise) result.catch((err) => report(name, err));
	} catch (err) {
		report(name, err);
	}
}
