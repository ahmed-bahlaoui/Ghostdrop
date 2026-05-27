<script lang="ts">
	import { fetchMetadata, downloadFileBlob } from "../lib/api.js";
	import { decryptFile } from "../lib/crypto.js";
	import {
		hasCompleteReceiveCode,
		normalizeReceiveCode,
		formatTransferCode,
		receiveCodeCharacters,
		normalizeTransferMetadata,
	} from "../lib/format.js";
	import { state, resetReceiveState } from "../lib/state.svelte.js";

	async function handlePeek() {
		if (!hasCompleteReceiveCode()) return;

		state.status = { type: "loading", message: "Fetching metadata..." };
		state.fileMeta = null;

		try {
			const cleanCode = normalizeReceiveCode();
			const meta = await fetchMetadata(cleanCode);
			state.fileMeta = normalizeTransferMetadata(meta);
			state.peekedCode = cleanCode;
			state.status = { type: "idle", message: "" };
			state.view = "peek";
		} catch (err: unknown) {
			console.error("Peek error:", err);
			state.status = {
				type: "error",
				message: err instanceof Error ? err.message : "Peek failed",
			};
		}
	}

	async function handleDownload() {
		if (!hasCompleteReceiveCode()) return;

		state.status = { type: "loading", message: "Download starting..." };

		try {
			const cleanCode = normalizeReceiveCode();
			const meta = await fetchMetadata(cleanCode);
			const blob = await downloadFileBlob(cleanCode);
			await triggerBrowserDownload(blob, meta);
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

	async function triggerBrowserDownload(encryptedBlob: Blob, meta: ReturnType<typeof normalizeTransferMetadata>) {
		let file: File;

		if (meta.encryption.algorithm === "none") {
			file = new File([encryptedBlob], meta.filename, {
				type: meta.mimeType || "application/octet-stream",
			});
		} else {
			if (!meta.encryption.iv) throw new Error("Transfer is missing encryption metadata");
			const key = state.receiveKey.trim();
			if (!key) throw new Error("Decryption key is required");
			file = await decryptFile({
				encryptedBlob,
				keyBase64Url: key,
				ivBase64Url: meta.encryption.iv,
				filename: meta.filename,
				mimeType: meta.mimeType,
			});
		}

		const url = URL.createObjectURL(file);
		const link = document.createElement("a");
		link.href = url;
		link.download = file.name || `ghostdrop-${state.peekedCode}`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	function handleReceiveCodeInput(e: Event) {
		state.receiveCode = formatTransferCode((e.currentTarget as HTMLInputElement).value);
	}

	function handleReceiveCodeKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") { handlePeek(); return; }
		if (e.key.length === 1 && !/^[a-z0-9]$/i.test(e.key)) e.preventDefault();
	}
</script>

<div class="bg-white rounded-2xl shadow-xl p-6 md:p-8 transition-all">
	<h2 class="text-xl font-black mb-6 text-slate-800 uppercase tracking-tighter">
		Receive File
	</h2>

	<div class="flex flex-col gap-4">
		<label class="relative block">
			<span class="sr-only">Enter transfer code</span>
			<input
				type="text"
				value={state.receiveCode}
				oninput={handleReceiveCodeInput}
				onkeydown={handleReceiveCodeKeydown}
				inputmode="text"
				autocomplete="one-time-code"
				autocapitalize="characters"
				spellcheck="false"
				class="peer absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
				aria-label="Enter transfer code"
			/>
			<div
				aria-hidden="true"
				class="grid grid-cols-[repeat(3,minmax(0,1fr))_auto_repeat(3,minmax(0,1fr))] items-center gap-2 sm:gap-3"
			>
				{#each receiveCodeCharacters() as character, index (index)}
					{#if index === 3}
						<span class="h-1 w-3 rounded-full bg-slate-300 sm:w-4"></span>
					{/if}
					<div
						class="flex h-12 min-w-0 items-center justify-center rounded-2xl border-2 bg-slate-50 text-xl font-black font-mono text-slate-800 shadow-inner transition-all sm:h-14 sm:text-2xl {character ? 'border-slate-300' : 'border-slate-200'} peer-focus:border-rose-400 peer-focus:bg-white peer-focus:shadow-rose-100"
					>
						{character}
					</div>
				{/each}
			</div>
		</label>
		<input
			type="text"
			bind:value={state.receiveKey}
			onkeydown={(e) => e.key === "Enter" && handlePeek()}
			placeholder="PASTE DECRYPTION KEY"
			class="w-full bg-slate-100 py-4 px-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 text-sm font-mono font-bold text-center placeholder:text-slate-300 transition-all"
		/>
		<div class="flex gap-3">
			<button
				onclick={handlePeek}
				disabled={!hasCompleteReceiveCode() || state.status.type === "loading"}
				class="flex-1 py-5 bg-emerald-500 text-white rounded-2xl font-black text-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 active:bg-emerald-700 uppercase tracking-tighter"
			>
				Peek
			</button>
			<button
				onclick={handleDownload}
				disabled={!hasCompleteReceiveCode() || state.status.type === "loading"}
				class="flex-1 py-5 bg-rose-500 text-white rounded-2xl font-black text-lg hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 active:bg-rose-700 uppercase tracking-tighter"
			>
				Download
			</button>
		</div>
	</div>
</div>
