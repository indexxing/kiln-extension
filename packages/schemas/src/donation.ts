export type DonationPlatform = {
	name: string;
	host: string;
	pathPrefix?: string;
};

export const DONATION_PLATFORMS: DonationPlatform[] = [
	{ name: "Patreon", host: "patreon.com" },
	{ name: "Ko-fi", host: "ko-fi.com" },
	{ name: "Buy Me a Coffee", host: "buymeacoffee.com" },
	{ name: "PayPal.Me", host: "paypal.me" },
	{ name: "GitHub Sponsors", host: "github.com", pathPrefix: "/sponsors/" },
	{ name: "Liberapay", host: "liberapay.com" },
	{ name: "Open Collective", host: "opencollective.com" },
	{ name: "Cash App", host: "cash.app" },
	{ name: "Boosty", host: "boosty.to" },
	{ name: "Sponsr", host: "sponsr.ru" },
];

export const DONATION_URL_MAX_LENGTH = 200;

export function findDonationPlatform(raw: string): DonationPlatform | null {
	const url = parseDonationUrl(raw);
	if (!url) return null;
	const { hostname, pathname } = new URL(url);
	return (
		DONATION_PLATFORMS.find(
			(platform) =>
				(hostname === platform.host ||
					hostname.endsWith(`.${platform.host}`)) &&
				(!platform.pathPrefix || pathname.startsWith(platform.pathPrefix)),
		) ?? null
	);
}

export function parseDonationUrl(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed || trimmed.length > DONATION_URL_MAX_LENGTH) return null;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" || url.username || url.password) return null;
	return url.href;
}

export function normalizeDonationUrl(raw: string): string | null {
	const url = parseDonationUrl(raw);
	if (!url || !findDonationPlatform(url)) return null;
	return url;
}
