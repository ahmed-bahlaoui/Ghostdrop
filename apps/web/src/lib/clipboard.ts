import { selectFile, state } from "./state.svelte.js";

function getImageFilename(mimeType: string): string {
	const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg");
	return extension
		? `ghostdrop-clipboard.${extension}`
		: "ghostdrop-clipboard-image";
}

export function selectClipboardImage(blob: Blob, mimeType: string) {
	selectFile(
		new File([blob], getImageFilename(mimeType), { type: mimeType }),
	);
}

export function selectClipboardText(text: string) {
	selectFile(
		new File([text], "ghostdrop-note.txt", {
			type: "text/plain;charset=utf-8",
		}),
	);
}

function shouldIgnorePaste(event: ClipboardEvent): boolean {
	const target = event.target as HTMLElement | null;
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target?.isContentEditable === true
	);
}

export function handleWindowPaste(event: ClipboardEvent) {
	if (state.view !== "main" || state.status.type === "loading" || shouldIgnorePaste(event)) {
		return;
	}

	const clipboard = event.clipboardData;
	if (!clipboard) return;

	const imageItem = Array.from(clipboard.items).find((item) =>
		item.type.startsWith("image/"),
	);

	if (imageItem) {
		const image = imageItem.getAsFile();
		if (!image) return;

		event.preventDefault();
		selectClipboardImage(image, image.type || imageItem.type);
		return;
	}

	const text = clipboard.getData("text/plain");
	if (text.trim()) {
		event.preventDefault();
		selectClipboardText(text);
	}
}

export async function handlePasteClipboard() {
	if (!navigator.clipboard?.read && !navigator.clipboard?.readText) {
		state.status = {
			type: "error",
			message: "Clipboard access is not supported in this browser",
		};
		return;
	}

	try {
		if (navigator.clipboard.read) {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const imageType = item.types.find((type) => type.startsWith("image/"));
				if (imageType) {
					const blob = await item.getType(imageType);
					selectClipboardImage(blob, imageType);
					return;
				}
			}
		}

		if (!navigator.clipboard.readText) {
			state.status = {
				type: "error",
				message: "Clipboard does not contain an image",
			};
			return;
		}

		const text = await navigator.clipboard.readText();
		if (!text.trim()) {
			state.status = {
				type: "error",
				message: "Clipboard does not contain text or an image",
			};
			return;
		}

		selectClipboardText(text);
	} catch (err: unknown) {
		console.error("Clipboard paste error:", err);
		state.status = {
			type: "error",
			message:
				err instanceof Error ? err.message : "Clipboard permission was denied",
		};
	}
}
