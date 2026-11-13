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

import type { Extension, LOVE, PolyTrack, Polytoria } from "@kiln/schemas";
import { defineExtensionMessaging } from "@webext-core/messaging";
import type { PolytoriaTradeOwnerHistory } from "../../../packages/schemas/src/apis/love";
import type {
	AvatarIFrameState,
	FeaturedPlacesApi,
	FeedApi,
	FeedSearchFilters,
	ForumSearchFilters,
	KilnBan,
	KilnErrorLogEntry,
	PlacesListingApi,
	PlacesListingFilters,
	Result,
	StoreListingApi,
	StoreListingFilters,
} from "./types";

export type ProfileThemePayload = {
	accentColor: string;
	navbarColor: string;
	fontFamily?: string;
	customCss?: string;
	backgroundImage?: string;
	backgroundOverlayColor?: string;
	backgroundOverlayOpacity?: number;
	effects?: import("./types").ThemeEffect[];
	navbarIconColor?: string;
	cursorUrl?: string;
	colorTokens?: Record<string, string>;
	layout?: Extension.ProfileLayout;
	usernameStyle?: Extension.ProfileUsernameStyle;
	banner?: Extension.ProfileBanner;
	ambient?: Extension.ProfileAmbient;
	stickers?: Extension.ProfileSticker[];
	notes?: Extension.ProfileNote[];
	videos?: Extension.ProfileVideo[];
	cardStyle?: Extension.ProfileCardStyle;
	avatarBackdrop?: Extension.ProfileAvatarBackdrop;
	pointerEffects?: Extension.ProfilePointerEffects;
};

export interface ProtocolMap {
	openPreferences(): void;
	themeAutoUpdated(): void;
	downloadPlaceFile(id: number): void;
	getModelFile(id: number): string;
	joinPlace(data: {
		placeId: number;
		serverId?: number;
		version: 1 | 2;
	}): Promise<Result<boolean>>;
	registerBootstrapElements(): void;
	getStreakFreezeCount(): Promise<Result<number | null>>;
	disableFeedAutoScroll(): void;
	getFeed(page: number): Promise<Result<FeedApi>>;
	getStoreListing(
		filters: StoreListingFilters,
	): Promise<Result<StoreListingApi>>;
	disablePlacesAutoScroll(): void;
	getPlacesListing(
		filters: PlacesListingFilters,
	): Promise<Result<PlacesListingApi>>;
	getFeaturedPlaces(): Promise<Result<FeaturedPlacesApi>>;
	getForumSearch(
		filters: ForumSearchFilters,
	): Promise<Result<PolyTrack.ForumSearchApi>>;
	getForumReplyRedirect(replyId: number): Promise<Result<string>>;
	showHiddenCategoryAlert(): void;
	getFeedSearch(
		filters: FeedSearchFilters,
	): Promise<Result<PolyTrack.FeedSearchApi>>;
	getPolyTrackSearch(data: {
		query: string;
		lane: "entities" | "content";
		limit: number;
	}): Promise<Result<PolyTrack.SearchApi>>;
	openCreator(version: 1 | 2): void;
	changeUserAlias(data: { userId: number; currentAlias?: string }): void;

	getUser(id: number): Promise<Result<Polytoria.UserApi>>;
	findUserByUsername(username: string): Promise<Result<number>>;
	searchUsersByActivity(
		query: string,
	): Promise<Result<Extension.ActivitySearchApi["data"]>>;
	getActivityUser(
		id: number,
	): Promise<Result<Extension.ActivityUserApi["data"]>>;
	getUserAvatar(id: number): Promise<Result<Polytoria.AvatarApi>>;
	getBestFriends(userIds: number[]): Promise<Result<Polytoria.UserApi[]>>;
	getUserInventory(data: {
		userId: number;
		limit: number;
		page?: number;
		collectiblesOnly?: boolean;
	}): Promise<Result<Polytoria.InventoryApi>>;
	getOwnedAssetMap(
		userId: number,
	): Promise<Result<Record<number, { isLimited: boolean; serials: number[] }>>>;
	getFriendRequests(): Promise<Result<{ senderID: number }[]>>;
	manageFriendRequests(
		action: "acceptAll" | "declineAll",
	): Promise<Result<void>>;
	acceptFriendRequest(senderUserId: number): Promise<Result<void>>;
	declineFriendRequest(senderUserId: number): Promise<Result<void>>;
	getProfileVersions(userId: number): Promise<Result<PolyTrack.UserApi>>;
	getUserCreations(data: {
		userId: number;
		page?: number;
		limit?: number;
	}): Promise<Result<Polytoria.UserCreationsApi>>;
	getGuildCreations(data: {
		guildId: number;
		page?: number;
		limit?: number;
	}): Promise<Result<Polytoria.GuildCreationsApi>>;
	updateBodyColor(data: { bodyPart: string; color: string }): void;
	getUserCharts(userId: number): Promise<Result<PolyTrack.UserChartsApi>>;
	getWorldStatsChart(data: {
		placeId: number;
		metric: PolyTrack.WorldStatsMetric;
		start: string;
		stop: string;
		window?: string;
	}): Promise<Result<PolyTrack.WorldStatsChartApi>>;
	getWorldIngameChart(data: {
		placeId: number;
		start: string;
		stop: string;
		window?: string;
	}): Promise<Result<PolyTrack.WorldIngameChartApi>>;
	getWorldVersions(
		worldIds: number[],
	): Promise<Result<Record<string, "1.0" | "2.0" | null>>>;

	getStore(data: {
		order?: string;
		sort?: string;
		showOffsale?: boolean;
		types?: string[];
		search?: string;
		page?: number;
		limit?: number;
	}): Promise<Result<Polytoria.StoreApi>>;
	getStoreBodies(): Promise<Result<Polytoria.StoreApi>>;
	getItem(id: number): Promise<Result<Polytoria.ItemApi>>;
	getItemMesh(id: number): Promise<Result<Polytoria.MeshApi>>;
	getAssetAudio(id: number): Promise<Result<Polytoria.AudioApi>>;
	getItemTexture(id: number): Promise<Result<Polytoria.TextureApi>>;
	fetchCdnImageDataUrl(url: string): Promise<Result<string>>;
	getItemOwners(data: {
		itemId: number;
		limit?: number;
		page?: number;
	}): Promise<Result<Polytoria.OwnersApi>>;
	getItemCopy(data: {
		itemId: number;
		userId: number;
	}): Promise<Result<Polytoria.IndividualOwnerApi>>;
	resolveItemThumbnails(
		hashes: string[],
	): Promise<Result<Extension.ItemThumbnailMapApi>>;

	getPlace(id: number): Promise<Result<Polytoria.PlaceApi>>;
	getPlaceGamepasses(placeId: number): Promise<Result<Polytoria.GamepassesApi>>;
	getFavoritedPlaces(userId: number): Promise<Result<Polytoria.PlaceApi[]>>;
	favoritePlace(data: {
		placeId: number;
		userId: number;
	}): Promise<Result<null>>;
	unfavoritePlace(data: {
		placeId: number;
		userId: number;
	}): Promise<Result<null>>;
	bulkWhitelist(data: { placeId: number; usernames: string[] }): void;
	rollRandomPlace(): Promise<Result<void>>;
	rollRandomPlaceStatus(status: string): void;

	rejectTrade(tradeId: number): Promise<Result<boolean>>;
	getPolytoriaTradeItems(itemIds: number[]): Promise<
		Result<
			{
				itemId: number;
				data: LOVE.PolytoriaTradeItemWithTagsResult | null;
			}[]
		>
	>;
	getItemOwnerHistory(
		itemId: number,
	): Promise<Result<PolytoriaTradeOwnerHistory>>;
	getNFTItems(userId: number): Promise<Result<Extension.NFTItemsApi>>;
	markItemAsNFT(data: {
		userId: number;
		itemId: number;
		serials: number[] | null;
	}): Promise<Result<{ success: boolean }>>;
	unmarkItemAsNFT(data: {
		userId: number;
		itemId: number;
	}): Promise<Result<{ success: boolean }>>;
	getNLFItems(userId: number): Promise<Result<Extension.NLFItemsApi>>;
	markItemAsNLF(data: {
		userId: number;
		itemId: number;
	}): Promise<Result<{ success: boolean }>>;
	unmarkItemAsNLF(data: {
		userId: number;
		itemId: number;
	}): Promise<Result<{ success: boolean }>>;
	getPinnedAchievements(
		userId: number,
	): Promise<Result<Extension.PinnedAchievementsApi>>;
	pinAchievement(data: {
		achievementId: number;
		userId: number;
	}): Promise<Result<null>>;
	unpinAchievement(data: {
		achievementId: number;
		userId: number;
	}): Promise<Result<null>>;

	getLikeCount(userId: number): Promise<Result<Extension.LikeCountApi>>;
	getKilnUsage(userId: number): Promise<Result<Extension.KilnUsageApi>>;
	getUserTimezone(userId: number): Promise<Result<Extension.UserTimezoneApi>>;
	setUserTimezone(data: {
		userId: number;
		timezone: string;
	}): Promise<Result<{ success: boolean }>>;
	clearUserTimezone(userId: number): Promise<Result<{ success: boolean }>>;
	getUserEditingStatus(
		userId: number,
	): Promise<Result<Extension.UserEditingStatusApi>>;
	getWorldEditTime(userId: number): Promise<Result<Extension.WorldEditTimeApi>>;
	getUserDonation(userId: number): Promise<Result<Extension.UserDonationApi>>;
	setUserDonation(data: {
		userId: number;
		url: string;
	}): Promise<Result<{ success: boolean }>>;
	clearUserDonation(userId: number): Promise<Result<{ success: boolean }>>;
	showDonationLinkPrompt(data: {
		currentUrl: string | null;
	}): Promise<Result<string | null>>;
	showDonationWarning(data: { url: string }): Promise<Result<boolean>>;
	getPublicOutfits(userId: number): Promise<Result<Extension.PublicOutfitsApi>>;
	syncPublicOutfits(data: {
		userId: number;
		outfits: { id: number; name: string; thumbnail: string }[];
	}): Promise<Result<{ success: boolean }>>;
	clearPublicOutfits(userId: number): Promise<Result<{ success: boolean }>>;
	getLikeStatus(data: {
		userId: number;
		targetUserId: number;
	}): Promise<Result<Extension.LikeStatusApi>>;
	likeUser(data: {
		userId: number;
		targetUserId: number;
	}): Promise<Result<{ success: boolean }>>;
	unlikeUser(data: {
		userId: number;
		targetUserId: number;
	}): Promise<Result<{ success: boolean }>>;

	getBlockedTraders(
		userId: number,
	): Promise<Result<Extension.BlockedTradersApi>>;
	blockTrader(data: {
		userId: number;
		blockedUserId: number;
	}): Promise<Result<{ success: boolean }>>;
	unblockTrader(data: {
		userId: number;
		blockedUserId: number;
	}): Promise<Result<{ success: boolean }>>;

	getGameActivity(data: {
		userId: number;
		gameId: number;
		page?: number;
		pageSize?: number;
		forceRefresh?: boolean;
	}): Promise<Result<PolyTrack.GameActivityApi>>;

	getApiSession(userId: number): Promise<Result<Extension.CurrentSessionApi>>;
	startKilnVerification(
		userId: number,
	): Promise<Result<Extension.AuthStartApi>>;
	finishKilnVerification(userId: number): Promise<Result<Extension.AuthEndApi>>;
	checkKilnBan(userId: number): Promise<Result<KilnBan | null>>;
	getProfileBio(): Promise<Result<string>>;
	updateProfileBio(description: string): Promise<Result<boolean>>;
	terminateKilnSession(userId: number): Promise<Result<null>>;
	getKilnSessions(userId: number): Promise<Result<Extension.AuthSessionsApi>>;
	terminateKilnSessionById(data: {
		userId: number;
		sessionId: string;
	}): Promise<Result<null>>;
	getKilnAddonInstalls(
		userId: number,
	): Promise<Result<Extension.AddonInstallsApi>>;
	downloadKilnAddon(
		userId: number,
	): Promise<Result<Extension.DownloadAddonApi>>;
	revokeKilnAddonInstall(data: {
		userId: number;
		id: string;
	}): Promise<Result<null>>;

	publishTheme(data: {
		userId: number;
		name: string;
		accentColor: string;
		navbarColor: string;
		fontFamily?: string;
		customCss?: string;
		backgroundImage?: string;
		effects?: import("./types").ThemeEffect[];
		existingId?: string;
		navbarIconColor?: string;
		cursorUrl?: string;
		backgroundOverlayColor?: string;
		backgroundOverlayOpacity?: number;
		colorTokens?: Record<string, string>;
		ambient?: Extension.ProfileAmbient;
		cardStyle?: Extension.ProfileCardStyle;
		pointerEffects?: Extension.ProfilePointerEffects;
	}): Promise<Result<Extension.PublishThemeApi>>;
	getPublishedTheme(
		id: string,
	): Promise<Result<Extension.GetPublishedThemeApi>>;
	getThemeGallery(page?: number): Promise<Result<Extension.ThemeGalleryApi>>;
	unpublishTheme(data: {
		userId: number;
		id: string;
	}): Promise<Result<Extension.UnpublishThemeApi>>;
	deletePublishedTheme(data: {
		userId: number;
		id: string;
	}): Promise<Result<Extension.UnpublishThemeApi>>;
	reportTheme(data: {
		id: string;
		reason: string;
	}): Promise<Result<Extension.ReportThemeApi>>;

	getProfileTheme(userId: number): Promise<Result<Extension.ProfileThemeApi>>;
	getMyProfileTheme(userId: number): Promise<Result<Extension.ProfileThemeApi>>;
	saveProfileTheme(
		data: { userId: number } & ProfileThemePayload,
	): Promise<Result<Extension.ProfileThemeApi>>;
	getProfileThemeSlots(
		userId: number,
	): Promise<Result<Extension.ProfileThemeSlotsApi>>;
	saveProfileThemeSlot(
		data: { userId: number; slot: number } & ProfileThemePayload,
	): Promise<Result<Extension.ProfileThemeSlotsApi>>;
	renameProfileThemeSlot(data: {
		userId: number;
		slot: number;
		name: string;
	}): Promise<Result<Extension.ProfileThemeSlotsApi>>;
	clearProfileThemeSlot(data: {
		userId: number;
		slot: number;
	}): Promise<Result<Extension.ProfileThemeSlotsApi>>;
	setProfileThemeEnabled(data: {
		userId: number;
		enabled: boolean;
	}): Promise<Result<Extension.ProfileThemeOkApi>>;
	deleteProfileTheme(
		userId: number,
	): Promise<Result<Extension.ProfileThemeOkApi>>;
	reportProfileTheme(data: {
		userId: number;
		reason: string;
	}): Promise<Result<Extension.ProfileThemeOkApi>>;

	adminGetPendingThemes(
		userId: number,
	): Promise<Result<Extension.AdminPendingThemesApi>>;
	adminReviewTheme(data: {
		userId: number;
		id: string;
		action: "approve" | "decline";
	}): Promise<Result<Extension.AdminReviewThemeApi>>;
	adminGetPendingProfileThemes(
		userId: number,
	): Promise<Result<Extension.AdminPendingProfileThemesApi>>;
	adminReviewProfileTheme(data: {
		userId: number;
		targetUserId: number;
		action: "approve" | "decline";
	}): Promise<Result<Extension.ProfileThemeOkApi>>;
	adminDeleteProfileTheme(data: {
		userId: number;
		targetUserId: number;
	}): Promise<Result<Extension.ProfileThemeOkApi>>;
	adminDeleteTheme(data: {
		userId: number;
		id: string;
	}): Promise<Result<Extension.AdminDeleteThemeApi>>;
	adminDeletePlaceReview(data: {
		userId: number;
		id: string;
	}): Promise<Result<Extension.AdminDeletePlaceReviewApi>>;
	adminGetPlaceAiDisclosures(data: {
		userId: number;
		placeId: number;
	}): Promise<Result<Extension.AdminPlaceAiDisclosuresApi>>;
	adminListAiDisclosedPlaces(
		userId: number,
	): Promise<Result<Extension.AdminAiDisclosedPlacesApi>>;
	adminAddPlaceAiDisclosure(data: {
		userId: number;
		placeId: number;
		kind: "icon" | "thumbnail" | "assisted" | "generated";
		imageHash?: string;
	}): Promise<Result<Extension.AdminAiDisclosureOkApi>>;
	adminRemovePlaceAiDisclosure(data: {
		userId: number;
		id: number;
	}): Promise<Result<Extension.AdminAiDisclosureOkApi>>;
	adminGetAiReports(
		userId: number,
	): Promise<Result<Extension.AdminAiReportsApi>>;
	adminReviewAiReport(data: {
		userId: number;
		id: string;
		action: "resolve" | "dismiss";
	}): Promise<Result<Extension.AdminAiDisclosureOkApi>>;
	adminBanUser(data: {
		userId: number;
		targetUserId: number;
		reason?: string;
	}): Promise<Result<Extension.AdminBanUserApi>>;
	adminUnbanUser(data: {
		userId: number;
		targetUserId: number;
	}): Promise<Result<Extension.AdminBanUserApi>>;
	adminGetBannedUsers(data: {
		userId: number;
		search?: string;
		page?: number;
	}): Promise<Result<Extension.AdminBannedUsersApi>>;
	adminGetUserRisk(data: {
		userId: number;
		targetUserId: number;
	}): Promise<Result<Extension.AdminUserRiskApi>>;
	adminSetUserTrusted(data: {
		userId: number;
		targetUserId: number;
		trusted: boolean;
	}): Promise<Result<Extension.AdminTrustUserApi>>;
	adminAdjustUserRisk(data: {
		userId: number;
		targetUserId: number;
		delta: number;
	}): Promise<Result<Extension.AdminAdjustRiskApi>>;
	adminClearUserRiskHits(data: {
		userId: number;
		targetUserId: number;
	}): Promise<Result<Extension.AdminClearRiskHitsApi>>;

	getConfig(): Promise<Result<Extension.ExtensionConfig>>;
	getChangelog(): Promise<Result<string>>;
	getCurrencyRates(): Promise<Result<Extension.CurrencyExchangeRate>>;
	getProfanityFilter(): Promise<Result<string>>;
	submitFeedback(data: {
		type: "feature" | "general" | "bug";
		message: string;
		version: string;
		username: string;
		userId?: number;
	}): Promise<Result<Extension.SubmitFeedbackApi>>;
	getMyFeedback(userId?: number): Promise<Result<Extension.MyFeedbackApi>>;
	adminGetFeedback(data: {
		userId: number;
		type?: "feature" | "general" | "bug";
		status?: "open" | "resolved";
		unanswered?: boolean;
		search?: string;
		page?: number;
	}): Promise<Result<Extension.AdminFeedbackListApi>>;
	adminRespondFeedback(data: {
		userId: number;
		id: string;
		response: string;
	}): Promise<Result<Extension.AdminFeedbackApi>>;
	adminResolveFeedback(data: {
		userId: number;
		id: string;
	}): Promise<Result<Extension.AdminFeedbackApi>>;
	adminReopenFeedback(data: {
		userId: number;
		id: string;
	}): Promise<Result<Extension.AdminFeedbackApi>>;
	adminDeleteFeedback(data: {
		userId: number;
		id: string;
	}): Promise<Result<Extension.AdminDeleteFeedbackApi>>;
	adminGetStats(userId: number): Promise<Result<Extension.AdminStatsApi>>;
	reportError(entry: Omit<KilnErrorLogEntry, "timestamp">): void;

	getAvatarOutfits(userId: number): Promise<Result<Extension.AvatarOutfitsApi>>;
	createAvatarOutfit(data: {
		userId: number;
		name: string;
		avatarData: AvatarIFrameState;
	}): Promise<Result<Extension.AvatarOutfitApi>>;
	updateAvatarOutfit(data: {
		userId: number;
		outfitId: string;
		name?: string;
		avatarData?: AvatarIFrameState;
	}): Promise<Result<Extension.AvatarOutfitApi>>;
	deleteAvatarOutfit(data: {
		userId: number;
		outfitId: string;
	}): Promise<Result<{ success: boolean }>>;

	getPlaceAiDisclosures(
		placeId: number,
	): Promise<Result<Extension.PlaceAiDisclosuresApi>>;
	showPlaceAiReportPrompt(data: {
		hasLabels: boolean;
		verified: boolean;
	}): Promise<
		Result<{ kind: "missing" | "incorrect"; details: string } | null>
	>;
	reportPlaceAiDisclosure(data: {
		userId: number;
		placeId: number;
		kind: "missing" | "incorrect";
		details?: string;
	}): Promise<Result<Extension.PlaceAiReportApi>>;
	getPlaceReviews(data: {
		placeId: number;
		userId: number;
	}): Promise<Result<Extension.PlaceReviewsApi>>;
	getPlaceReviewPlaytimes(data: {
		placeId: number;
		userId: number;
		reviewIds: string[];
	}): Promise<Result<Extension.PlaceReviewPlaytimesApi>>;
	submitPlaceReview(data: {
		placeId: number;
		userId: number;
		rating: number;
		body?: string;
		anonymous?: boolean;
		wasPublic?: boolean;
	}): Promise<Result<Extension.PlaceReviewApi>>;
	deleteMyPlaceReview(data: {
		placeId: number;
		userId: number;
		wasPublic?: boolean;
	}): Promise<Result<null>>;
	submitReviewReply(data: {
		userId: number;
		reviewId: string;
		body: string;
	}): Promise<Result<Extension.PlaceReviewReplyApi>>;
	deleteReviewReply(data: {
		userId: number;
		replyId: string;
	}): Promise<Result<null>>;
	getMessagingStatus(
		userId: number,
	): Promise<Result<Extension.MessagingStatusApi>>;
	setMessagingEnabled(data: {
		userId: number;
		enabled: boolean;
	}): Promise<Result<Extension.MessagingStatusApi["data"]["enabled"]>>;
	getDirectConversations(
		userId: number,
	): Promise<Result<Extension.DirectConversationsApi>>;
	getDirectMessages(data: {
		userId: number;
		partnerId: number;
		before?: number;
	}): Promise<Result<Extension.DirectMessagesApi>>;
	sendDirectMessage(data: {
		userId: number;
		recipientId: number;
		body: string;
		imageAssetId?: number;
	}): Promise<Result<Extension.SendDirectMessageApi>>;
	markDirectConversationRead(data: {
		userId: number;
		partnerId: number;
	}): Promise<Result<null>>;
	setDirectMessageBlock(data: {
		userId: number;
		partnerId: number;
		blocked: boolean;
	}): Promise<Result<null>>;
	reportDirectMessage(data: {
		userId: number;
		messageId: number;
		reason: Extension.MessageReportReason;
		details?: string;
	}): Promise<Result<Extension.ReportDirectMessageApi>>;
	getTopReviewers(): Promise<Result<Extension.TopReviewersApi>>;
	// getMostLikedUsers(): Promise<Result<Extension.MostLikedUsersApi>>;
	getRatedWorldsLeaderboard(
		order: "highest" | "lowest",
	): Promise<Result<Extension.RatedWorldsLeaderboardApi>>;
	setNativeRankingsLoadingPaused(paused: boolean): void;

	getMigratablePlaceReviews(
		userId: number,
	): Promise<Result<Extension.MigratablePlaceReviewsApi>>;
	markPlaceReviewMigrated(data: {
		userId: number;
		reviewId: string;
		nativeRatingId?: number | null;
	}): Promise<Result<Extension.MigratePlaceReviewApi>>;
	createPolytoriaPlaceReview(data: {
		placeId: number;
		value: "like" | "dislike";
		content: string;
	}): Promise<Result<{ id: string | null }>>;
	unlinkNativePlaceReview(data: {
		placeId: number;
		userId: number;
	}): Promise<Result<null>>;
	removePolytoriaPlaceReview(placeId: number): Promise<Result<{ ok: boolean }>>;

	getKilnNotifications(
		userId: number,
	): Promise<Result<Extension.NotificationsApi>>;
	markKilnNotificationSeen(data: {
		userId: number;
		notificationId: number;
	}): Promise<Result<Extension.MarkNotificationSeenApi>>;

	getRetroItems(page?: number): Promise<Result<Extension.RetroItemsApi>>;
	getEventForItem(itemId: number): Promise<Result<Extension.EventForItemApi>>;
	getEvents(): Promise<Result<Extension.EventsListApi>>;
	getEventItems(eventId: number): Promise<Result<Extension.EventItemsApi>>;
	getEventProgress(userId: number): Promise<Result<Polytoria.EventItemsApi>>;
	getGreatDivideStats(
		userId: number,
	): Promise<Result<Extension.GreatDivideStatsApi | Extension.ErrorGeneric>>;
	checkUserActivity(data: {
		userIds: number[];
		days: number;
	}): Promise<
		Result<Record<string, { active: boolean; registeredAt: string | null }>>
	>;

	getAvatarHashes(userIds: number[]): Promise<Result<Record<string, string>>>;

	showSecurityKeyRenamePrompt(data: {
		currentName: string;
	}): Promise<Result<string | null>>;
	showHomepageReorderModal(data: {
		sections: Array<{
			id: string;
			label: string;
			locked?: boolean;
			group?: string;
		}>;
	}): Promise<Result<string[] | null>>;
	showBannedUserAlert(
		data: Extension.ActivitySearchApi["data"][number],
	): Promise<Result<void>>;

	updateOutfit(data: { id: number; name: string }): Promise<Result<unknown>>;

	exportUserData(userId: number): Promise<Result<Extension.DataExportApi>>;

	getLibraryAddons(data: {
		page: number;
		search?: string;
	}): Promise<Result<Extension.AddonLibraryApi>>;
	getMyAddons(userId: number): Promise<Result<Extension.MyAddonsApi>>;
	publishAddon(data: {
		userId: number;
		name: string;
		description: string;
		changelog?: string;
		content: string;
	}): Promise<Result<Extension.PublishAddonApi>>;
	reportAddon(data: {
		userId: number;
		id: string;
		category: "malicious" | "stolen" | "broken" | "inappropriate" | "other";
		details?: string;
	}): Promise<Result<Extension.AddonOkApi>>;
	deleteMyAddon(data: {
		userId: number;
		id: string;
	}): Promise<Result<Extension.AddonOkApi>>;
}

export const { sendMessage, onMessage } =
	defineExtensionMessaging<ProtocolMap>();
