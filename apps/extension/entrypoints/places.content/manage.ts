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

import { kilnDisclosureBadgeHtml } from "@/utils/utilities";

const placeID = +window.location.pathname.split("/")[3];

type TrendMetric =
	| "uniqueVisits"
	| "visits"
	| "likes"
	| "dislikes"
	| "likeRate"
	| "inGame";

type TrendPoint = { time: number; value: number };

type TrendRange = {
	id: string;
	label: string;
	days: number;
	window: string;
};

export function placeFileExport(showDisclosures: boolean) {
	const container = document.createElement("div");
	container.classList.add("form-group", "mt-4");
	container.innerHTML = `
  <label class="mb-2">
    <h5 class="mb-0">Download <code style="color: orange;">.poly</code> File${kilnDisclosureBadgeHtml(showDisclosures)}</h5>
    <small class="text-muted">Quickly download your place from the site!</small>
  </label>
  <br>
  <button type="button" id="_kiln-downloadplace-btn" class="btn btn-primary">Download</button>
  `;

	const form = document.querySelector('form[action="/create/place/update"]')!;
	const button = container.getElementsByTagName("button")[0]!;

	form.insertBefore(container, form.children[form.children.length - 1]);

	button.addEventListener("click", async () => {
		button.disabled = true;
		button.innerHTML = `
      <span class="spinner-grow spinner-grow-sm" aria-hidden="true"></span>
        <span class="visually-hidden" role="status">Loading...</span>
    `;

		try {
			await sendMessage("downloadPlaceFile", +placeID);
		} finally {
			button.disabled = false;
			button.textContent = "Download";
		}
	});
}

export function bulkWhitelist(showDisclosures: boolean) {
	const whitelistCard = document.querySelector(
		".card:has(#whitelist-username)",
	)!;

	const bulkWhitelistCard = document.createElement("card");
	bulkWhitelistCard.classList.add("card", "mt-3");
	bulkWhitelistCard.innerHTML = `
	<div class="card-header">
		<i class="fa-duotone fa-solid fa-vial-circle-check"></i>
		Multi-Whitelist${kilnDisclosureBadgeHtml(showDisclosures)}
	</div>
	<div class="card-body">
		<textarea class="form-control bg-dark mb-2" placeholder="Usernames (separated by lines).." style="min-height: 250px;"></textarea>
		<button class="btn btn-primary">
			<i class="fa-duotone fa-solid fa-users"></i>
			Whitelist
		</button>
	</div>
	`;
	whitelistCard.parentElement!.appendChild(bulkWhitelistCard);

	const submitBtn = bulkWhitelistCard.getElementsByTagName("button")[0];

	submitBtn.addEventListener("click", async () => {
		const textbox = submitBtn.previousElementSibling! as HTMLTextAreaElement;
		const usernames = textbox.value
			.split("\n")
			.map((x) => x.trim())
			.filter((x) => x !== "");

		if (usernames.length === 0) {
			textbox.disabled = false;
			return;
		}

		textbox.disabled = true;
		submitBtn.disabled = true;

		try {
			await sendMessage("bulkWhitelist", {
				placeId: placeID,
				usernames,
			});
			window.location.reload();
		} catch {
			textbox.disabled = false;
			submitBtn.disabled = false;
		}
	});
}

const trendMetrics: {
	id: TrendMetric;
	label: string;
	format: (value: number) => string;
	lowerIsBetter?: boolean;
}[] = [
	{
		id: "uniqueVisits",
		label: "Unique Visitors",
		format: (v) => Math.round(v).toLocaleString(),
	},
	{
		id: "visits",
		label: "Visits",
		format: (v) => Math.round(v).toLocaleString(),
	},
	{
		id: "inGame",
		label: "Players In-Game",
		format: (v) => Math.round(v).toLocaleString(),
	},
	{
		id: "likes",
		label: "Likes",
		format: (v) => Math.round(v).toLocaleString(),
	},
	{
		id: "dislikes",
		label: "Dislikes",
		format: (v) => Math.round(v).toLocaleString(),
		lowerIsBetter: true,
	},
	{
		id: "likeRate",
		label: "Like Rate",
		format: (v) => `${v.toFixed(1)}%`,
	},
];

const trendRanges: TrendRange[] = [
	{ id: "1d", label: "Last 24 Hours", days: 1, window: "30m" },
	{ id: "7d", label: "Last 7 Days", days: 7, window: "2h" },
	{ id: "30d", label: "Last 30 Days", days: 30, window: "8h" },
	{ id: "90d", label: "Last 90 Days", days: 90, window: "1d" },
];

export function worldTrends() {
	const statsCard = document.querySelector(".card:has(.fa-chart-fft)");
	if (!statsCard) return;

	const card = document.createElement("div");
	card.classList.add("card", "mt-3");
	card.innerHTML = `
	<h6 class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2">
		<span><i class="fas fa-chart-line me-1"></i> World Trends (Kiln)</span>
		<span class="d-flex gap-2">
			<select class="form-select form-select-sm w-auto kiln-trends-metric"></select>
			<select class="form-select form-select-sm w-auto kiln-trends-range"></select>
		</span>
	</h6>
	<div class="card-body">
		<h3 class="m-0 kiln-trends-current text-center">...</h3>
		<div class="kiln-trends-chart-container" style="position:relative;height:220px;"></div>
	</div>
	`;

	statsCard.insertAdjacentElement("afterend", card);

	const metricSelect = card.querySelector<HTMLSelectElement>(
		".kiln-trends-metric",
	)!;
	metricSelect.innerHTML = trendMetrics
		.map((m) => `<option value="${m.id}">${m.label}</option>`)
		.join("");

	const rangeSelect =
		card.querySelector<HTMLSelectElement>(".kiln-trends-range")!;
	rangeSelect.innerHTML = trendRanges
		.map((r) => `<option value="${r.id}">${r.label}</option>`)
		.join("");
	rangeSelect.value = "7d";

	const currentEl = card.querySelector<HTMLElement>(".kiln-trends-current")!;
	const chartContainer = card.querySelector<HTMLElement>(
		".kiln-trends-chart-container",
	)!;

	const cache = new Map<string, TrendPoint[]>();

	const fetchMetric = async (
		metric: TrendMetric,
		range: TrendRange,
	): Promise<{ points: TrendPoint[]; ok: boolean }> => {
		const cacheKey = `${metric}-${range.id}`;
		const cached = cache.get(cacheKey);
		if (cached) return { points: cached, ok: true };

		const stop = new Date();
		const start = new Date(stop.getTime() - range.days * 24 * 60 * 60 * 1000);

		let points: TrendPoint[];
		let ok: boolean;
		if (metric === "inGame") {
			const result = await sendMessage("getWorldIngameChart", {
				placeId: placeID,
				start: start.toISOString(),
				stop: stop.toISOString(),
				window: range.window,
			});
			ok = result.ok;
			points = result.ok
				? result.data.avg.map((p) => ({
						time: new Date(p._time).getTime(),
						value: p._value,
					}))
				: [];
		} else {
			const result = await sendMessage("getWorldStatsChart", {
				placeId: placeID,
				metric,
				start: start.toISOString(),
				stop: stop.toISOString(),
				window: range.window,
			});
			ok = result.ok;
			points =
				result.ok && "value" in result.data
					? result.data.value.map((p) => ({
							time: new Date(p._time).getTime(),
							value: p._value,
						}))
					: result.ok && "avg" in result.data
						? result.data.avg.map((p) => ({
								time: new Date(p._time).getTime(),
								value: p._value * 100,
							}))
						: [];
		}

		if (ok) cache.set(cacheKey, points);
		return { points, ok };
	};

	const formatAxisDate = (time: number, rangeDays: number) => {
		const date = new Date(time);
		return rangeDays <= 1
			? date.toLocaleTimeString(undefined, {
					hour: "numeric",
					minute: "2-digit",
				})
			: date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	};

	const renderChart = (
		points: TrendPoint[],
		format: (v: number) => string,
		rangeDays: number,
		lowerIsBetter: boolean,
	) => {
		if (points.length === 0) {
			chartContainer.innerHTML = `<div class="d-flex justify-content-center align-items-center h-100 text-muted small fst-italic">No data available.</div>`;
			currentEl.textContent = "N/A";
			return;
		}

		const values = points.map((p) => p.value);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const valueRange = max - min || 1;

		const width = 640;
		const height = 220;
		const marginLeft = 56;
		const marginRight = 10;
		const marginTop = 10;
		const marginBottom = 26;

		const plotWidth = width - marginLeft - marginRight;
		const plotHeight = height - marginTop - marginBottom;

		const coords = points.map((p, i) => {
			const x = marginLeft + (i / (points.length - 1 || 1)) * plotWidth;
			const y =
				marginTop + plotHeight - ((p.value - min) / valueRange) * plotHeight;
			return [x, y] as const;
		});

		const linePath = coords
			.map(
				([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`,
			)
			.join(" ");
		const [lastX] = coords[coords.length - 1]!;
		const [firstX] = coords[0]!;
		const areaPath = `${linePath} L${lastX.toFixed(1)},${(marginTop + plotHeight).toFixed(1)} L${firstX.toFixed(1)},${(marginTop + plotHeight).toFixed(1)} Z`;

		const yTickCount = 4;
		const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => {
			const value = min + (valueRange * i) / yTickCount;
			const y = marginTop + plotHeight - (i / yTickCount) * plotHeight;
			return { value, y };
		});

		const xTickCount = Math.min(5, points.length);
		const xTicks = Array.from({ length: xTickCount }, (_, i) => {
			const index = Math.round(
				(i / (xTickCount - 1 || 1)) * (points.length - 1),
			);
			const point = points[index]!;
			return {
				x: coords[index]![0],
				label: formatAxisDate(point.time, rangeDays),
			};
		});

		const last = values[values.length - 1]!;
		const first = values[0]!;
		const delta = last - first;
		const improving = lowerIsBetter ? delta < 0 : delta > 0;
		const trendColor =
			delta === 0 ? "#6c757d" : improving ? "#2ecc71" : "#e74c3c";
		const trendArrow = delta === 0 ? "" : delta > 0 ? "▲" : "▼";

		currentEl.innerHTML = `${format(last)} <span class="small" style="color:${trendColor};">${trendArrow} ${format(Math.abs(delta))}</span>`;

		const gridLines = yTicks
			.map(
				(t) =>
					`<line x1="${marginLeft}" y1="${t.y.toFixed(1)}" x2="${width - marginRight}" y2="${t.y.toFixed(1)}" stroke="#ffffff" stroke-opacity="0.08" stroke-dasharray="4 4" />`,
			)
			.join("");

		const yLabels = yTicks
			.map(
				(t) =>
					`<text x="${marginLeft - 8}" y="${t.y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="currentColor" opacity="0.65">${format(t.value)}</text>`,
			)
			.join("");

		const xLabels = xTicks
			.map(
				(t) =>
					`<text x="${t.x.toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.65">${t.label}</text>`,
			)
			.join("");

		chartContainer.innerHTML = `
			<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;color:#adb5bd;">
				<defs>
					<linearGradient id="kiln-trends-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#198754" stop-opacity="0.35" />
						<stop offset="100%" stop-color="#198754" stop-opacity="0" />
					</linearGradient>
				</defs>
				${gridLines}
				<line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop + plotHeight}" stroke="currentColor" stroke-opacity="0.25" />
				<line x1="${marginLeft}" y1="${marginTop + plotHeight}" x2="${width - marginRight}" y2="${marginTop + plotHeight}" stroke="currentColor" stroke-opacity="0.25" />
				<path d="${areaPath}" fill="url(#kiln-trends-fill)" stroke="none" />
				<path d="${linePath}" fill="none" stroke="#198754" stroke-width="2" />
				${yLabels}
				${xLabels}
			</svg>
		`;
	};

	const showLoading = () => {
		chartContainer.innerHTML = `
			<div class="d-flex justify-content-center align-items-center h-100">
				<div class="spinner-border spinner-border-sm text-secondary" role="status">
					<span class="visually-hidden">Loading...</span>
				</div>
			</div>
		`;
		currentEl.textContent = "...";
	};

	let loadRequestId = 0;

	const load = async () => {
		const requestId = ++loadRequestId;
		const metric = metricSelect.value as TrendMetric;
		const range = trendRanges.find((r) => r.id === rangeSelect.value)!;

		showLoading();
		const { points } = await fetchMetric(metric, range);
		if (requestId !== loadRequestId) return;

		const metricConfig = trendMetrics.find((m) => m.id === metric)!;
		renderChart(
			points,
			metricConfig.format,
			range.days,
			metricConfig.lowerIsBetter ?? false,
		);
	};

	metricSelect.addEventListener("change", load);
	rangeSelect.addEventListener("change", load);

	load();
}
