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

import type { WxtStorageItem } from "wxt/storage";
import preferencesList from "../public/preferences.json";
import type { FeatureId } from "./featureIds.generated";
import { sendMessage } from "./messaging";
import type {
	ApiSession,
	CacheInterface,
	EvalProfile,
	KilnBan,
	KilnErrorLogEntry,
	ThemeEffect,
} from "./types";
import type { Ambient, CardStyle, PointerEffects } from "./visualEffects";

const prefItems = preferencesList.preferences;

export function isMobileDevice(): boolean {
	if ((navigator as any).userAgentData?.mobile) return true;
	return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isChrome(): boolean {
	return (
		/Chrome/i.test(navigator.userAgent) && !/Edg|OPR/i.test(navigator.userAgent)
	);
}

const desktopOnlyIds = new Set(
	(prefItems as Array<{ id: string; desktopOnly?: boolean }>)
		.filter((p) => p.desktopOnly)
		.map((p) => p.id),
);

const chromeOnlyIds = new Set(
	(prefItems as Array<{ id: string; chromeOnly?: boolean }>)
		.filter((p) => p.chromeOnly)
		.map((p) => p.id),
);

const deprecatedHiddenIds = new Set(
	(prefItems as Array<{ id: string; hide?: boolean; defaultEnabled?: boolean }>)
		.filter((p) => p.hide && !p.defaultEnabled)
		.map((p) => p.id),
);

const deprecatedIds = new Set(
	(prefItems as Array<{ id: string; tags?: string[] }>)
		.filter((p) => p.tags?.includes("deprecated"))
		.map((p) => p.id),
);

export function getEnabledDeprecatedFeatures(
	enabled: FeatureId[],
): FeatureId[] {
	return enabled.filter((id) => deprecatedIds.has(id));
}

const irlBrickPriceCurrencies = new Set(
	(
		prefItems as Array<{
			id: string;
			config?: Array<{ options?: Array<{ value: string }> }>;
		}>
	)
		.find((p) => p.id === "irlBrickPrice")
		?.config?.[0]?.options?.map((o) => o.value),
);

export const defaultPreferences = {
	enabled: (prefItems as Array<{ id: string; defaultEnabled?: boolean }>)
		.filter((p) => p.defaultEnabled)
		.map((p) => p.id) as FeatureId[],
	disabled: [] as FeatureId[],
	config: {
		...Object.fromEntries(
			(
				prefItems as Array<{
					id: string;
					config?: Array<{
						type: string;
						subsetting: string;
						default?: string | boolean;
					}>;
				}>
			)
				.filter((p) => p.config?.length)
				.map((p) => [
					p.id,
					Object.fromEntries(
						p.config!.map((c) => {
							if (c.type === "check") return [c.subsetting, c.default ?? true];
							const n = Number(c.default);
							return [c.subsetting, Number.isNaN(n) ? c.default : n];
						}),
					),
				]),
		),
		tradeEvaluation: {
			profile: "balanced" as EvalProfile,
		},
		themeCreator: {
			activeThemeId: "default" as string,
		},
		favoredDevelopmentGuild: {
			guildId: null as number | null,
		},
	} as Record<string, Record<string, any>>,
};

export type preferencesSchema = typeof defaultPreferences & {
	[key: string]: any;
};

const FORUM_COMPOSER_SPLIT: Array<{ id: string; oldSubsetting?: string }> = [
	{ id: "forumCharacterCount", oldSubsetting: "showCharacterCount" },
	{ id: "forumMarkdownButtons", oldSubsetting: "showMarkdownBtns" },
	{ id: "forumFilteredWordHighlight", oldSubsetting: "highlightFilteredWords" },
	{ id: "forumImageLibrary", oldSubsetting: "showImageLibrary" },
	{ id: "forumPostPreview" },
];

function splitForumComposer(oldValue: any) {
	const enabled: string[] = oldValue?.enabled ?? [];
	const disabled: string[] = oldValue?.disabled ?? [];
	const { improvedForumComposer: oldConfig, ...config } =
		oldValue?.config ?? {};

	const wasOn =
		enabled.includes("improvedForumComposer") ||
		!disabled.includes("improvedForumComposer");

	const isOn = ({ oldSubsetting }: (typeof FORUM_COMPOSER_SPLIT)[number]) =>
		wasOn && (oldSubsetting ? (oldConfig?.[oldSubsetting] ?? true) : true);

	const replaced = [
		"improvedForumComposer",
		...FORUM_COMPOSER_SPLIT.map((f) => f.id),
	];

	if (oldConfig?.autoShowPreview !== undefined) {
		config.forumPostPreview = {
			...config.forumPostPreview,
			autoShow: oldConfig.autoShowPreview,
		};
	}

	return {
		...oldValue,
		enabled: [
			...enabled.filter((id) => !replaced.includes(id)),
			...FORUM_COMPOSER_SPLIT.filter(isOn).map((f) => f.id),
		],
		disabled: [
			...disabled.filter((id) => !replaced.includes(id)),
			...FORUM_COMPOSER_SPLIT.filter((f) => !isOn(f)).map((f) => f.id),
		],
		config,
	};
}

function fixIrlBrickPriceCurrency(oldValue: any) {
	const currency = oldValue?.config?.irlBrickPrice?.currency;
	if (currency === undefined || irlBrickPriceCurrencies.has(currency)) {
		return oldValue;
	}
	return {
		...oldValue,
		config: {
			...oldValue?.config,
			irlBrickPrice: {
				...oldValue?.config?.irlBrickPrice,
				currency: "USD",
			},
		},
	};
}

export const PREFERENCES_VERSION = 6;

const preferenceMigrations: Record<number, (oldValue: any) => any> = {
	3: () => defaultPreferences,
	4: (oldValue: any) => ({
		...oldValue,
		disabled: defaultPreferences.enabled.filter(
			(id) => !((oldValue?.enabled as string[]) ?? []).includes(id),
		),
	}),
	5: fixIrlBrickPriceCurrency,
	6: splitForumComposer,
};

const UNVERSIONED_EXPORT_VERSION = 4;

export class PreferencesVersionError extends Error {}

export function migrateImportedPreferences(imported: any) {
	const { version = UNVERSIONED_EXPORT_VERSION, ...value } = imported;
	if (!Number.isInteger(version) || version < UNVERSIONED_EXPORT_VERSION) {
		throw new Error("Invalid format");
	}
	if (version > PREFERENCES_VERSION) {
		throw new PreferencesVersionError(
			"This file was exported from a newer version of Kiln. Update Kiln and try again.",
		);
	}

	let migrated = value;
	for (let v = version + 1; v <= PREFERENCES_VERSION; v++) {
		migrated = preferenceMigrations[v](migrated);
	}
	return migrated;
}

interface PreferencesStorageItem
	// biome-ignore lint/complexity/noBannedTypes: WXT
	extends WxtStorageItem<typeof defaultPreferences, {}> {
	getPreferences: () => Promise<typeof defaultPreferences>;
}

export const preferences: PreferencesStorageItem = storage.defineItem(
	"sync:preferences",
	{
		fallback: defaultPreferences,
		version: PREFERENCES_VERSION,
		migrations: preferenceMigrations,
	},
) as PreferencesStorageItem;

export const _favoritedPlaces = storage.defineItem<number[]>(
	"sync:favoritedPlaces",
	{
		fallback: [],
		version: 1,
	},
);

export const _bestFriends = storage.defineItem("sync:bestFriends", {
	fallback: [],
	version: 1,
});

export const _viewedForumThreads = storage.defineItem<number[]>(
	"local:viewedForumThreads",
	{
		fallback: [],
		version: 1,
	},
);

export interface KilnNotification {
	userId?: number;
	message: string;
	date: string;
	url: string;
	avatarUrl: string;
	read: boolean;
	dedupeValue: string;
	notifiedAt?: string;
}

export const _kilnNotifications = storage.defineItem<
	Record<string, KilnNotification>
>("local:kilnNotifications", {
	fallback: {},
	version: 1,
});

export const _forumMentionChecks = storage.defineItem<
	Record<number, { since: string; checkedAt: number }>
>("local:forumMentionChecks", {
	fallback: {},
	version: 1,
});

export const _notificationBellOpenedAt = storage.defineItem<
	Record<number, number>
>("local:notificationBellOpenedAt", {
	fallback: {},
	version: 1,
});

export interface PastNotification {
	id: number;
	message: string;
	url: string;
	avatarUrl: string;
	date: string;
}

export const UNASSIGNED_PAST_NOTIFICATIONS = "unassigned";

export const _pastNotifications = storage.defineItem<
	Record<string, Record<number, PastNotification>>
>("local:pastNotifications", {
	fallback: {},
	version: 2,
	migrations: {
		2: (old: Record<number, PastNotification>) => ({
			[UNASSIGNED_PAST_NOTIFICATIONS]: old,
		}),
	},
});

export type SavedTheme = {
	id: string;
	name: string;
	accentColor: string;
	navbarColor: string;
	fontFamily?: string;
	customCss?: string;
	publishedSlug?: string;
	previousPublishedSlug?: string;
	importedSlug?: string;
	importedFromProfile?: number;
	autoUpdate?: boolean;
	backgroundImage?: string;
	backgroundOverlayColor?: string;
	backgroundOverlayOpacity?: number;
	effects?: ThemeEffect[];
	navbarIconColor?: string;
	cursorUrl?: string;
	cursorScale?: number;
	colorTokens?: Record<string, string>;
	ambient?: Ambient;
	cardStyle?: CardStyle;
	pointerEffects?: PointerEffects;
};

export const _savedThemes = storage.defineItem<SavedTheme[]>(
	"local:savedThemes",
	{
		fallback: [],
		version: 1,
	},
);

const _savedThemesSync = storage.defineItem<SavedTheme[]>("sync:savedThemes", {
	fallback: [],
	version: 1,
});

export async function migrateThemesToLocal(): Promise<void> {
	const syncThemes = await _savedThemesSync.getValue();
	if (syncThemes.length === 0) return;

	const localThemes = await _savedThemes.getValue();
	const localIds = new Set(localThemes.map((t) => t.id));
	const missingFromLocal = syncThemes.filter((t) => !localIds.has(t.id));
	if (missingFromLocal.length > 0) {
		await _savedThemes.setValue([...localThemes, ...missingFromLocal]);
	}
	await _savedThemesSync.removeValue();
}

export const _seenTradeIds = storage.defineItem<number[]>(
	"local:seenTradeIds",
	{
		fallback: [],
		version: 1,
	},
);

export const _screenedNotificationIds = storage.defineItem<
	Record<number, number[]>
>("local:screenedNotificationIds", {
	fallback: {},
	version: 2,
	migrations: { 2: () => ({}) },
});

export const _viewedTradeIds = storage.defineItem<number[]>(
	"local:viewedTradeIds",
	{
		fallback: [],
		version: 1,
	},
);

export const _userAliases = storage.defineItem<Record<number, string>>(
	"local:userAliases",
	{
		fallback: {},
		version: 1,
	},
);

export const _userNotes = storage.defineItem<Record<number, string>>(
	"local:userNotes",
	{
		fallback: {},
		version: 1,
	},
);

export const _homepageSectionOrder = storage.defineItem<string[]>(
	"local:homepageSectionOrder",
	{
		fallback: [],
		version: 1,
	},
);

export interface PendingAssetApproval {
	userId?: number;
	assetId: number;
	addedAt: string;
}

export const _pendingAssetApprovals = storage.defineItem<
	Record<number, PendingAssetApproval>
>("local:pendingAssetApprovals", {
	fallback: {},
	version: 1,
});

export async function addPendingAssetApproval(
	assetId: number,
	userId: number,
): Promise<void> {
	const pending = await _pendingAssetApprovals.getValue();
	pending[assetId] = { userId, assetId, addedAt: new Date().toISOString() };
	await _pendingAssetApprovals.setValue(pending);
}

preferences.getPreferences = async function () {
	const userPreferences = await this.getValue();

	const mergedEnabled = [
		...new Set([
			...defaultPreferences.enabled,
			...(userPreferences.enabled ?? []),
		]),
	].filter((id) => !(userPreferences.disabled ?? []).includes(id));

	const mergedConfig = {
		...defaultPreferences.config,
		...userPreferences.config,
		...Object.fromEntries(
			Object.keys(defaultPreferences.config).map((id) => [
				id,
				{
					...defaultPreferences.config[
						id as keyof typeof defaultPreferences.config
					],
					...(userPreferences.config?.[
						id as keyof typeof userPreferences.config
					] ?? {}),
				},
			]),
		),
	};

	const configResult = await sendMessage("getConfig").catch(() => null);
	const flags = configResult?.ok ? configResult.data.flags : {};
	const mobile = isMobileDevice();
	const chrome = isChrome();
	const activeEnabled = mergedEnabled.filter(
		(id) =>
			flags[`features.${id}.enabled`] !== false &&
			!(mobile && desktopOnlyIds.has(id)) &&
			!(!chrome && chromeOnlyIds.has(id)) &&
			!deprecatedHiddenIds.has(id),
	);

	return {
		...defaultPreferences,
		...userPreferences,
		enabled: activeEnabled,
		disabled: userPreferences.disabled ?? [],
		config: mergedConfig,
	};
};

const originalSetValue = preferences.setValue.bind(preferences);

preferences.setValue = async function (value) {
	const rawStored = await this.getValue();
	const configResult = await sendMessage("getConfig").catch(() => null);
	const flags = configResult?.ok ? configResult.data.flags : {};
	const mobile = isMobileDevice();
	const chrome = isChrome();
	const disabled = value.disabled ?? [];

	const enabled = new Set(value.enabled ?? []);
	for (const id of rawStored.enabled ?? []) {
		if (enabled.has(id) || disabled.includes(id)) continue;
		const filteredOut =
			flags[`features.${id}.enabled`] === false ||
			(mobile && desktopOnlyIds.has(id)) ||
			(!chrome && chromeOnlyIds.has(id)) ||
			deprecatedHiddenIds.has(id);
		if (filteredOut) enabled.add(id);
	}

	return originalSetValue({ ...value, enabled: [...enabled] });
};

export const cache = storage.defineItem<CacheInterface>("local:cache", {
	fallback: {
		remoteConfig: null as Record<string, any> | null,
		favoritedPlaces: {},
		bestFriends: {},
		inventory: {},
		users: {},
		userIDs: {},
		avatars: {},
		items: {},
		places: {},
		placeGamepasses: {},
		placeRevenue: {},
		ownerCount: {},
		greatDivideStats: {},
		lastDailyActiveUser: null as string | null,
		collectibles: {},
	},
	version: 2,
	migrations: {
		2: () => ({
			remoteConfig: null,
			favoritedPlaces: {},
			bestFriends: {},
			inventory: {},
			users: {},
			userIDs: {},
			avatars: {},
			items: {},
			places: {},
			placeGamepasses: {},
			placeRevenue: {},
			ownerCount: {},
			greatDivideStats: {},
			lastDailyActiveUser: null,
			collectibles: {},
		}),
	},
});

export const apiSessions = storage.defineItem<ApiSession[]>(
	"local:kilnSessions",
	{
		fallback: [],
		version: 1,
	},
);

export const kilnBans = storage.defineItem<KilnBan[]>("local:kilnBans", {
	fallback: [],
	version: 1,
});

export const dismissedNotices = storage.defineItem<string[]>(
	"local:dismissedNotices",
	{
		fallback: [],
		version: 1,
	},
);

export const _hasShownPublishRulesModal = storage.defineItem<boolean>(
	"local:hasShownPublishRulesModal",
	{
		fallback: false,
		version: 1,
	},
);

export const _reportedTimezones = storage.defineItem<
	Record<number, { timezone: string; reportedAt: number }>
>("local:reportedTimezones", {
	fallback: {},
	version: 1,
});

export const _reportedOutfits = storage.defineItem<
	Record<number, { signature: string; checkedAt: number; uploadedAt: number }>
>("local:reportedOutfits", {
	fallback: {},
	version: 1,
});

export const _showKilnDisclosures = storage.defineItem<boolean>(
	"local:showKilnDisclosures",
	{
		fallback: false,
		version: 1,
	},
);

export const _condensedTabBars = storage.defineItem<boolean>(
	"local:condensedTabBars",
	{
		fallback: true,
		version: 1,
	},
);

export const _textTruncateFix = storage.defineItem<boolean>(
	"local:textTruncateFix",
	{
		fallback: false,
		version: 1,
	},
);

export const _forumFeedbackRedirectBanner = storage.defineItem<boolean>(
	"local:forumFeedbackRedirectBanner",
	{
		fallback: true,
		version: 1,
	},
);

export const _kilnUpdatesCategory = storage.defineItem<boolean>(
	"local:kilnUpdatesCategory",
	{
		fallback: true,
		version: 1,
	},
);

export interface BookmarkedThread {
	threadId: number;
	categoryId?: number;
	title: string;
	url: string;
	bookmarkedAt: string;
}

export const _bookmarkedThreads = storage.defineItem<
	Record<number, BookmarkedThread>
>("local:bookmarkedThreads", {
	fallback: {},
	version: 1,
});

export interface BookmarkedReply {
	replyId: number;
	threadId: number;
	categoryId?: number;
	title: string;
	author: string;
	content: string;
	bookmarkedAt: string;
}

export const _bookmarkedReplies = storage.defineItem<
	Record<number, BookmarkedReply>
>("local:bookmarkedReplies", {
	fallback: {},
	version: 1,
});

export interface ForumDraft {
	id: string;
	categoryId: number;
	title: string;
	content: string;
	updatedAt: string;
}

export const _forumDrafts = storage.defineItem<Record<string, ForumDraft>>(
	"local:forumDrafts",
	{
		fallback: {},
		version: 1,
	},
);

export interface SavedForumImage {
	imageId: number;
	starredAt: string;
}

export const _forumImages = storage.defineItem<Record<number, SavedForumImage>>(
	"local:forumImages",
	{
		fallback: {},
		version: 1,
	},
);

export async function removeForumImage(imageId: number): Promise<void> {
	const current = await _forumImages.getValue();
	const { [imageId]: _removed, ...rest } = current;
	await _forumImages.setValue(rest);
}

export async function setForumImageStarred(
	imageId: number,
	starred: boolean,
): Promise<void> {
	if (!starred) {
		await removeForumImage(imageId);
		return;
	}

	const current = await _forumImages.getValue();
	current[imageId] = { imageId, starredAt: new Date().toISOString() };
	await _forumImages.setValue(current);
}

export const _securityKeyNames = storage.defineItem<Record<number, string>>(
	"local:securityKeyNames",
	{
		fallback: {},
		version: 1,
	},
);

export const _errorLog = storage.defineItem<KilnErrorLogEntry[]>(
	"local:errorLog",
	{
		fallback: [],
		version: 1,
	},
);

const _feedbackClientId = storage.defineItem<string | null>(
	"local:feedbackClientId",
	{
		fallback: null,
		version: 1,
	},
);

export async function getFeedbackClientId(): Promise<string> {
	const existing = await _feedbackClientId.getValue();
	if (existing) return existing;

	const id = crypto.randomUUID();
	await _feedbackClientId.setValue(id);
	return id;
}
