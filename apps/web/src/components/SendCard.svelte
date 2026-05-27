<script lang="ts">
	import { encryptFile } from "../lib/crypto.js";
	import { handshakeTransfer, uploadFile } from "../lib/api.js";
	import { handlePasteClipboard } from "../lib/clipboard.js";
	import { buildEncryptedShareLink } from "../lib/format.js";
	import {
		selectFile,
		state,
		expiryOptions,
		downloadOptions,
	} from "../lib/state.svelte.js";

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) selectFile(file);
	}

	async function handleUpload() {
		if (!state.selectedFile) return;

		state.status.message = state.endToEndEncryption
			? "Encrypting file..."
			: "Initializing transfer...";
		state.status.type = "loading";

		try {
			const encrypted = state.endToEndEncryption
				? await encryptFile(state.selectedFile)
				: null;

			state.status.message = "Initializing transfer...";
			const uploadFileBlob = encrypted?.file ?? state.selectedFile;

			const { code } = await handshakeTransfer({
				filename: state.selectedFile.name,
				size: uploadFileBlob.size,
				originalSize: encrypted?.originalSize,
				mimeType: state.selectedFile.type || "application/octet-stream",
				encryptionAlgorithm: encrypted?.algorithm ?? "none",
				encryptionIv: encrypted?.ivBase64Url ?? null,
				maxDownloads: state.maxDownloads,
				expiresInMinutes: state.expiresInMinutes,
			});

			state.status.message = `Uploading ${state.selectedFile.name}...`;

			await uploadFile(code, uploadFileBlob as File);

			state.shareKey = encrypted?.keyBase64Url ?? "";
			state.shareLink = encrypted
				? buildEncryptedShareLink(code, encrypted.keyBase64Url)
				: "";
			state.status = {
				type: "success",
				message: "File ready for ghosting!",
				code: code,
			};
			state.selectedFile = null;
			if (state.fileInput) state.fileInput.value = "";
		} catch (err: unknown) {
			console.error("Upload error:", err);
			state.status = {
				type: "error",
				message: err instanceof Error ? err.message : "Upload failed",
			};
		}
	}
</script>

<div class="bg-white rounded-2xl shadow-xl p-6 md:p-8 transition-all active:scale-[0.99]">
	<h2 class="text-xl font-black mb-6 text-slate-800 uppercase tracking-tighter">
		Send File
	</h2>

	<div class="relative group overflow-hidden">
		<input
			type="file"
			bind:this={state.fileInput}
			onchange={handleFileSelect}
			class="absolute inset-0 opacity-0 z-20 cursor-pointer"
		/>
		<div
			class="w-full aspect-square rounded-2xl border-4 border-dashed flex flex-col items-center justify-center transition-all {state.selectedFile
				? 'border-emerald-400 bg-emerald-50'
				: 'border-slate-100 bg-slate-50 group-active:bg-rose-50'}"
		>
			<div class={state.selectedFile ? "text-emerald-500" : "text-rose-500"}>
				{#if state.selectedFile}
					<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
						<path d="M20 6L9 17l-5-5" />
					</svg>
				{:else}
					<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				{/if}
			</div>
			<p class="mt-4 text-xs font-black uppercase text-center px-4 break-all {state.selectedFile ? 'text-emerald-700' : 'text-slate-400'}">
				{state.selectedFile ? state.selectedFile.name : "Tap here to choose"}
			</p>
		</div>
	</div>

	<button
		onclick={handlePasteClipboard}
		disabled={state.status.type === "loading"}
		class="mt-4 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all active:bg-slate-950 uppercase tracking-tighter disabled:opacity-50 disabled:cursor-not-allowed"
	>
		Paste Clipboard
	</button>

	{#if state.selectedFile && state.status.type !== "loading"}
		<div class="mt-4 space-y-4">
			<label class="flex items-center justify-between gap-4 rounded-2xl bg-slate-100 p-4">
				<span>
					<span class="block text-xs font-black uppercase text-slate-700">End to end encryption</span>
					<span class="mt-1 block text-xs font-bold text-slate-400">Requires secure link or key to open</span>
				</span>
				<input type="checkbox" bind:checked={state.endToEndEncryption} class="h-6 w-11 accent-rose-500" />
			</label>

			<div>
				<p class="text-xs font-black uppercase text-slate-400 mb-2">Expires in</p>
				<div class="flex gap-2">
					{#each expiryOptions as option (option.value)}
						<button
							onclick={() => (state.expiresInMinutes = option.value)}
							class="flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all {state.expiresInMinutes === option.value ? 'bg-rose-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<div>
				<p class="text-xs font-black uppercase text-slate-400 mb-2">Max Downloads</p>
				<div class="flex gap-2">
					{#each downloadOptions as option (option.value)}
						<button
							onclick={() => (state.maxDownloads = option.value)}
							class="flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all {state.maxDownloads === option.value ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<button
				onclick={handleUpload}
				class="mt-2 w-full py-5 bg-rose-500 text-white rounded-2xl font-black text-xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 active:bg-rose-700 uppercase tracking-tighter"
			>
				Send Now
			</button>
		</div>
	{/if}
</div>
