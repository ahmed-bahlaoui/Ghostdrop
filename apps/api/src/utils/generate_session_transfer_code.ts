import { webcrypto } from "node:crypto";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates a human-friendly 6-character transfer code (e.g., "K7M-X9Q").
 * Uses a restricted charset to avoid ambiguous characters.
 */
export function generateTransferCode(): string {
	const bytes = new Uint8Array(6);
	webcrypto.getRandomValues(bytes);
	const code = Array.from(bytes)

		.map((b) => CHARSET[b % CHARSET.length])
		.join("");

	// Format as XXX-XXX
	return `${code.slice(0, 3)}-${code.slice(3)}`;
}
