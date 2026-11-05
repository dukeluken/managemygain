import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			// Reine Client-App (SPA): alle Routen landen auf index.html.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	test: { include: ['tests/**/*.test.{js,ts}'] }
});
