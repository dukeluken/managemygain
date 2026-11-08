// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		/** Zustand für Shallow Routing: im Training die geöffnete Übung. */
		interface PageState {
			exercise?: number;
		}
	}
}

export {};
