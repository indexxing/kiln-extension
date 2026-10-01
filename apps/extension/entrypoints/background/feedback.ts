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
import { onMessage } from "@/utils/messaging";
import { _errorLog, getFeedbackClientId } from "@/utils/storage";
import { getKilnBan } from "@/utils/utilities";
import {
	checkRateLimit,
	handle,
	NoSessionError,
	safeFetch,
	withApi,
	withAuthSession,
} from "./shared";

const MAX_ERRORS_SENT = 15;
const CLIENT_ID_HEADER = "x-kiln-feedback-id";

async function getOptionalAuthHeader(
	userId: number | undefined,
): Promise<Record<string, string>> {
	if (!userId) return {};
	try {
		return await withAuthSession(userId, async (token) => ({
			Authorization: `Bearer ${token}`,
		}));
	} catch (err) {
		if (err instanceof NoSessionError) return {};
		throw err;
	}
}

onMessage("submitFeedback", ({ data }) =>
	handle(async () => {
		checkRateLimit("feedback", 5);
		if (data.userId && (await getKilnBan(data.userId)))
			throw new Error("ACCOUNT_BANNED");

		const [config, clientId, authHeader] = await Promise.all([
			withApi("kiln_api", "extension"),
			getFeedbackClientId(),
			getOptionalAuthHeader(data.userId),
		]);

		const diagnostics =
			data.type === "bug"
				? {
						userAgent: navigator.userAgent,
						errors: (await _errorLog.getValue()).slice(-MAX_ERRORS_SENT),
					}
				: undefined;

		return safeFetch(
			`${config.resolvedUrls.extension}feedback`,
			Extension.SubmitFeedbackApi,
			{
				method: "POST",
				headers: { [CLIENT_ID_HEADER]: clientId, ...authHeader },
				body: JSON.stringify({ ...data, diagnostics }),
			},
		);
	}),
);

onMessage("getMyFeedback", ({ data: userId }) =>
	handle(async () => {
		const [config, clientId, authHeader] = await Promise.all([
			withApi("kiln_api", "extension"),
			getFeedbackClientId(),
			getOptionalAuthHeader(userId),
		]);

		return safeFetch(
			`${config.resolvedUrls.extension}feedback/mine`,
			Extension.MyFeedbackApi,
			{ headers: { [CLIENT_ID_HEADER]: clientId, ...authHeader } },
		);
	}),
);
