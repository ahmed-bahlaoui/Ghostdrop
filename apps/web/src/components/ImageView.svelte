<script lang="ts">
import { goBackToPeek, state } from "../lib/state.svelte.js";
</script>

{#if state.imagePreviewUrl}
	<div class="bg-white rounded-2xl shadow-xl p-6 md:p-8 w-full max-w-2xl mx-auto">
		<h2 class="text-xl font-black mb-2 text-slate-800 uppercase tracking-tighter">
			Image Preview
		</h2>
		<p class="text-xs font-black uppercase text-slate-400 mb-5">
			Image transfer {state.peekedCode}
		</p>

		<div class="bg-slate-100 rounded-2xl p-3">
			<img
				src={state.imagePreviewUrl}
				alt={state.fileMeta?.filename || "Clipboard image preview"}
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
