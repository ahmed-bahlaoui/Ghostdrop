import { formatTransferCode } from "./format.js";
import { SvelteURLSearchParams } from "svelte/reactivity";

export interface TransferMetadata {
	filename: string;
	size: number;
	originalSize: number | null;
	mimeType: string;
	downloadCount: number;
	maxDownloads: number;
	expiresAt: string;
	encryption: {
		algorithm: "none" | "AES-GCM-256";
		iv: string | null;
	};
}

export interface SharedFileRecord {
	id: "latest";
	file?: File;
	files?: File[];
	ignoredFileCount: number;
	receivedAt: number;
}

export interface StatusState {
	type: "idle" | "loading" | "success" | "error";
	message: string;
	code?: string;
}

export const expiryOptions = [
	{ label: "1 Hour", value: 60 },
	{ label: "1 Day", value: 1440 },
	{ label: "3 Days", value: 4320 },
	{ label: "7 Days", value: 10080 },
];

export const downloadOptions = [
	{ label: "1", value: 1 },
	{ label: "3", value: 3 },
	{ label: "5", value: 5 },
	{ label: "10", value: 10 },
];

export const transferCodeLength = 6;

export const headers = {
	"Bypass-Tunnel-Reminder": "true",
};

export let parsedShareFragment = false;
export let loadedShareTargetFile = false;

export const state = $state({
	selectedFile: null as File | null,
	selectedFiles: [] as File[],
	receiveCode: "",
	receiveKey: "",
	peekedCode: "",
	shareLink: "",
	shareKey: "",
	copiedShareLink: false,
	copiedShareKey: false,
	endToEndEncryption: false,
	expiresInMinutes: 60,
	maxDownloads: 1,
	view: "main" as "main" | "peek" | "note" | "image",
	noteContent: "",
	noteCopied: false,
	imagePreviewUrl: "",
	fileMeta: null as TransferMetadata | null,
	status: { type: "idle", message: "" } as StatusState,
	fileInput: undefined as HTMLInputElement | undefined,
});

export function revokeImagePreviewUrl() {
	if (state.imagePreviewUrl) {
		URL.revokeObjectURL(state.imagePreviewUrl);
		state.imagePreviewUrl = "";
	}
}

export function selectFile(file: File) {
	selectFiles([file]);
}

export function selectFiles(files: File[]) {
	const selectedFiles = files.filter((file) => file.size > 0);
	if (selectedFiles.length === 0) return;

	state.selectedFiles = selectedFiles;
	state.selectedFile = selectedFiles[0] ?? null;
	state.noteContent = "";
	state.shareLink = "";
	state.shareKey = "";
	state.copiedShareLink = false;
	state.copiedShareKey = false;
	revokeImagePreviewUrl();
	state.status = { type: "idle", message: "" };
	if (state.fileInput) state.fileInput.value = "";
}

export function resetReceiveState() {
	state.receiveCode = "";
	state.receiveKey = "";
	state.peekedCode = "";
	state.fileMeta = null;
	state.noteContent = "";
	state.noteCopied = false;
	revokeImagePreviewUrl();
	state.view = "main";
}

export function goBack() {
	resetReceiveState();
	state.status = { type: "idle", message: "" };
}

export function goBackToPeek() {
	state.view = "peek";
	state.noteCopied = false;
	revokeImagePreviewUrl();
	state.status = { type: "idle", message: "" };
}

export function initShareFragment() {
	if (parsedShareFragment || typeof window === "undefined") return;
	parsedShareFragment = true;
	const fragment = window.location.hash.replace(/^#\/?/, "");
	const params = new SvelteURLSearchParams(fragment);
	const transfer = params.get("transfer");
	const key = params.get("key");

	if (transfer) state.receiveCode = formatTransferCode(transfer);
	if (key) state.receiveKey = key;
}

export function initAndroidShareTarget(callback: () => Promise<void>) {
	if (loadedShareTargetFile || typeof window === "undefined") return false;
	const params = new SvelteURLSearchParams(window.location.search);
	if (!params.has("shared")) return false;
	loadedShareTargetFile = true;
	callback();
	return true;
}
