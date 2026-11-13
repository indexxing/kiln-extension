import { z } from "zod";

export type ApiTypes =
	| "public"
	| "internal"
	| "extension"
	| "proxy"
	| "currencyRates";

export const ItemTypeSchema = z.enum([
	"hat",
	"tool",
	"face",
	"shirt",
	"pants",
	"profileTheme",
	"torso",
	"clothing",
	"body",
	"achievement",
	"consumable",
	"gamePass",
]);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const UserApiSchema = z.object({
	id: z.number(),
	username: z.string(),
	description: z.string(),
	signature: z.string(),
	thumbnail: z.object({
		avatar: z.string().url(),
		icon: z.string().url(),
	}),
	playing: z
		.object({
			name: z.string(),
			placeID: z.number(),
			serverID: z.number(),
		})
		.nullable(),
	netWorth: z.number(),
	placeVisits: z.number(),
	profileViews: z.number(),
	forumPosts: z.number(),
	assetSales: z.number(),
	membershipType: z.enum(["free", "plus", "plusDeluxe"]),
	isStaff: z.boolean(),
	registeredAt: z.string(),
	lastSeenAt: z.string(),
});
export type UserApi = z.infer<typeof UserApiSchema>;

export const FindUserByUsernameApiSchema = z.object({
	id: z.number(),
	username: z.string(),
});
export type FindUserByUsernameApi = z.infer<typeof FindUserByUsernameApiSchema>;

export const InventoryApiSchema = z.object({
	inventory: z.array(
		z.object({
			id: z.number(),
			asset: z.object({
				id: z.number(),
				type: z.string(),
				name: z.string(),
				thumbnail: z.string().url(),
				isLimited: z.boolean(),
			}),
			serial: z.number().int().nullable(),
			purchasedAt: z.iso.datetime({ offset: true }),
		}),
	),
	pages: z.number().int().nonnegative(),
	total: z.number().int().nonnegative(),
});
export type InventoryApi = z.infer<typeof InventoryApiSchema>;

export const PlaceApiSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string(),
	creator: z.object({
		type: z.enum(["user", "guild"]),
		id: z.number(),
		name: z.string(),
		thumbnail: z.string(),
	}),
	thumbnail: z.string(),
	genre: z.string(),
	maxPlayers: z.number(),
	isActive: z.boolean(),
	visits: z.number(),
	uniqueVisits: z.number(),
	playing: z.number(),
	rating: z.object({
		likes: z.number(),
		dislikes: z.number(),
		percent: z.string(),
	}),
	accessType: z.string(),
	accessPrice: z.number().nullable(),
	createdAt: z.string(),
	updatedAt: z.string().nullable(),
});
export type PlaceApi = z.infer<typeof PlaceApiSchema>;

export const AvatarApiSchema = z.object({
	id: z.string(),
	colors: z.object({
		head: z.string(),
		torso: z.string(),
		leftArm: z.string(),
		rightArm: z.string(),
		leftLeg: z.string(),
		rightLeg: z.string(),
	}),
	assets: z.array(
		z.object({
			id: z.number(),
			type: ItemTypeSchema,
			accessoryType: z.string().nullable(),
			name: z.string(),
			thumbnail: z.string(),
			path: z.string(),
		}),
	),
	isDefault: z.boolean(),
});
export type AvatarApi = z.infer<typeof AvatarApiSchema>;

export const ItemApiSchema = z.object({
	id: z.number(),
	type: ItemTypeSchema,
	accessoryType: z.string().nullable(),
	name: z.string(),
	description: z.string(),
	tags: z.array(z.string()),
	creator: z.object({
		type: z.string(),
		id: z.number(),
		name: z.string(),
		thumbnail: z.string(),
	}),
	thumbnail: z.string(),
	price: z.number().nullable(),
	averagePrice: z.number().nullable(),
	version: z.number(),
	sales: z.number(),
	favorites: z.number(),
	totalStock: z.number().nullable(),
	onSaleUntil: z.string().nullable(),
	isLimited: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string().nullable(),
});
export type ItemApi = z.infer<typeof ItemApiSchema>;

const ApiStatusSchema = z.object({
	success: z.boolean(),
	url: z.string().optional(),
	errors: z
		.array(
			z.object({
				code: z.string(),
				message: z.string(),
			}),
		)
		.optional(),
});

export const MeshApiSchema = ApiStatusSchema;
export type MeshApi = z.infer<typeof MeshApiSchema>;

export const TextureApiSchema = ApiStatusSchema;
export type TextureApi = z.infer<typeof TextureApiSchema>;

export const AudioApiSchema = ApiStatusSchema;
export type AudioApi = z.infer<typeof AudioApiSchema>;

export const EditApiSchema = z.object({
	success: z.boolean(),
	token: z.string(),
});
export type EditApi = z.infer<typeof EditApiSchema>;

export const GamepassesApiSchema = z.object({
	gamepasses: z.array(
		z.object({
			id: z.number(),
			asset: z.object({
				id: z.number(),
				name: z.string(),
				description: z.string(),
				thumbnail: z.string(),
				price: z.number().nullable(),
				sales: z.number(),
			}),
		}),
	),
	pages: z.number(),
	total: z.number(),
});
export type GamepassesApi = z.infer<typeof GamepassesApiSchema>;

export const OwnersApiSchema = z.object({
	inventories: z.array(
		z.object({
			serial: z.number(),
			purchasedAt: z.string(),
			user: z.object({
				id: z.number(),
				username: z.string(),
			}),
		}),
	),
	pages: z.number(),
	total: z.number(),
});
export type OwnersApi = z.infer<typeof OwnersApiSchema>;

export const BatchApiSchema = z.array(
	z.object({
		data: z.any(),
		cached: z.boolean(),
		path: z.string(),
	}),
);

export const StoreItemApiSchema = z.object({
	id: z.number(),
	type: z.string(),
	accessoryType: z.string().nullable(),
	name: z.string(),
	description: z.string(),
	tags: z.array(z.string()),
	creator: z.object({
		type: z.string(),
		id: z.number(),
		name: z.string(),
		thumbnail: z.string().url(),
	}),
	thumbnail: z.string().url(),
	price: z.number().nullable(),
	owners: z.number(),
	averagePrice: z.number().nullable(),
	isLimited: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string().nullable(),
});
export type StoreItemApi = z.infer<typeof StoreItemApiSchema>;

export const StoreApiSchema = z.object({
	assets: z.array(StoreItemApiSchema),
	pages: z.number(),
	total: z.number(),
});
export type StoreApi = z.infer<typeof StoreApiSchema>;

export const JoinPlaceApiSchema = z.object({
	success: z.boolean(),
	token: z.string(),
});
export type JoinPlaceApi = z.infer<typeof JoinPlaceApiSchema>;

export const EventItemApiSchema = z.object({
	assetID: z.number(),
	asset: z.object({
		name: z.string(),
		description: z.string(),
		thumbnailUrl: z.string().url(),
	}),
	isOwned: z.boolean(),
});
export type EventItemApi = z.infer<typeof EventItemApiSchema>;

// Response of the site's public GET /v1/events/items/:userId (the current event's items)
export const EventItemsApiSchema = z.array(EventItemApiSchema);
export type EventItemsApi = z.infer<typeof EventItemsApiSchema>;

export const UserCreationsApiSchema = z.object({
	assets: z.array(
		z.object({
			id: z.number(),
			type: z.string(),
			accessoryType: z.string().nullable(),
			name: z.string(),
			description: z.string(),
			thumbnail: z.string(),
			price: z.number().nullable(),
			createdAt: z.string(),
			updatedAt: z.string().nullable(),
		}),
	),
	pages: z.number().int().nonnegative(),
	total: z.number().int().nonnegative(),
});
export type UserCreationsApi = z.infer<typeof UserCreationsApiSchema>;

export const GuildCreationsApiSchema = UserCreationsApiSchema;
export type GuildCreationsApi = z.infer<typeof GuildCreationsApiSchema>;

// Response of the site's internal GET /api/avatar/outfits (the signed-in user's outfits)
export const OutfitsApiSchema = z.object({
	meta: z.object({
		currentPage: z.number().int(),
		lastPage: z.number().int(),
	}),
	data: z.array(
		z.object({
			id: z.number().int(),
			name: z.string(),
			avatar: z.object({ thumbnail: z.string() }),
		}),
	),
});
export type OutfitsApi = z.infer<typeof OutfitsApiSchema>;

export const IndividualOwnerApiSchema = z.object({
	owned: z.boolean(),
	inventory: z
		.object({
			userID: z.number().int(),
			assetID: z.number().int(),
			serial: z.number().int(),
			purchasedAt: z.string().datetime({ offset: true }),
		})

		.optional(),
});
export type IndividualOwnerApi = z.infer<typeof IndividualOwnerApiSchema>;
