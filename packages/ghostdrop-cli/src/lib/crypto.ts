import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

const AES_GCM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const AUTH_TAG_LENGTH = 16;

function toBase64Url(buf: Buffer): string {
	return buf.toString("base64url");
}

function fromBase64Url(str: string): Buffer {
	return Buffer.from(str, "base64url");
}

export interface EncryptedResult {
	encrypted: Buffer;
	keyBase64Url: string;
	ivBase64Url: string;
	algorithm: "AES-GCM-256";
	originalSize: number;
	encryptedSize: number;
}

export function generateKey(): Buffer {
	return randomBytes(KEY_LENGTH_BYTES);
}

export function encryptBuffer(plaintext: Buffer, key?: Buffer): EncryptedResult {
	const key_ = key ?? generateKey();
	const iv = randomBytes(IV_LENGTH_BYTES);

	const cipher = createCipheriv(AES_GCM, key_, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const authTag = cipher.getAuthTag();

	const encrypted = Buffer.concat([ciphertext, authTag]);

	return {
		encrypted,
		keyBase64Url: toBase64Url(key_),
		ivBase64Url: toBase64Url(iv),
		algorithm: "AES-GCM-256",
		originalSize: plaintext.length,
		encryptedSize: encrypted.length,
	};
}

export async function encryptFile(
	filePath: string,
): Promise<EncryptedResult & { filename: string }> {
	const plaintext = await readFile(filePath);
	const key = generateKey();
	const iv = randomBytes(IV_LENGTH_BYTES);

	const cipher = createCipheriv(AES_GCM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const authTag = cipher.getAuthTag();

	const encrypted = Buffer.concat([ciphertext, authTag]);

	return {
		encrypted,
		keyBase64Url: toBase64Url(key),
		ivBase64Url: toBase64Url(iv),
		algorithm: "AES-GCM-256",
		originalSize: plaintext.length,
		encryptedSize: encrypted.length,
		filename: filePath,
	};
}

export function decryptBuffer(
	encrypted: Buffer,
	keyBase64Url: string,
	ivBase64Url: string,
): Buffer {
	const key = fromBase64Url(keyBase64Url);
	const iv = fromBase64Url(ivBase64Url);

	const authTag = encrypted.subarray(-AUTH_TAG_LENGTH);
	const ciphertext = encrypted.subarray(0, -AUTH_TAG_LENGTH);

	const decipher = createDecipheriv(AES_GCM, key, iv);
	decipher.setAuthTag(authTag);

	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
