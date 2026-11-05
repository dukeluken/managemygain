<script lang="ts">
	// Bottom Sheet aus Glas: fährt von unten ein, schließt mit Hintergrund-Tipp oder Escape.
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		onclose,
		children
	}: { title: string; onclose: () => void; children: Snippet } = $props();

	const id = `sheet-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
	<header>
		<h2 {id}>{title}</h2>
		<button class="close" onclick={onclose} aria-label="Schließen"><Icon name="close" size={18} /></button>
	</header>
	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgb(0 0 0 / 0.45);
		animation: fade 0.2s ease-out;
	}
	.sheet {
		position: fixed;
		z-index: 41;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 560px;
		max-height: 88dvh;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		border-radius: 28px 28px 0 0;
		background: color-mix(in srgb, var(--sf) 86%, transparent);
		-webkit-backdrop-filter: blur(24px) saturate(1.4);
		backdrop-filter: blur(24px) saturate(1.4);
		box-shadow: var(--glass-edge);
		padding-bottom: env(safe-area-inset-bottom, 0px);
		animation: rise 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 18px max(20px, env(safe-area-inset-left, 0px)) 8px max(20px, env(safe-area-inset-right, 0px));
	}
	h2 {
		margin: 0;
		font-size: 19px;
		font-weight: 650;
		text-wrap: balance;
	}
	.close {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
		flex: none;
	}
	.content {
		overflow-y: auto;
		padding: 8px max(20px, env(safe-area-inset-left, 0px)) 20px max(20px, env(safe-area-inset-right, 0px));
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@keyframes rise {
		from {
			transform: translateY(40px);
			opacity: 0;
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
