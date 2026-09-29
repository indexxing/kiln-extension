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

import { onMessage } from "@/utils/messaging";
import { _errorLog } from "@/utils/storage";
import type { KilnErrorLogEntry } from "@/utils/types";

const MAX_ENTRIES = 40;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

let writeQueue: Promise<void> = Promise.resolve();

export function logError(
	entry: Omit<KilnErrorLogEntry, "timestamp">,
): Promise<void> {
	const run = async () => {
		const now = Date.now();
		const log = await _errorLog.getValue();
		const trimmed = log
			.filter((e) => now - e.timestamp < MAX_AGE_MS)
			.slice(-(MAX_ENTRIES - 1));
		trimmed.push({ ...entry, timestamp: now });
		await _errorLog.setValue(trimmed);
	};
	const next = writeQueue.then(run, run);
	writeQueue = next.catch(() => {});
	return next;
}

export async function purgeOldErrors(): Promise<void> {
	const now = Date.now();
	const log = await _errorLog.getValue();
	const trimmed = log.filter((e) => now - e.timestamp < MAX_AGE_MS);
	if (trimmed.length !== log.length) await _errorLog.setValue(trimmed);
}

onMessage("reportError", ({ data }) => {
	logError(data);
});
