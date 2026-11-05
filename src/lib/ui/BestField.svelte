<script lang="ts">
	// Bestwert für eine Übung eingeben: direkt als Maximum (1 Wdh.) oder über den
	// Rechner aus Gewicht × Wiederholungen. Gewichte über das Tastenfeld. Leer = unbekannt.
	import { e1rm, kg } from '#lib/engine/index.ts';
	import Icon from './Icon.svelte';
	import Keypad from './Keypad.svelte';

	let {
		id,
		label,
		value = $bindable<number | null>(null)
	}: { id: string; label: string; value?: number | null } = $props();

	let calc = $state(false);
	let calcWeight = $state<number | null>(null);
	let calcReps = $state(5);
	let keypad = $state<'max' | 'calc' | null>(null);

	// Rechner: Wiederholungen „sauber geschafft“ ≈ RPE 9 (eine Wiederholung Luft).
	const estimate = $derived.by(() => {
		if (!calcWeight) return null;
		const est = e1rm(calcWeight, calcReps, 9);
		return est ? Math.round(est / 2.5) * 2.5 : null;
	});

	function takeEstimate() {
		if (estimate == null) return;
		value = estimate;
		calc = false;
	}

	function confirm(v: number | null) {
		if (keypad === 'max') value = v != null && v <= 600 ? v : null;
		else calcWeight = v;
		keypad = null;
	}
</script>

<div class="best">
	<div class="row">
		<span class="name">{label}</span>
		<button id="{id}-max" class="value" onclick={() => (keypad = 'max')} aria-label="{label}: Bestwert eingeben">
			<span class="display num" class:empty={value == null}>{value != null ? kg(value) : '–'}</span>
			<small>kg</small>
		</button>
	</div>
	{#if calc}
		<div class="calc">
			<span class="muted">Ich schaffe sauber</span>
			<button id="{id}-cw" class="chip num" onclick={() => (keypad = 'calc')} aria-label="Gewicht für den Rechner">
				{calcWeight != null ? kg(calcWeight) : '–'} kg
			</button>
			<span class="muted">×</span>
			<span class="reps">
				<button onclick={() => (calcReps = Math.max(1, calcReps - 1))} aria-label="Eine Wiederholung weniger"
					><Icon name="minus" size={16} /></button
				>
				<b id="{id}-cr" class="num">{calcReps}</b>
				<button onclick={() => (calcReps = Math.min(12, calcReps + 1))} aria-label="Eine Wiederholung mehr"
					><Icon name="plus" size={16} /></button
				>
			</span>
			<button class="take" disabled={estimate == null} onclick={takeEstimate}>
				{estimate != null ? `≈ ${kg(estimate)} kg übernehmen` : 'Gewicht eingeben'}
			</button>
		</div>
	{:else}
		<button class="link" onclick={() => (calc = true)}>Maximum unbekannt? Schätzen lassen</button>
	{/if}
</div>

{#if keypad}
	<Keypad
		title={keypad === 'max' ? `${label} · Maximum (1 Wdh.)` : `${label} · Gewicht für ${calcReps} Wdh.`}
		value={keypad === 'max' ? value : calcWeight}
		allowClear={keypad === 'max'}
		clearLabel="Unbekannt"
		onconfirm={confirm}
		oncancel={() => (keypad = null)}
	/>
{/if}

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
	.value {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 4px 12px;
		border-radius: 12px;
		background: var(--sf2);
	}
	.value .display {
		font-size: 34px;
		color: var(--ac-ink);
		min-width: 2.4ch;
		text-align: right;
	}
	.value .display.empty {
		color: var(--mu);
		opacity: 0.6;
	}
	.value small {
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
	.chip {
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--sf2);
		font-weight: 600;
	}
	.reps {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.reps button {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
	}
	.reps b {
		min-width: 2ch;
		text-align: center;
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
