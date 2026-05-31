import { normalizeTransferMetadata } from "./format.js";
import type { TransferMetadata } from "./state.svelte.js";

// --- CONFIGURATION ---
const API_OVERRIDE = import.meta.env.VITE_API_URL ?? "";

function getApiUrl(): string {
	if (typeof window === "undefined") return "http://localhost:3100";

	const params = new URLSearchParams(window.location.search);
	const paramApi = params.get("api");
	if (paramApi) return paramApi;
	if (API_OVERRIDE) return API_OVERRIDE;

	return "/api";
}

export const API_URL = getApiUrl();

export const showApiConnectionBadge =
	import.meta.env.DEV || import.meta.env.VITE_SHOW_API_BADGE === "true";

const headers = {
	"Bypass-Tunnel-Reminder": "true",
};

export async function handshakeTransfer(params: {
	filename: string;
	size: number;
	originalSize?: number;
	mimeType: string;
	encryptionAlgorithm?: string;
	encryptionIv?: string | null;
	maxDownloads: number;
	expiresInMinutes: number;
}) {
	const res = await fetch(`${API_URL}/transfers`, {
		method: "POST",
		headers: { ...headers, "Content-Type": "application/json" },
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

export async function uploadFile(code: string, file: File) {
	const formData = new FormData();
	formData.append("file", file);

	const res = await fetch(`${API_URL}/transfers/${code}/upload`, {
		method: "POST",
		headers,
		body: formData,
	});

	if (!res.ok) {
		throw new Error("Streaming upload failed");
	}

	return res.json() as Promise<{ message: string; code: string }>;
}

export async function fetchMetadata(code: string): Promise<TransferMetadata> {
	const res = await fetch(`${API_URL}/transfers/${code}`, { headers });

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new Error(err?.error || "File metadata could not be loaded");
	}

	const meta = await res.json();
	return normalizeTransferMetadata(meta);
}

export async function downloadFileBlob(code: string): Promise<Blob> {
	const res = await fetch(`${API_URL}/transfers/${code}/download`, { headers });

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new Error(err?.error || "Download failed");
	}

	return res.blob();
}

export async function previewFileBlob(code: string): Promise<Blob> {
	const res = await fetch(`${API_URL}/transfers/${code}/preview`, { headers });

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new Error(err?.error || "Preview failed");
	}

	return res.blob();
}
