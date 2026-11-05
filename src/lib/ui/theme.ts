import type { ThemePref } from '#lib/data/types.ts';

const KEY = 'mmg-theme';

export function getThemePref(): ThemePref {
	try {
		const value = localStorage.getItem(KEY);
		if (value === 'light' || value === 'dark' || value === 'system') return value;
	} catch {
		/* Speicher blockiert */
	}
	return 'dark';
}

export function applyTheme(pref: ThemePref) {
	try {
		localStorage.setItem(KEY, pref);
	} catch {
		/* Speicher blockiert */
	}
	const light = pref === 'light' || (pref === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
	document.documentElement.dataset.theme = light ? 'light' : 'dark';
	const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}
