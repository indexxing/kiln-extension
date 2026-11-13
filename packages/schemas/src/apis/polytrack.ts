import z from "zod";

export const UserApiSchema = z.object({
	user: z.object({
		polytoriaId: z.number().int().positive(),
		username: z.string().min(1),
		avatarUrl: z.string(),
	}),
	profileStates: z.array(
		z.object({
			id: z.string(),
			polytoriaId: z.number().int().positive(),
			avatarUrl: z.string().url(),
			username: z.string().min(1),
			aboutText: z.string(),
			forumSignature: z.string().nullable(),
			membership: z.enum(["free", "plus", "plusDeluxe"]),
			isStaff: z.boolean(),
			checksum: z.string(),
			createdAt: z.string(),
		}),
	),
});
export type UserApi = z.infer<typeof UserApiSchema>;

const InfluxRecord = z.object({
	_time: z.string().datetime(),
	_value: z.string(),
	_field: z.string(),
	_measurement: z.string(),
});

export const UserChartsApiSchema = z.object({
	data: z.object({
		networth: z.array(InfluxRecord).optional(),
		profileviews: z.array(InfluxRecord).optional(),
		visits: z.array(InfluxRecord).optional(),
		forumposts: z.array(InfluxRecord).optional(),
		sales: z.array(InfluxRecord).optional(),
		xp: z.array(InfluxRecord).optional(),
	}),
	meta: z.object({
		metric: z.string(),
		window: z.string(),
		start: z.string(),
		stop: z.string(),
	}),
});
export type UserChartsApi = z.infer<typeof UserChartsApiSchema>;

const ChartPointSchema = z.object({
	_time: z.string(),
	_value: z.number(),
});

export const WorldStatsValueChartApiSchema = z.object({
	value: z.array(ChartPointSchema),
});
export type WorldStatsValueChartApi = z.infer<
	typeof WorldStatsValueChartApiSchema
>;

export const WorldStatsRateChartApiSchema = z.object({
	min: z.array(ChartPointSchema),
	avg: z.array(ChartPointSchema),
	max: z.array(ChartPointSchema),
});
export type WorldStatsRateChartApi = z.infer<
	typeof WorldStatsRateChartApiSchema
>;

export const WorldStatsChartApiSchema = z.union([
	WorldStatsValueChartApiSchema,
	WorldStatsRateChartApiSchema,
]);
export type WorldStatsChartApi = z.infer<typeof WorldStatsChartApiSchema>;
export const WorldStatsMetricSchema = z.enum([
	"uniqueVisits",
	"visits",
	"likes",
	"dislikes",
	"likeRate",
]);
export type WorldStatsMetric = z.infer<typeof WorldStatsMetricSchema>;

export const WorldIngameChartApiSchema = z.object({
	min: z.array(ChartPointSchema),
	avg: z.array(ChartPointSchema),
	max: z.array(ChartPointSchema),
});
export type WorldIngameChartApi = z.infer<typeof WorldIngameChartApiSchema>;

export const GameActivitySessionSchema = z.object({
	id: z.string(),
	gameId: z.number().int(),
	gameName: z.string(),
	startedAt: z.string(),
	endedAt: z.string().nullable(),
	duration: z.number(),
	isOpen: z.boolean(),
	serverId: z.number().int().nullable(),
	lastServerId: z.number().int().nullable(),
	closeReason: z.string().nullable(),
});
export type GameActivitySession = z.infer<typeof GameActivitySessionSchema>;

export const GameActivityApiSchema = z.object({
	totalPlaytime: z.number(),
	totalSessions: z.number(),
	sessions: z.array(GameActivitySessionSchema),
});
export type GameActivityApi = z.infer<typeof GameActivityApiSchema>;

export const ForumAuthorSchema = z.object({
	polytoriaId: z.number().int().positive(),
	username: z.string().min(1),
	avatarUrl: z.string(),
});
export type ForumAuthor = z.infer<typeof ForumAuthorSchema>;

export const ForumThreadSummarySchema = z.object({
	id: z.number().int(),
	title: z.string(),
	replyCount: z.number().int().nullable(),
	viewCount: z.number().int().nullable(),
	isPinned: z.boolean(),
	isLocked: z.boolean(),
	rating: z.number().nullable(),
	bumpedAt: z.string(),
});
export type ForumThreadSummary = z.infer<typeof ForumThreadSummarySchema>;

export const ForumEntrySchema = z.object({
	id: z.number().int(),
	threadId: z.number().int(),
	kind: z.enum(["thread", "reply"]),
	title: z.string(),
	content: z.string(),
	postedAt: z.string(),
	bumpedAt: z.string(),
	categoryId: z.number().int(),
	author: ForumAuthorSchema,
	thread: ForumThreadSummarySchema,
});
export type ForumEntry = z.infer<typeof ForumEntrySchema>;

export const ForumSearchApiSchema = z.object({
	entries: z.array(ForumEntrySchema),
	nextPage: z
		.number()
		.int()
		.nullable()
		.optional()
		.transform((value) => value ?? null),
});
export type ForumSearchApi = z.infer<typeof ForumSearchApiSchema>;

export const FeedEntryParentSchema = z.object({
	id: z.number().int(),
	content: z.string(),
});
export type FeedEntryParent = z.infer<typeof FeedEntryParentSchema>;

export const FeedEntrySchema = z.object({
	id: z.number().int(),
	parentId: z.number().int().nullable(),
	parentUnavailable: z.boolean(),
	kind: z.enum(["parent", "reply"]),
	content: z.string(),
	mediaUrl: z.string().nullable(),
	replyCount: z.number().int().nullable(),
	postedAt: z.string(),
	author: ForumAuthorSchema,
	parent: FeedEntryParentSchema.nullable(),
});
export type FeedEntry = z.infer<typeof FeedEntrySchema>;

export const FeedSearchApiSchema = z.object({
	entries: z.array(FeedEntrySchema),
	nextPage: z
		.number()
		.int()
		.nullable()
		.optional()
		.transform((value) => value ?? null),
});
export type FeedSearchApi = z.infer<typeof FeedSearchApiSchema>;

export const SearchHitSchema = z.object({
	type: z.string(),
	id: z.string(),
	title: z.string(),
	subtitle: z.string().nullable(),
	meta: z.string().nullable(),
	polytoriaHref: z.string().nullable(),
	image: z.string().nullable(),
	imageShape: z.string().nullable(),
	badges: z.array(z.object({ label: z.string(), tone: z.string() })),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchGroupSchema = z.object({
	type: z.string(),
	hits: z.array(SearchHitSchema),
	hasMore: z.boolean().optional(),
});
export type SearchGroup = z.infer<typeof SearchGroupSchema>;

export const SearchApiSchema = z.object({
	text: z.string(),
	exact: z.array(SearchHitSchema),
	groups: z.array(SearchGroupSchema),
});
export type SearchApi = z.infer<typeof SearchApiSchema>;
