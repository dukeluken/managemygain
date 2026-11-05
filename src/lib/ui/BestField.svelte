<script lang="ts">
	// Bestwert für eine Übung eingeben: direkt als Maximum (1 Wdh.) oder über den
	// Rechner aus Gewicht × Wiederholungen. Leer = unbekannt.
	import { e1rm, kg } from '#lib/engine/index.ts';

	let {
		id,
		label,
		value = $bindable<number | null>(null)
	}: { id: string; label: string; value?: number | null } = $props();

	let text = $state(value != null ? kg(value) : '');
	let calc = $state(false);
	let cw = $state('');
	let cr = $state('5');

	const parse = (v: string) => {
		const n = Number(v.replace(',', '.'));
		return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
	};

	function fromText() {
		const n = parse(text);
		value = n != null && n <= 600 ? n : null;
	}

	// Rechner: Wiederholungen „sauber geschafft“ ≈ RPE 9 (eine Wiederholung Luft).
	const estimate = $derived.by(() => {
		const w = parse(cw);
		const r = Number.parseInt(cr, 10);
		if (!w || !(r >= 1 && r <= 12)) return null;
		const est = e1rm(w, r, 9);
		return est ? Math.round(est / 2.5) * 2.5 : null;
	});

	function takeEstimate() {
		if (estimate == null) return;
		value = estimate;
		text = kg(estimate);
		calc = false;
	}
</script>

<div class="best">
	<label class="row" for="{id}-max">
		<span class="name">{label}</span>
		<span class="input">
			<input
				id="{id}-max"
				class="display num"
				inputmode="decimal"
				placeholder="–"
				autocomplete="off"
				bind:value={text}
				oninput={fromText}
			/>
			<small>kg</small>
		</span>
	</label>
	{#if calc}
		<div class="calc">
			<span class="muted">Ich schaffe sauber</span>
			<input id="{id}-cw" inputmode="decimal" placeholder="kg" bind:value={cw} aria-label="Gewicht in kg" />
			<span class="muted">kg ×</span>
			<input id="{id}-cr" inputmode="numeric" bind:value={cr} aria-label="Wiederholungen" />
			<button class="take" disabled={estimate == null} onclick={takeEstimate}>
				{estimate != null ? `≈ ${kg(estimate)} kg übernehmen` : 'Werte eingeben'}
			</button>
		</div>
	{:else}
		<button class="link" onclick={() => (calc = true)}>Maximum unbekannt? Schätzen lassen</button>
	{/if}
</div>

<style>
	.best {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 0;
		border-bottom: 1px solid var(--sf2);
	}
	.best:last-child {
		border: 0;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.name {
		font-weight: 600;
	}
	.input {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.input input {
		width: 4.4ch;
		text-align: right;
		font-size: 34px;
		background: var(--sf2);
		border: 0;
		border-radius: 12px;
		padding: 4px 10px;
		color: var(--ac-ink);
	}
	.input input::placeholder {
		color: var(--mu);
		opacity: 0.6;
	}
	.input input:focus {
		outline: 2px solid var(--ac);
		outline-offset: 0;
	}
	.input small {
		color: var(--mu);
	}
	.link {
		align-self: flex-start;
		text-align: left;
		font-size: 13px;
		color: var(--mu);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.calc {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}
	.calc input {
		width: 4.5em;
		padding: 8px 10px;
		border-radius: 10px;
		border: 0;
		background: var(--sf2);
		font-variant-numeric: tabular-nums;
	}
	.take {
		padding: 9px 14px;
		border-radius: 999px;
		background: var(--ac);
		color: var(--on-ac);
		font-weight: 600;
		font-size: 13px;
	}
	.take:disabled {
		background: var(--sf2);
		color: var(--mu);
	}
</style>
