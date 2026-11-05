<script lang="ts">
	// Übung auswählen: Suche, Vorschläge aus derselben Gruppe oben, sonst nach Gruppen.
	import type { CatalogItem } from '#lib/engine/index.ts';
	import Icon from './Icon.svelte';

	let {
		catalog,
		suggestGroup = null,
		onpick
	}: { catalog: CatalogItem[]; suggestGroup?: string | null; onpick: (item: CatalogItem) => void } = $props();

	let q = $state('');
	const norm = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '');

	const filtered = $derived(q.trim() ? catalog.filter((c) => norm(c.name).includes(norm(q.trim()))) : catalog);
	const groups = $derived.by(() => {
		const map = new Map<string, CatalogItem[]>();
		for (const item of filtered) {
			const key = item.group;
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(item);
		}
		const list = [...map.entries()];
		// Passende Gruppe zuerst.
		list.sort(([a], [b]) => (a === suggestGroup ? -1 : b === suggestGroup ? 1 : 0));
		return list;
	});
	const exact = $derived(catalog.some((c) => norm(c.name) === norm(q.trim())));

	function custom() {
		const name = q.trim().slice(0, 60);
		if (name) onpick({ name, group: 'Eigene', category: 'custom' });
	}
</script>

<label class="search tile">
	<Icon name="search" size={18} />
	<input id="exercise-search" placeholder="Übung suchen" bind:value={q} autocomplete="off" />
</label>

{#if q.trim() && !exact}
	<button class="item own" onclick={custom}>
		<span>„{q.trim()}“ als eigene Übung</span><Icon name="plus" size={18} />
	</button>
{/if}

{#each groups as [group, items] (group)}
	<section>
		<h3>{group}{group === suggestGroup ? ' · passend' : ''}</h3>
		<div class="tile list">
			{#each items as item (item.name)}
				<button class="item" onclick={() => onpick(item)}>{item.name}</button>
			{/each}
		</div>
	</section>
{/each}

{#if !groups.length}
	<p class="muted">Keine Übung gefunden. Du kannst sie oben als eigene Übung anlegen.</p>
{/if}

<style>
	.search {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 16px;
		border-radius: 999px;
		color: var(--mu);
		background: var(--sf);
	}
	.search input {
		flex: 1;
		border: 0;
		background: transparent;
		padding: 14px 0;
		font-size: 16px;
		color: var(--tx);
	}
	.search input:focus {
		outline: none;
	}
	h3 {
		margin: 0 0 8px;
		font-size: 12px;
		font-weight: 500;
		color: var(--mu);
	}
	.list {
		padding: 2px 16px;
		background: var(--sf);
	}
	.item {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 13px 0;
		text-align: left;
		border-bottom: 1px solid var(--sf2);
	}
	.list > :last-child {
		border: 0;
	}
	.own {
		padding: 14px 16px;
		border: 0;
		border-radius: 16px;
		background: var(--ac);
		color: var(--on-ac);
		font-weight: 600;
	}
</style>
