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

import type { Runtime } from "webextension-polyfill";
import { onMessage } from "@/utils/messaging";
import { handle, resolveInjectableTabId } from "./shared";

type ProfileFieldResult =
	| { ok: true; bio: string }
	| { ok: false; reason: "http" | "form"; status: number };

type ProfileSubmitResult =
	| { ok: true }
	| { ok: false; reason: "http" | "form" | "network"; status: number };

async function getActiveTabId(sender?: Runtime.MessageSender): Promise<number> {
	const tabId = await resolveInjectableTabId(sender);
	if (tabId == null) throw new Error("No active tab");
	return tabId;
}

onMessage("getProfileBio", ({ sender }) =>
	handle(async () => {
		const tabId = await getActiveTabId(sender);

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			func: async (): Promise<ProfileFieldResult> => {
				let res: Response;
				try {
					res = await fetch("/my/settings/profile", {
						credentials: "include",
					});
				} catch {
					return { ok: false, reason: "http", status: 0 };
				}
				if (!res.ok) return { ok: false, reason: "http", status: res.status };

				const doc = new DOMParser().parseFromString(
					await res.text(),
					"text/html",
				);
				const description = doc.querySelector<HTMLTextAreaElement>(
					'form[action="/my/settings/profile/update"] #description',
				);
				if (!description) return { ok: false, reason: "form", status: 0 };

				return { ok: true, bio: description.value };
			},
		});

		const injected = results[0]?.result as ProfileFieldResult | undefined;
		if (!injected?.ok) {
			throw new Error(
				`Couldn't read profile bio (${injected?.reason ?? "unknown"} ${injected?.status ?? ""})`.trim(),
			);
		}
		return injected.bio;
	}),
);

onMessage("updateProfileBio", ({ data: description, sender }) =>
	handle(async () => {
		const tabId = await getActiveTabId(sender);

		const results = await browser.scripting.executeScript({
			target: { tabId },
			world: "MAIN",
			args: [description],
			func: async (description: string): Promise<ProfileSubmitResult> => {
				let res: Response;
				try {
					res = await fetch("/my/settings/profile", {
						credentials: "include",
					});
				} catch {
					return { ok: false, reason: "http", status: 0 };
				}
				if (!res.ok) return { ok: false, reason: "http", status: res.status };

				const doc = new DOMParser().parseFromString(
					await res.text(),
					"text/html",
				);
				const form = doc.querySelector<HTMLFormElement>(
					'form[action="/my/settings/profile/update"]',
				);
				const field = form?.querySelector<HTMLTextAreaElement>("#description");
				if (!form || !field) return { ok: false, reason: "form", status: 0 };

				field.value = description;

				const params = new URLSearchParams();
				for (const [key, value] of new FormData(form)) {
					if (typeof value === "string") params.append(key, value);
				}

				let post: Response;
				try {
					post = await fetch("/my/settings/profile/update", {
						method: "POST",
						credentials: "include",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
						},
						body: params.toString(),
					});
				} catch {
					return { ok: false, reason: "network", status: 0 };
				}
				if (!post.ok) return { ok: false, reason: "http", status: post.status };

				return { ok: true };
			},
		});

		const injected = results[0]?.result as ProfileSubmitResult | undefined;
		if (!injected?.ok) {
			throw new Error(
				`Failed to update profile bio (${injected?.reason ?? "unknown"} ${injected?.status ?? ""})`.trim(),
			);
		}
		return true;
	}),
);
