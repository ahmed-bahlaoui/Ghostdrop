<script lang="ts">
import { downloadFileBlob, previewFileBlob } from "../lib/api.js";
import { decryptFile } from "../lib/crypto.js";
import {
	formatExpiry,
	formatSize,
	isImage,
	isTextNote,
	normalizeTransferMetadata,
} from "../lib/format.js";
import {
	goBack,
	resetReceiveState,
	revokeImagePreviewUrl,
	state,
} from "../lib/state.svelte.js";

async function handleViewNote() {
	if (!state.fileMeta) return;

	state.status = { type: "loading", message: "Opening note..." };
	state.noteCopied = false;
	revokeImagePreviewUrl();

	try {
		const blob = await previewFileBlob(state.peekedCode);
		const file = await decryptBlob(blob);
		state.noteContent = await file.text();
		state.status = { type: "idle", message: "" };
		state.view = "note";
	} catch (err: unknown) {
		console.error("Note view error:", err);
		state.status = {
			type: "error",
			message: err instanceof Error ? err.message : "Note could not be opened",
		};
	}
}

async function handleViewImage() {
	if (!state.fileMeta) return;

	state.status = { type: "loading", message: "Opening image..." };
	revokeImagePreviewUrl();

	try {
		const blob = await previewFileBlob(state.peekedCode);
		const file = await decryptBlob(blob);
		state.imagePreviewUrl = URL.createObjectURL(file);
		state.status = { type: "idle", message: "" };
		state.view = "image";
	} catch (err: unknown) {
		console.error("Image preview error:", err);
		state.status = {
			type: "error",
			message: err instanceof Error ? err.message : "Image could not be opened",
		};
	}
}

async function handleDownloadFromPeek() {
	state.status = { type: "loading", message: "Download starting..." };

	try {
		const blob = await downloadFileBlob(state.peekedCode);
		const file = await decryptBlob(blob);
		const url = URL.createObjectURL(file);
		const link = document.createElement("a");
		link.href = url;
		link.download = file.name || `ghostdrop-${state.peekedCode}`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
		resetReceiveState();
		state.status = { type: "idle", message: "" };
	} catch (err: unknown) {
		console.error("Download error:", err);
		resetReceiveState();
		state.status = {
			type: "error",
			message: err instanceof Error ? err.message : "Download failed",
		};
	}
}

async function decryptBlob(encryptedBlob: Blob): Promise<File> {
	const meta = normalizeTransferMetadata(state.fileMeta);
	if (meta.encryption.algorithm === "none") {
		return new File([encryptedBlob], meta.filename, {
			type: meta.mimeType || "application/octet-stream",
		});
	}
	if (!meta.encryption.iv)
		throw new Error("Transfer is missing encryption metadata");
	const key = state.receiveKey.trim();
	if (!key) throw new Error("Decryption key is required");
	return decryptFile({
		encryptedBlob,
		keyBase64Url: key,
		ivBase64Url: meta.encryption.iv,
		filename: meta.filename,
		mimeType: meta.mimeType,
	});
}
</script>

{#if state.fileMeta}
	<div class="bg-white rounded-2xl shadow-xl p-6 md:p-8 w-full max-w-lg mx-auto">
		<h2 class="text-xl font-black mb-6 text-slate-800 uppercase tracking-tighter">
			File Details
		</h2>

		<div class="space-y-4">
			<div>
				<p class="text-xs font-black uppercase text-slate-400">Filename</p>
				<p class="text-lg font-bold text-slate-800 break-all">{state.fileMeta.filename}</p>
			</div>

			<div class="flex gap-6">
				<div>
					<p class="text-xs font-black uppercase text-slate-400">Type</p>
					<p class="font-bold text-slate-800">{state.fileMeta.mimeType}</p>
				</div>
				<div>
					<p class="text-xs font-black uppercase text-slate-400">Size</p>
					<p class="font-bold text-slate-800">{formatSize(state.fileMeta.originalSize ?? state.fileMeta.size)}</p>
				</div>
			</div>

			<div class="flex gap-6">
				<div>
					<p class="text-xs font-black uppercase text-slate-400">Downloads</p>
					<p class="font-bold text-slate-800" class:text-rose-500={state.fileMeta.downloadCount >= state.fileMeta.maxDownloads}>
						{state.fileMeta.downloadCount} / {state.fileMeta.maxDownloads}
					</p>
				</div>
				<div>
					<p class="text-xs font-black uppercase text-slate-400">Expires</p>
					<p class="font-bold text-slate-800">{formatExpiry(state.fileMeta.expiresAt)}</p>
				</div>
			</div>
		</div>

		{#if isTextNote(state.fileMeta)}
			<button
				onclick={handleViewNote}
				disabled={state.status.type === "loading"}
				class="mt-8 w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 active:bg-emerald-700 uppercase tracking-tighter"
			>
				View Note
			</button>
		{:else if isImage(state.fileMeta)}
			<button
				onclick={handleViewImage}
				disabled={state.status.type === "loading"}
				class="mt-8 w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 active:bg-emerald-700 uppercase tracking-tighter"
			>
				Preview Image
			</button>
		{:else}
			<button
				onclick={handleDownloadFromPeek}
				disabled={state.status.type === "loading"}
				class="mt-8 w-full py-5 bg-rose-500 text-white rounded-2xl font-black text-xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 active:bg-rose-700 uppercase tracking-tighter"
			>
				Download
			</button>
		{/if}
		<button
			onclick={goBack}
			class="mt-3 w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase hover:bg-slate-200 transition-all tracking-tighter"
		>
			Back to code
		</button>
	</div>
{/if}
