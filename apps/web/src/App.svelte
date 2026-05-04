<script lang="ts">
	let selectedFile = $state<File | null>(null);
	let receiveCode = $state("");
	let status = $state<{
		type: "idle" | "loading" | "success" | "error";
		message: string;
		code?: string;
	}>({ type: "idle", message: "" });

	let fileInput: HTMLInputElement;

	// --- CONFIGURATION ---
	const API_OVERRIDE = ""; 

	const getApiUrl = () => {
		if (typeof window === "undefined") return "http://localhost:3100";
		const params = new URLSearchParams(window.location.search);
		const paramApi = params.get("api");
		if (paramApi) return paramApi;
		if (API_OVERRIDE) return API_OVERRIDE;
		return `http://${window.location.hostname}:3100`;
	};

	const API_URL = getApiUrl();
	
	// Localtunnel/Ngrok bypass header
	const headers = {
		"Bypass-Tunnel-Reminder": "true"
	};
	// ---------------------

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			selectedFile = file;
			status = { type: "idle", message: "" };
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
					"Content-Type": "application/json" 
				},
				body: JSON.stringify({
					filename: selectedFile.name,
					size: selectedFile.size,
					mimeType: selectedFile.type || "application/octet-stream",
				}),
			});

			if (!handshakeRes.ok) {
				const err = await handshakeRes.json();
				throw new Error(err.error || "Handshake failed");
			}

			const { code } = await handshakeRes.json();
			status = { type: "loading", message: `Uploading ${selectedFile.name}...` };

			// 2. Binary Stream
			const formData = new FormData();
			formData.append("file", selectedFile);

			const uploadRes = await fetch(`${API_URL}/transfers/${code}/upload`, {
				method: "POST",
				headers: headers, // Bypass tunnel reminder for upload too
				body: formData,
			});

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
		} catch (err: any) {
			console.error("Upload error:", err);
			status = { type: "error", message: err.message };
		}
	}

	async function handleDownload() {
		if (!receiveCode) return;

		status = { type: "loading", message: "Locating file..." };

		try {
			const cleanCode = receiveCode.trim().toUpperCase();
			// 1. Peek Metadata
			const metaRes = await fetch(`${API_URL}/transfers/${cleanCode}`, {
				headers: headers
			});
			if (!metaRes.ok) {
				const err = await metaRes.json();
				throw new Error(err.error || "File not found");
			}

			status = { type: "success", message: "Download starting..." };

			// 2. Trigger Binary Stream Download
			window.location.assign(`${API_URL}/transfers/${cleanCode}/download`);

			receiveCode = "";
		} catch (err: any) {
			console.error("Download error:", err);
			status = { type: "error", message: err.message };
		}
	}
</script>

<div class="min-h-screen w-screen bg-slate-200 text-slate-900 font-sans selection:bg-rose-100 flex flex-col">
	<!-- Navbar -->
	<header class="flex h-16 w-full items-center justify-between bg-white px-6 md:px-8 shadow-sm shrink-0">
		<div class="flex items-center gap-2">
			<div class="h-8 w-8 rounded-full bg-rose-500 flex items-center justify-center text-white font-bold text-xl">
				G
			</div>
			<span class="text-xl font-bold tracking-tight text-slate-800 uppercase">
				ghostdrop
			</span>
		</div>

		<nav class="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
			<a href="/" class="text-rose-600 border-b-2 border-rose-600 pb-1">Transfer</a>
			<a href="/" class="hover:text-rose-600 transition-colors">Product</a>
			<a href="/" class="hover:text-rose-600 transition-colors">Pricing</a>
			<a href="/" class="hover:text-rose-600 transition-colors">Download</a>
		</nav>

		<div class="flex items-center gap-4 text-sm font-medium">
			<button class="flex items-center gap-1 hover:text-rose-600 transition-colors font-bold text-rose-500 uppercase">
				Sign in
			</button>
		</div>
	</header>

	<main class="flex-1 flex flex-col items-center justify-start p-4 md:p-12 overflow-y-auto">
		<div class="flex flex-col gap-6 w-full max-w-[400px]">
			
			<!-- Connection Badge -->
			<div class="flex justify-between items-center px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
				<span>API CONNECTION</span>
				<span class="text-rose-500">{API_URL.replace('http://', '').replace('https://', '')}</span>
			</div>

			<!-- Status Message -->
			{#if status.type !== "idle"}
				<div class="p-4 rounded-2xl flex flex-col gap-2 transition-all border {
					status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 
					status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
					'bg-blue-50 text-blue-700 border-blue-100'
				}">
					<p class="font-bold uppercase text-xs tracking-widest">{status.message}</p>
					{#if status.code}
						<div class="mt-2 p-4 bg-white rounded-xl border border-emerald-200 text-center shadow-sm">
							<p class="text-[10px] uppercase text-slate-400 font-black mb-1">Your Transfer Code</p>
							<p class="text-4xl font-mono font-black tracking-[0.2em] text-rose-600 select-all">{status.code}</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Send Card -->
			<div class="bg-white rounded-2xl shadow-xl p-6 md:p-8 transition-all active:scale-[0.99]">
				<h2 class="text-xl font-black mb-6 text-slate-800 uppercase tracking-tighter">Send File</h2>

				<div class="relative group overflow-hidden">
					<input
						type="file"
						bind:this={fileInput}
						onchange={handleFileSelect}
						class="absolute inset-0 opacity-0 z-20 cursor-pointer"
					/>
					<div class="w-full aspect-square rounded-2xl border-4 border-dashed flex flex-col items-center justify-center transition-all {
						selectedFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100 bg-slate-50 group-active:bg-rose-50'
					}">
						<div class={selectedFile ? "text-emerald-500" : "text-rose-500"}>
							{#if selectedFile}
								<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
									<path d="M20 6L9 17l-5-5"/>
								</svg>
							{:else}
								<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
									<line x1="12" y1="5" x2="12" y2="19" />
									<line x1="5" y1="12" x2="19" y2="12" />
								</svg>
							{/if}
						</div>
						<p class="mt-4 text-xs font-black uppercase text-center px-4 break-all {selectedFile ? 'text-emerald-700' : 'text-slate-400'}">
							{selectedFile ? selectedFile.name : "Tap here to choose"}
						</p>
					</div>
				</div>

				{#if selectedFile && status.type !== "loading"}
					<button
						onclick={handleUpload}
						class="mt-6 w-full py-5 bg-rose-500 text-white rounded-2xl font-black text-xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 active:bg-rose-700 uppercase tracking-tighter"
					>
						Send Now
					</button>
				{/if}
			</div>

			<!-- Receive Card -->
			<div class="bg-white rounded-2xl shadow-xl p-6 md:p-8 transition-all">
				<h2 class="text-xl font-black mb-6 text-slate-800 uppercase tracking-tighter">Receive File</h2>

				<div class="flex flex-col gap-4">
					<input
						type="text"
						bind:value={receiveCode}
						onkeydown={(e) => e.key === "Enter" && handleDownload()}
						placeholder="ENTER 6-DIGIT CODE"
						class="w-full bg-slate-100 py-5 px-4 rounded-2xl outline-none focus:ring-4 focus:ring-rose-100 text-2xl font-mono font-black text-center placeholder:text-slate-300 uppercase tracking-widest transition-all"
					/>
					<button
						onclick={handleDownload}
						disabled={!receiveCode.trim() || status.type === "loading"}
						class="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xl disabled:opacity-20 active:bg-black transition-all uppercase tracking-tighter"
					>
						Download
					</button>
				</div>
			</div>
		</div>
	</main>

	<!-- Background watermark icon -->
	<div class="fixed bottom-0 left-1/2 -translate-x-1/2 opacity-[0.03] -z-10 pointer-events-none">
		<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
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
