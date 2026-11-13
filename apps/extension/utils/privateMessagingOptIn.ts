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

import { endpoints } from "@/utils/endpoints";
import { _syncedMessagingOptIns } from "@/utils/storage";
import { getApiSession } from "@/utils/utilities";

export async function syncMessagingOptIn(userId: number, enabled: boolean) {
	const key = `${endpoints.extension}${userId}`;
	const synced = await _syncedMessagingOptIns.getValue();
	if ((synced[key] ?? false) === enabled) return true;

	const session = await getApiSession(userId);
	if (session?.state !== "verified") return false;

	const result = await sendMessage("setMessagingEnabled", { userId, enabled });
	if (!result.ok) return false;

	await _syncedMessagingOptIns.setValue({
		...(await _syncedMessagingOptIns.getValue()),
		[key]: enabled,
	});
	return true;
}
