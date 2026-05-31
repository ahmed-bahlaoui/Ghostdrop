#!/usr/bin/env node
import { Command } from "commander";
import { send } from "./commands/send.js";
import { receive } from "./commands/receive.js";
import { menu } from "./commands/menu.js";

const program = new Command();

program
	.name("ghostdrop")
	.description("Anonymous, temporary, encrypted file sharing from your terminal")
	.version("1.0.0");

program
	.command("send")
	.description("Send a file")
	.argument("[file]", "Path to the file to send")
	.option("-e, --encrypt", "Enable end-to-end encryption")
	.option("--expiry <minutes>", "Expiry in minutes (60, 1440, 4320, 10080)", parseInt)
	.option("--max-downloads <number>", "Maximum number of downloads", parseInt)
	.action(async (file: string | undefined, options: Record<string, unknown>) => {
		await send({
			filePath: file,
			encrypt: options.encrypt === true,
			expiresInMinutes:
				typeof options.expiry === "number" ? options.expiry : undefined,
			maxDownloads:
				typeof options.maxDownloads === "number"
					? options.maxDownloads
					: undefined,
		});
	});

program
	.command("receive")
	.description("Receive a file")
	.argument("[code]", "Transfer code")
	.option("-k, --key <key>", "Decryption key (for E2EE transfers)")
	.option("-o, --output <path>", "Output file path")
	.action(async (code: string | undefined, options: Record<string, unknown>) => {
		await receive({
			code,
			key: typeof options.key === "string" ? options.key : undefined,
			output:
				typeof options.output === "string" ? options.output : undefined,
		});
	});

const args = process.argv.slice(2);
if (args.length === 0) {
	await menu();
} else {
	await program.parseAsync();
}
