export function getApiUrl(): string {
	return process.env.GHOSTDROP_API_URL ?? "http://localhost/api";
}

export function getWebUrl(): string {
	return process.env.GHOSTDROP_WEB_URL ?? "http://localhost";
}
