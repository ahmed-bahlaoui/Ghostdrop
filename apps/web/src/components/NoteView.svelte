<script lang="ts">
	import { state, goBackToPeek } from "../lib/state.svelte.js";

	async function handleCopyNote() {
		try {
			await navigator.clipboard.writeText(state.noteContent);
			state.noteCopied = true;
		} catch (err: unknown) {
			console.error("Note copy error:", err);
			state.status = {
				type: "error",
				message: "Could not copy note to clipboard",
			};
		}
	}
</script>

<div class="bg-white rounded-2xl shadow-xl p-6 md:p-8 w-full max-w-2xl mx-auto">
	<h2 class="text-xl font-black mb-2 text-slate-800 uppercase tracking-tighter">
		Ghost Note
	</h2>
	<p class="text-xs font-black uppercase text-slate-400 mb-5">
		Text transfer {state.peekedCode}
	</p>

	<textarea
		readonly
		value={state.noteContent}
		class="w-full min-h-72 bg-slate-100 text-slate-800 rounded-2xl p-4 outline-none font-mono text-sm leading-6 resize-y whitespace-pre-wrap"
	></textarea>

	<button
		onclick={handleCopyNote}
		class="mt-5 w-full py-5 bg-rose-500 text-white rounded-2xl font-black text-xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 active:bg-rose-700 uppercase tracking-tighter"
	>
		{state.noteCopied ? "Copied" : "Copy Note"}
	</button>
	<button
		onclick={goBackToPeek}
		class="mt-3 w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase hover:bg-slate-200 transition-all tracking-tighter"
	>
		Back
	</button>
</div>
