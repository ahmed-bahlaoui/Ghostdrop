<script lang="ts">
	let selectedFile = $state<File | null>(null);
	let receiveCode = $state("");
	let peekedCode = $state("");
	let expiresInMinutes = $state(60);
	let maxDownloads = $state(1);
	let view = $state<"main" | "peek" | "note" | "image">("main");
	let noteContent = $state("");
	let noteCopied = $state(false);
	let imagePreviewUrl = $state("");
	let fileMeta = $state<{
		filename: string;
		size: number;
		mimeType: string;
		downloadCount: number;
		maxDownloads: number;
		expiresAt: string;
	} | null>(null);
	let status = $state<{
		type: "idle" | "loading" | "success" | "error";
		message: string;
		code?: string;
	}>({ type: "idle", message: "" });

	let fileInput = $state<HTMLInputElement>();

	const expiryOptions = [
		{ label: "1 Hour", value: 60 },
		{ label: "1 Day", value: 1440 },
		{ label: "3 Days", value: 4320 },
		{ label: "7 Days", value: 10080 },
	];

	const downloadOptions = [
		{ label: "1", value: 1 },
		{ label: "3", value: 3 },
		{ label: "5", value: 5 },
		{ label: "10", value: 10 },
	];

	// --- CONFIGURATION ---
	const API_OVERRIDE = "";

	const getApiUrl = () => {
		if (typeof window === "undefined") return "http://localhost:3100";

		const params = new URLSearchParams(window.location.search);
		const paramApi = params.get("api");
		if (paramApi) return paramApi;
		if (API_OVERRIDE) return API_OVERRIDE;

		// If we are in production (staging), use the relative /api path
		// provided by the Caddy proxy
		if (import.meta.env.PROD) {
			return "/api";
		}

		return `http://${window.location.hostname}:3100`;
	};

	const API_URL = getApiUrl();

	// Localtunnel/Ngrok bypass header
	const headers = {
		"Bypass-Tunnel-Reminder": "true",
	};
	// ---------------------

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			selectedFile = file;
			noteContent = "";
			revokeImagePreviewUrl();
			status = { type: "idle", message: "" };
		}
	}

	function getImageFilename(mimeType: string): string {
		const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg");
		return extension
			? `ghostdrop-clipboard.${extension}`
			: "ghostdrop-clipboard-image";
	}

	function revokeImagePreviewUrl() {
		if (imagePreviewUrl) {
			URL.revokeObjectURL(imagePreviewUrl);
			imagePreviewUrl = "";
		}
	}

	async function handlePasteClipboard() {
		if (!navigator.clipboard?.read && !navigator.clipboard?.readText) {
			status = {
				type: "error",
				message: "Clipboard access is not supported in this browser",
			};
			return;
		}

		try {
			if (navigator.clipboard.read) {
				const items = await navigator.clipboard.read();
				for (const item of items) {
					const imageType = item.types.find((type) =>
						type.startsWith("image/"),
					);

					if (imageType) {
						const blob = await item.getType(imageType);
						selectedFile = new File([blob], getImageFilename(imageType), {
							type: imageType,
						});
						noteContent = "";
						revokeImagePreviewUrl();
						status = { type: "idle", message: "" };
						if (fileInput) fileInput.value = "";
						return;
					}
				}
			}

			if (!navigator.clipboard.readText) {
				status = {
					type: "error",
					message: "Clipboard does not contain an image",
				};
				return;
			}

			const text = await navigator.clipboard.readText();
			if (!text.trim()) {
				status = {
					type: "error",
					message: "Clipboard does not contain text or an image",
				};
				return;
			}

			selectedFile = new File([text], "ghostdrop-note.txt", {
				type: "text/plain;charset=utf-8",
			});
			noteContent = "";
			revokeImagePreviewUrl();
			status = { type: "idle", message: "" };
			if (fileInput) fileInput.value = "";
		} catch (err: unknown) {
			console.error("Clipboard paste error:", err);
			status = {
				type: "error",
				message:
					err instanceof Error
						? err.message
						: "Clipboard permission was denied",
			};
		}
	}

	async function handleUpload() {
		if (!selectedFile) return;

		status = { type: "loading", message: "Initializing transfer..." };

		try {
			// 1. Handshake
			const handshakeRes = await fetch(`${API_URL}/transfers`, {
				method: "POST",
				headers: {
					...headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					filename: selectedFile.name,
					size: selectedFile.size,
					mimeType: selectedFile.type || "application/octet-stream",
					maxDownloads,
					expiresInMinutes,
				}),
			});

			if (!handshakeRes.ok) {
				const text = await handshakeRes.text();
				let errorMessage = "Handshake failed";
				try {
					const err = JSON.parse(text);
					errorMessage = err.error || errorMessage;
				} catch {
					errorMessage = `Server Error: ${handshakeRes.status} ${handshakeRes.statusText}`;
				}
				throw new Error(errorMessage);
			}

			const data = await handshakeRes.json();
			const { code } = data;
			status = {
				type: "loading",
				message: `Uploading ${selectedFile.name}...`,
			};

			// 2. Binary Stream
			const formData = new FormData();
			formData.append("file", selectedFile);

			const uploadRes = await fetch(
				`${API_URL}/transfers/${code}/upload`,
				{
					method: "POST",
					headers: headers, // Bypass tunnel reminder for upload too
					body: formData,
				},
			);

			if (!uploadRes.ok) {
				throw new Error("Streaming upload failed");
			}

			status = {
				type: "success",
				message: "File ready for ghosting!",
				code: code,
			};
			selectedFile = null;
			if (fileInput) fileInput.value = "";
		} catch (err: unknown) {
			console.error("Upload error:", err);
			status = {
				type: "error",
				message: err instanceof Error ? err.message : "Upload failed",
			};
		}
	}

	async function handlePeek() {
		if (!receiveCode) return;

		status = { type: "loading", message: "Fetching metadata..." };
		fileMeta = null;

		try {
			const cleanCode = receiveCode.trim().toUpperCase();
			const metaRes = await fetch(`${API_URL}/transfers/${cleanCode}`, {
				headers: headers,
			});
			if (!metaRes.ok) {
				const err = await metaRes.json();
				throw new Error(err.error || "File not found");
			}

			const meta = await metaRes.json();
			fileMeta = {
				filename: meta.filename,
				size: meta.size,
				mimeType: meta.mimeType,
				downloadCount: meta.downloadCount,
				maxDownloads: meta.maxDownloads,
				expiresAt: meta.expiresAt,
			};
			peekedCode = cleanCode;
			status = { type: "idle", message: "" };
			view = "peek";
		} catch (err: unknown) {
			console.error("Peek error:", err);
			status = {
				type: "error",
				message: err instanceof Error ? err.message : "Peek failed",
			};
		}
	}

	async function handleDownload() {
		if (!receiveCode) return;

		status = { type: "loading", message: "Download starting..." };

		try {
			const cleanCode = receiveCode.trim().toUpperCase();
			const filename = await getTransferFilename(cleanCode);
			await downloadTransfer(cleanCode, filename);
			resetReceiveState();
			status = { type: "idle", message: "" };
		} catch (err: unknown) {
			console.error("Download error:", err);
			resetReceiveState();
			status = {
				type: "error",
				message:
					err instanceof Error ? err.message : "Download failed",
			};
		}
	}

	async function handleDownloadFromPeek() {
		status = { type: "loading", message: "Download starting..." };

		try {
			await downloadTransfer(peekedCode, fileMeta?.filename);
			resetReceiveState();
			status = { type: "idle", message: "" };
		} catch (err: unknown) {
			console.error("Download error:", err);
			resetReceiveState();
			status = {
				type: "error",
				message:
					err instanceof Error ? err.message : "Download failed",
			};
		}
	}

	async function downloadTransfer(code: string, filename?: string) {
		const res = await fetch(`${API_URL}/transfers/${code}/download`, {
			headers: headers,
		});

		if (!res.ok) {
			const err = await res.json().catch(() => null);
			throw new Error(err?.error || "Download failed");
		}

		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename || `ghostdrop-${code}`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	async function getTransferFilename(code: string): Promise<string | undefined> {
		const metaRes = await fetch(`${API_URL}/transfers/${code}`, {
			headers: headers,
		});

		if (!metaRes.ok) return undefined;

		const meta = await metaRes.json().catch(() => null);
		return typeof meta?.filename === "string" ? meta.filename : undefined;
	}

	async function handleViewNote() {
		status = { type: "loading", message: "Opening note..." };
		noteCopied = false;
		revokeImagePreviewUrl();

		try {
			const res = await fetch(`${API_URL}/transfers/${peekedCode}/download`, {
				headers: headers,
			});

			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err?.error || "Note could not be opened");
			}

			noteContent = await res.text();
			status = { type: "idle", message: "" };
			view = "note";
		} catch (err: unknown) {
			console.error("Note view error:", err);
			status = {
				type: "error",
				message:
					err instanceof Error ? err.message : "Note could not be opened",
			};
		}
	}

	async function handleViewImage() {
		status = { type: "loading", message: "Opening image..." };
		revokeImagePreviewUrl();

		try {
			const res = await fetch(`${API_URL}/transfers/${peekedCode}/download`, {
				headers: headers,
			});

			if (!res.ok) {
				const err = await res.json().catch(() => null);
				throw new Error(err?.error || "Image could not be opened");
			}

			const blob = await res.blob();
			imagePreviewUrl = URL.createObjectURL(blob);
			status = { type: "idle", message: "" };
			view = "image";
		} catch (err: unknown) {
			console.error("Image preview error:", err);
			status = {
				type: "error",
				message:
					err instanceof Error ? err.message : "Image could not be opened",
			};
		}
	}

	async function handleCopyNote() {
		try {
			await navigator.clipboard.writeText(noteContent);
			noteCopied = true;
		} catch (err: unknown) {
			console.error("Note copy error:", err);
			status = {
				type: "error",
				message: "Could not copy note to clipboard",
			};
		}
	}

	function goBackToPeek() {
		view = "peek";
		noteCopied = false;
		revokeImagePreviewUrl();
		status = { type: "idle", message: "" };
	}

	function resetReceiveState() {
		receiveCode = "";
		peekedCode = "";
		fileMeta = null;
		noteContent = "";
		noteCopied = false;
		revokeImagePreviewUrl();
		view = "main";
	}

	function goBack() {
		resetReceiveState();
		status = { type: "idle", message: "" };
	}

	function isTextNote(meta: { mimeType: string } | null): boolean {
		return meta?.mimeType.toLowerCase().startsWith("text/plain") ?? false;
	}

	function isImage(meta: { mimeType: string } | null): boolean {
		return meta?.mimeType.toLowerCase().startsWith("image/") ?? false;
	}

	function formatSize(bytes: number): string {
		if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
		if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
		if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
		return `${bytes} B`;
	}

	function formatExpiry(iso: string): string {
		const diff = new Date(iso).getTime() - Date.now();
		if (diff <= 0) return "Expired";
		const mins = Math.round(diff / 60_000);
		if (mins < 60) return `in ${mins} min`;
		const hours = Math.round(mins / 60);
		if (hours < 24) return `in ${hours}h`;
		const days = Math.round(hours / 24);
		return `in ${days} day${days > 1 ? "s" : ""}`;
	}
</script>

<div
	class="min-h-screen w-screen bg-slate-200 text-slate-900 font-sans selection:bg-rose-100 flex flex-col"
>
	<!-- Navbar -->
	<header
		class="flex h-16 w-full items-center bg-white px-6 md:px-8 shadow-sm shrink-0"
	>
		<div class="flex items-center gap-2">
			<div
				class="h-8 w-8 rounded-full bg-rose-500 flex items-center justify-center text-white font-bold text-xl"
			>
				G
			</div>
			<span
				class="text-xl font-bold tracking-tight text-slate-800 uppercase"
			>
				ghostdrop
			</span>
		</div>
	</header>

	<main
		class="flex-1 flex flex-col items-center justify-start p-4 md:p-12 overflow-y-auto"
	>
		<div class="flex flex-col gap-6 w-full max-w-5xl">
			<!-- Connection Badge -->
			<div
				class="flex justify-between items-center px-1 text-[10px] font-black uppercase tracking-widest text-slate-400"
			>
				<span>API CONNECTION</span>
				<span class="text-rose-500"
					>{API_URL.replace("http://", "").replace(
						"https://",
						"",
					)}</span
				>
			</div>

			<!-- Status Message -->
			{#if status.type !== "idle"}
				<div
					class="p-4 rounded-2xl flex flex-col gap-2 transition-all border {status.type ===
					'error'
						? 'bg-red-50 text-red-700 border-red-100'
						: status.type === 'success'
							? 'bg-emerald-50 text-emerald-700 border-emerald-100'
							: 'bg-blue-50 text-blue-700 border-blue-100'}"
				>
					<p class="font-bold uppercase text-xs tracking-widest">
						{status.message}
					</p>
					{#if status.code}
						<div
							class="mt-2 p-4 bg-white rounded-xl border border-emerald-200 text-center shadow-sm"
						>
							<p
								class="text-[10px] uppercase text-slate-400 font-black mb-1"
							>
								Your Transfer Code
							</p>
							<p
								class="text-4xl font-mono font-black tracking-[0.2em] text-rose-600 select-all"
							>
								{status.code}
							</p>
						</div>
					{/if}
				</div>
			{/if}

			{#if view === "main"}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
				<!-- Send Card -->
				<div
					class="bg-white rounded-2xl shadow-xl p-6 md:p-8 transition-all active:scale-[0.99]"
				>
					<h2
						class="text-xl font-black mb-6 text-slate-800 uppercase tracking-tighter"
					>
						Send File
					</h2>

					<div class="relative group overflow-hidden">
						<input
							type="file"
							bind:this={fileInput}
							onchange={handleFileSelect}
							class="absolute inset-0 opacity-0 z-20 cursor-pointer"
						/>
						<div
							class="w-full aspect-square rounded-2xl border-4 border-dashed flex flex-col items-center justify-center transition-all {selectedFile
								? 'border-emerald-400 bg-emerald-50'
								: 'border-slate-100 bg-slate-50 group-active:bg-rose-50'}"
						>
							<div
								class={selectedFile
									? "text-emerald-500"
									: "text-rose-500"}
							>
								{#if selectedFile}
									<svg
										width="64"
										height="64"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M20 6L9 17l-5-5" />
									</svg>
								{:else}
									<svg
										width="64"
										height="64"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<line x1="12" y1="5" x2="12" y2="19" />
										<line x1="5" y1="12" x2="19" y2="12" />
									</svg>
								{/if}
							</div>
							<p
								class="mt-4 text-xs font-black uppercase text-center px-4 break-all {selectedFile
									? 'text-emerald-700'
									: 'text-slate-400'}"
							>
								{selectedFile
									? selectedFile.name
									: "Tap here to choose"}
							</p>
						</div>
					</div>

					<button
						onclick={handlePasteClipboard}
						disabled={status.type === "loading"}
						class="mt-4 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all active:bg-slate-950 uppercase tracking-tighter disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Paste Clipboard
					</button>

					{#if selectedFile && status.type !== "loading"}
						<div class="mt-4 space-y-4">
							<div>
								<p
									class="text-xs font-black uppercase text-slate-400 mb-2"
								>
									Expires in
								</p>
								<div class="flex gap-2">
									{#each expiryOptions as option (option.value)}
										<button
											onclick={() =>
												(expiresInMinutes =
													option.value)}
											class="flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all {expiresInMinutes ===
											option.value
												? 'bg-rose-500 text-white shadow-sm'
												: 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
										>
											{option.label}
										</button>
									{/each}
								</div>
							</div>

							<div>
								<p
									class="text-xs font-black uppercase text-slate-400 mb-2"
								>
									Max Downloads
								</p>
								<div class="flex gap-2">
									{#each downloadOptions as option (option.value)}
										<button
											onclick={() =>
												(maxDownloads = option.value)}
											class="flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all {maxDownloads ===
											option.value
												? 'bg-slate-900 text-white shadow-sm'
												: 'bg-slate-100 text-slate-500 hover:bg-slate-200'}"
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

				<!-- Receive Card -->
				<div
					class="bg-white rounded-2xl shadow-xl p-6 md:p-8 transition-all"
				>
					<h2
						class="text-xl font-black mb-6 text-slate-800 uppercase tracking-tighter"
					>
						Receive File
					</h2>

					<div class="flex flex-col gap-4">
						<input
							type="text"
							bind:value={receiveCode}
							onkeydown={(e) =>
								e.key === "Enter" && handlePeek()}
							placeholder="ENTER 6-DIGIT CODE"
							class="w-full bg-slate-100 py-5 px-4 rounded-2xl outline-none focus:ring-4 focus:ring-rose-100 text-2xl font-mono font-black text-center placeholder:text-slate-300 uppercase tracking-widest transition-all"
						/>
						<div class="flex gap-3">
							<button
								onclick={handlePeek}
								disabled={!receiveCode.trim() ||
									status.type === "loading"}
								class="flex-1 py-5 bg-emerald-500 text-white rounded-2xl font-black text-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 active:bg-emerald-700 uppercase tracking-tighter"
							>
								Peek
							</button>
							<button
								onclick={handleDownload}
								disabled={!receiveCode.trim() ||
									status.type === "loading"}
								class="flex-1 py-5 bg-rose-500 text-white rounded-2xl font-black text-lg hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 active:bg-rose-700 uppercase tracking-tighter"
							>
								Download
							</button>
						</div>
					</div>
				</div>
			</div>
		{:else if view === "peek" && fileMeta}
			<div
				class="bg-white rounded-2xl shadow-xl p-6 md:p-8 w-full max-w-lg mx-auto"
			>
				<h2
					class="text-xl font-black mb-6 text-slate-800 uppercase tracking-tighter"
				>
					File Details
				</h2>

				<div class="space-y-4">
					<div>
						<p class="text-xs font-black uppercase text-slate-400"
						>
							Filename
						</p>
						<p
							class="text-lg font-bold text-slate-800 break-all"
						>
							{fileMeta.filename}
						</p>
					</div>

					<div class="flex gap-6">
						<div>
							<p
								class="text-xs font-black uppercase text-slate-400"
							>
								Type
							</p>
							<p class="font-bold text-slate-800">
								{fileMeta.mimeType}
							</p>
						</div>
						<div>
							<p
								class="text-xs font-black uppercase text-slate-400"
							>
								Size
							</p>
							<p class="font-bold text-slate-800">
								{formatSize(fileMeta.size)}
							</p>
						</div>
					</div>

					<div class="flex gap-6">
						<div>
							<p
								class="text-xs font-black uppercase text-slate-400"
							>
								Downloads
							</p>
							<p
								class="font-bold text-slate-800"
								class:text-rose-500={fileMeta.downloadCount >=
									fileMeta.maxDownloads}
							>
								{fileMeta.downloadCount} / {fileMeta.maxDownloads}
							</p>
						</div>
						<div>
							<p
								class="text-xs font-black uppercase text-slate-400"
							>
								Expires
							</p>
							<p class="font-bold text-slate-800">
								{formatExpiry(fileMeta.expiresAt)}
							</p>
						</div>
					</div>
				</div>

				{#if isTextNote(fileMeta)}
					<button
						onclick={handleViewNote}
						disabled={status.type === "loading"}
						class="mt-8 w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 active:bg-emerald-700 uppercase tracking-tighter"
					>
						View Note
					</button>
				{:else if isImage(fileMeta)}
					<button
						onclick={handleViewImage}
						disabled={status.type === "loading"}
						class="mt-8 w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 active:bg-emerald-700 uppercase tracking-tighter"
					>
						Preview Image
					</button>
				{:else}
					<button
						onclick={handleDownloadFromPeek}
						disabled={status.type === "loading"}
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
		{:else if view === "note"}
			<div
				class="bg-white rounded-2xl shadow-xl p-6 md:p-8 w-full max-w-2xl mx-auto"
			>
				<h2
					class="text-xl font-black mb-2 text-slate-800 uppercase tracking-tighter"
				>
					Ghost Note
				</h2>
				<p class="text-xs font-black uppercase text-slate-400 mb-5">
					Text transfer {peekedCode}
				</p>

				<textarea
					readonly
					value={noteContent}
					class="w-full min-h-72 bg-slate-100 text-slate-800 rounded-2xl p-4 outline-none font-mono text-sm leading-6 resize-y whitespace-pre-wrap"
				></textarea>

				<button
					onclick={handleCopyNote}
					class="mt-5 w-full py-5 bg-rose-500 text-white rounded-2xl font-black text-xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 active:bg-rose-700 uppercase tracking-tighter"
				>
					{noteCopied ? "Copied" : "Copy Note"}
				</button>
				<button
					onclick={goBackToPeek}
					class="mt-3 w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase hover:bg-slate-200 transition-all tracking-tighter"
				>
					Back
				</button>
			</div>
		{:else if view === "image" && imagePreviewUrl}
			<div
				class="bg-white rounded-2xl shadow-xl p-6 md:p-8 w-full max-w-2xl mx-auto"
			>
				<h2
					class="text-xl font-black mb-2 text-slate-800 uppercase tracking-tighter"
				>
					Image Preview
				</h2>
				<p class="text-xs font-black uppercase text-slate-400 mb-5">
					Image transfer {peekedCode}
				</p>

				<div class="bg-slate-100 rounded-2xl p-3">
					<img
						src={imagePreviewUrl}
						alt={fileMeta?.filename || "Clipboard image preview"}
						class="max-h-[70vh] w-full object-contain rounded-xl"
					/>
				</div>

				<button
					onclick={goBackToPeek}
					class="mt-5 w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase hover:bg-slate-200 transition-all tracking-tighter"
				>
					Back
				</button>
			</div>
		{/if}
		</div>
	</main>

	<!-- Background watermark icon -->
	<div
		class="fixed bottom-0 left-1/2 -translate-x-1/2 opacity-[0.03] -z-10 pointer-events-none"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="600"
			height="600"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="17 8 12 3 7 8" />
			<line x1="12" y1="3" x2="12" y2="15" />
		</svg>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}
</style>
