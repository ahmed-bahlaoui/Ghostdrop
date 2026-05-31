const TRANSFER_CODE_LENGTH = 6;

export function stripTransferCode(value: string): string {
	return value
		.replace(/[^a-z0-9]/gi, "")
		.slice(0, TRANSFER_CODE_LENGTH)
		.toUpperCase();
}

export function formatTransferCode(value: string): string {
	const code = stripTransferCode(value);
	if (code.length <= 3) return code;
	return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function hasCompleteReceiveCode(value: string): boolean {
	return stripTransferCode(value).length === TRANSFER_CODE_LENGTH;
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

export function buildEncryptedShareLink(
	webUrl: string,
	code: string,
	key: string,
): string {
	const cleanBase = webUrl.replace(/\/+$/, "");
	return `${cleanBase}/#transfer=${encodeURIComponent(code)}&key=${encodeURIComponent(key)}`;
}

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

export const EXPIRY_OPTIONS = [
	{ label: "1 Hour", value: 60 },
	{ label: "1 Day", value: 1440 },
	{ label: "3 Days", value: 4320 },
	{ label: "7 Days", value: 10080 },
];

export const DOWNLOAD_OPTIONS = [
	{ label: "1", value: 1 },
	{ label: "3", value: 3 },
	{ label: "5", value: 5 },
	{ label: "10", value: 10 },
];
