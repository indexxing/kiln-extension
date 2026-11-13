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

const noopEvent = {
	addListener() {},
	removeListener() {},
	hasListener: () => false,
};

(globalThis as any).chrome ??= {
	runtime: {
		id: "kiln-test",
		onMessage: noopEvent,
		sendMessage: async () => undefined,
		getURL: (path: string) => `chrome-extension://kiln-test/${path}`,
	},
	storage: {
		local: {
			get: async () => ({}),
			set: async () => {},
			remove: async () => {},
		},
		sync: {
			get: async () => ({}),
			set: async () => {},
			remove: async () => {},
		},
		onChanged: noopEvent,
	},
};

const { storage: wxtStorage } = await import("wxt/storage");
(globalThis as any).storage = wxtStorage;

export {};
