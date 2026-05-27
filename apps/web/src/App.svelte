<script lang="ts">
	import { handleWindowPaste } from "./lib/clipboard.js";
	import { loadSharedFileFromAndroid } from "./lib/share-target.js";
	import { API_URL, showApiConnectionBadge } from "./lib/api.js";
	import {
		state,
		initShareFragment,
		initAndroidShareTarget,
	} from "./lib/state.svelte.js";
	import SendCard from "./components/SendCard.svelte";
	import ReceiveCard from "./components/ReceiveCard.svelte";
	import PeekView from "./components/PeekView.svelte";
	import NoteView from "./components/NoteView.svelte";
	import ImageView from "./components/ImageView.svelte";

	$effect(() => {
		initShareFragment();
	});

	$effect(() => {
		if (typeof document === "undefined") return;
		const robots = document.querySelector('meta[name="robots"]');
		if (!robots) return;
		robots.setAttribute(
			"content",
			state.view === "main" ? "index, follow" : "noindex, nofollow",
		);
	});

	$effect(() => {
		initAndroidShareTarget(loadSharedFileFromAndroid);
	});

	async function copyShareValue(value: string, kind: "link" | "key") {
		try {
			await navigator.clipboard.writeText(value);
			if (kind === "link") {
				state.copiedShareLink = true;
				setTimeout(() => (state.copiedShareLink = false), 1800);
				return;
			}
			state.copiedShareKey = true;
			setTimeout(() => (state.copiedShareKey = false), 1800);
		} catch (err: unknown) {
			console.error("Share copy error:", err);
			state.status = {
				type: "error",
				message: "Could not copy to clipboard",
			};
		}
	}
</script>

<svelte:window onpaste={handleWindowPaste} />

<div class="min-h-screen w-screen bg-slate-200 text-slate-900 font-sans selection:bg-rose-100 flex flex-col">
	<header class="flex h-16 w-full items-center bg-white px-6 md:px-8 shadow-sm shrink-0">
		<div class="flex items-center gap-2">
			<div class="h-8 w-8 rounded-full bg-rose-500 flex items-center justify-center text-white font-bold text-xl">
				G
			</div>
			<span class="text-xl font-bold tracking-tight text-slate-800">
				GhostDrop
			</span>
			<span class="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
				Added E2EE
			</span>
		</div>
	</header>

	<main class="flex-1 flex flex-col items-center justify-start p-4 md:p-12 overflow-y-auto">
		<div class="flex flex-col gap-6 w-full max-w-5xl">
			{#if showApiConnectionBadge}
				<div class="flex justify-between items-center px-1 text-[10px] font-black uppercase tracking-widest text-slate-400" aria-hidden="true">
					<span>API CONNECTION</span>
					<span class="text-rose-500">{API_URL.replace("http://", "").replace("https://", "")}</span>
				</div>
			{/if}

			<!-- Status Banner -->
			{#if state.status.type !== "idle"}
				<div class="p-4 rounded-2xl flex flex-col gap-2 transition-all border {state.status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : state.status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}">
					<p class="font-bold uppercase text-xs tracking-widest">{state.status.message}</p>
					{#if state.status.code}
						<div class="mt-2 p-4 bg-white rounded-xl border border-emerald-200 text-center shadow-sm">
							<p class="text-[10px] uppercase text-slate-400 font-black mb-1">Your Transfer Code</p>
							<p class="text-4xl font-mono font-black tracking-[0.2em] text-rose-600 select-all">{state.status.code}</p>
							{#if state.shareLink}
								<p class="mt-4 text-[10px] uppercase text-slate-400 font-black mb-1">Secure Share Link</p>
								<div class="flex items-stretch gap-2 rounded-xl bg-slate-100 p-2">
									<p class="min-w-0 flex-1 p-1 text-left text-xs font-mono text-slate-700 break-all select-all">{state.shareLink}</p>
									<button
										type="button"
										onclick={() => copyShareValue(state.shareLink, "link")}
										title="Copy secure share link"
										aria-label="Copy secure share link"
										class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm transition-all hover:text-rose-500 active:bg-slate-200"
									>
										{#if state.copiedShareLink}
											<span class="text-xs font-black text-emerald-600">OK</span>
										{:else}
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
												<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
											</svg>
										{/if}
									</button>
								</div>
							{/if}
							{#if state.shareKey}
								<p class="mt-4 text-[10px] uppercase text-slate-400 font-black mb-1">Decryption Key</p>
								<div class="flex items-stretch gap-2 rounded-xl bg-slate-100 p-2">
									<p class="min-w-0 flex-1 p-1 text-left text-xs font-mono text-slate-700 break-all select-all">{state.shareKey}</p>
									<button
										type="button"
										onclick={() => copyShareValue(state.shareKey, "key")}
										title="Copy decryption key"
										aria-label="Copy decryption key"
										class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm transition-all hover:text-rose-500 active:bg-slate-200"
									>
										{#if state.copiedShareKey}
											<span class="text-xs font-black text-emerald-600">OK</span>
										{:else}
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
												<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
											</svg>
										{/if}
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			{#if state.view === "main"}
				<section class="text-center px-2">
					<h1 class="text-2xl md:text-3xl font-black tracking-tight text-slate-800">
						Anonymous temporary file sharing
					</h1>
					<p class="mt-2 text-sm md:text-base text-slate-600 max-w-xl mx-auto">
						Upload a file, share a short code, and let anyone download it &mdash;
						encrypted in the browser, no account required.
					</p>
				</section>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
					<SendCard />
					<ReceiveCard />
				</div>
			{:else if state.view === "peek"}
				<PeekView />
			{:else if state.view === "note"}
				<NoteView />
			{:else if state.view === "image"}
				<ImageView />
			{/if}
		</div>
	</main>

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
