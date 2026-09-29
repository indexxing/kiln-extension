import z from "zod";

export const ExtensionConfigSchema = z.object({
	latestVersion: z.string(),
	notices: z.array(
		z.object({
			id: z.string(),
			message: z.string(),
			type: z.enum(["info", "warning"]),
		}),
	),
	apiAvailability: z.object({
		public: z.boolean(),
		internal: z.boolean(),
		extension: z.boolean(),
		proxy: z.boolean(),
		currencyRates: z.boolean(),
	}),
	flags: z.record(z.string(), z.boolean()),
	limits: z.object({
		maxPinnedWorlds: z.number().positive().default(25),
		maxNFTItems: z.number().positive().default(50),
		maxNFTSerialsPerItem: z.number().positive().default(10),
		maxNLFItems: z.number().positive().default(50),
		maxBlockedTraders: z.number().positive().default(200),
		maxPublishedThemes: z.number().positive().default(15),
		maxPinnedAchievements: z.number().positive().default(5),
		minReviewPlaytimeMinutes: z.number().nonnegative().default(5),
		maxStarredImages: z.number().positive().default(100),
	}),
	users: z.object({
		generativeAI: z.array(z.number()),
	}),
});
export type ExtensionConfig = z.infer<typeof ExtensionConfigSchema>;

export const MetadataSchema = z.object({
	endpoints: z.object({
		public: z.string(),
		internal: z.string(),
		extension: z.string(),
		proxy: z.string(),
		currencyRates: z.string(),
	}),
	economy: z.object({
		membershipTax: z.object({
			free: z.number().min(0).max(1),
			plus: z.number().min(0).max(1),
			plusDeluxe: z.number().min(0).max(1),
		}),
		visitsPerBrick: z.number().nonnegative(),
	}),
});
export type Metadata = z.infer<typeof MetadataSchema>;

export const CurrentSessionApi = z.object({
	data: z.discriminatedUnion("state", [
		z.object({ state: z.literal("pending") }),
		z.object({
			state: z.literal("verified"),
			id: z.number(),
			likes: z.number(),
			linkedAt: z.string().nullable(),
		}),
	]),
});
export type CurrentSessionApi = z.infer<typeof CurrentSessionApi>;

export const AuthStartApi = z.object({
	data: z.object({
		phrase: z.string(),
		token: z.string(),
	}),
});
export type AuthStartApi = z.infer<typeof AuthStartApi>;

export const AuthEndApi = z.object({
	data: z.object({
		userId: z.number(),
		accessToken: z.string(),
		refreshToken: z.string(),
	}),
});
export type AuthEndApi = z.infer<typeof AuthEndApi>;

export const RefreshTokenApi = z.object({
	data: z.object({
		accessToken: z.string(),
		refreshToken: z.string(),
	}),
});
export type RefreshTokenApi = z.infer<typeof RefreshTokenApi>;

export const ErrorGeneric = z.object({
	data: z.null(),
	error: z.object({
		code: z.string(),
		message: z.string(),
	}),
});
export type ErrorGeneric = z.infer<typeof ErrorGeneric>;

export const CurrencyExchangeRate = z.object({
	date: z.iso.date(),
	usd: z.record(z.string(), z.number()),
});
export type CurrencyExchangeRate = z.infer<typeof CurrencyExchangeRate>;

export const RetroItemsApi = z.object({
	data: z.array(
		z.object({
			id: z.number(),
			accessoryType: z.string(),
			name: z.string(),
			assetUrl: z.url().nullable().optional(),
			createdAt: z.string().nullable().optional(),
			updatedAt: z.string().nullable().optional(),
		}),
	),
	meta: z.object({
		currentPage: z.number(),
		perPage: z.number(),
		totalPages: z.number(),
		totalCount: z.number(),
	}),
	links: z.object({
		self: z.string(),
		first: z.string(),
		last: z.string(),
		next: z.string().optional(),
		prev: z.string().optional(),
	}),
});
export type RetroItemsApi = z.infer<typeof RetroItemsApi>;

export const FavoritedPlaceIdsApi = z.object({
	data: z.array(z.number()),
	meta: z.object({
		currentPage: z.number(),
		perPage: z.number(),
		totalPages: z.number(),
		totalCount: z.number(),
	}),
	links: z.object({
		self: z.string(),
		first: z.string(),
		last: z.string(),
	}),
});
export type FavoritedPlaceIdsApi = z.infer<typeof FavoritedPlaceIdsApi>;

export const GreatDivideStatsApi = z.object({
	id: z.number().int().positive(),
	team: z.enum(["phantoms", "cobras"]),
	rank: z.enum([
		"recruit",
		"corporal",
		"sergeant",
		"lieutenant",
		"team captain",
	]),
	kills: z.int().nonnegative(),
	deaths: z.int().nonnegative(),
	pointsScored: z.int().nonnegative(),
	cashEarned: z.int().nonnegative(),
	flagsCaptured: z.int().nonnegative(),
	flagsReturned: z.int().nonnegative(),
	airdropsCollected: z.int().nonnegative(),
	obelisksDestroyed: z.int().nonnegative(),
	blocksPlaced: z.int().nonnegative(),
	blocksDestroyed: z.int().nonnegative(),
	headshots: z.int().nonnegative(),
	//enlistedAt: z.string(),
	lastRoundSeen: z.int().nonnegative(),
});
export type GreatDivideStatsApi = z.infer<typeof GreatDivideStatsApi>;

export const VersionOverride = z.object({
	id: z.number(),
	condition: z.object({
		minVersion: z.string().optional(),
		maxVersion: z.string().optional(),
	}),
	flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
	note: z.string().optional(),
});
export const VersionOverridesSchema = z.array(VersionOverride);
export type VersionOverride = z.infer<typeof VersionOverride>;

export const VersionPatch = z.object({
	version: z.string(),
	applied: z.boolean(),
	flags: z
		.record(z.string(), z.union([z.boolean(), z.number(), z.string()]))
		.optional(),
	notes: z.array(z.string()).optional(),
});
export const VersionPatchesSchema = z.array(VersionPatch);
export type VersionPatch = z.infer<typeof VersionPatch>;

export const BlockedTraders = z.object({
	data: z.array(z.number()),
});
export type BlockedTradersApi = z.infer<typeof BlockedTraders>;

export const LikeCountApi = z.object({
	data: z.object({ count: z.number() }),
});
export type LikeCountApi = z.infer<typeof LikeCountApi>;

export const KilnUsageApi = z.object({
	data: z.object({ linkedAt: z.string().nullable() }),
});
export type KilnUsageApi = z.infer<typeof KilnUsageApi>;

export const UserTimezoneApi = z.object({
	data: z.object({ timezone: z.string().nullable() }),
});
export type UserTimezoneApi = z.infer<typeof UserTimezoneApi>;

export const LikeStatusApi = z.object({
	data: z.object({ liked: z.boolean() }),
});
export type LikeStatusApi = z.infer<typeof LikeStatusApi>;

export const PublishThemeApi = z.object({
	data: z.object({
		id: z.string(),
		approvalStatus: z.string(),
	}),
});
export type PublishThemeApi = z.infer<typeof PublishThemeApi>;

const PendingTheme = z.object({
	id: z.string(),
	userId: z.number(),
	name: z.string(),
	accentColor: z.string(),
	navbarColor: z.string(),
	fontFamily: z.string().nullable().optional(),
	customCss: z.string().nullable().optional(),
	backgroundImage: z.string().nullable().optional(),
	approvalStatus: z.string(),
	createdAt: z.string().nullable().optional(),
});
export const AdminPendingThemesApi = z.object({ data: z.array(PendingTheme) });
export type AdminPendingThemesApi = z.infer<typeof AdminPendingThemesApi>;

export const AdminReviewThemeApi = z.object({
	data: z.object({ ok: z.boolean() }),
});
export type AdminReviewThemeApi = z.infer<typeof AdminReviewThemeApi>;

export const AdminDeleteThemeApi = z.object({
	data: z.object({ ok: z.boolean() }),
});
export type AdminDeleteThemeApi = z.infer<typeof AdminDeleteThemeApi>;

export const AdminConfigApi = z.object({ data: ExtensionConfigSchema });
export type AdminConfigApi = z.infer<typeof AdminConfigApi>;

export const AdminConfigListApi = z.object({
	data: z.array(
		z.object({
			version: z.string(),
			data: ExtensionConfigSchema,
			updatedAt: z.string().nullable(),
		}),
	),
});
export type AdminConfigListApi = z.infer<typeof AdminConfigListApi>;

export const AdminDeleteConfigApi = z.object({
	data: z.object({ ok: z.boolean() }),
});
export type AdminDeleteConfigApi = z.infer<typeof AdminDeleteConfigApi>;

export const UnpublishThemeApi = z.object({
	data: z.object({ ok: z.boolean() }),
});
export type UnpublishThemeApi = z.infer<typeof UnpublishThemeApi>;

const PublishedThemeEffect = z.object({
	id: z.string(),
	slot: z.enum([
		"global",
		"cards",
		"buttons",
		"inputs",
		"navbar",
		"modals",
		"avatars",
	]),
	type: z.enum([
		"border-radius",
		"box-shadow",
		"border-width",
		"border-color",
		"border-style",
		"background-color",
		"letter-spacing",
		"text-transform",
		"frame-image",
		"frame-shape",
		"clicking-sound",
		"background-music",
	]),
	value: z.union([z.string(), z.number()]),
});

export const PROFILE_AMBIENT_TYPES = [
	"snow",
	"stars",
	"rain",
	"bubbles",
	"fireflies",
	"petals",
] as const;

export const ProfileAmbient = z.object({
	type: z.enum(PROFILE_AMBIENT_TYPES),
	density: z.number(),
	color: z.string().optional(),
});
export type ProfileAmbient = z.infer<typeof ProfileAmbient>;

export const ProfileCardStyle = z.object({
	preset: z.enum(["solid", "glass", "outline", "gradient"]),
	tint: z.string().optional(),
	opacity: z.number().optional(),
	radius: z.number().optional(),
	hover: z.enum(["none", "lift", "glow", "tilt"]).optional(),
	liquidGlass: z.boolean().optional(),
});
export type ProfileCardStyle = z.infer<typeof ProfileCardStyle>;

export const ProfilePointerEffects = z.object({
	click: z.enum(["sparkles", "hearts", "ripples", "confetti"]).optional(),
	trail: z.enum(["sparkles", "dots", "hearts", "glow"]).optional(),
	color: z.string().optional(),
});
export type ProfilePointerEffects = z.infer<typeof ProfilePointerEffects>;

export const GetPublishedThemeApi = z.object({
	data: z.object({
		id: z.string(),
		userId: z.number(),
		name: z.string(),
		accentColor: z.string(),
		navbarColor: z.string(),
		fontFamily: z.string().nullable().optional(),
		customCss: z.string().nullable().optional(),
		backgroundImage: z.string().nullable().optional(),
		backgroundOverlayColor: z.string().nullable().optional(),
		backgroundOverlayOpacity: z.number().nullable().optional(),
		navbarIconColor: z.string().nullable().optional(),
		cursorUrl: z.string().nullable().optional(),
		effects: z.array(PublishedThemeEffect).nullable().optional(),
		colorTokens: z.record(z.string(), z.string()).nullable().optional(),
		ambient: ProfileAmbient.nullable().optional(),
		cardStyle: ProfileCardStyle.nullable().optional(),
		pointerEffects: ProfilePointerEffects.nullable().optional(),
	}),
});
export type GetPublishedThemeApi = z.infer<typeof GetPublishedThemeApi>;

const GalleryTheme = z.object({
	id: z.string(),
	userId: z.number(),
	name: z.string(),
	accentColor: z.string(),
	navbarColor: z.string(),
	fontFamily: z.string().nullable().optional(),
	backgroundImage: z.string().nullable().optional(),
	thumbnailUrl: z.string().nullable().optional(),
	effects: z.array(PublishedThemeEffect).nullable().optional(),
	hasCustomCss: z.boolean().optional(),
});
export const ThemeGalleryApi = z.object({
	data: z.array(GalleryTheme),
	meta: z.object({
		currentPage: z.number(),
		perPage: z.number(),
		totalPages: z.number(),
		totalCount: z.number(),
	}),
});
export type ThemeGalleryApi = z.infer<typeof ThemeGalleryApi>;

export const ReportThemeApi = z.object({
	data: z.object({ ok: z.boolean() }),
});
export type ReportThemeApi = z.infer<typeof ReportThemeApi>;

export const ProfileLayout = z.object({
	order: z.array(z.string()),
	hidden: z.array(z.string()),
});
export type ProfileLayout = z.infer<typeof ProfileLayout>;

export const ProfileUsernameStyle = z.object({
	mode: z.enum(["solid", "gradient"]),
	color1: z.string(),
	color2: z.string().optional(),
	animated: z.boolean().optional(),
	glowColor: z.string().optional(),
	glowSize: z.number().optional(),
	fontFamily: z.string().optional(),
});
export type ProfileUsernameStyle = z.infer<typeof ProfileUsernameStyle>;

export const ProfileBanner = z.object({
	url: z.string(),
	height: z.number(),
	position: z.enum(["top", "center", "bottom"]),
});
export type ProfileBanner = z.infer<typeof ProfileBanner>;

export const ProfileSticker = z.object({
	id: z.string(),
	url: z.string(),
	anchor: z.string(),
	x: z.number(),
	y: z.number(),
	size: z.number(),
	rotation: z.number(),
	layer: z.enum(["front", "back"]),
});
export type ProfileSticker = z.infer<typeof ProfileSticker>;

export const ProfileNote = z.object({
	id: z.string(),
	text: z.string(),
	anchor: z.string(),
	x: z.number(),
	y: z.number(),
	size: z.number(),
	rotation: z.number(),
	color: z.string(),
	background: z.string(),
	layer: z.enum(["front", "back"]),
});
export type ProfileNote = z.infer<typeof ProfileNote>;

export const ProfileAvatarBackdrop = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("gradient"),
		color1: z.string(),
		color2: z.string(),
		angle: z.number(),
		opacity: z.number().optional(),
	}),
	z.object({
		type: z.literal("image"),
		url: z.string(),
		fit: z.enum(["cover", "contain"]),
		opacity: z.number().optional(),
	}),
]);
export type ProfileAvatarBackdrop = z.infer<typeof ProfileAvatarBackdrop>;

const ProfileTheme = z.object({
	userId: z.number(),
	accentColor: z.string(),
	navbarColor: z.string(),
	fontFamily: z.string().nullable().optional(),
	customCss: z.string().nullable().optional(),
	backgroundImage: z.string().nullable().optional(),
	backgroundOverlayColor: z.string().nullable().optional(),
	backgroundOverlayOpacity: z.number().nullable().optional(),
	navbarIconColor: z.string().nullable().optional(),
	cursorUrl: z.string().nullable().optional(),
	effects: z.array(PublishedThemeEffect).nullable().optional(),
	colorTokens: z.record(z.string(), z.string()).nullable().optional(),
	layout: ProfileLayout.nullable().optional(),
	usernameStyle: ProfileUsernameStyle.nullable().optional(),
	banner: ProfileBanner.nullable().optional(),
	ambient: ProfileAmbient.nullable().optional(),
	stickers: z.array(ProfileSticker).nullable().optional(),
	notes: z.array(ProfileNote).nullable().optional(),
	cardStyle: ProfileCardStyle.nullable().optional(),
	avatarBackdrop: ProfileAvatarBackdrop.nullable().optional(),
	pointerEffects: ProfilePointerEffects.nullable().optional(),
	enabled: z.number(),
	approvalStatus: z.string(),
	createdAt: z.string().nullable().optional(),
	updatedAt: z.string().nullable().optional(),
});

/** Data is null when the player has no theme, or none that's visible to the
 *  requester. */
export const ProfileThemeApi = z.object({ data: ProfileTheme.nullable() });
export type ProfileThemeApi = z.infer<typeof ProfileThemeApi>;

export const ProfileThemeOkApi = z.object({
	data: z.object({ ok: z.boolean() }),
});
export type ProfileThemeOkApi = z.infer<typeof ProfileThemeOkApi>;

export const AdminPendingProfileThemesApi = z.object({
	data: z.array(ProfileTheme),
});
export type AdminPendingProfileThemesApi = z.infer<
	typeof AdminPendingProfileThemesApi
>;

export const PinnedAchievementsApi = z.object({
	data: z.array(z.number()),
});
export type PinnedAchievementsApi = z.infer<typeof PinnedAchievementsApi>;

export const NFTItems = z.object({
	data: z.array(
		z.object({
			itemId: z.number(),
			serials: z.array(z.number()).nullable(),
		}),
	),
});
export type NFTItemsApi = z.infer<typeof NFTItems>;

export const NLFItems = z.object({
	data: z.array(z.number()),
});
export type NLFItemsApi = z.infer<typeof NLFItems>;

export const ItemThumbnailMap = z.object({
	data: z.record(z.string(), z.number().nullable()),
});
export type ItemThumbnailMapApi = z.infer<typeof ItemThumbnailMap>;

const EventItem = z.object({
	id: z.number(),
	name: z.string(),
	thumbnailUrl: z.string(),
});

export const EventForItemApi = z.object({
	data: z.object({
		event: z.object({ id: z.number(), slug: z.string(), name: z.string() }),
		items: z.array(EventItem),
	}),
});
export type EventForItemApi = z.infer<typeof EventForItemApi>;

export const EventsListApi = z.object({
	data: z.array(
		z.object({
			id: z.number(),
			slug: z.string(),
			name: z.string(),
			date: z.string().nullable(),
			link: z.string().nullable(),
		}),
	),
});
export type EventsListApi = z.infer<typeof EventsListApi>;

export const EventItemsApi = z.object({
	data: z.array(EventItem),
});
export type EventItemsApi = z.infer<typeof EventItemsApi>;

const AvatarState = z.object({
	useCharacter: z.boolean(),
	items: z.array(z.union([z.number(), z.string()])),
	clothing: z.array(z.union([z.number(), z.string()])).optional(),
	face: z.union([z.number(), z.string()]).optional(),
	body: z.union([z.number(), z.string()]).optional(),
	tool: z.union([z.number(), z.string()]).optional(),
	headColor: z.string(),
	torsoColor: z.string(),
	leftArmColor: z.string(),
	rightArmColor: z.string(),
	leftLegColor: z.string(),
	rightLegColor: z.string(),
});

const AvatarOutfit = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: z.string(),
	data: AvatarState,
});

export const AvatarOutfitsApi = z.object({
	data: z.array(AvatarOutfit),
});
export type AvatarOutfitsApi = z.infer<typeof AvatarOutfitsApi>;

export const AvatarOutfitApi = z.object({
	data: AvatarOutfit,
});
export type AvatarOutfitApi = z.infer<typeof AvatarOutfitApi>;

const PublicOutfit = z.object({
	id: z.number(),
	name: z.string(),
	thumbnail: z.string(),
});

export const PublicOutfitsApi = z.object({
	data: z.array(PublicOutfit),
});
export type PublicOutfitsApi = z.infer<typeof PublicOutfitsApi>;

const PlaceReviewReply = z.object({
	id: z.string(),
	reviewId: z.string(),
	userId: z.number(),
	username: z.string(),
	thumbnail: z.string().nullable(),
	anonymous: z.boolean(),
	body: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const PlaceReview = z.object({
	id: z.string(),
	placeId: z.number(),
	userId: z.number(),
	username: z.string(),
	thumbnail: z.string().nullable(),
	anonymous: z.boolean(),
	rating: z.number().min(1).max(5),
	body: z.string().nullable(),
	migrated: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
	replies: z.array(PlaceReviewReply),
});

export const PlaceReviewsApi = z.object({
	data: z.object({
		reviews: z.array(PlaceReview),
		averageRating: z.number().nullable(),
		totalReviews: z.number(),
		myReview: PlaceReview.nullable(),
	}),
});
export type PlaceReviewsApi = z.infer<typeof PlaceReviewsApi>;

export const PlaceReviewApi = z.object({
	data: PlaceReview,
});
export type PlaceReviewApi = z.infer<typeof PlaceReviewApi>;

// Keyed by review id: null means playtime is unknown (PolyTrack unavailable),
// not zero.
export const PlaceReviewPlaytimesApi = z.object({
	data: z.record(z.string(), z.number().nullable()),
});
export type PlaceReviewPlaytimesApi = z.infer<typeof PlaceReviewPlaytimesApi>;

export const PlaceReviewReplyApi = z.object({
	data: PlaceReviewReply,
});
export type PlaceReviewReplyApi = z.infer<typeof PlaceReviewReplyApi>;

// A review belonging to the requesting user, paired with a resolved world
// name so the migration tool can list it before recreating it natively.
export const MigratablePlaceReview = z.object({
	id: z.string(),
	placeId: z.number(),
	placeName: z.string().nullable(),
	rating: z.number().min(1).max(5),
	body: z.string().nullable(),
	anonymous: z.boolean(),
	approvalStatus: z.string(),
	migrated: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const MigratablePlaceReviewsApi = z.object({
	data: z.array(MigratablePlaceReview),
});
export type MigratablePlaceReviewsApi = z.infer<
	typeof MigratablePlaceReviewsApi
>;

export const MigratePlaceReviewApi = z.object({
	data: z.object({
		id: z.string(),
		migrated: z.boolean(),
	}),
});
export type MigratePlaceReviewApi = z.infer<typeof MigratePlaceReviewApi>;

export const TopReviewersApi = z.object({
	data: z.array(
		z.object({
			userId: z.number(),
			username: z.string(),
			thumbnail: z.string().nullable(),
			reviewCount: z.number(),
		}),
	),
});
export type TopReviewersApi = z.infer<typeof TopReviewersApi>;

export const RatedWorldsLeaderboardApi = z.object({
	data: z.array(
		z.object({
			placeId: z.number(),
			averageRating: z.number(),
			reviewCount: z.number(),
		}),
	),
});
export type RatedWorldsLeaderboardApi = z.infer<
	typeof RatedWorldsLeaderboardApi
>;

const KilnNotification = z.object({
	id: z.number(),
	userId: z.number(),
	type: z.string(),
	message: z.string(),
	url: z.string(),
	avatarUrl: z.string().nullable(),
	sourceId: z.string(),
	createdAt: z.string(),
	seenAt: z.string().nullable(),
});
export type KilnNotification = z.infer<typeof KilnNotification>;

export const NotificationsApi = z.object({
	data: z.array(KilnNotification),
});
export type NotificationsApi = z.infer<typeof NotificationsApi>;

export const MarkNotificationSeenApi = z.object({
	data: KilnNotification,
});
export type MarkNotificationSeenApi = z.infer<typeof MarkNotificationSeenApi>;

const AuthSession = z.object({
	id: z.string(),
	createdAt: z.string().nullable(),
	expiresAt: z.coerce.date(),
	lastUsedAt: z.coerce.date().nullable(),
	os: z.string().nullable(),
	browser: z.string().nullable(),
});
export const AuthSessionsApi = z.object({ data: z.array(AuthSession) });
export type AuthSessionsApi = z.infer<typeof AuthSessionsApi>;

const ActivitySearchResult = z.object({
	userId: z.number(),
	username: z.string(),
	thumbnailUrl: z.string().nullable(),
	isStaff: z.boolean(),
	userRoleClass: z.string().nullable(),
	registeredAt: z.string(),
	lastSeenAt: z.string(),
});
export const ActivitySearchApi = z.object({
	data: z.array(ActivitySearchResult),
});
export type ActivitySearchApi = z.infer<typeof ActivitySearchApi>;

export const AvatarHashesApi = z.object({
	data: z.record(z.string(), z.string()),
});
export type AvatarHashesApi = z.infer<typeof AvatarHashesApi>;

const FeedbackEntry = z.object({
	id: z.string(),
	type: z.enum(["feature", "general", "bug"]),
	message: z.string(),
	version: z.string().nullable(),
	status: z.enum(["open", "resolved"]),
	response: z.string().nullable(),
	respondedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const SubmitFeedbackApi = z.object({ data: FeedbackEntry });
export type SubmitFeedbackApi = z.infer<typeof SubmitFeedbackApi>;

export const MyFeedbackApi = z.object({ data: z.array(FeedbackEntry) });
export type MyFeedbackApi = z.infer<typeof MyFeedbackApi>;

const AdminFeedbackEntry = FeedbackEntry.extend({
	clientId: z.string(),
	userId: z.number().nullable(),
	username: z.string().nullable(),
});

export const AdminFeedbackListApi = z.object({
	data: z.array(AdminFeedbackEntry),
	meta: z.object({
		currentPage: z.number(),
		perPage: z.number(),
		totalPages: z.number(),
		totalCount: z.number(),
	}),
});
export type AdminFeedbackListApi = z.infer<typeof AdminFeedbackListApi>;

export const AdminFeedbackApi = z.object({ data: AdminFeedbackEntry });
export type AdminFeedbackApi = z.infer<typeof AdminFeedbackApi>;

export const AdminDeleteFeedbackApi = z.object({
	data: z.object({ ok: z.boolean() }),
});
export type AdminDeleteFeedbackApi = z.infer<typeof AdminDeleteFeedbackApi>;

export const AdminStatsApi = z.object({
	data: z.object({
		totalVerifiedUsers: z.number(),
		pendingFeedback: z.number(),
		versions: z.array(
			z.object({
				version: z.string().nullable(),
				users: z.number(),
			}),
		),
	}),
});
export type AdminStatsApi = z.infer<typeof AdminStatsApi>;

export const DataExportApi = z.object({
	data: z.object({
		exportedAt: z.string(),
		profile: z
			.object({
				id: z.number(),
				likes: z.number().nullable(),
				linkedAt: z.string().nullable(),
				version: z.string().nullable(),
				bannedAt: z.string().nullable(),
			})
			.nullable(),
		sessions: z.array(
			z.object({
				id: z.string(),
				createdAt: z.string(),
				expiresAt: z.coerce.date(),
				lastUsedAt: z.coerce.date().nullable(),
				revokedAt: z.coerce.date().nullable(),
				os: z.string().nullable(),
				browser: z.string().nullable(),
			}),
		),
		likes: z.object({
			received: z.array(z.object({ id: z.number(), originator: z.number() })),
			given: z.array(z.object({ id: z.number(), target: z.number() })),
		}),
		favoritedPlaces: z.array(
			z.object({
				id: z.number(),
				placeId: z.number(),
				favoritedAt: z.string(),
			}),
		),
		pinnedAchievements: z.array(
			z.object({ achievementId: z.number(), pinnedAt: z.string() }),
		),
		blockedTraders: z.array(z.number()),
		nfts: z.object({
			items: z.array(z.number()),
			serials: z.array(z.object({ itemId: z.number(), serial: z.number() })),
		}),
		nlfItems: z.array(z.number()),
		placeReviews: z.array(
			z.object({
				id: z.string(),
				placeId: z.number(),
				rating: z.number(),
				body: z.string().nullable(),
				anonymous: z.boolean(),
				approvalStatus: z.string(),
				migrated: z.boolean(),
				createdAt: z.string(),
				updatedAt: z.string(),
			}),
		),
		placeReviewReplies: z.array(
			z.object({
				id: z.string(),
				reviewId: z.string(),
				body: z.string(),
				approvalStatus: z.string(),
				createdAt: z.string(),
				updatedAt: z.string(),
			}),
		),
		notifications: z.array(KilnNotification),
		avatarOutfits: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				data: AvatarState,
				createdAt: z.string(),
				updatedAt: z.string().nullable(),
			}),
		),
		publicOutfits: z.array(
			z.object({
				userId: z.number(),
				outfitId: z.number(),
				name: z.string(),
				thumbnail: z.string(),
				position: z.number(),
				syncedAt: z.string(),
			}),
		),
		themes: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				accentColor: z.string(),
				navbarColor: z.string(),
				fontFamily: z.string().nullable(),
				customCss: z.string().nullable(),
				backgroundImage: z.string().nullable(),
				effects: z.string().nullable(),
				navbarIconColor: z.string().nullable(),
				cursorUrl: z.string().nullable(),
				colorTokens: z.string().nullable(),
				published: z.number(),
				approvalStatus: z.string(),
				createdAt: z.string().nullable(),
				thumbnailUpdatedAt: z.string().nullable(),
			}),
		),
		feedback: z.array(
			z.object({
				id: z.string(),
				type: z.enum(["feature", "general", "bug"]),
				message: z.string(),
				version: z.string().nullable(),
				username: z.string().nullable(),
				status: z.enum(["open", "resolved"]),
				response: z.string().nullable(),
				respondedAt: z.string().nullable(),
				createdAt: z.string(),
				updatedAt: z.string(),
			}),
		),
		profileTheme: z
			.looseObject({
				userId: z.number(),
				approvalStatus: z.string(),
				createdAt: z.string(),
				updatedAt: z.string().nullable(),
			})
			.nullable()
			.optional(),
	}),
});
export type DataExportApi = z.infer<typeof DataExportApi>;
