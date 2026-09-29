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
import { _pendingAssetApprovals, preferences } from "@/utils/storage";
import { fireKilnNotification } from "@/utils/utilities";
import { type FetchedConfig, safeFetch, withApi } from "./shared";

const ALARM_NAME = "kiln-asset-approval-check";
const CHECK_INTERVAL_MINUTES = 20;
const PENDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 100;

export async function scheduleAssetApprovalCheck() {
	if (await browser.alarms.get(ALARM_NAME)) return;
	browser.alarms.create(ALARM_NAME, {
		delayInMinutes: 1,
		periodInMinutes: CHECK_INTERVAL_MINUTES,
	});
}

browser.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM_NAME) checkForApprovedAssets();
});

async function resolveActiveUserId(): Promise<number | null> {
	const tabs = await browser.tabs.query({ url: "https://polytoria.com/*" });

	for (const tab of tabs) {
		if (tab.id === undefined) continue;
		try {
			const results = await browser.scripting.executeScript({
				target: { tabId: tab.id },
				func: () => {
					const profileLink = document.querySelector<HTMLAnchorElement>(
						'.navbar a.text-reset[href^="/users/"]',
					);
					const match = profileLink?.href.match(/\/users\/(\d+)/);
					return match ? Number(match[1]) : null;
				},
			});
			const userId = results[0]?.result as number | null;
			if (userId) return userId;
		} catch {}
	}

	return null;
}

async function findApprovedAssets(
	config: FetchedConfig,
	userId: number,
	targetIds: Set<number>,
): Promise<Map<number, Polytoria.UserCreationsApi["assets"][number]>> {
	const found = new Map<number, Polytoria.UserCreationsApi["assets"][number]>();

	let page = 1;
	let totalPages = 1;

	do {
		const res = await safeFetch(
			`${config.resolvedUrls.public}users/${userId}/store?page=${page}&limit=${PAGE_LIMIT}`,
			Polytoria.UserCreationsApiSchema,
		);

		for (const asset of res.assets) {
			if (targetIds.has(asset.id)) found.set(asset.id, asset);
		}

		totalPages = res.pages;
		page++;
	} while (page <= totalPages && found.size < targetIds.size);

	return found;
}

export async function checkForApprovedAssets(): Promise<void> {
	const values = await preferences.getPreferences();
	if (!values.enabled.includes("assetApprovedNotifications")) return;

	const pending = await _pendingAssetApprovals.getValue();
	const now = Date.now();

	const entries = Object.values(pending);
	const alive = entries.filter(
		(entry) => now - new Date(entry.addedAt).getTime() < PENDING_EXPIRY_MS,
	);
	if (alive.length !== entries.length) {
		await _pendingAssetApprovals.setValue(
			Object.fromEntries(alive.map((entry) => [entry.assetId, entry])),
		);
	}
	if (alive.length === 0) return;

	const userId = await resolveActiveUserId();
	if (userId === null) return;

	const mine = alive.filter(
		(entry) => entry.userId === undefined || entry.userId === userId,
	);
	if (mine.length === 0) return;

	const config = await withApi("public_api", "public");
	const targetIds = new Set(mine.map((entry) => entry.assetId));

	let found: Map<number, Polytoria.UserCreationsApi["assets"][number]>;
	try {
		found = await findApprovedAssets(config, userId, targetIds);
	} catch (err) {
		console.warn("[Kiln] Failed to check for approved assets:", err);
		return;
	}
	if (found.size === 0) return;

	const remaining = await _pendingAssetApprovals.getValue();
	for (const [assetId, asset] of found) {
		delete remaining[assetId];
		await fireKilnNotification({
			userId,
			id: `asset-approved-${assetId}`,
			message: `"${asset.name}" has been approved!`,
			date: new Date(),
			url: `https://polytoria.com/store/${assetId}`,
			avatarUrl: asset.thumbnail,
		});
	}
	await _pendingAssetApprovals.setValue(remaining);
}
