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

import type { PolyTrack, Polytoria } from "@kiln/schemas";
import errorIcon from "@/assets/error.svg";
import sadFace from "@/assets/sad-face.webp";
import { escapeHtml, safeHttpUrl } from "@/utils/escapeHtml";
import {
	_bestFriends,
	_homepageSectionOrder,
	_showKilnDisclosures,
	isChrome,
	preferences,
} from "@/utils/storage";
import type { CurrencyCode, FeedPost } from "@/utils/types";
import {
	applyKilnDisclosureTitle,
	createKilnDisclosureBadge,
	formatNotificationRelativeTime,
	getUserDetails,
	kilnDisclosureBadgeHtml,
	openVerificationModal,
} from "@/utils/utilities";
import { sendMessage } from "../utils/messaging";

export default defineContentScript({
	matches: [
		"https://polytoria.com/",
		"https://polytoria.com/?*",
		"https://polytoria.com/home",
		"https://polytoria.com/home?*",
	],
	main() {
		Promise.all([
			preferences.getPreferences(),
			_showKilnDisclosures.getValue(),
		]).then(([values, showDisclosures]) => {
			if (values.enabled.includes("favoritedPlaces"))
				favoritedPlaces(showDisclosures);
			if (values.enabled.includes("bestFriends")) bestFriends(showDisclosures);
			if (values.enabled.includes("irlBrickPrice"))
				irlBrickPrice(
					values.config.irlBrickPrice.currency as CurrencyCode,
					showDisclosures,
				);
			if (values.enabled.includes("homeFriendJoins"))
				homeJoinFriendsButton(showDisclosures);

			if (values.enabled.includes("quickCreatorLaunchBtns"))
				quickCreatorLaunchBtns(showDisclosures);

			if (values.enabled.includes("dailyChallengesRefreshing") && isChrome())
				dailyChallengesRefreshing(showDisclosures);

			if (
				values.enabled.includes("disableInfiniteScrolling") &&
				values.config.disableInfiniteScrolling.feed
			)
				disableInfiniteScrolling(showDisclosures);

			if (values.enabled.includes("myFeedPosts")) myFeedPosts();
			if (values.enabled.includes("searchFeedPosts")) searchFeedPosts();

			if (values.enabled.includes("reorderableHomepage"))
				reorderableHomepage(showDisclosures);
		});
	},
});

async function favoritedPlaces(showDisclosures: boolean) {
	const container = document.createElement("div");
	container.id = "home-pinnedWorlds";
	container.innerHTML = `
      <div class="row reqFadeAnim px-2 px-lg-0">
        <div class="col">
          <h6 class="dash-ctitle2">Jump right back into your favorite worlds</h6>
          <h5 class="dash-ctitle">Pinned Worlds${kilnDisclosureBadgeHtml(showDisclosures)}</h5>
        </div>
      </div>
      <div class="card card-dash mcard mb-3">
        <div class="card-body p-0 m-1 scrollFadeContainer">
          <div class="text-center p-5">
            <div class="spinner-border text-muted" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        </div>
      </div>
      `;

	const card: HTMLElement = container.getElementsByClassName(
		"scrollFadeContainer",
	)[0] as HTMLElement;
	const column = document.getElementsByClassName("col-lg-8")[0];

	if (
		document.getElementsByClassName("home-event-container")[0] === undefined
	) {
		column.insertBefore(container, column.children[0]);
	} else {
		column.insertBefore(container, column.children[1]);
	}

	const userDetails = await getUserDetails();
	if (!userDetails) {
		card.innerHTML = `
        <div class="text-center p-2">
          <img src="${errorIcon}" width="100" height="100">
          <p class="text-muted mb-0">Could not determine your user session. Try refreshing the page.</p>
        </div>
        `;
		return;
	}

	const favResult = await sendMessage("getFavoritedPlaces", userDetails.userId);
	const placeData: Array<Polytoria.PlaceApi> | "unavailable" = favResult.ok
		? favResult.data
		: "unavailable";
	const fetchError = !favResult.ok
		? favResult.code === "NO_SESSION"
			? "no_session"
			: "unavailable"
		: null;

	if (placeData == "unavailable") {
		if (fetchError === "no_session") {
			card.innerHTML = `
			<div class="text-center p-2">
				<img src="${errorIcon}" width="100" height="100">
				<p class="text-muted mb-2">Verify your account with Kiln to take advantage of Pinned Worlds!</p>
				<button class="btn btn-dark" id="kiln-pinned-verify-btn">Verify Account</button>
			</div>
        `;
			document
				.getElementById("kiln-pinned-verify-btn")
				?.addEventListener("click", () => {
					openVerificationModal();
				});
		} else {
			console.log(favResult);
			card.innerHTML = `
        <div class="text-center p-2">
          <img src="${errorIcon}" width="100" height="100">
          <p class="text-muted mb-0">Sorry! This feature is currently unavailable. Please check back later!</p>
        </div>
        `;
		}
		return;
	}

	if (placeData.length == 0) {
		card.innerHTML = `
        <div class="text-center p-2">
          <img class="m-2" src="${sadFace}" width="75" height="75" style="filter: grayscale(1)">
          <p class="text-muted mb-0">Looks like you don't have any pinned worlds yet! Go pin some!</p>
        </div>
        `;
		return;
	}

	const cardElements: Array<{
		scrollCard: HTMLAnchorElement;
		details: Polytoria.PlaceApi;
	}> = [];

	for (const details of placeData) {
		const scrollCard = document.createElement("a");
		scrollCard.classList.value = "d-none";
		scrollCard.href = `/places/${details.id}`;
		scrollCard.innerHTML = `
        <div class="scrollFade card me-2 place-card force-desktop text-center mb-2" style="opacity: 1;">
          <div class="card-body">
            <div class="ratings-header" style="position: relative;">
              <img src="${escapeHtml(safeHttpUrl(details.thumbnail) || errorIcon)}" class="place-card-image" style="position: relative;">
              <div class="p+pinned_games_playing" style="position: absolute;background: linear-gradient(to bottom, #000000f7, transparent, transparent, transparent);width: 100%;height: 100%;top: 0;left: 0;border-radius: 11px;padding-top: 12px;color: gray;font-size: 0.8rem;">
                <i class="fa-duotone fa-users"></i>
                <span>
                  ${details.playing}
                  Playing
                </span>
              </div>
            </div>
            <div>
              <div class="mt-2 mb-1 place-card-title">
                ${escapeHtml(details.name)}
              </div>
            </div>
          </div>
        </div>
        `;

		if (!details.isActive) {
			const PlayerCountText = scrollCard.getElementsByClassName(
				"p+pinned_games_playing",
			)[0];
			PlayerCountText.children[0].classList.value =
				"text-warning fa-duotone fa-lock";
			PlayerCountText.children[1].remove();
		}

		card.appendChild(scrollCard);
		cardElements.push({ scrollCard, details });
	}

	card.children[0].remove();
	card.classList.add("d-flex");
	Array.from(card.children).forEach((place) => {
		place.classList.remove("d-none");
	});

	await Promise.all(
		cardElements.map(async ({ scrollCard, details }) => {
			const creatorResult = await sendMessage("getUser", details.creator.id);
			if (creatorResult.ok) return;
			if (creatorResult.code !== "UNKNOWN") return;

			const ratingsHeader = scrollCard.querySelector(
				".ratings-header",
			) as HTMLElement | null;
			if (!ratingsHeader) return;

			const unfavoriteOverlay = document.createElement("div");
			unfavoriteOverlay.style.cssText = `
				position: absolute;
				inset: 0;
				border-radius: 11px;
				background: rgba(0, 0, 0, 0.72);
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 6px;
				z-index: 10;
				backdrop-filter: blur(2px);
			`;
			unfavoriteOverlay.innerHTML = `
				<i class="fa-duotone fa-circle-exclamation text-warning" style="font-size: 1.4rem;"></i>
				<p class="mb-1 text-white" style="font-size: 0.7rem; text-align: center; line-height: 1.3; padding: 0 8px;">World might be unavailable.</p>
				<button class="btn btn-sm btn-danger kiln-unpin-btn" style="font-size: 0.7rem; padding: 2px 10px;">Unpin</button>
			`;

			const unpinBtn = unfavoriteOverlay.querySelector(
				".kiln-unpin-btn",
			) as HTMLButtonElement;
			unpinBtn.addEventListener("click", async (e) => {
				e.preventDefault();
				e.stopPropagation();
				unpinBtn.disabled = true;
				unpinBtn.textContent = "Unpinning…";

				const result = await sendMessage("unfavoritePlace", {
					placeId: details.id,
					userId: userDetails.userId,
				});

				if (result.ok) {
					scrollCard.remove();

					if (card.querySelectorAll("a").length === 0) {
						card.classList.remove("d-flex");
						card.innerHTML = `
							<div class="text-center p-2">
								<img class="m-2" src="${sadFace}" width="75" height="75" style="filter: grayscale(1)">
								<p class="text-muted mb-0">Looks like you don't have any pinned worlds yet! Go pin some!</p>
							</div>
						`;
					}
				} else {
					unpinBtn.disabled = false;
					unpinBtn.textContent = "Unpin";
				}
			});

			ratingsHeader.appendChild(unfavoriteOverlay);
		}),
	);
}

function bestFriends(showDisclosures: boolean) {
	const friendsRow = document.querySelector(
		".card:has(.friendsPopup) .d-flex",
	)!;

	const createHeadshot = async (id: string) => {
		const r = await sendMessage("getUser", +id);
		if (!r.ok) {
			throw new Error(
				"[Kiln] API is disabled, cancelling best friends loading..",
			);
		}
		const user = r.data;

		const headshot = document.createElement("div");

		headshot.classList.add("friend-circle");
		Object.assign(headshot.dataset, {
			userId: id,
			username: user.username,
			isOnline: "false",
			location: "offline",
		});

		headshot.innerHTML = `
    <img width="90" height="auto" src="${escapeHtml(safeHttpUrl(user.thumbnail.icon) || errorIcon)}" alt="${escapeHtml(user.username)}" class="img-fluid rounded-circle border border-2 ">
    <div class="friend-name text-truncate mt-1">
      <div style="font-size: 0.5rem; line-height: 0.5rem; display: inline-block;">
        <span class="text-muted">
          <i class="fas fa-dot-circle"></i>
        </span>
      </div>
      ${escapeHtml(user.username)}
    </div>
    `;

		if (showDisclosures) {
			headshot.style.position = "relative";
			const badge = createKilnDisclosureBadge();
			Object.assign(badge.style, {
				position: "absolute",
				top: "0",
				right: "0",
				fontSize: "0.45rem",
				padding: "1px 3px",
				zIndex: "10",
			});
			headshot.appendChild(badge);
		}

		friendsRow.prepend(headshot);
		return headshot;
	};

	_bestFriends.getValue().then(async (friends) => {
		if (friends.length == 0) return;

		for (const id of friends) {
			let headshot = document.getElementById(`friend-${id}`);
			if (!headshot) headshot = await createHeadshot(id).catch(() => null);
			if (headshot) friendsRow.prepend(headshot, friendsRow.children[0]);
		}
	});
}

async function irlBrickPrice(
	irlCurrency: CurrencyCode,
	showDisclosures: boolean,
) {
	const trendingItems = Array.from(
		document.querySelectorAll('a[href^="/store"]:has(.place-card)'),
	);

	for (const item of trendingItems) {
		const priceTag = item.getElementsByClassName("text-success")[0];
		if (priceTag) {
			const currency = await bricksToCurrency(
				parseInt(priceTag.textContent!.replace(/,/g, ""), 10),
				irlCurrency,
			);

			if (currency) {
				const spanTag = document.createElement("span");
				spanTag.classList.add("text-muted");
				spanTag.style.fontSize = "0.7rem";
				spanTag.style.fontWeight = "lighter";
				spanTag.innerText = ` (${currency})`;
				applyKilnDisclosureTitle(
					spanTag,
					showDisclosures,
					"IRL currency conversion",
				);
				priceTag.appendChild(spanTag);
			}
		}
	}
}

function homeJoinFriendsButton(showDisclosures: boolean) {
	const friendsPopup = document.getElementById("friend-name");
	if (!friendsPopup) {
		console.warn("[Kiln] #friend-name not found");
		return;
	}

	const observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (!(node instanceof HTMLAnchorElement)) continue;

				const target = node.parentElement?.parentElement;
				if (!target) continue;

				target.querySelector('[data-kiln="home-join-btn"]')?.remove();

				const joinButton = document.createElement("button");
				joinButton.className = "btn btn-success btn-sm";
				joinButton.dataset.kiln = "home-join-btn";
				Object.assign(joinButton.style, {
					position: "absolute",
					top: 0,
					right: 0,
					zIndex: 2000,
					margin: "3px",
				});
				joinButton.innerHTML = '<i class="fas fa-play"></i>';
				applyKilnDisclosureTitle(
					joinButton,
					showDisclosures,
					"Join friend's game",
				);
				target.appendChild(joinButton);

				joinButton.addEventListener("click", async () => {
					const profileLink = document.getElementById(
						"friendsProfileLink",
					) as HTMLAnchorElement | null;
					const userId = profileLink?.getAttribute("href")?.split("/")[2];

					if (!userId) {
						console.error(`[Kiln] Missing userId.`);
						return;
					}

					const userResult = await sendMessage("getUser", +userId);
					if (!userResult.ok) return;

					const playing = userResult.data.playing;
					if (!playing) return;

					window.location.href = `https://polytoria.com/places/${playing.placeID}?serverId=${playing.serverID}`;
				});
			}
		}
	});

	observer.observe(friendsPopup, { childList: true, subtree: true });
}

function quickCreatorLaunchBtns(showDisclosures: boolean) {
	const stickySection = document.querySelector(".dashboardAvatarShadow + *");

	const btnGroup = document.createElement("div");
	btnGroup.classList.add("btn-group", "w-100", "mb-3");

	const btn = document.createElement("button");
	btn.classList.add("btn", "btn-primary");
	btn.innerText = "Open 2.0 Creator";

	const btn2 = document.createElement("button");
	btn2.classList.add("btn", "btn-secondary");
	btn2.innerText = "Open 1.0 Creator";

	btnGroup.append(btn, btn2);

	if (showDisclosures) {
		const label = document.createElement("div");
		label.className = "small text-muted mb-1";
		label.innerHTML = `Quick Creator Launch${kilnDisclosureBadgeHtml(true)}`;
		stickySection?.prepend(label, btnGroup);
	} else {
		stickySection?.prepend(btnGroup);
	}

	btn.addEventListener("click", () => {
		console.log("aaa");
		sendMessage("openCreator", 2);
	});
	btn2.addEventListener("click", () => sendMessage("openCreator", 1));
}

function renderFeedPost(post: FeedPost): HTMLElement {
	const card = document.createElement("div");
	card.className = "card card-dash mcard mb-3";
	card.id = `feed-post-${post.id}`;
	card.innerHTML = `
		<div class="card-body">
			<div class="row small">
				<div class="col-auto">
					<a href="/users/${post.author.id}">
						<img width="52" height="52" class="img-fluid rounded-circle border border-2 border-secondary kiln-feed-avatar">
					</a>
				</div>
				<div class="col">
					<p class="mb-1">
						<a href="/users/${post.author.id}" class="text-reset kiln-feed-username"></a>
						<span class="text-muted ms-2">
							<i class="fad fa-clock me-1"></i>
							<span class="kiln-feed-time"></span>
							<span class="kiln-feed-place"></span>
						</span>
					</p>
					<p class="mb-1 feed-post-text">
						<a href="/feed/${post.id}" class="text-reset kiln-feed-content"></a>
					</p>
					<div class="kiln-feed-media"></div>
					<div class="row">
						<div class="col-auto">
							<a class="text-danger text-decoration-none" onclick="toggleLike(${post.id})"><i class="${post.isLiked ? "fas" : "far"} fa-heart btn-icon me-1"></i> <span>${post.likeCount}</span></a>
						</div>
						<div class="col-auto">
							<a class="text-muted text-decoration-none" href="/feed/${post.id}"><i class="far fa-comment btn-icon me-1"></i>${post.replyCount}</a>
						</div>
					</div>
				</div>
			</div>
		</div>
		`;

	const avatar = card.querySelector<HTMLImageElement>(".kiln-feed-avatar")!;
	avatar.src = post.author.avatarIconUrl;
	avatar.alt = post.author.username;

	card.querySelector(".kiln-feed-username")!.textContent = post.author.username;
	card.querySelector(".kiln-feed-time")!.textContent =
		formatNotificationRelativeTime(new Date(post.postedAt));
	card.querySelector(".kiln-feed-content")!.textContent = post.content;

	if (post.placeID !== null) {
		const place = card.querySelector(".kiln-feed-place")!;
		place.innerHTML = `<span class="text-muted mx-1">&middot;</span> `;
		const placeLink = document.createElement("a");
		placeLink.className = "text-muted";
		placeLink.href = `/places/${post.placeID}`;
		placeLink.textContent = post.placeName ?? "";
		place.appendChild(placeLink);
	}

	if (post.mediaUrl) {
		const mediaUrl = post.mediaUrl;
		const mediaContainer = card.querySelector(".kiln-feed-media")!;
		const link = document.createElement("a");
		link.href = "#!";
		const img = document.createElement("img");
		img.src = mediaUrl;
		img.alt = post.content;
		img.className = "img-fluid rounded-3 my-2";
		link.appendChild(img);
		link.addEventListener("click", (e) => {
			e.preventDefault();
			//@ts-expect-error: page-defined global
			window.showImageModal?.(mediaUrl);
		});
		mediaContainer.appendChild(link);
	}

	return card;
}

function disableInfiniteScrolling(showDisclosures: boolean) {
	sendMessage("disableFeedAutoScroll");

	const feedPosts = document.getElementById("feed-posts");
	if (!feedPosts) return;

	let page = 1;
	let loading = false;
	let finished = false;

	const button = document.createElement("button");
	button.type = "button";
	button.className = "btn btn-outline-secondary w-100 mb-3";
	button.innerHTML = `Load More${kilnDisclosureBadgeHtml(showDisclosures)}`;
	feedPosts.insertAdjacentElement("afterend", button);

	const setButtonState = (state: "idle" | "loading" | "error") => {
		button.disabled = state !== "idle";
		button.innerHTML =
			state === "loading"
				? `<span class="spinner-border spinner-border-sm"></span> Loading...`
				: state === "error"
					? "Failed to load more, click to retry"
					: `Load More${kilnDisclosureBadgeHtml(showDisclosures)}`;
	};

	button.addEventListener("click", async () => {
		if (loading || finished) return;
		loading = true;
		setButtonState("loading");

		const result = await sendMessage("getFeed", page + 1);
		loading = false;

		if (!result.ok) {
			setButtonState("error");
			return;
		}

		page = result.data.meta.currentPage;
		for (const post of result.data.data) {
			feedPosts.appendChild(renderFeedPost(post));
		}

		if (result.data.meta.nextPageURL === null) {
			finished = true;
			button.remove();
		} else {
			setButtonState("idle");
		}
	});
}

function dailyChallengesRefreshing(showDisclosures: boolean) {
	const card = document.querySelector(".daily-challenge-card");
	if (!card) return;

	const header = card.querySelector<HTMLElement>(".card-body > .d-flex");
	const challengesList = card.querySelector<HTMLElement>(".overflow-y-auto");
	if (!header || !challengesList) return;

	const refreshBtn = document.createElement("button");
	refreshBtn.type = "button";
	refreshBtn.className =
		"btn btn-sm btn-outline-secondary kiln-challenges-refresh-btn";
	applyKilnDisclosureTitle(refreshBtn, showDisclosures, "Refresh challenges");
	refreshBtn.innerHTML = `<i class="fas fa-sync-alt"></i>`;
	header.appendChild(refreshBtn);

	refreshBtn.addEventListener("click", async () => {
		refreshBtn.disabled = true;
		refreshBtn.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i>`;

		try {
			const response = await fetch(window.location.href);
			const html = await response.text();
			const dom = new DOMParser().parseFromString(html, "text/html");

			const freshCard = dom.querySelector(".daily-challenge-card");
			if (!freshCard) return;

			const freshStreakBadge = freshCard.querySelector(
				".challenge-streak-badge",
			);
			const streakBadge = header.querySelector(".challenge-streak-badge");
			if (freshStreakBadge && streakBadge) {
				streakBadge.outerHTML = freshStreakBadge.outerHTML;
			} else if (streakBadge) {
				streakBadge.remove();
			} else if (freshStreakBadge) {
				header.appendChild(freshStreakBadge.cloneNode(true) as Element);
			}

			const freshList = freshCard.querySelector(".overflow-y-auto");
			if (freshList) {
				challengesList.innerHTML = freshList.innerHTML;
			}

			sendMessage("registerBootstrapElements");
		} finally {
			refreshBtn.disabled = false;
			refreshBtn.innerHTML = `<i class="fas fa-sync-alt"></i>`;
		}
	});
}

async function myFeedPosts() {
	const findFeedToolbar = (): {
		toolbar: HTMLElement;
		container: HTMLElement;
	} | null => {
		const headingRow = Array.from(
			document.querySelectorAll<HTMLElement>("h5.dash-ctitle"),
		)
			.find((h) => h.textContent?.trim() === "Feed")
			?.closest<HTMLElement>(".row");
		if (!headingRow) return null;

		let container: HTMLElement | null = headingRow;
		while (
			container &&
			!Array.from(container.classList).some((c) => c.startsWith("container"))
		) {
			container = container.parentElement;
		}
		if (!container) return null;

		let toolbar = headingRow.querySelector<HTMLElement>(
			'[data-kiln="feed-toolbar"]',
		);
		if (!toolbar) {
			toolbar = document.createElement("div");
			toolbar.dataset.kiln = "feed-toolbar";
			toolbar.className = "col-auto d-flex align-items-center gap-2";
			headingRow.appendChild(toolbar);
		}

		return { toolbar, container };
	};

	const found = findFeedToolbar();
	if (!found) return;
	const { toolbar, container } = found;

	const renderFeedEntry = (entry: PolyTrack.FeedEntry): HTMLElement => {
		const isReply = entry.kind === "reply";
		const preview = entry.content.replace(/\s+/g, " ").trim();
		const truncatedPreview =
			preview.length > 150 ? `${preview.slice(0, 147)}...` : preview;

		const card = document.createElement("div");
		card.className = "card card-dash mcard mb-3";
		card.innerHTML = `
			<div class="card-body">
				<div class="row small">
					<div class="col-auto">
						<a href="/users/${entry.author.polytoriaId}">
							<img src="${escapeHtml(entry.author.avatarUrl)}" width="52" height="52" class="img-fluid rounded-circle border border-2 border-secondary">
						</a>
					</div>
					<div class="col">
						<p class="mb-1">
							<a href="/users/${entry.author.polytoriaId}" class="text-reset fw-semibold">${escapeHtml(entry.author.username)}</a>
							<span class="text-muted ms-2" data-bs-toggle="tooltip" data-bs-title="${escapeHtml(new Date(entry.postedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))}">
								<i class="fa-duotone fa-clock me-1"></i>${formatNotificationRelativeTime(new Date(entry.postedAt))}
							</span>
						</p>
						${
							entry.parent
								? `<blockquote class="blockquote mb-1 text-muted small"><i class="fas fa-quote-left me-1"></i>${escapeHtml(entry.parent.content.replace(/\s+/g, " ").trim().slice(0, 100))}<i class="fas fa-quote-right ms-1"></i></blockquote>`
								: isReply && entry.parentUnavailable
									? `<p class="mb-1 text-muted small fst-italic"><i class="fas fa-triangle-exclamation me-1"></i>Original post unavailable</p>`
									: ""
						}
						${
							truncatedPreview
								? `<p class="mb-1"><a data-kiln="feed-link" class="text-reset">${escapeHtml(truncatedPreview)}</a></p>`
								: ""
						}
						${
							entry.mediaUrl
								? `<a data-kiln="feed-link" class="d-inline-block"><img src="${escapeHtml(entry.mediaUrl)}" class="img-fluid rounded-3 my-2" style="max-height:200px;"></a>`
								: ""
						}
						<div class="small">
							<a data-kiln="feed-link" class="text-muted text-decoration-none"><i class="far fa-comment me-1"></i>${entry.replyCount ?? "-"}</a>
						</div>
					</div>
				</div>
			</div>
			`;

		for (const link of card.querySelectorAll<HTMLAnchorElement>(
			'[data-kiln="feed-link"]',
		)) {
			if (entry.parentUnavailable) {
				link.href = "#";
				link.style.pointerEvents = "none";
				link.style.opacity = "0.7";
			} else {
				link.href = `/feed/${isReply ? (entry.parentId ?? entry.id) : entry.id}`;
			}
		}

		return card;
	};

	const setLoadMoreState = (
		btn: HTMLButtonElement,
		state: "idle" | "loading" | "error" | "done" | "hidden",
	) => {
		btn.classList.toggle("d-none", state === "hidden");
		btn.classList.toggle("d-block", state !== "hidden");
		btn.disabled = state === "loading" || state === "done";
		btn.innerHTML =
			state === "loading"
				? `<span class="spinner-border spinner-border-sm"></span> Loading...`
				: state === "error"
					? "Failed to load more, click to retry"
					: state === "done"
						? "No more results"
						: "Load More";
	};

	const button = document.createElement("button");
	button.type = "button";
	button.className = "btn btn-outline-secondary btn-sm";
	button.textContent = "My Feed Posts";
	toolbar.appendChild(button);

	const showMyFeedPosts = async () => {
		const user = await getUserDetails();
		if (!user) return;
		const userId = user.userId;

		const existingChildren = Array.from(container.children) as HTMLElement[];
		for (const child of existingChildren) child.style.display = "none";
		toolbar.style.display = "none";

		const kilnBadge = document.createElement("span");
		kilnBadge.classList.add("badge", "bg-warning", "mb-2");
		kilnBadge.innerText = "Kiln";

		const header = document.createElement("div");
		header.className = "d-flex align-items-center justify-content-between mb-3";
		header.innerHTML = `
			<h2 class="text-shadow mb-0">My Feed Posts</h2>
			<div class="d-flex align-items-center gap-3">
				<div class="form-check mb-0">
					<input class="form-check-input" type="checkbox" id="kiln-my-feed-posts-replies" data-kiln="my-feed-posts-replies">
					<label class="form-check-label" for="kiln-my-feed-posts-replies">Include replies</label>
				</div>
				<select class="form-select form-select-sm w-auto" data-kiln="my-feed-posts-sort">
					<option value="newest">Newest to oldest</option>
					<option value="oldest">Oldest to newest</option>
				</select>
				<button type="button" class="btn btn-sm btn-outline-secondary" data-kiln="my-feed-back">
					<i class="fas fa-arrow-left me-1"></i>Back to Home
				</button>
			</div>
		`;
		container.prepend(header);
		container.prepend(kilnBadge);

		const resultsContainer = document.createElement("div");
		resultsContainer.className = "kiln-feed-results mt-3";

		const loadMoreButton = document.createElement("button");
		loadMoreButton.type = "button";
		loadMoreButton.className =
			"btn btn-outline-secondary w-75 mx-auto mt-3 mb-3 d-none";
		loadMoreButton.textContent = "Load More";

		header.insertAdjacentElement("afterend", resultsContainer);
		resultsContainer.insertAdjacentElement("afterend", loadMoreButton);

		header
			.querySelector<HTMLButtonElement>('[data-kiln="my-feed-back"]')!
			.addEventListener("click", () => {
				window.history.pushState(null, "", window.location.pathname);
				kilnBadge.remove();
				header.remove();
				resultsContainer.remove();
				loadMoreButton.remove();
				toolbar.style.display = "";
				for (const child of existingChildren) child.style.display = "";
			});

		const repliesCheckbox = header.querySelector<HTMLInputElement>(
			'[data-kiln="my-feed-posts-replies"]',
		)!;
		const sortSelect = header.querySelector<HTMLSelectElement>(
			'[data-kiln="my-feed-posts-sort"]',
		)!;

		let nextPage: number | null = null;
		let requestId = 0;

		const loadPage = async (page: number) => {
			const thisRequest = ++requestId;
			const result = await sendMessage("getFeedSearch", {
				page,
				search: "",
				sort: sortSelect.value,
				kind: repliesCheckbox.checked ? "both" : "parents",
				authorIds: [userId],
				postedAfter: "",
				postedBefore: "",
			});

			if (thisRequest !== requestId) return;

			if (!result.ok) {
				if (page === 1) {
					resultsContainer.innerHTML = `<div class="alert alert-danger">Failed to load your feed posts: ${escapeHtml(result.message)}</div>`;
				} else {
					setLoadMoreState(loadMoreButton, "error");
				}
				return;
			}

			if (page === 1) {
				resultsContainer.innerHTML =
					result.data.entries.length === 0
						? `<div class="text-center text-muted border border-secondary rounded p-2">You haven't posted anything on the feed yet.</div>`
						: "";
			}

			for (const entry of result.data.entries) {
				resultsContainer.appendChild(renderFeedEntry(entry));
			}
			sendMessage("registerBootstrapElements");

			nextPage = result.data.nextPage;
			setLoadMoreState(loadMoreButton, nextPage === null ? "done" : "idle");
		};

		const runSearch = async () => {
			resultsContainer.innerHTML = `<div class="text-center text-muted p-4"><span class="spinner-border spinner-border-sm"></span> Loading your feed posts...</div>`;
			setLoadMoreState(loadMoreButton, "hidden");
			await loadPage(1);
		};

		repliesCheckbox.addEventListener("change", runSearch);
		sortSelect.addEventListener("change", runSearch);

		await runSearch();

		loadMoreButton.addEventListener("click", async () => {
			if (nextPage === null) return;
			setLoadMoreState(loadMoreButton, "loading");
			await loadPage(nextPage);
		});
	};

	button.addEventListener("click", () => {
		window.history.pushState(
			null,
			"",
			`${window.location.pathname}?my-feed-posts`,
		);
		showMyFeedPosts();
	});

	if (new URLSearchParams(window.location.search).has("my-feed-posts")) {
		await showMyFeedPosts();
	}
}

async function searchFeedPosts() {
	const SORT_OPTIONS = [
		{ value: "relevance", label: "Relevance" },
		{ value: "newest", label: "Newest" },
		{ value: "oldest", label: "Oldest" },
	];
	const KIND_OPTIONS = [
		{ value: "both", label: "Posts and replies" },
		{ value: "parents", label: "Posts" },
		{ value: "replies", label: "Replies" },
	];
	const DEFAULT_SORT = "relevance";
	const DEFAULT_KIND = "both";

	type Chip = { id: number; label: string };

	const findFeedToolbar = (): {
		toolbar: HTMLElement;
		container: HTMLElement;
	} | null => {
		const headingRow = Array.from(
			document.querySelectorAll<HTMLElement>("h5.dash-ctitle"),
		)
			.find((h) => h.textContent?.trim() === "Feed")
			?.closest<HTMLElement>(".row");
		if (!headingRow) return null;

		let container: HTMLElement | null = headingRow;
		while (
			container &&
			!Array.from(container.classList).some((c) => c.startsWith("container"))
		) {
			container = container.parentElement;
		}
		if (!container) return null;

		let toolbar = headingRow.querySelector<HTMLElement>(
			'[data-kiln="feed-toolbar"]',
		);
		if (!toolbar) {
			toolbar = document.createElement("div");
			toolbar.dataset.kiln = "feed-toolbar";
			toolbar.className = "col-auto d-flex align-items-center gap-2";
			headingRow.appendChild(toolbar);
		}

		return { toolbar, container };
	};

	const found = findFeedToolbar();
	if (!found) return;
	const { toolbar, container } = found;

	const renderFeedEntry = (entry: PolyTrack.FeedEntry): HTMLElement => {
		const isReply = entry.kind === "reply";
		const preview = entry.content.replace(/\s+/g, " ").trim();
		const truncatedPreview =
			preview.length > 150 ? `${preview.slice(0, 147)}...` : preview;

		const card = document.createElement("div");
		card.className = "card card-dash mcard mb-3";
		card.innerHTML = `
			<div class="card-body">
				<div class="row small">
					<div class="col-auto">
						<a href="/users/${entry.author.polytoriaId}">
							<img src="${escapeHtml(entry.author.avatarUrl)}" width="52" height="52" class="img-fluid rounded-circle border border-2 border-secondary">
						</a>
					</div>
					<div class="col">
						<p class="mb-1">
							<a href="/users/${entry.author.polytoriaId}" class="text-reset fw-semibold">${escapeHtml(entry.author.username)}</a>
							<span class="text-muted ms-2" data-bs-toggle="tooltip" data-bs-title="${escapeHtml(new Date(entry.postedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))}">
								<i class="fa-duotone fa-clock me-1"></i>${formatNotificationRelativeTime(new Date(entry.postedAt))}
							</span>
						</p>
						${
							entry.parent
								? `<blockquote class="blockquote mb-1 text-muted small"><i class="fas fa-quote-left me-1"></i>${escapeHtml(entry.parent.content.replace(/\s+/g, " ").trim().slice(0, 100))}<i class="fas fa-quote-right ms-1"></i></blockquote>`
								: isReply && entry.parentUnavailable
									? `<p class="mb-1 text-muted small fst-italic"><i class="fas fa-triangle-exclamation me-1"></i>Original post unavailable</p>`
									: ""
						}
						${
							truncatedPreview
								? `<p class="mb-1"><a data-kiln="feed-link" class="text-reset">${escapeHtml(truncatedPreview)}</a></p>`
								: ""
						}
						${
							entry.mediaUrl
								? `<a data-kiln="feed-link" class="d-inline-block"><img src="${escapeHtml(entry.mediaUrl)}" class="img-fluid rounded-3 my-2" style="max-height:200px;"></a>`
								: ""
						}
						<div class="small">
							<a data-kiln="feed-link" class="text-muted text-decoration-none"><i class="far fa-comment me-1"></i>${entry.replyCount ?? "-"}</a>
						</div>
					</div>
				</div>
			</div>
			`;

		for (const link of card.querySelectorAll<HTMLAnchorElement>(
			'[data-kiln="feed-link"]',
		)) {
			if (entry.parentUnavailable) {
				link.href = "#";
				link.style.pointerEvents = "none";
				link.style.opacity = "0.7";
			} else {
				link.href = `/feed/${isReply ? (entry.parentId ?? entry.id) : entry.id}`;
			}
		}

		return card;
	};

	const setLoadMoreState = (
		btn: HTMLButtonElement,
		state: "idle" | "loading" | "error" | "done" | "hidden",
	) => {
		btn.classList.toggle("d-none", state === "hidden");
		btn.classList.toggle("d-block", state !== "hidden");
		btn.disabled = state === "loading" || state === "done";
		btn.innerHTML =
			state === "loading"
				? `<span class="spinner-border spinner-border-sm"></span> Loading...`
				: state === "error"
					? "Failed to load more, click to retry"
					: state === "done"
						? "No more results"
						: "Load More";
	};

	const button = document.createElement("button");
	button.type = "button";
	button.className = "btn btn-outline-secondary btn-sm";
	button.textContent = "Search Feed Posts";
	toolbar.appendChild(button);

	const showSearchFeedPosts = async () => {
		const existingChildren = Array.from(container.children) as HTMLElement[];
		for (const child of existingChildren) child.style.display = "none";
		toolbar.style.display = "none";

		const kilnBadge = document.createElement("span");
		kilnBadge.classList.add("badge", "bg-warning", "mb-2");
		kilnBadge.innerText = "Kiln";
		container.prepend(kilnBadge);

		const searchBox = document.createElement("div");
		searchBox.className = "forum-category-container mb-3 border-secondary";
		searchBox.innerHTML = `
			<div class="d-flex align-items-center justify-content-between mb-2">
				<h2 class="text-shadow mb-0">Search Feed</h2>
				<button type="button" class="btn btn-sm btn-outline-secondary" data-kiln="feed-search-back">
					<i class="fas fa-arrow-left me-1"></i>Back to Home
				</button>
			</div>
		`;
		container.prepend(searchBox);

		const panel = document.createElement("div");
		panel.className = "row g-3";
		panel.innerHTML = `
			<div class="col-lg-8 col-12">
				<label class="small text-muted mb-1 d-block">Text</label>
				<div class="input-group">
					<span class="input-group-text bg-dark"><i class="fas fa-search"></i></span>
					<input type="search" class="form-control" data-kiln="text" placeholder="Search feed post content">
				</div>
			</div>
			<div class="col-lg-4 col-12">
				<label class="small text-muted mb-1 d-block">Sort</label>
				<select class="form-select" data-kiln="sort">
					${SORT_OPTIONS.map((o) => `<option value="${o.value}"${o.value === DEFAULT_SORT ? " selected" : ""}>${o.label}</option>`).join("")}
				</select>
			</div>
			<div class="col-lg-6 col-12">
				<label class="small text-muted mb-1 d-block">Posted by</label>
				<div data-kiln="authors-slot"></div>
			</div>
			<div class="col-lg-6 col-12">
				<label class="small text-muted mb-1 d-block">Feed post type</label>
				<select class="form-select" data-kiln="kind">
					${KIND_OPTIONS.map((o) => `<option value="${o.value}"${o.value === DEFAULT_KIND ? " selected" : ""}>${o.label}</option>`).join("")}
				</select>
			</div>
			<div class="col-md-6 col-12">
				<label class="small text-muted mb-1 d-block">Posted after</label>
				<input type="date" class="form-control" data-kiln="posted-after">
			</div>
			<div class="col-md-6 col-12">
				<label class="small text-muted mb-1 d-block">Posted before</label>
				<input type="date" class="form-control" data-kiln="posted-before">
			</div>
			<div class="col-12 d-flex flex-column flex-sm-row justify-content-sm-end gap-2">
				<button type="button" class="btn btn-outline-secondary" data-kiln="clear">Clear</button>
				<button type="submit" class="btn btn-primary" data-kiln="submit">
					<i class="fas fa-search me-1"></i>Search
				</button>
			</div>
		`;

		const form = document.createElement("form");
		form.append(panel);
		searchBox.appendChild(form);

		const suggestAuthors = async (text: string): Promise<Chip[]> => {
			const trimmed = text.trim();
			if (trimmed.length < 2) return [];

			const result = await sendMessage("searchUsersByActivity", trimmed);
			if (!result.ok) return [];
			return result.data.map((u) => ({ id: u.userId, label: u.username }));
		};

		const resolveAuthor = async (text: string): Promise<Chip | null> => {
			const trimmed = text.trim();
			if (!trimmed) return null;
			if (/^\d+$/.test(trimmed))
				return { id: Number(trimmed), label: `#${trimmed}` };

			const result = await sendMessage("findUserByUsername", trimmed);
			if (!result.ok) return null;
			return { id: result.data, label: trimmed };
		};

		const createAuthorInput = () => {
			const wrapContainer = document.createElement("div");
			wrapContainer.className = "position-relative";

			const wrapper = document.createElement("div");
			wrapper.className =
				"form-control d-flex flex-wrap align-items-center gap-1 h-auto";
			wrapContainer.appendChild(wrapper);

			const chipList = document.createElement("div");
			chipList.className = "d-flex flex-wrap gap-1";

			const input = document.createElement("input");
			input.type = "search";
			input.className = "border-0 flex-grow-1 p-0 bg-transparent";
			input.style.outline = "none";
			input.style.minWidth = "140px";
			input.placeholder = "Username or user ID";

			const chips = new Map<number, string>();

			const renderChips = () => {
				chipList.innerHTML = "";
				for (const [id, label] of chips) {
					const chip = document.createElement("span");
					chip.className =
						"badge bg-secondary d-inline-flex align-items-center gap-1";
					chip.append(label);

					const remove = document.createElement("button");
					remove.type = "button";
					remove.className = "btn-close btn-close-black";
					remove.style.fontSize = "0.55em";
					remove.setAttribute("aria-label", "Remove");
					remove.addEventListener("click", () => {
						chips.delete(id);
						renderChips();
					});

					chip.appendChild(remove);
					chipList.appendChild(chip);
				}
				input.placeholder =
					chips.size === 0 ? "Username or user ID" : "Add another";
			};

			const addChip = (chip: Chip) => {
				if (!chips.has(chip.id)) {
					chips.set(chip.id, chip.label);
					renderChips();
				}
				input.value = "";
			};

			let pending = false;
			const tryAdd = async () => {
				const text = input.value;
				if (!text.trim() || pending) return;
				pending = true;
				try {
					const resolved = await resolveAuthor(text);
					if (resolved) addChip(resolved);
				} finally {
					pending = false;
					input.value = "";
				}
			};

			const dropdown = document.createElement("div");
			dropdown.className =
				"list-group position-absolute w-100 mt-1 shadow-sm d-none";
			dropdown.style.zIndex = "1000";
			dropdown.style.maxHeight = "220px";
			dropdown.style.overflowY = "auto";
			wrapContainer.appendChild(dropdown);

			const hideSuggestions = () => {
				dropdown.classList.add("d-none");
				dropdown.innerHTML = "";
			};

			let suggestRequestId = 0;
			let debounceTimer: ReturnType<typeof setTimeout> | undefined;
			input.addEventListener("input", () => {
				clearTimeout(debounceTimer);
				const text = input.value;
				if (!text.trim()) {
					hideSuggestions();
					return;
				}
				debounceTimer = setTimeout(async () => {
					const requestId = ++suggestRequestId;
					const results = await suggestAuthors(text);
					if (requestId !== suggestRequestId) return;
					if (!results.length) {
						hideSuggestions();
						return;
					}

					dropdown.innerHTML = "";
					for (const candidate of results) {
						const item = document.createElement("button");
						item.type = "button";
						item.className = "list-group-item list-group-item-action py-1 px-2";
						item.textContent = candidate.label;
						item.addEventListener("mousedown", (event) => {
							event.preventDefault();
							addChip(candidate);
							hideSuggestions();
						});
						dropdown.appendChild(item);
					}
					dropdown.classList.remove("d-none");
				}, 250);
			});

			input.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					tryAdd();
					hideSuggestions();
				} else if (
					event.key === "Backspace" &&
					input.value === "" &&
					chips.size > 0
				) {
					const lastKey = [...chips.keys()].pop();
					if (lastKey !== undefined) {
						chips.delete(lastKey);
						renderChips();
					}
				}
			});
			input.addEventListener("blur", () => {
				tryAdd();
				hideSuggestions();
			});

			wrapper.append(chipList, input);
			renderChips();

			return {
				element: wrapContainer,
				getIds: () => [...chips.keys()],
				clear: () => {
					chips.clear();
					renderChips();
					hideSuggestions();
				},
			};
		};

		const authors = createAuthorInput();
		panel
			.querySelector('[data-kiln="authors-slot"]')!
			.replaceWith(authors.element);

		const resultsContainer = document.createElement("div");
		resultsContainer.className = "kiln-feed-results mt-3";

		const loadMoreButton = document.createElement("button");
		loadMoreButton.type = "button";
		loadMoreButton.className = "btn btn-outline-secondary w-100 mb-3 d-none";
		loadMoreButton.textContent = "Load More";

		searchBox.insertAdjacentElement("afterend", resultsContainer);
		resultsContainer.insertAdjacentElement("afterend", loadMoreButton);

		searchBox
			.querySelector<HTMLButtonElement>('[data-kiln="feed-search-back"]')!
			.addEventListener("click", () => {
				window.history.pushState(null, "", window.location.pathname);
				kilnBadge.remove();
				searchBox.remove();
				resultsContainer.remove();
				loadMoreButton.remove();
				toolbar.style.display = "";
				for (const child of existingChildren) child.style.display = "";
			});

		const textInput =
			panel.querySelector<HTMLInputElement>('[data-kiln="text"]')!;
		const sortSelect =
			panel.querySelector<HTMLSelectElement>('[data-kiln="sort"]')!;
		const kindSelect =
			panel.querySelector<HTMLSelectElement>('[data-kiln="kind"]')!;
		const postedAfterInput = panel.querySelector<HTMLInputElement>(
			'[data-kiln="posted-after"]',
		)!;
		const postedBeforeInput = panel.querySelector<HTMLInputElement>(
			'[data-kiln="posted-before"]',
		)!;
		const clearButton = panel.querySelector<HTMLButtonElement>(
			'[data-kiln="clear"]',
		)!;

		let nextPage: number | null = null;
		let requestId = 0;

		const readFilters = (targetPage: number) => ({
			page: targetPage,
			search: textInput.value.trim(),
			sort: sortSelect.value,
			kind: kindSelect.value,
			authorIds: authors.getIds(),
			postedAfter: postedAfterInput.value,
			postedBefore: postedBeforeInput.value,
		});

		const runSearch = async () => {
			const thisRequest = ++requestId;
			resultsContainer.innerHTML = `<div class="text-center text-muted p-4"><span class="spinner-border spinner-border-sm"></span> Searching...</div>`;
			setLoadMoreState(loadMoreButton, "hidden");

			const result = await sendMessage("getFeedSearch", readFilters(1));
			if (thisRequest !== requestId) return;

			if (!result.ok) {
				resultsContainer.innerHTML = `<div class="alert alert-danger">Failed to search the feed: ${escapeHtml(result.message)}</div>`;
				return;
			}

			resultsContainer.innerHTML = "";
			if (result.data.entries.length === 0) {
				resultsContainer.innerHTML = `<div class="text-center text-danger border border-danger rounded p-2">No feed posts matched your search.</div>`;
				return;
			}

			for (const entry of result.data.entries) {
				resultsContainer.appendChild(renderFeedEntry(entry));
			}
			sendMessage("registerBootstrapElements");

			nextPage = result.data.nextPage;
			setLoadMoreState(loadMoreButton, nextPage === null ? "done" : "idle");
		};

		loadMoreButton.addEventListener("click", async () => {
			if (nextPage === null) return;
			const thisRequest = ++requestId;
			setLoadMoreState(loadMoreButton, "loading");

			const result = await sendMessage("getFeedSearch", readFilters(nextPage));
			if (thisRequest !== requestId) return;

			if (!result.ok) {
				setLoadMoreState(loadMoreButton, "error");
				return;
			}

			for (const entry of result.data.entries) {
				resultsContainer.appendChild(renderFeedEntry(entry));
			}
			sendMessage("registerBootstrapElements");

			nextPage = result.data.nextPage;
			setLoadMoreState(loadMoreButton, nextPage === null ? "done" : "idle");
		});

		form.addEventListener("submit", (event) => {
			event.preventDefault();
			runSearch();
		});

		clearButton.addEventListener("click", () => {
			textInput.value = "";
			sortSelect.value = DEFAULT_SORT;
			kindSelect.value = DEFAULT_KIND;
			postedAfterInput.value = "";
			postedBeforeInput.value = "";
			authors.clear();
			runSearch();
		});

		await runSearch();
	};

	button.addEventListener("click", () => {
		window.history.pushState(
			null,
			"",
			`${window.location.pathname}?kiln-feed-search`,
		);
		showSearchFeedPosts();
	});

	if (new URLSearchParams(window.location.search).has("kiln-feed-search")) {
		await showSearchFeedPosts();
	}
}

const REORDERABLE_SECTION_LABELS: Record<string, string> = {
	"home-pinnedWorlds": "Pinned Worlds",
	"home-friendsOnline": "Friends",
	"home-news": "News",
	"home-following": "Following",
	"home-liveNow": "Live Now",
	"home-recommendedPlaces": "Recommended Worlds",
	"home-newAndRising": "New & Rising",
	"home-recentlyPlayed": "Continue Playing",
};

async function reorderableHomepage(showDisclosures: boolean) {
	const column = document.querySelector<HTMLElement>(".col-lg-8");
	if (!column) return;

	const playTab = document.getElementById("home-play");

	const following = playTab?.querySelector<HTMLElement>(
		'section[aria-labelledby="home-following-title"]',
	);
	if (following && !following.id) following.id = "home-following";

	const groups: Array<{ label: string; container: HTMLElement }> = [
		{ label: "Homepage", container: column },
	];
	if (playTab) groups.push({ label: "Play Tab", container: playTab });

	const getSections = (container: HTMLElement): HTMLElement[] =>
		Array.from(container.children).filter(
			(el): el is HTMLElement =>
				el instanceof HTMLElement &&
				REORDERABLE_SECTION_LABELS[el.id] !== undefined,
		);

	const defaultOrder = groups.flatMap((g) =>
		getSections(g.container).map((s) => s.id),
	);

	let observer: MutationObserver | null = null;

	const observeContainers = () => {
		for (const { container } of groups)
			observer?.observe(container, { childList: true });
	};

	const orderSections = (order: string[]) => {
		const rank = (section: HTMLElement) => {
			const index = order.indexOf(section.id);
			return index === -1 ? order.length : index;
		};

		for (const { container } of groups) {
			const sections = getSections(container);
			if (sections.length === 0) continue;

			const desired = [...sections].sort((a, b) => rank(a) - rank(b));
			if (desired.every((s, i) => sections[i] === s)) continue;

			const anchor = sections[sections.length - 1].nextSibling;

			observer?.disconnect();
			for (const section of desired) container.insertBefore(section, anchor);
			observeContainers();
		}
	};

	const applyOrder = async () => {
		const order = await _homepageSectionOrder.getValue();
		if (order.length === 0) return;
		orderSections(order);
	};

	await applyOrder();

	observer = new MutationObserver(() => applyOrder());
	observeContainers();

	const stickySection = document.querySelector<HTMLElement>(
		".dashboardAvatarShadow + *",
	);
	if (!stickySection) return;

	const reorderBtn = document.createElement("button");
	reorderBtn.type = "button";
	reorderBtn.className =
		"btn btn-secondary mb-3 rounded-pill d-none d-md-block";
	reorderBtn.innerHTML = `<i class="fas fa-arrows-up-down me-1"></i>Reorder Homepage${kilnDisclosureBadgeHtml(showDisclosures)}`;

	const placeReorderBtn = (): boolean => {
		if (reorderBtn.isConnected) return true;

		const customizeBtn = stickySection.querySelector<HTMLElement>(
			".customizeHomepageBtn",
		);
		if (!customizeBtn) return false;

		customizeBtn.insertAdjacentElement("afterend", reorderBtn);
		return true;
	};

	if (!placeReorderBtn()) {
		const btnObserver = new MutationObserver(() => {
			if (placeReorderBtn()) btnObserver.disconnect();
		});
		btnObserver.observe(stickySection, { childList: true, subtree: true });
	}

	reorderBtn.addEventListener("click", async () => {
		const sections = groups.flatMap(({ label, container }) =>
			getSections(container).map((section) => ({
				id: section.id,
				label: REORDERABLE_SECTION_LABELS[section.id],
				group: label,
			})),
		);
		if (sections.length < 2) return;

		const result = await sendMessage("showHomepageReorderModal", {
			sections,
		});
		if (!result.ok || !result.data) return;

		if (result.data.length === 0) {
			await _homepageSectionOrder.setValue([]);
			orderSections(defaultOrder);
			return;
		}

		await _homepageSectionOrder.setValue(result.data);
		await applyOrder();
	});
}
