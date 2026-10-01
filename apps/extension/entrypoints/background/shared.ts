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
import type { Runtime } from "webextension-polyfill";
import type z from "zod";
import fallbackConfig from "@/utils/static/fallbackConfig.json";
import metadata from "@/utils/static/metadata.json";
import { apiSessions, getFeedbackClientId, kilnBans } from "@/utils/storage";
import type { ApiTypes, KilnBan, Result } from "@/utils/types";
import {
	expireKVCache,
	getFlag,
	pullCache,
	withJitter,
} from "@/utils/utilities";
import { logError } from "./errors";

export const KILN_API_BASE = metadata.endpoints.extension;

type ResolvedUrls = typeof metadata.endpoints;
export type FetchedConfig = Extension.ExtensionConfig & {
	resolvedUrls: ResolvedUrls;
};

export class ApiDisabledError extends Error {
	readonly apiName: string;
	constructor(apiName: string) {
		super(`[Kiln] API "${apiName}" is disabled`);
		this.name = "ApiDisabledError";
		this.apiName = apiName;
	}
}

export class NoSessionError extends Error {
	constructor() {
		super("[Kiln] No verified session found for user");
		this.name = "NoSessionError";
	}
}

export class ApiHttpError extends Error {
	readonly status: number;
	readonly code?: string;
	constructor(
		status: number,
		statusText: string,
		apiCode?: string,
		apiMessage?: string,
	) {
		super(apiMessage ?? `[Kiln] API Error: ${status} ${statusText}`);
		this.name = "ApiHttpError";
		this.status = status;
		this.code = apiCode;
	}
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(key: string, limit: number) {
	const now = Date.now();
	let data = rateLimitMap.get(key);

	if (!data || now >= data.resetTime) {
		data = { count: 0, resetTime: now + 60000 };
		rateLimitMap.set(key, data);
	}

	if (data.count >= limit) {
		throw new Error("Rate limit exceeded. Try again in a minute.");
	}

	data.count++;
}

const inflightRequests = new Map<string, Promise<any>>();

export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const existing = inflightRequests.get(key);
	if (existing) return existing;

	const promise = fn().finally(() => inflightRequests.delete(key));
	inflightRequests.set(key, promise);
	return promise;
}

export async function safeFetch<T>(
	url: string,
	schema?: z.ZodType<T> | null,
	options: RequestInit = {},
	blob: boolean = false,
	allowErrorResponse: boolean = false,
): Promise<T> {
	const clientHeader: Record<string, string> = url.startsWith(KILN_API_BASE)
		? { "x-kiln-client-id": await getFeedbackClientId() }
		: {};

	let response: Response;
	try {
		response = await fetch(url, {
			...options,
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				...clientHeader,
				...options.headers,
			},
		});
	} catch (err) {
		logError({
			type: "network",
			message: err instanceof Error ? err.message : String(err),
			source: url,
		});
		throw err;
	}

	if (!response.ok && !allowErrorResponse) {
		let apiCode: string | undefined;
		let apiMessage: string | undefined;
		try {
			const errJson = (await response.json()) as {
				error?: { code?: string; message?: string };
			};
			apiCode = errJson.error?.code;
			apiMessage = errJson.error?.message;
		} catch {}

		if (
			!apiMessage &&
			response.status >= 500 &&
			url.includes("polytrack.top")
		) {
			apiMessage = `Polytrack returned an error (${response.status} ${response.statusText}). This is an issue with Polytrack, not Kiln.`;
		}

		const httpError = new ApiHttpError(
			response.status,
			response.statusText,
			apiCode,
			apiMessage,
		);
		logError({
			type: "network",
			message: httpError.message,
			source: url,
			url: `${response.status} ${response.statusText}`,
		});
		throw httpError;
	}

	if (schema) {
		const json = await response.json();
		return schema.parse(json);
	}

	const text = !blob ? await response.text() : await response.blob();
	return text as unknown as T;
}

export async function fetchConfig(): Promise<FetchedConfig> {
	return dedupe("getConfig", () =>
		pullCache(
			"remoteConfig",
			async () => {
				const resolvedUrls = {
					...metadata.endpoints,
					extension: KILN_API_BASE,
				};
				try {
					const version = browser.runtime.getManifest().version;
					const result = await safeFetch(
						`${KILN_API_BASE}config?v=${version}`,
						Extension.ExtensionConfigSchema,
						{ method: "GET" },
					);
					result.flags = { ...fallbackConfig.flags, ...result.flags };
					if (
						getFlag(result.flags, "apis.usePublicApiProxy", false) &&
						result.apiAvailability.proxy
					) {
						resolvedUrls.public = `${KILN_API_BASE}proxy/`;
					}
					return { ...result, resolvedUrls };
				} catch (_err) {
					console.warn(
						"[Kiln] Couldn't reach remote config server, using fallback config",
					);
					return { ...fallbackConfig, resolvedUrls };
				}
			},
			withJitter(30 * 60 * 1000),
			false,
		),
	);
}

export async function requireApi(apiName: ApiTypes): Promise<FetchedConfig> {
	const config = await fetchConfig();
	if (!config.apiAvailability[apiName]) throw new ApiDisabledError(apiName);
	return config;
}

export async function withApi(
	rateKey: string,
	apiName: ApiTypes,
): Promise<FetchedConfig> {
	checkRateLimit(rateKey, 100);
	return requireApi(apiName);
}

export async function handle<T>(fn: () => Promise<T>): Promise<Result<T>> {
	try {
		return { ok: true, data: await fn() };
	} catch (err) {
		return {
			ok: false,
			code:
				err instanceof ApiDisabledError
					? "API_DISABLED"
					: err instanceof NoSessionError
						? "NO_SESSION"
						: err instanceof Error && err.message.includes("Rate limit")
							? "RATE_LIMITED"
							: "UNKNOWN",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}

export function isBannedError(err: unknown): boolean {
	return (
		err instanceof ApiHttpError &&
		err.status === 403 &&
		err.message === "ACCOUNT_BANNED"
	);
}

export async function saveKilnBan(ban: KilnBan): Promise<void> {
	const bans = await kilnBans.getValue();
	await kilnBans.setValue([...bans.filter((b) => b.userId != ban.userId), ban]);
}

export async function clearKilnBan(userId: number): Promise<void> {
	const bans = await kilnBans.getValue();
	if (!bans.some((b) => b.userId == userId)) return;
	await kilnBans.setValue(bans.filter((b) => b.userId != userId));
}

export async function fetchKilnBanStatus(
	refreshToken: string,
	config: FetchedConfig,
): Promise<Extension.AuthBanStatusApi["data"]> {
	const result = await safeFetch(
		`${config.resolvedUrls.extension}auth/ban`,
		Extension.AuthBanStatusApi,
		{
			method: "POST",
			headers: { "x-kiln-refresh-token": refreshToken },
		},
	);
	return result.data;
}

export async function recordKilnBan(
	userId: number,
	config: FetchedConfig,
	refreshToken?: string,
): Promise<void> {
	let reason: string | null = null;
	let bannedAt: string | null = null;
	if (refreshToken) {
		try {
			({ reason, bannedAt } = await fetchKilnBanStatus(refreshToken, config));
		} catch {}
	}
	await saveKilnBan({ userId, reason, bannedAt, refreshToken });
	await apiSessions.setValue(
		(await apiSessions.getValue()).filter((s) => s.userId != userId),
	);
	await expireKVCache("currentSession", String(userId));
}

export async function withAuthSession<T>(
	userId: number,
	fn: (token: string, config: FetchedConfig) => Promise<T>,
): Promise<T> {
	const config = await withApi("kiln_api", "extension");
	const sessionStore = await apiSessions.getValue();
	const session = sessionStore.find((s) => s.userId == userId);
	if (!session?.accessToken) throw new NoSessionError();

	try {
		return await fn(session.accessToken, config);
	} catch (err) {
		if (isBannedError(err)) {
			await recordKilnBan(userId, config, session.refreshToken);
			throw new NoSessionError();
		}
		if (!(err instanceof ApiHttpError && err.status === 401)) throw err;
		if (!session.refreshToken) throw new NoSessionError();

		const refreshed = await dedupe(`refreshSession:${userId}`, async () => {
			const latestStore = await apiSessions.getValue();
			const latestSession = latestStore.find((s) => s.userId == userId);
			if (!latestSession?.refreshToken) throw new NoSessionError();

			try {
				const result = await safeFetch(
					`${config.resolvedUrls.extension}auth/refresh`,
					Extension.RefreshTokenApi,
					{
						method: "POST",
						headers: { "x-kiln-refresh-token": latestSession.refreshToken },
					},
				);

				const updatedStore = latestStore.map((s) =>
					s.userId == userId
						? {
								...s,
								accessToken: result.data.accessToken,
								refreshToken: result.data.refreshToken,
							}
						: s,
				);
				await apiSessions.setValue(updatedStore);

				return result.data;
			} catch (refreshErr) {
				if (isBannedError(refreshErr)) {
					await recordKilnBan(userId, config, latestSession.refreshToken);
					throw new NoSessionError();
				}
				if (
					refreshErr instanceof ApiHttpError &&
					(refreshErr.status === 401 || refreshErr.status === 403)
				) {
					await apiSessions.setValue(
						latestStore.filter((s) => s.userId != userId),
					);
					await expireKVCache("currentSession", String(userId));
					throw new NoSessionError();
				}
				throw refreshErr;
			}
		});

		return fn(refreshed.accessToken, config);
	}
}

export async function resolveInjectableTabId(
	sender?: Runtime.MessageSender,
): Promise<number | null> {
	if (sender?.tab?.id != null) return sender.tab.id;

	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	if (tab?.id == null || !/^https?:/.test(tab.url ?? "")) return null;
	return tab.id;
}
