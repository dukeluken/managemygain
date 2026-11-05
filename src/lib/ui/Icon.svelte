<script lang="ts">
	type Name =
		| 'home'
		| 'edit'
		| 'trash'
		| 'swap'
		| 'up'
		| 'down'
		| 'search'
		| 'today' | 'plan' | 'community' | 'profile' | 'close' | 'back' | 'check' | 'plus' | 'minus' | 'chevron';
	let { name, size = 22 }: { name: Name; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
	{#if name === 'home'}
		<path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z" />
	{:else if name === 'edit'}
		<path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" />
	{:else if name === 'trash'}
		<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7" />
	{:else if name === 'swap'}
		<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
	{:else if name === 'up'}
		<path d="M6 14l6-6 6 6" />
	{:else if name === 'down'}
		<path d="M6 10l6 6 6-6" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
	{:else if name === 'today'}
		<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
	{:else if name === 'plan'}
		<rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
	{:else if name === 'community'}
		<circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.6c2.5.2 4.3 1.9 5 4.9" />
	{:else if name === 'profile'}
		<circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6L6 18" />
	{:else if name === 'back'}
		<path d="M15 5l-7 7 7 7" />
	{:else if name === 'check'}
		<path d="M5 12.5l4.5 4.5L19 7.5" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'minus'}
		<path d="M5 12h14" />
	{:else if name === 'chevron'}
		<path d="M9 5l7 7-7 7" />
	{/if}
</svg>

<style>
	svg {
		flex: none;
		stroke: currentColor;
		fill: none;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
