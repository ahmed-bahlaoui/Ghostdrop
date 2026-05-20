import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
	server: {
		port: 3000,
		strictPort: true,
		proxy: {
			"/api": {
				target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1",
				changeOrigin: true,
			},
		},
	},
	plugins: [svelte(), tailwindcss()],
});
