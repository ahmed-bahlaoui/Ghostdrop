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
			`\nx ${err instanceof Error ? err.message : "Transfer not found or expired"}`,
		);
		return;
	}

	const displaySize = meta.originalSize ?? meta.size;
	const rows = [
		["Filename", meta.filename],
		["Type", meta.mimeType],
		["Size", formatSize(displaySize)],
		["Downloads", `${meta.downloadCount} / ${meta.maxDownloads}`],
		["Expires", formatExpiry(meta.expiresAt)],
	];
	if (meta.encryption.algorithm !== "none") {
		rows.push(["Encrypted", meta.encryption.algorithm]);
	}

	const labelWidth = 10;
	const valueWidth = Math.max(30, ...rows.map(([, value]) => value.length));
	const borderWidth = labelWidth + valueWidth + 3;
	console.log(`\n+${"-".repeat(borderWidth)}+`);
	for (const [label, value] of rows) {
		console.log(
			`| ${`${label}:`.padEnd(labelWidth)} ${value.padEnd(valueWidth)} |`,
		);
	}
	console.log(`+${"-".repeat(borderWidth)}+`);

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

		console.log(`\nDownloaded to ${outputPath}`);
	} catch (err) {
		console.log(
			`\nx ${err instanceof Error ? err.message : "Download failed"}`,
		);
		try {
			const { unlink } = await import("node:fs/promises");
			await unlink(tempPath);
		} catch {
			// Ignore cleanup errors
		}
	}
}
