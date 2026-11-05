<script lang="ts">
	// Tastenfeld für Gewichte: Ziffern, Komma, Löschen und Schnelltasten ±1,25 / ±2,5 kg.
	// Die erste getippte Ziffer ersetzt den alten Wert, danach wird angehängt.
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		value = null,
		allowClear = false,
		onconfirm,
		oncancel
	}: {
		title: string;
		value?: number | null;
		/** Zeigt „Kein Gewicht“ an (für Übungen ohne Gewichtsvorgabe). */
		allowClear?: boolean;
		onconfirm: (value: number | null) => void;
		oncancel: () => void;
	} = $props();

	const format = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
	// Startwert beim Öffnen übernehmen; das Tastenfeld wird pro Eingabe neu geöffnet.
	let text = $state(untrack(() => (value != null ? format(value) : '')));
	let fresh = $state(true);

	const numeric = $derived(Number(text.replace(',', '.')));
	const valid = $derived(text !== '' && Number.isFinite(numeric) && numeric > 0 && numeric <= 1000);

	function key(k: string) {
		if (k === 'back') {
			text = fresh ? '' : text.slice(0, -1);
		} else if (k === ',') {
			if (fresh) text = '0,';
			else if (!text.includes(',')) text = text ? `${text},` : '0,';
		} else {
			const next = fresh ? k : `${text === '0' ? '' : text}${k}`;
			// Höchstens zwei Nachkommastellen und vier Vorkommastellen.
			if (/^\d{0,4}(,\d{0,2})?$/.test(next)) text = next;
		}
		fresh = false;
	}

	function step(delta: number) {
		const base = Number.isFinite(numeric) && text !== '' ? numeric : 0;
		text = format(Math.max(0, base + delta));
		fresh = false;
	}

	function confirm() {
		if (valid) onconfirm(Math.round(numeric * 100) / 100);
	}

	function onkeydown(e: KeyboardEvent) {
		if (/^\d$/.test(e.key)) key(e.key);
		else if (e.key === ',' || e.key === '.') key(',');
		else if (e.key === 'Backspace') key('back');
		else if (e.key === 'Enter') confirm();
		else if (e.key === 'Escape') oncancel();
		else return;
		e.preventDefault();
	}
</script>

<svelte:window {onkeydown} />

<div class="backdrop" role="presentation" onclick={oncancel}></div>
<div class="keypad" role="dialog" aria-modal="true" aria-label={title}>
	<div class="head">
		<span class="muted">{title}</span>
		<button class="close" onclick={oncancel} aria-label="Abbrechen"><Icon name="close" size={18} /></button>
	</div>
	<output class="display num" class:fresh aria-live="polite">{text || '0'}<small>kg</small></output>

	<div class="steps">
		<button onclick={() => step(-2.5)}>−2,5</button>
		<button onclick={() => step(-1.25)}>−1,25</button>
		<button onclick={() => step(1.25)}>+1,25</button>
		<button onclick={() => step(2.5)}>+2,5</button>
	</div>

	<div class="grid">
		{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'] as k (k)}
			<button class="k num" onclick={() => key(k)}>{k}</button>
		{/each}
		<button class="k" onclick={() => key('back')} aria-label="Löschen">⌫</button>
	</div>

	<div class="actions">
		{#if allowClear}
			<button class="ghost" onclick={() => onconfirm(null)}>Kein Gewicht</button>
		{/if}
		<button class="cta" onclick={confirm} disabled={!valid}><span>Übernehmen</span></button>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgb(0 0 0 / 0.5);
	}
	.keypad {
		position: fixed;
		z-index: 61;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 560px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px max(18px, env(safe-area-inset-left, 0px)) calc(env(safe-area-inset-bottom, 0px) + 16px)
			max(18px, env(safe-area-inset-right, 0px));
		border-radius: 28px 28px 0 0;
		background: color-mix(in srgb, var(--sf) 92%, transparent);
		-webkit-backdrop-filter: blur(24px) saturate(1.4);
		backdrop-filter: blur(24px) saturate(1.4);
		box-shadow: var(--glass-edge);
		animation: rise 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 14px;
	}
	.close {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
	}
	.display {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 8px;
		font-family: var(--f-num);
		font-stretch: 75%;
		font-weight: 750;
		font-size: 72px;
		line-height: 1;
		color: var(--ac-ink);
	}
	.display.fresh {
		opacity: 0.6;
	}
	.display small {
		font-family: var(--f-ui);
		font-stretch: 100%;
		font-weight: 500;
		font-size: 16px;
		color: var(--mu);
	}
	.steps {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}
	.steps button {
		padding: 11px 0;
		border-radius: 999px;
		background: var(--sf2);
		font-weight: 600;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}
	.k {
		padding: 14px 0;
		border-radius: 16px;
		font-size: 22px;
		font-weight: 600;
		background: color-mix(in srgb, var(--sf2) 55%, transparent);
	}
	.k:active,
	.steps button:active {
		background: var(--ac);
		color: var(--on-ac);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.actions .ghost {
		background: var(--sf2);
		box-shadow: none;
	}
	.actions .cta {
		flex: 1;
		justify-content: center;
	}
	@keyframes rise {
		from {
			transform: translateY(40px);
			opacity: 0;
		}
	}
</style>
