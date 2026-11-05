<script lang="ts">
	import { page } from '$app/state';
	import Icon from './Icon.svelte';

	const items = [
		{ href: '/', label: 'Heute', icon: 'today' },
		{ href: '/plan', label: 'Plan', icon: 'plan' },
		{ href: '/community', label: 'Community', icon: 'community' },
		{ href: '/profil', label: 'Profil', icon: 'profile' }
	] as const;

	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<nav aria-label="Hauptnavigation">
	{#each items as item (item.href)}
		<a href={item.href} class:on={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}>
			<Icon name={item.icon} />
			<span>{item.label}</span>
		</a>
	{/each}
</nav>

<style>
	nav {
		position: fixed;
		z-index: 20;
		left: max(14px, env(safe-area-inset-left, 0px));
		right: max(14px, env(safe-area-inset-right, 0px));
		bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
		max-width: 520px;
		margin: 0 auto;
		display: flex;
		justify-content: space-around;
		padding: 10px 8px;
		border-radius: 24px;
		background: var(--glass-bar);
		color: var(--bar-tx);
		-webkit-backdrop-filter: blur(18px) saturate(1.5);
		backdrop-filter: blur(18px) saturate(1.5);
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.08),
			0 10px 24px -12px rgb(0 0 0 / 0.5);
	}

	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		min-width: 64px;
		padding: 2px 8px;
		font-size: 11px;
		text-decoration: none;
		opacity: 0.55;
		transition: opacity 0.2s;
	}

	a.on {
		opacity: 1;
	}

	a.on :global(svg) {
		stroke: var(--ac);
	}
</style>
