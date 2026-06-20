import { zipSync, type Zippable } from "fflate";

const ZIP_MIME_TYPE = "application/zip";
const ZIP_STORE_LEVEL = 0;

export class ZipArchiveError extends Error {
	constructor() {
		super("Could not create ZIP archive. Try fewer files or a smaller bundle.");
		this.name = "ZipArchiveError";
	}
}

function getTimestamp(): string {
	const now = new Date();
	const pad = (value: number) => value.toString().padStart(2, "0");

	return [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		"-",
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
	].join("");
}

function getArchiveName(): string {
	return `ghostdrop-transfer-${getTimestamp()}.zip`;
}

function splitExtension(filename: string): { name: string; extension: string } {
	const extensionIndex = filename.lastIndexOf(".");
	if (extensionIndex <= 0) return { name: filename, extension: "" };

	return {
		name: filename.slice(0, extensionIndex),
		extension: filename.slice(extensionIndex),
	};
}

function sanitizeFilename(filename: string, fallbackIndex: number): string {
	const basename = filename.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
	const sanitized = basename
		.split("")
		.filter((character) => {
			const codePoint = character.charCodeAt(0);
			return codePoint > 31 && codePoint !== 127;
		})
		.join("")
		.replace(/[<>:"|?*]/g, "_")
		.trim();

	return sanitized || `file-${fallbackIndex + 1}`;
}

function dedupeFilename(filename: string, seen: Map<string, number>): string {
	const normalized = filename.toLowerCase();
	const count = seen.get(normalized) ?? 0;
	seen.set(normalized, count + 1);

	if (count === 0) return filename;

	const { name, extension } = splitExtension(filename);
	return `${name} (${count})${extension}`;
}

async function fileToBytes(file: File): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await file.arrayBuffer());
}

export function getTotalFileSize(files: File[]): number {
	return files.reduce((total, file) => total + file.size, 0);
}

export async function createZipArchive(files: File[]): Promise<File> {
	const seen = new Map<string, number>();
	const archiveEntries: Zippable = {};

	try {
		await Promise.all(
			files.map(async (file, index) => {
				const filename = dedupeFilename(
					sanitizeFilename(file.name, index),
					seen,
				);
				archiveEntries[filename] = await fileToBytes(file);
			}),
		);

		const archiveBytes = zipSync(archiveEntries, { level: ZIP_STORE_LEVEL });

		return new File([archiveBytes], getArchiveName(), { type: ZIP_MIME_TYPE });
	} catch (error) {
		console.error("ZIP archive creation failed:", error);
		throw new ZipArchiveError();
	}
}
