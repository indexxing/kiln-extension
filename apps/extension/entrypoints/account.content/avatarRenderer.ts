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

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import type { AccessoryTransform, AvatarIFrameState } from "@/utils/types";

const BODY_GLB = "https://cdn.polytoria.com/static/Pauly-DS-yCzTt.glb";
const RETRO_HAT_Y_OFFSET = 1.5;

const MAT_TO_COLOR: Partial<Record<string, keyof AvatarIFrameState>> = {
	Head: "headColor",
	"Head.001": "headColor",
	Torso: "torsoColor",
	LeftArm: "leftArmColor",
	RightArm: "rightArmColor",
	LeftLeg: "leftLegColor",
	RightLeg: "rightLegColor",
	"Left Arm": "leftArmColor",
	"Right Arm": "rightArmColor",
	"Left Leg": "leftLegColor",
	"Right Leg": "rightLegColor",
};

const isUrl = (v: unknown): v is string =>
	typeof v === "string" &&
	(v.startsWith("data:") ||
		v.startsWith("blob:") ||
		/^[a-z][a-z\d+.-]*:\/\//i.test(v));

async function loadImage(url: string): Promise<HTMLImageElement> {
	if (url.startsWith("blob:") || url.startsWith("data:")) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
			img.src = url;
		});
	}

	const buf = await fetch(url).then((r) => r.arrayBuffer());
	const objUrl = URL.createObjectURL(new Blob([buf], { type: "image/png" }));
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(objUrl);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(objUrl);
			reject(new Error(`Failed to load image: ${url}`));
		};
		img.src = objUrl;
	});
}

function loadGLB(loader: GLTFLoader, url: string): Promise<any> {
	return fetch(url)
		.then((r) => r.arrayBuffer())
		.then(
			(buf) =>
				new Promise((resolve, reject) =>
					loader.parse(buf, "", resolve, reject),
				),
		);
}

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
	const tex = new THREE.CanvasTexture(canvas);
	tex.flipY = false;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.generateMipmaps = false;
	tex.minFilter = THREE.LinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.needsUpdate = true;
	return tex;
}

async function buildFaceTexture(
	headColor: string,
	faceUrl: string,
): Promise<THREE.CanvasTexture> {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 512;
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = headColor;
	ctx.fillRect(0, 0, 512, 512);
	try {
		ctx.drawImage(await loadImage(faceUrl), 0, 0, 512, 512);
	} catch {}
	return makeTexture(canvas);
}

function buildClothingTex(
	images: HTMLImageElement[],
	skinColor: string,
): THREE.CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 512;
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = skinColor;
	ctx.fillRect(0, 0, 512, 512);
	for (const img of images) ctx.drawImage(img, 0, 0, 512, 512);
	return makeTexture(canvas);
}

function patchGLBNodeNames(
	buffer: ArrayBuffer,
	nameMap: Map<string, string>,
): ArrayBuffer {
	const view = new DataView(buffer);
	if (view.getUint32(0, true) !== 0x46546c67) return buffer;
	const jsonChunkLen = view.getUint32(12, true);
	if (view.getUint32(16, true) !== 0x4e4f534a) return buffer;

	const json = JSON.parse(
		new TextDecoder().decode(new Uint8Array(buffer, 20, jsonChunkLen)),
	);

	let changed = false;
	for (const node of json.nodes ?? []) {
		const original = nameMap.get(node.name);
		if (original && original !== node.name) {
			node.name = original;
			changed = true;
		}
	}
	if (!changed) return buffer;

	let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
	const pad = (4 - (jsonBytes.length % 4)) % 4;
	if (pad) {
		const padded = new Uint8Array(jsonBytes.length + pad);
		padded.set(jsonBytes);
		padded.fill(0x20, jsonBytes.length);
		jsonBytes = padded;
	}

	const binStart = 20 + jsonChunkLen;
	const hasBin = binStart + 8 <= buffer.byteLength;
	const binLen = hasBin ? view.getUint32(binStart, true) : 0;
	const binType = hasBin ? view.getUint32(binStart + 4, true) : 0;
	const binData = hasBin ? new Uint8Array(buffer, binStart + 8, binLen) : null;

	const totalLen = 12 + 8 + jsonBytes.length + (hasBin ? 8 + binLen : 0);
	const out = new ArrayBuffer(totalLen);
	const outView = new DataView(out);
	const outBytes = new Uint8Array(out);

	outView.setUint32(0, 0x46546c67, true);
	outView.setUint32(4, 2, true);
	outView.setUint32(8, totalLen, true);
	outView.setUint32(12, jsonBytes.length, true);
	outView.setUint32(16, 0x4e4f534a, true);
	outBytes.set(jsonBytes, 20);

	if (hasBin && binData) {
		const binOffset = 20 + jsonBytes.length;
		outView.setUint32(binOffset, binLen, true);
		outView.setUint32(binOffset + 4, binType, true);
		outBytes.set(binData, binOffset + 8);
	}

	return out;
}

export class AvatarRenderer {
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private renderer: THREE.WebGLRenderer;
	private controls: OrbitControls;
	private loader = new GLTFLoader();
	private cachedBodyGltf: any | null = null;
	private avatarGroup: THREE.Group | null = null;
	private mixer: THREE.AnimationMixer | null = null;
	private clips: THREE.AnimationClip[] = [];
	private clock = new THREE.Clock();
	private hasLoaded = false;
	private animId: number | null = null;
	private ro: ResizeObserver;
	private loadGen = 0;
	private nameRestoreMap = new Map<string, string>();
	private accessoryObjects = new Map<string, THREE.Object3D>();
	private accessoryBase = new Map<
		string,
		{
			position: THREE.Vector3;
			quaternion: THREE.Quaternion;
			scale: THREE.Vector3;
		}
	>();
	private accessoryPivot = new Map<string, THREE.Vector3>();

	constructor(canvas: HTMLCanvasElement, options?: { transparent?: boolean }) {
		this.scene = new THREE.Scene();
		if (!options?.transparent) {
			this.scene.background = new THREE.Color(0x1a1a1a);
		}

		const w = canvas.clientWidth || 300;
		const h = canvas.clientHeight || 314;

		this.camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100);
		this.camera.position.set(0, 3, 6);

		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: options?.transparent,
		});
		if (options?.transparent) this.renderer.setClearColor(0x000000, 0);
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(w, h, false);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;

		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.target.set(0, 2.5, 0);
		this.controls.minDistance = 1.5;
		this.controls.maxDistance = 20;
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.controls.update();

		this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
		const sun = new THREE.DirectionalLight(0xffffff, 1.5);
		sun.position.set(5, 10, 7);
		this.scene.add(sun);
		const fill = new THREE.DirectionalLight(0xffffff, 0.5);
		fill.position.set(-5, 3, -5);
		this.scene.add(fill);

		this.ro = new ResizeObserver(() => this.resize());
		this.ro.observe(canvas);

		this.loader.register((parser: any) => ({
			name: "kiln-name-restore",
			afterRoot: () => {
				for (const node of (parser.json.nodes ?? []) as { name?: string }[]) {
					if (!node.name) continue;
					const sanitized = node.name
						.replace(/\s/g, "_")
						.replace(/[^\w-]/g, "");
					if (!this.nameRestoreMap.has(sanitized))
						this.nameRestoreMap.set(sanitized, node.name);
				}
				return null;
			},
		}));

		this.animate();
	}

	private animate(): void {
		this.animId = requestAnimationFrame(() => this.animate());
		this.mixer?.update(this.clock.getDelta());
		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	}

	private resize(): void {
		const canvas = this.renderer.domElement;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (w === 0 || h === 0) return;
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	private disposeObject(obj: THREE.Object3D): void {
		obj.traverse((node) => {
			if (!(node instanceof THREE.Mesh)) return;
			node.geometry.dispose();
			const mats = Array.isArray(node.material)
				? node.material
				: [node.material];
			for (const m of mats) {
				const stdMat = m as THREE.MeshStandardMaterial;
				stdMat.map?.dispose();
				stdMat.dispose();
			}
		});
	}

	private clearAvatar(): void {
		if (this.mixer) {
			this.mixer.stopAllAction();
			this.mixer = null;
		}
		if (!this.avatarGroup) return;
		this.disposeObject(this.avatarGroup);
		this.scene.remove(this.avatarGroup);
		this.avatarGroup = null;
		this.accessoryObjects.clear();
		this.accessoryBase.clear();
		this.accessoryPivot.clear();
	}

	private computeLocalPivot(obj: THREE.Object3D): THREE.Vector3 {
		obj.updateMatrixWorld(true);
		const objWorldInverse = new THREE.Matrix4().copy(obj.matrixWorld).invert();
		const box = new THREE.Box3();
		let found = false;

		obj.traverse((child) => {
			if (!(child instanceof THREE.Mesh) || !child.geometry) return;
			if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
			const geomBox = child.geometry.boundingBox!.clone();
			const childToObj = new THREE.Matrix4().multiplyMatrices(
				objWorldInverse,
				child.matrixWorld,
			);
			geomBox.applyMatrix4(childToObj);
			box.union(geomBox);
			found = true;
		});

		return found ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
	}

	async load(avatar: AvatarIFrameState): Promise<void> {
		const gen = ++this.loadGen;
		const isCurrent = () => gen === this.loadGen;

		const faceUrl = isUrl(avatar.face) ? avatar.face : undefined;
		const clothingUrls = (avatar.clothing ?? []).filter(isUrl) as string[];
		const bodyUrl = isUrl(avatar.body) ? avatar.body : undefined;
		const toolUrl = isUrl(avatar.tool) ? avatar.tool : undefined;
		const accUrls = (avatar.items as (string | number)[]).filter(
			isUrl,
		) as string[];

		if (!this.cachedBodyGltf) {
			this.cachedBodyGltf = await loadGLB(this.loader, BODY_GLB);
			if (!isCurrent()) return;
		}

		const clothingImages: HTMLImageElement[] = [];
		if (clothingUrls.length) {
			await Promise.all(
				clothingUrls.map(async (url) => {
					try {
						clothingImages.push(await loadImage(url));
					} catch {}
				}),
			);
			if (!isCurrent()) return;
		}

		const faceTexture = faceUrl
			? await buildFaceTexture(avatar.headColor, faceUrl)
			: null;
		if (!isCurrent()) {
			faceTexture?.dispose();
			return;
		}

		const partTexCache = new Map<string, THREE.CanvasTexture>();
		const getClothingTex = (skinColor: string): THREE.CanvasTexture => {
			const cached = partTexCache.get(skinColor);
			if (cached) return cached;
			const tex = buildClothingTex(clothingImages, skinColor);
			partTexCache.set(skinColor, tex);
			return tex;
		};

		const bodyScene = skeletonClone(this.cachedBodyGltf.scene);

		const animations: THREE.AnimationClip[] = (
			this.cachedBodyGltf.animations ?? []
		).map((clip: THREE.AnimationClip) =>
			THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip)),
		);
		const animName = toolUrl ? "ToolHold" : "Idle";
		let localClips: THREE.AnimationClip[] = animations;
		let localMixer: THREE.AnimationMixer | null = null;
		const clipToPlay =
			animations.find((a) => a.name === animName) ?? animations[0];
		if (clipToPlay) {
			localMixer = new THREE.AnimationMixer(bodyScene);
			const action = localMixer.clipAction(clipToPlay).reset().play();
			if (animName === "Idle") action.paused = true;
		}

		bodyScene.traverse((node: THREE.Object3D) => {
			if (!(node instanceof THREE.Mesh)) return;
			const mat = (node.material as THREE.MeshStandardMaterial).clone();
			node.material = mat;
			const matName: string = mat.name ?? "";
			const colorKey = MAT_TO_COLOR[matName];
			const skinColor = colorKey
				? ((avatar as Record<string, unknown>)[colorKey] as string)
				: null;

			if (faceTexture && /head/i.test(matName)) {
				mat.map = faceTexture;
				mat.color.set(0xffffff);
				mat.metalness = 0;
				mat.roughness = 1;
			} else if (
				clothingImages.length &&
				skinColor &&
				/torso|arm|leg/i.test(matName)
			) {
				mat.map = getClothingTex(skinColor);
				mat.color.set(0xffffff);
				mat.metalness = 0;
				mat.roughness = 1;
			} else if (colorKey && skinColor) {
				mat.color = new THREE.Color(skinColor);
				mat.metalness = 0;
				mat.roughness = 1;
				mat.map = null;
			}
			mat.needsUpdate = true;
		});

		const group = new THREE.Group();
		group.add(bodyScene);

		let activeBodyScene: THREE.Object3D = bodyScene;

		if (bodyUrl) {
			try {
				const bodyGltf = await loadGLB(this.loader, bodyUrl);
				if (!isCurrent()) {
					this.disposeObject(bodyGltf.scene);
					this.disposeObject(group);
					return;
				}
				const bodyGltfScene = bodyGltf.scene;

				bodyGltfScene.traverse((node: THREE.Object3D) => {
					if (!(node instanceof THREE.Mesh)) return;
					const mat = (node.material as THREE.MeshStandardMaterial).clone();
					node.material = mat;
					const colorKey =
						MAT_TO_COLOR[(mat.name as string) ?? ""] ?? MAT_TO_COLOR[node.name];
					if (!colorKey) return;
					const skinColor = (avatar as Record<string, unknown>)[
						colorKey
					] as string;
					mat.metalness = 0;
					mat.roughness = 1;
					if (colorKey === "headColor") {
						if (faceTexture) {
							mat.map = faceTexture;
							mat.color.set(0xffffff);
						} else {
							mat.color = new THREE.Color(skinColor);
							mat.map = null;
						}
					} else if (clothingImages.length) {
						mat.map = getClothingTex(skinColor);
						mat.color.set(0xffffff);
					} else {
						mat.color = new THREE.Color(skinColor);
						mat.map = null;
					}
					mat.needsUpdate = true;
				});

				localMixer?.stopAllAction();
				const rawBodyAnims: THREE.AnimationClip[] = bodyGltf.animations?.length
					? bodyGltf.animations
					: (this.cachedBodyGltf.animations ?? []);
				const bodyAnims = rawBodyAnims.map((clip: THREE.AnimationClip) =>
					THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip)),
				);
				localClips = bodyAnims;
				const bodyClip =
					bodyAnims.find((a: THREE.AnimationClip) => a.name === animName) ??
					bodyAnims[0];
				if (bodyClip) {
					localMixer = new THREE.AnimationMixer(bodyGltfScene);
					const action = localMixer.clipAction(bodyClip).reset().play();
					if (animName === "Idle") action.paused = true;
				}

				group.add(bodyGltfScene);
				activeBodyScene = bodyGltfScene;
				bodyScene.visible = false;
			} catch {}
		}

		const headBone = activeBodyScene.getObjectByName("Head") ?? null;

		let rightHandBone: THREE.Object3D | null = null;
		activeBodyScene.traverse((obj) => {
			if (rightHandBone) return;
			const n = obj.name.toLowerCase();
			if ((n.includes("right") || n.endsWith(".r")) && n.includes("hand"))
				rightHandBone = obj;
		});

		const localAccessoryObjects = new Map<string, THREE.Object3D>();
		const localAccessoryBase = new Map<
			string,
			{
				position: THREE.Vector3;
				quaternion: THREE.Quaternion;
				scale: THREE.Vector3;
			}
		>();
		const localAccessoryPivot = new Map<string, THREE.Vector3>();

		await Promise.all(
			[...accUrls, ...(toolUrl ? [toolUrl] : [])].map(async (url) => {
				try {
					const gltf = await loadGLB(this.loader, url);
					if (!isCurrent()) {
						this.disposeObject(gltf.scene);
						return;
					}
					if (url.includes("poly-upd-archival.pages.dev"))
						gltf.scene.position.y += RETRO_HAT_Y_OFFSET;
					if (url === toolUrl) {
						(rightHandBone ?? activeBodyScene).attach(gltf.scene);
					} else {
						(headBone ?? activeBodyScene).attach(gltf.scene);
						localAccessoryObjects.set(url, gltf.scene);
						localAccessoryBase.set(url, {
							position: gltf.scene.position.clone(),
							quaternion: gltf.scene.quaternion.clone(),
							scale: gltf.scene.scale.clone(),
						});
						localAccessoryPivot.set(url, this.computeLocalPivot(gltf.scene));
					}
				} catch {}
			}),
		);

		if (!isCurrent()) {
			this.disposeObject(group);
			return;
		}

		this.clearAvatar();
		this.mixer = localMixer;
		this.clips = localClips;
		this.accessoryObjects = localAccessoryObjects;
		this.accessoryBase = localAccessoryBase;
		this.accessoryPivot = localAccessoryPivot;
		this.avatarGroup = group;
		this.scene.add(group);

		for (const [url, transform] of Object.entries(
			avatar.itemTransforms ?? {},
		)) {
			if (this.accessoryObjects.has(url))
				this.setAccessoryTransform(url, transform);
		}

		if (!this.hasLoaded) {
			this.hasLoaded = true;
			const box = new THREE.Box3().setFromObject(group);
			const center = box.getCenter(new THREE.Vector3());
			const size = box.getSize(new THREE.Vector3());
			const dist = Math.max(size.x, size.y, size.z) * 1.8;
			this.controls.target.copy(center);
			this.camera.position.set(
				center.x,
				center.y + size.y * 0.05,
				center.z + dist,
			);
			this.controls.update();
		}
	}

	async exportGLB(includeAnimations = true): Promise<ArrayBuffer> {
		if (!this.avatarGroup) throw new Error("No avatar loaded");
		const { GLTFExporter } = await import(
			"three/addons/exporters/GLTFExporter.js"
		);
		const exporter = new GLTFExporter();
		const raw = await new Promise<ArrayBuffer>((resolve, reject) => {
			exporter.parse(
				this.avatarGroup!,
				(result) => resolve(result as ArrayBuffer),
				reject,
				{ binary: true, animations: includeAnimations ? this.clips : [] },
			);
		});
		return patchGLBNodeNames(raw, this.nameRestoreMap);
	}

	setAccessoryTransform(url: string, transform: AccessoryTransform): void {
		const obj = this.accessoryObjects.get(url);
		const base = this.accessoryBase.get(url);
		const pivot = this.accessoryPivot.get(url);
		if (!obj || !base || !pivot) return;

		const offset = new THREE.Quaternion().setFromEuler(
			new THREE.Euler(
				THREE.MathUtils.degToRad(transform.rotation[0]),
				THREE.MathUtils.degToRad(transform.rotation[1]),
				THREE.MathUtils.degToRad(transform.rotation[2]),
			),
		);
		const finalQuaternion = base.quaternion.clone().multiply(offset);
		const finalScale = base.scale.clone().multiplyScalar(transform.scale);

		const pivotAtBase = pivot
			.clone()
			.multiply(base.scale)
			.applyQuaternion(base.quaternion);
		const pivotAtFinal = pivot
			.clone()
			.multiply(finalScale)
			.applyQuaternion(finalQuaternion);

		obj.quaternion.copy(finalQuaternion);
		obj.scale.copy(finalScale);
		obj.position
			.copy(base.position)
			.add(new THREE.Vector3(...transform.position))
			.add(pivotAtBase)
			.sub(pivotAtFinal);
	}

	playAnimation(name: string): void {
		if (!this.mixer) return;
		this.mixer.stopAllAction();
		const clip = this.clips.find((c) => c.name === name) ?? this.clips[0];
		if (!clip) return;
		const action = this.mixer.clipAction(clip).reset().play();
		if (name === "Idle") action.paused = true;
	}

	dispose(): void {
		this.ro.disconnect();
		if (this.animId !== null) cancelAnimationFrame(this.animId);
		this.clearAvatar();
		this.renderer.dispose();
	}
}
