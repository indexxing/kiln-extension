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
import { sendMessage } from "@/utils/messaging";
import { publishedThemeFields } from "@/utils/publishedTheme";
import { _savedThemes, preferences, type SavedTheme } from "@/utils/storage";
import { safeFetch, withApi } from "./shared";

const ALARM_NAME = "kiln-theme-autoupdate";

export async function scheduleThemeAutoUpdateCheck() {
	if (await browser.alarms.get(ALARM_NAME)) return;
	browser.alarms.create(ALARM_NAME, {
		delayInMinutes: 1,
		periodInMinutes: 24 * 60,
	});
}

browser.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM_NAME) checkForThemeUpdates();
});

async function notifyActiveThemeChanged() {
	const tabs = await browser.tabs.query({ url: "https://polytoria.com/*" });
	for (const tab of tabs) {
		if (tab.id === undefined) continue;
		sendMessage("themeAutoUpdated", undefined, tab.id).catch(() => {});
	}
}

export async function checkForThemeUpdates(): Promise<void> {
	const saved = await _savedThemes.getValue();
	const targets = saved.filter((t) => t.importedSlug && t.autoUpdate);
	if (targets.length === 0) return;

	const config = await withApi("kiln_api", "extension");

	const updates = new Map<string, ReturnType<typeof publishedThemeFields>>();
	for (const t of targets) {
		try {
			const res = await safeFetch(
				`${config.resolvedUrls.extension}themes/${encodeURIComponent(t.importedSlug!)}`,
				Extension.GetPublishedThemeApi,
			);
			updates.set(t.id, publishedThemeFields(res.data));
		} catch {}
	}
	if (updates.size === 0) return;

	const current = await _savedThemes.getValue();
	const values = await preferences.getPreferences();
	const activeId = values.enabled.includes("themeCreator")
		? (values.config.themeCreator.activeThemeId ?? "default")
		: null;

	let changed = false;
	let activeChanged = false;

	const next = current.map((entry) => {
		const fields = updates.get(entry.id);
		if (!fields) return entry;
		const updatedEntry: SavedTheme = { ...entry, ...fields };
		if (JSON.stringify(updatedEntry) === JSON.stringify(entry)) return entry;
		changed = true;
		if (activeId === entry.id) activeChanged = true;
		return updatedEntry;
	});

	if (!changed) return;
	await _savedThemes.setValue(next);
	if (activeChanged) await notifyActiveThemeChanged();
}
