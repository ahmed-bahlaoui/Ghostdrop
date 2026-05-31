import type { TransferMetadata } from "./state.svelte.js";
import { state, transferCodeLength } from "./state.svelte.js";

export function stripTransferCode(value: string): string {
	return value
		.replace(/[^a-z0-9]/gi, "")
		.slice(0, transferCodeLength)
		.toUpperCase();
}

export function formatTransferCode(value: string): string {
	const code = stripTransferCode(value);
	if (code.length <= 3) return code;
	return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function normalizeReceiveCode(): string {
	return formatTransferCode(state.receiveCode);
}

export function hasCompleteReceiveCode(): boolean {
	return stripTransferCode(state.receiveCode).length === transferCodeLength;
}

export function receiveCodeCharacters(): string[] {
	const code = stripTransferCode(state.receiveCode);
	return Array.from(
		{ length: transferCodeLength },
		(_, index) => code[index] ?? "",
	);
}

export function isTextNote(meta: { mimeType: string } | null): boolean {
	return meta?.mimeType.toLowerCase().startsWith("text/plain") ?? false;
}

export function isImage(meta: { mimeType: string } | null): boolean {
	return meta?.mimeType.toLowerCase().startsWith("image/") ?? false;
}

export function formatSize(bytes: number): string {
	if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
	if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
	return `${bytes} B`;
}

export function formatExpiry(iso: string): string {
	const diff = new Date(iso).getTime() - Date.now();
	if (diff <= 0) return "Expired";
	const mins = Math.round(diff / 60_000);
	if (mins < 60) return `in ${mins} min`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `in ${hours}h`;
	const days = Math.round(hours / 24);
	return `in ${days} day${days > 1 ? "s" : ""}`;
}

export function normalizeTransferMetadata(meta: unknown): TransferMetadata {
	const value = meta as Partial<TransferMetadata>;
	const encryption = value.encryption ?? {
		algorithm: "none" as const,
		iv: null,
	};

	return {
		filename: String(value.filename ?? ""),
		size: Number(value.size ?? 0),
		originalSize:
			value.originalSize === null || value.originalSize === undefined
				? null
				: Number(value.originalSize),
		mimeType: String(value.mimeType ?? "application/octet-stream"),
		downloadCount: Number(value.downloadCount ?? 0),
		maxDownloads: Number(value.maxDownloads ?? 1),
		expiresAt: String(value.expiresAt ?? ""),
		encryption: {
			algorithm:
				encryption.algorithm === "AES-GCM-256" ? "AES-GCM-256" : "none",
			iv: encryption.iv ?? null,
		},
	};
}

export function buildEncryptedShareLink(code: string, key: string): string {
	const baseUrl =
		typeof window === "undefined"
			? ""
			: `${window.location.origin}${window.location.pathname}`;
	const params = new URLSearchParams({ transfer: code, key });
	return `${baseUrl}#${params.toString()}`;
}
