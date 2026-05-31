import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { input, select, confirm } from "@inquirer/prompts";
import {
	handshakeTransfer,
	uploadFile,
	getFileMimeType,
	getFileSize,
} from "../lib/api.js";
import { encryptFile } from "../lib/crypto.js";
import { getWebUrl } from "../lib/config.js";
import {
	formatTransferCode,
	formatSize,
	EXPIRY_OPTIONS,
	DOWNLOAD_OPTIONS,
	buildEncryptedShareLink,
} from "../lib/format.js";
import { printQrCode } from "../lib/qr.js";

export interface SendOptions {
	filePath: string;
	expiresInMinutes: number;
	maxDownloads: number;
	encrypt: boolean;
}

export async function send(options: Partial<SendOptions> = {}): Promise<void> {
	// --- Step 1: Gather inputs ---

	let filePath = options.filePath;
	if (!filePath) {
		filePath = await input({
			message: "File path:",
			validate: (value: string) => {
				if (!value.trim()) return "File path is required";
				const resolved = resolve(value.trim());
				if (!existsSync(resolved)) return `File not found: ${resolved}`;
				return true;
			},
		});
	}
	filePath = resolve(filePath);

	let expiresInMinutes = options.expiresInMinutes;
	if (!expiresInMinutes) {
		expiresInMinutes = await select({
			message: "Expires in:",
			choices: EXPIRY_OPTIONS.map((o) => ({
				name: o.label,
				value: o.value,
			})),
		});
	}

	let maxDownloads = options.maxDownloads;
	if (!maxDownloads) {
		maxDownloads = await select({
			message: "Max downloads:",
			choices: DOWNLOAD_OPTIONS.map((o) => ({
				name: o.label,
				value: o.value,
			})),
		});
	}

	let encrypt = options.encrypt;
	if (encrypt === undefined) {
		encrypt = await confirm({
			message: "Enable end-to-end encryption?",
			default: false,
		});
	}

	// --- Step 2: Encrypt if requested ---

	let uploadBuffer: Buffer;
	let originalSize: number | undefined;
	let encryptionAlgorithm: "none" | "AES-GCM-256" = "none";
	let encryptionIv: string | null = null;
	let keyBase64Url: string | null = null;

	const filename = filePath.split(/[/\\]/).pop() ?? "file";
	const mimeType = getFileMimeType(filePath);
	const fileSize = getFileSize(filePath);

	if (encrypt) {
		console.log(`\nEncrypting ${filename} (${formatSize(fileSize)})...`);
		const result = await encryptFile(filePath);
		uploadBuffer = result.encrypted;
		originalSize = result.originalSize;
		encryptionAlgorithm = result.algorithm;
		encryptionIv = result.ivBase64Url;
		keyBase64Url = result.keyBase64Url;
		console.log(`Encrypted: ${formatSize(fileSize)} → ${formatSize(result.encryptedSize)}`);
	} else {
		const { readFile } = await import("node:fs/promises");
		uploadBuffer = await readFile(filePath);
	}

	// --- Step 3: Handshake ---

	console.log(`\nUploading ${filename} (${formatSize(uploadBuffer.length)})...`);
	const { code, expiresAt } = await handshakeTransfer({
		filename,
		size: uploadBuffer.length,
		originalSize,
		mimeType,
		encryptionAlgorithm,
		encryptionIv,
		maxDownloads,
		expiresInMinutes,
	});

	// --- Step 4: Upload ---

	await uploadFile(code, filePath, uploadBuffer);

	// --- Step 5: Output result ---

	const formattedCode = formatTransferCode(code);
	console.log(`\n✓ Uploaded!`);
	console.log(`  Transfer code: ${formattedCode}`);

	if (encrypt && keyBase64Url) {
		const webUrl = getWebUrl();
		const shareLink = buildEncryptedShareLink(webUrl, code, keyBase64Url);
		console.log(`\n  Share link (E2EE):`);
		console.log(`  ${shareLink}`);
		console.log(`\n  Scan the QR code below or share the link:`);
		printQrCode(shareLink);
	}
}
