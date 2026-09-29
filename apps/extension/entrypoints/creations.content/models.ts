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

const modelId = +window.location.pathname.split("/")[2];

export function modelTreeInspector(showDisclosures: boolean) {
	interface Vector3 {
		X: string;
		Y: string;
		Z: string;
	}

	interface Color {
		R: string;
		G: string;
		B: string;
		A: string;
	}

	interface TreeNode {
		id: string;
		text: string;
		icon: string;
		children: TreeNode[];
		properties: NodeListOf<Element> | null;
	}

	function makeId(length: number): string {
		const chars =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		return Array.from(
			{ length },
			() => chars[Math.floor(Math.random() * chars.length)],
		).join("");
	}

	function readVector(el: Element): Vector3 {
		const tag = (name: string): string =>
			el.getElementsByTagName(name)[0].textContent ?? "";
		return { X: tag("X"), Y: tag("Y"), Z: tag("Z") };
	}

	function readColor(el: Element): Color {
		const tag = (name: string): string =>
			el.getElementsByTagName(name)[0].textContent ?? "";
		return { R: tag("R"), G: tag("G"), B: tag("B"), A: tag("A") };
	}

	function getProperty(obj: Element, propertyName: string): string {
		try {
			const prop = obj
				.getElementsByTagName("Properties")[0]
				.querySelector<Element>(`*[name="${propertyName}"]`)!;

			if (prop.tagName === "vector3") {
				const { X, Y, Z } = readVector(prop);
				return `${X},${Y},${Z}`;
			}
			if (prop.tagName === "color") {
				const { R, G, B, A } = readColor(prop);
				return `${R},${G},${B},${A}`;
			}
			return prop.innerHTML;
		} catch {
			return `Unable to load Property "${propertyName}"`;
		}
	}

	function getAllProperties(obj: Element): NodeListOf<Element> | null {
		try {
			return obj
				.getElementsByTagName("Properties")[0]
				.querySelectorAll("*[name]");
		} catch {
			return null;
		}
	}

	function getDisplayProperty(prop: Element): HTMLElement {
		try {
			if (prop.tagName === "vector3") {
				const { X, Y, Z } = readVector(prop);
				const input = document.createElement("input");
				input.type = "text";
				input.disabled = true;
				input.className = "form-control form-control-sm";
				input.value = `${X}, ${Y}, ${Z}`;
				return input;
			}
			if (prop.tagName === "color") {
				const { R, G, B, A } = readColor(prop);
				const input = document.createElement("input");
				input.type = "text";
				input.disabled = true;
				input.className = "form-control form-control-sm";
				input.value = `${R}, ${G}, ${B}, ${A}`;
				return input;
			}
			if (prop.tagName === "boolean") {
				const id = makeId(8);
				const wrapper = document.createElement("div");
				wrapper.className = "form-check";
				const checkbox = document.createElement("input");
				checkbox.className = "form-check-input";
				checkbox.type = "checkbox";
				checkbox.disabled = true;
				checkbox.id = id;
				checkbox.checked = prop.textContent === "true";
				const label = document.createElement("label");
				label.className = "form-check-label";
				label.htmlFor = id;
				wrapper.append(checkbox, label);
				return wrapper;
			}
			const input = document.createElement("input");
			input.type = "text";
			input.disabled = true;
			input.className = "form-control form-control-sm";
			input.value = prop.textContent ?? "";
			return input;
		} catch {
			const span = document.createElement("span");
			span.textContent = "Unable to load property.";
			return span;
		}
	}

	function getIcon(classType: string): string {
		const known = new Set([
			"StringValue",
			"CoreUI",
			"Insert",
			"BoolValue",
			"Tool",
			"Instance",
			"Event",
			"Particles",
			"Achievements",
			"ModuleScript",
			"NetworkEvent",
			"Text3D",
			"ImageSky",
			"Game",
			"Seat",
			"Type",
			"json",
			"UIFlowV",
			"ValueBase",
			"Enum",
			"NumberValue",
			"UIHVLayout",
			"GUI",
			"Players",
			"MeshPart",
			"Datastore",
			"Unknown",
			"Hidden",
			"Backpack",
			"GUI3D",
			"ColorValue",
			"Vector2Value",
			"Vector3Value",
			"BaseScript",
			"Http",
			"Model",
			"UIImage",
			"BasePart",
			"Sound",
			"RayResult",
			"Light",
			"UIHorizontalLayout",
			"Folder",
			"Truss",
			"UIVerticalLayout",
			"PlayerGUI",
			"Lighting",
			"Color",
			"NPC",
			"InstanceValue",
			"ScriptService",
			"SunLight",
			"BodyPosition",
			"Climbable",
			"Input",
			"Tween",
			"PlayerDefaults",
			"UIView",
			"Decal",
			"UI",
			"RemoteEvent",
			"UILabel",
			"BaseTextSource",
			"Vector2",
			"Camera",
			"Part",
			"DynamicInstance",
			"ScriptInstance",
			"Chat",
			"GradientSky",
			"ColorRange",
			"UITextInput",
			"NetMessage",
			"SpotLight",
			"Vector3",
			"NumberRange",
			"PointLight",
			"UIField",
			"LocalScript",
			"IntValue",
			"Environment",
			"old-BaseScript",
			"Player",
			"UIButton",
		]);
		const name = known.has(classType) ? classType : "object";
		return (browser.runtime.getURL as (path: string) => string)(
			`/images/classes/${name}.png`,
		);
	}

	function renderItems(modelData: Element | ChildNode): TreeNode[] {
		const nodes: TreeNode[] = [];

		for (const item of modelData.childNodes) {
			if ((item as Element).tagName !== "Item") continue;

			const el = item as Element;
			const classType = el.getAttribute("class") ?? "";
			const icon = getIcon(classType);
			const name = getProperty(el, "Name").startsWith("Unable")
				? getProperty(el, "name")
				: getProperty(el, "Name");

			nodes.push({
				id: makeId(10),
				text: name,
				icon,
				children: renderItems(el),
				properties: getAllProperties(el),
			});
		}

		return nodes;
	}

	function renderPropertiesTable(
		properties: NodeListOf<Element>,
		propertiesViewEl: HTMLElement,
	): void {
		propertiesViewEl.innerHTML = "";

		const table = document.createElement("table");
		table.style.cssText =
			"width:100%; border-collapse:collapse; font-size:13px;";

		const thead = document.createElement("thead");
		thead.innerHTML = `
			<tr>
				<th style="text-align:left; padding:4px 6px; border-bottom:1px solid rgba(255,255,255,0.15); color:#aaa; font-weight:600; white-space:nowrap;">Property</th>
				<th style="text-align:left; padding:4px 6px; border-bottom:1px solid rgba(255,255,255,0.15); color:#aaa; font-weight:600;">Value</th>
			</tr>
		`;
		table.append(thead);

		const tbody = document.createElement("tbody");
		for (const prop of properties) {
			const tr = document.createElement("tr");

			const nameTd = document.createElement("td");
			nameTd.style.cssText =
				"padding:3px 6px; border-bottom:1px solid rgba(255,255,255,0.06); white-space:nowrap; color:#ccc; vertical-align:middle;";
			nameTd.textContent = prop.getAttribute("name") ?? "";

			const valTd = document.createElement("td");
			valTd.style.cssText =
				"padding:3px 6px; border-bottom:1px solid rgba(255,255,255,0.06); vertical-align:middle;";
			valTd.appendChild(getDisplayProperty(prop));

			tr.append(nameTd, valTd);
			tbody.append(tr);
		}
		table.append(tbody);
		propertiesViewEl.append(table);
	}

	function buildTreeDOM(
		nodes: TreeNode[],
		propertiesViewEl: HTMLElement,
	): HTMLUListElement {
		const ul = document.createElement("ul");
		ul.style.cssText = "list-style:none; padding-left:16px; margin:0;";

		for (const node of nodes) {
			const li = document.createElement("li");
			li.style.cssText = "margin:1px 0;";

			const row = document.createElement("div");
			row.style.cssText =
				"display:flex; align-items:center; gap:4px; padding:2px 4px; border-radius:3px; cursor:pointer; user-select:none;";

			const arrow = document.createElement("span");
			arrow.style.cssText =
				"display:inline-block; width:12px; font-size:10px; color:#888; flex-shrink:0;";
			arrow.textContent = node.children.length > 0 ? "▶" : " ";

			const img = document.createElement("img");
			img.src = node.icon;
			img.style.cssText = "width:16px; height:16px; flex-shrink:0;";

			const label = document.createElement("span");
			label.textContent = node.text;
			label.style.cssText = "font-size:13px; white-space:nowrap;";

			row.append(arrow, img, label);

			let childrenEl: HTMLUListElement | null = null;
			let expanded = false;

			if (node.children.length > 0) {
				childrenEl = buildTreeDOM(node.children, propertiesViewEl);
				childrenEl.style.display = "none";
				arrow.addEventListener("click", (e) => {
					e.stopPropagation();
					expanded = !expanded;
					arrow.textContent = expanded ? "▼" : "▶";
					childrenEl!.style.display = expanded ? "block" : "none";
				});
			}

			row.addEventListener("click", () => {
				const prev = document.querySelector<HTMLElement>(
					".kiln-tree-row-selected",
				);
				if (prev) {
					prev.classList.remove("kiln-tree-row-selected");
					prev.style.background = "";
				}
				row.classList.add("kiln-tree-row-selected");
				row.style.background = "rgba(255,255,255,0.1)";

				if (!node.properties) {
					propertiesViewEl.innerHTML = "";
					return;
				}
				renderPropertiesTable(node.properties, propertiesViewEl);
			});

			li.append(row);
			if (childrenEl) li.append(childrenEl);
			ul.append(li);
		}

		return ul;
	}

	async function openDialog(): Promise<void> {
		const modal = createModal("lg");

		modal.innerHTML = `
			<div class="d-flex justify-content-between align-items-center mb-2">
				<h5 class="mb-0" style="color:#fff;">Model Tree Viewer${kilnDisclosureBadgeHtml(showDisclosures)}</h5>
				<button class="btn btn-sm btn-secondary" id="kiln-model-tree-close">✕</button>
			</div>
			<div id="kiln-model-tree-status" class="text-muted mb-2" style="font-size:0.8rem;">Fetching...</div>
			<div class="d-flex gap-2" style="height:480px; overflow:hidden;">
				<div id="kiln-model-tree-view" style="flex:1; overflow-y:auto;"></div>
				<div id="kiln-model-tree-properties" style="flex:1; overflow-y:auto;"></div>
			</div>
		`;

		const statusEl = modal.querySelector<HTMLElement>(
			"#kiln-model-tree-status",
		)!;
		const treeViewEl = modal.querySelector<HTMLElement>(
			"#kiln-model-tree-view",
		)!;
		const propertiesViewEl = modal.querySelector<HTMLElement>(
			"#kiln-model-tree-properties",
		)!;

		modal
			.querySelector("#kiln-model-tree-close")!
			.addEventListener("click", () => modal.close());
		modal.showModal();

		let xmlDoc: Document;
		try {
			const text = await sendMessage("getModelFile", modelId);
			xmlDoc = new DOMParser().parseFromString(text, "text/xml");
		} catch {
			statusEl.textContent = "Invalid Model";
			return;
		}

		let nodes: TreeNode[];
		try {
			nodes = renderItems(xmlDoc.getElementsByTagName("model")[0]);
		} catch {
			statusEl.textContent = "Error while processing model tree.";
			return;
		}

		statusEl.textContent = "";
		treeViewEl.append(buildTreeDOM(nodes, propertiesViewEl));
	}

	const triggerButton = document.createElement("button");
	triggerButton.textContent = "Inspect Model Tree (Kiln)";
	triggerButton.classList.add(
		"btn",
		"btn-secondary",
		"btn-sm",
		"w-100",
		"mt-2",
	);
	triggerButton.addEventListener("click", openDialog);

	const thumbnailCard = document.querySelector(".card:has(.store-thumbnail)")!
		.parentElement!;
	thumbnailCard.append(triggerButton);
}
