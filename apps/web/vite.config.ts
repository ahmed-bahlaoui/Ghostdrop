import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
	server: {
		port: 3000,
		strictPort: true,
	},
	plugins: [svelte(), tailwindcss()],
});
