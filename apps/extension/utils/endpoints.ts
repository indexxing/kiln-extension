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

import metadata from "@/utils/static/metadata.json";

const LOCAL_API = "http://localhost:3000/v1/";

export const endpoints: typeof metadata.endpoints =
	import.meta.env.MODE === "development"
		? {
				...metadata.endpoints,
				extension: LOCAL_API,
				proxy: `${LOCAL_API}proxy/`,
				currencyRates: `${LOCAL_API}currency-rates`,
			}
		: metadata.endpoints;
