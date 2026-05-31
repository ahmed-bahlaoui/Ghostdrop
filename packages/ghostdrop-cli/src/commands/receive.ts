import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { input, confirm } from "@inquirer/prompts";
import { fetchMetadata, downloadFile } from "../lib/api.js";
import { decryptBuffer } from "../lib/crypto.js";
import {
	formatTransferCode,
	formatSize,
	formatExpiry,
	hasCompleteReceiveCode,
} from "../lib/format.js";
import type { TransferMetadata } from "../lib/format.js";

export interface ReceiveOptions {
	code: string;
	key?: string;
	output?: string;
}

export async function receive(
	options: Partial<ReceiveOptions> = {},
): Promise<void> {
	let code = options.code;
	if (!code) {
		code = await input({
			message: "Transfer code:",
			validate: (value: string) => {
				if (!value.trim()) return "Transfer code is required";
				return true;
			},
			transformer: (value: string) => formatTransferCode(value),
		});
	}
	const formattedCode = formatTransferCode(code);

	if (!hasCompleteReceiveCode(code)) {
		console.log("Invalid transfer code. Expected 6 characters.");
		return;
	}

	console.log(`\nPeeking ${formattedCode}...`);
	let meta: TransferMetadata;
	try {
		meta = await fetchMetadata(formattedCode);
	} catch (err) {
		console.log(
			`\n✗ ${err instanceof Error ? err.message : "Transfer not found or expired"}`,
		);
		return;
	}

	const displaySize = meta.originalSize ?? meta.size;
	console.log("\n┌─────────────────────────────────────────┐");
	console.log(`│ Filename:    ${meta.filename.padEnd(30)}│`);
	console.log(`│ Type:        ${meta.mimeType.padEnd(30)}│`);
	console.log(`│ Size:        ${formatSize(displaySize).padEnd(30)}│`);
	console.log(
		`│ Downloads:   ${`${meta.downloadCount} / ${meta.maxDownloads}`.padEnd(30)}│`,
	);
	console.log(
		`│ Expires:     ${formatExpiry(meta.expiresAt).padEnd(30)}│`,
	);
	if (meta.encryption.algorithm !== "none") {
		console.log(
			`│ Encrypted:   ${meta.encryption.algorithm.padEnd(30)}│`,
		);
	}
	console.log("└─────────────────────────────────────────┘");

	let key = options.key;
	if (meta.encryption.algorithm !== "none" && !key) {
		key = await input({
			message: "Decryption key:",
			validate: (value: string) => {
				if (!value.trim())
					return "Key is required for encrypted transfers";
				return true;
			},
		});
	}

	let shouldDownload: boolean;
	if (options.output !== undefined) {
		shouldDownload = true;
	} else {
		shouldDownload = await confirm({
			message: "Download now?",
			default: true,
		});
	}

	if (!shouldDownload) {
		console.log("Download skipped.");
		return;
	}

	let outputPath = options.output;
	if (!outputPath) {
		const defaultPath = resolve(process.cwd(), meta.filename);
		outputPath = await input({
			message: "Save to:",
			default: defaultPath,
		});
	}

	console.log(`\nDownloading ${meta.filename}...`);
	const tempPath = `${outputPath}.ghostdrop-tmp`;
	try {
		await downloadFile(formattedCode, tempPath);

		if (meta.encryption.algorithm !== "none" && key) {
			const { readFile, unlink } = await import("node:fs/promises");
			const encrypted = await readFile(tempPath);
			console.log("Decrypting...");
			const decrypted = decryptBuffer(
				encrypted,
				key,
				meta.encryption.iv!,
			);
			await writeFile(outputPath, decrypted);
			await unlink(tempPath);
		} else {
			const { rename } = await import("node:fs/promises");
			await rename(tempPath, outputPath);
		}

		console.log(`\n✓ Downloaded to ${outputPath}`);
	} catch (err) {
		console.log(
			`\n✗ ${err instanceof Error ? err.message : "Download failed"}`,
		);
		try {
			const { unlink } = await import("node:fs/promises");
			await unlink(tempPath);
		} catch {
			// Ignore cleanup errors
		}
	}
}
