<script lang="ts">
	import { decryptFile, encryptFile } from "./lib/crypto.js";

	type TransferMetadata = {
		filename: string;
		size: number;
		originalSize: number | null;
		mimeType: string;
		downloadCount: number;
		maxDownloads: number;
		expiresAt: string;
		encryption: {
			algorithm: "none" | "AES-GCM-256";
			iv: string | null;
		};
	};

	let selectedFile = $state<File | null>(null);
	let receiveCode = $state("");
	let receiveKey = $state("");
	let peekedCode = $state("");
	let shareLink = $state("");
	let shareKey = $state("");
	let copiedShareLink = $state(false);
	let copiedShareKey = $state(false);
	let endToEndEncryption = $state(false);
	let expiresInMinutes = $state(60);
	let maxDownloads = $state(1);
	let view = $state<"main" | "peek" | "note" | "image">("main");
	let noteContent = $state("");
	let noteCopied = $state(false);
	let imagePreviewUrl = $state("");
	let fileMeta = $state<TransferMetadata | null>(null);
	let status = $state<{
		type: "idle" | "loading" | "success" | "error";
		message: string;
		code?: string;
	}>({ type: "idle", message: "" });

	let fileInput = $state<HTMLInputElement>();
	let parsedShareFragment = false;

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
	const transferCodeLength = 6;

	// --- CONFIGURATION ---
	const API_OVERRIDE = import.meta.env.VITE_API_URL ?? "";

	const getApiUrl = () => {
		if (typeof window === "undefined") return "http://localhost:3100";

		const params = new URLSearchParams(window.location.search);
		const paramApi = params.get("api");
		if (paramApi) return paramApi;
		if (API_OVERRIDE) return API_OVERRIDE;

		return "/api";
	};

	const API_URL = getApiUrl();

	$effect(() => {
		if (parsedShareFragment || typeof window === "undefined") return;

		parsedShareFragment = true;
		const fragment = window.location.hash.replace(/^#\/?/, "");
		const params = new URLSearchParams(fragment);
		const transfer = params.get("transfer");
		const key = params.get("key");

		if (transfer) receiveCode = formatTransferCode(transfer);
		if (key) receiveKey = key;
	});

	// Localtunnel/Ngrok bypass header
	const headers = {
		"Bypass-Tunnel-Reminder": "true",
	};
	// ---------------------

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			selectFile(file);
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

	function selectFile(file: File) {
		selectedFile = file;
		noteContent = "";
		shareLink = "";
		shareKey = "";
		copiedShareLink = false;
		copiedShareKey = false;
		revokeImagePreviewUrl();
		status = { type: "idle", message: "" };
		if (fileInput) fileInput.value = "";
	}

	function selectClipboardImage(blob: Blob, mimeType: string) {
		selectFile(
			new File([blob], getImageFilename(mimeType), {
				type: mimeType,
			}),
		);
	}

	function selectClipboardText(text: string) {
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

	function handleWindowPaste(event: ClipboardEvent) {
		if (view !== "main" || status.type === "loading" || shouldIgnorePaste(event)) {
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
						selectClipboardImage(blob, imageType);
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

			selectClipboardText(text);
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

		status = {
			type: "loading",
			message: endToEndEncryption
				? "Encrypting file..."
				: "Initializing transfer...",
		};

		try {
			const encrypted = endToEndEncryption
				? await encryptFile(selectedFile)
				: null;

			status = { type: "loading", message: "Initializing transfer..." };
			const uploadFile = encrypted?.file ?? selectedFile;

			// 1. Handshake
			const handshakeRes = await fetch(`${API_URL}/transfers`, {
				method: "POST",
				headers: {
					...headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					filename: selectedFile.name,
					size: uploadFile.size,
					originalSize: encrypted?.originalSize,
					mimeType: selectedFile.type || "application/octet-stream",
					encryptionAlgorithm: encrypted?.algorithm ?? "none",
					encryptionIv: encrypted?.ivBase64Url ?? null,
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
			formData.append("file", uploadFile);

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

			shareKey = encrypted?.keyBase64Url ?? "";
			shareLink = encrypted
				? buildEncryptedShareLink(code, encrypted.keyBase64Url)
				: "";
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
		if (!hasCompleteReceiveCode()) return;

		status = { type: "loading", message: "Fetching metadata..." };
		fileMeta = null;

		try {
			const cleanCode = normalizeReceiveCode();
			const metaRes = await fetch(`${API_URL}/transfers/${cleanCode}`, {
				headers: headers,
			});
			if (!metaRes.ok) {
				const err = await metaRes.json();
				throw new Error(err.error || "File not found");
			}

			const meta = await metaRes.json();
			fileMeta = normalizeTransferMetadata(meta);
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
		if (!hasCompleteReceiveCode()) return;

		status = { type: "loading", message: "Download starting..." };

		try {
			const cleanCode = normalizeReceiveCode();
			const meta = await getTransferMetadata(cleanCode);
			await downloadTransfer(cleanCode, meta);
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
			await downloadTransfer(peekedCode, fileMeta);
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

	async function downloadTransfer(code: string, meta?: TransferMetadata | null) {
		const transferMeta = meta ?? (await getTransferMetadata(code));
		const res = await fetch(`${API_URL}/transfers/${code}/download`, {
			headers: headers,
		});

		if (!res.ok) {
			const err = await res.json().catch(() => null);
			throw new Error(err?.error || "Download failed");
		}

		const blob = await res.blob();
		const file = await decryptTransferBlob(blob, transferMeta);
		const url = URL.createObjectURL(file);
		const link = document.createElement("a");
		link.href = url;
		link.download = file.name || `ghostdrop-${code}`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	async function getTransferMetadata(code: string): Promise<TransferMetadata> {
		const metaRes = await fetch(`${API_URL}/transfers/${code}`, {
			headers: headers,
		});

		if (!metaRes.ok) {
			const err = await metaRes.json().catch(() => null);
			throw new Error(err?.error || "File metadata could not be loaded");
		}

		const meta = await metaRes.json();
		return normalizeTransferMetadata(meta);
	}

	function normalizeTransferMetadata(meta: unknown): TransferMetadata {
		const value = meta as Partial<TransferMetadata>;
		const encryption = value.encryption ?? {
			algorithm: "none",
			iv: null,
		};

		return {
			filename: String(value.filename ?? ""),
			size: Number(value.size ?? 0),
			originalSize:
				value.originalSize === null || value.originalSize === undefined
					? null
					: Number(value.originalSize),
			mimeType: String(value.mimeType ?? "application/octet-stream"),
			downloadCount: Number(value.downloadCount ?? 0),
			maxDownloads: Number(value.maxDownloads ?? 1),
			expiresAt: String(value.expiresAt ?? ""),
			encryption: {
				algorithm:
					encryption.algorithm === "AES-GCM-256"
						? "AES-GCM-256"
						: "none",
				iv: encryption.iv ?? null,
			},
		};
	}

	async function decryptTransferBlob(
		encryptedBlob: Blob,
		meta: TransferMetadata,
	): Promise<File> {
		if (meta.encryption.algorithm === "none") {
			return new File([encryptedBlob], meta.filename, {
				type: meta.mimeType || "application/octet-stream",
			});
		}

		if (!meta.encryption.iv) {
			throw new Error("Transfer is missing encryption metadata");
		}

		const key = receiveKey.trim();
		if (!key) {
			throw new Error("Decryption key is required");
		}

		try {
			return await decryptFile({
				encryptedBlob,
				keyBase64Url: key,
				ivBase64Url: meta.encryption.iv,
				filename: meta.filename,
				mimeType: meta.mimeType,
			});
		} catch (err) {
			console.error("Decrypt error:", err);
			throw new Error("Could not decrypt file. Check the transfer key.", {
				cause: err,
			});
		}
	}

	function buildEncryptedShareLink(code: string, key: string): string {
		const baseUrl =
			typeof window === "undefined"
				? ""
				: `${window.location.origin}${window.location.pathname}`;
		const params = new URLSearchParams({ transfer: code, key });
		return `${baseUrl}#${params.toString()}`;
	}

	function stripTransferCode(value: string): string {
		return value
			.replace(/[^a-z0-9]/gi, "")
			.slice(0, transferCodeLength)
			.toUpperCase();
	}

	function formatTransferCode(value: string): string {
		const code = stripTransferCode(value);
		if (code.length <= 3) return code;
		return `${code.slice(0, 3)}-${code.slice(3)}`;
	}

	function normalizeReceiveCode(): string {
		return formatTransferCode(receiveCode);
	}

	function hasCompleteReceiveCode(): boolean {
		return stripTransferCode(receiveCode).length === transferCodeLength;
	}

	function receiveCodeCharacters(): string[] {
		const code = stripTransferCode(receiveCode);
		return Array.from(
			{ length: transferCodeLength },
			(_, index) => code[index] ?? "",
		);
	}

	function handleReceiveCodeInput(e: Event) {
		receiveCode = formatTransferCode((e.currentTarget as HTMLInputElement).value);
	}

	function handleReceiveCodeKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			handlePeek();
			return;
		}

		if (e.key.length === 1 && !/^[a-z0-9]$/i.test(e.key)) {
			e.preventDefault();
		}
	}

	async function handleViewNote() {
		if (!fileMeta) return;

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

			const encryptedBlob = await res.blob();
			const file = await decryptTransferBlob(encryptedBlob, fileMeta);
			noteContent = await file.text();
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
		if (!fileMeta) return;

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

			const encryptedBlob = await res.blob();
			const file = await decryptTransferBlob(encryptedBlob, fileMeta);
			imagePreviewUrl = URL.createObjectURL(file);
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

	async function copyShareValue(value: string, kind: "link" | "key") {
		try {
			await navigator.clipboard.writeText(value);
			if (kind === "link") {
				copiedShareLink = true;
				setTimeout(() => (copiedShareLink = false), 1800);
				return;
			}

			copiedShareKey = true;
			setTimeout(() => (copiedShareKey = false), 1800);
		} catch (err: unknown) {
			console.error("Share copy error:", err);
			status = {
				type: "error",
				message: "Could not copy to clipboard",
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
		receiveKey = "";
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

<svelte:window onpaste={handleWindowPaste} />

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
			<span
				class="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700"
			>
				Added E2EE
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
							{#if shareLink}
								<p
									class="mt-4 text-[10px] uppercase text-slate-400 font-black mb-1"
								>
									Secure Share Link
								</p>
								<div
									class="flex items-stretch gap-2 rounded-xl bg-slate-100 p-2"
								>
									<p
										class="min-w-0 flex-1 p-1 text-left text-xs font-mono text-slate-700 break-all select-all"
									>
										{shareLink}
									</p>
									<button
										type="button"
										onclick={() => copyShareValue(shareLink, "link")}
										title="Copy secure share link"
										aria-label="Copy secure share link"
										class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm transition-all hover:text-rose-500 active:bg-slate-200"
									>
										{#if copiedShareLink}
											<span class="text-xs font-black text-emerald-600"
												>OK</span
											>
										{:else}
											<svg
												width="18"
												height="18"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<rect
													x="9"
													y="9"
													width="13"
													height="13"
													rx="2"
													ry="2"
												/>
												<path
													d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
												/>
											</svg>
										{/if}
									</button>
								</div>
							{/if}
							{#if shareKey}
								<p
									class="mt-4 text-[10px] uppercase text-slate-400 font-black mb-1"
								>
									Decryption Key
								</p>
								<div
									class="flex items-stretch gap-2 rounded-xl bg-slate-100 p-2"
								>
									<p
										class="min-w-0 flex-1 p-1 text-left text-xs font-mono text-slate-700 break-all select-all"
									>
										{shareKey}
									</p>
									<button
										type="button"
										onclick={() => copyShareValue(shareKey, "key")}
										title="Copy decryption key"
										aria-label="Copy decryption key"
										class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm transition-all hover:text-rose-500 active:bg-slate-200"
									>
										{#if copiedShareKey}
											<span class="text-xs font-black text-emerald-600"
												>OK</span
											>
										{:else}
											<svg
												width="18"
												height="18"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<rect
													x="9"
													y="9"
													width="13"
													height="13"
													rx="2"
													ry="2"
												/>
												<path
													d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
												/>
											</svg>
										{/if}
									</button>
								</div>
							{/if}
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
							<label
								class="flex items-center justify-between gap-4 rounded-2xl bg-slate-100 p-4"
							>
								<span>
									<span
										class="block text-xs font-black uppercase text-slate-700"
									>
										End to end encryption
									</span>
									<span
										class="mt-1 block text-xs font-bold text-slate-400"
									>
										Requires secure link or key to open
									</span>
								</span>
								<input
									type="checkbox"
									bind:checked={endToEndEncryption}
									class="h-6 w-11 accent-rose-500"
								/>
							</label>

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
						<label class="relative block">
							<span class="sr-only">Enter transfer code</span>
							<input
								type="text"
								value={receiveCode}
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
										<span
											class="h-1 w-3 rounded-full bg-slate-300 sm:w-4"
										></span>
									{/if}
									<div
										class="flex h-12 min-w-0 items-center justify-center rounded-2xl border-2 bg-slate-50 text-xl font-black font-mono text-slate-800 shadow-inner transition-all sm:h-14 sm:text-2xl {character
											? 'border-slate-300'
											: 'border-slate-200'} peer-focus:border-rose-400 peer-focus:bg-white peer-focus:shadow-rose-100"
									>
										{character}
									</div>
								{/each}
							</div>
						</label>
						<input
							type="text"
							bind:value={receiveKey}
							onkeydown={(e) =>
								e.key === "Enter" && handlePeek()}
							placeholder="PASTE DECRYPTION KEY"
							class="w-full bg-slate-100 py-4 px-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 text-sm font-mono font-bold text-center placeholder:text-slate-300 transition-all"
						/>
						<div class="flex gap-3">
							<button
								onclick={handlePeek}
								disabled={!hasCompleteReceiveCode() ||
									status.type === "loading"}
								class="flex-1 py-5 bg-emerald-500 text-white rounded-2xl font-black text-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 active:bg-emerald-700 uppercase tracking-tighter"
							>
								Peek
							</button>
							<button
								onclick={handleDownload}
								disabled={!hasCompleteReceiveCode() ||
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
								{formatSize(fileMeta.originalSize ?? fileMeta.size)}
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
