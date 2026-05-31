import { readFile } from "node:fs/promises";
import { statSync, createWriteStream } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";
import mime from "mime-types";
import { getApiUrl } from "./config.js";
import type { TransferMetadata } from "./format.js";
import { normalizeTransferMetadata } from "./format.js";

function apiUrl(): string {
	return getApiUrl();
}

function headers(): Record<string, string> {
	return { "Bypass-Tunnel-Reminder": "true" };
}

export interface UploadOptions {
	filePath: string;
	expiresInMinutes: number;
	maxDownloads: number;
	encrypt: boolean;
}

export interface UploadResult {
	code: string;
	expiresAt: string;
	shareLink: string | null;
	shareKey: string | null;
}

export async function handshakeTransfer(params: {
	filename: string;
	size: number;
	originalSize?: number;
	mimeType: string;
	encryptionAlgorithm: "none" | "AES-GCM-256";
	encryptionIv: string | null;
	maxDownloads: number;
	expiresInMinutes: number;
}): Promise<{ code: string; objectKey: string; expiresAt: string }> {
	const res = await fetch(`${apiUrl()}/transfers`, {
		method: "POST",
		headers: { ...headers(), "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});

	if (!res.ok) {
		const text = await res.text();
		let errorMessage = "Handshake failed";
		try {
			const err = JSON.parse(text);
			errorMessage = err.error || errorMessage;
		} catch {
			errorMessage = `Server Error: ${res.status} ${res.statusText}`;
		}
		throw new Error(errorMessage);
	}

	return res.json() as Promise<{
		code: string;
		objectKey: string;
		expiresAt: string;
	}>;
}

export async function uploadFile(
	code: string,
	filePath: string,
	buffer?: Buffer,
): Promise<{ message: string; code: string }> {
	const body = buffer ?? (await readFile(filePath));
	const filename = basename(filePath);
	const mimeType = mime.lookup(filePath) || "application/octet-stream";
	const blob = new Blob([new Uint8Array(body)], { type: mimeType });

	const formData = new FormData();
	formData.append("file", blob, filename);

	const res = await fetch(`${apiUrl()}/transfers/${code}/upload`, {
		method: "POST",
		headers: headers(),
		body: formData,
	});

	if (!res.ok) {
		const text = await res.text();
		let errorMessage = "Upload failed";
		try {
			const err = JSON.parse(text);
			errorMessage = err.error || errorMessage;
		} catch {
			errorMessage = `Server Error: ${res.status} ${res.statusText}`;
		}
		throw new Error(errorMessage);
	}

	return res.json() as Promise<{ message: string; code: string }>;
}

export async function fetchMetadata(code: string): Promise<TransferMetadata> {
	const res = await fetch(`${apiUrl()}/transfers/${code}`, {
		headers: headers(),
	});

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new Error(err?.error || "Transfer not found or expired");
	}

	const meta = await res.json();
	return normalizeTransferMetadata(meta);
}

export async function downloadFile(
	code: string,
	outputPath: string,
): Promise<void> {
	const res = await fetch(`${apiUrl()}/transfers/${code}/download`, {
		headers: headers(),
	});

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new Error(err?.error || "Download failed");
	}

	const dest = createWriteStream(outputPath);
	if (res.body) {
		await new Promise<void>((resolve, reject) => {
			const reader = Readable.fromWeb(
				res.body as import("node:stream/web").ReadableStream,
			);
			reader.pipe(dest);
			dest.on("finish", resolve);
			dest.on("error", reject);
			reader.on("error", reject);
		});
	} else {
		throw new Error("Response has no body");
	}
}

export function getFileMimeType(filePath: string): string {
	return mime.lookup(filePath) || "application/octet-stream";
}

export function getFileSize(filePath: string): number {
	return statSync(filePath).size;
}
