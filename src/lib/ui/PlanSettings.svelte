<script lang="ts">
	// Plan anpassen: Name, Namen der Trainingstage, Länge in Wochen.
	import { session } from '#lib/data/session.svelte.ts';
	import type { Plan } from '#lib/data/types.ts';
	import {
		WEEKDAY_SHORT,
		dayTitle,
		previewLength,
		renameDay,
		setPlanLength,
		weekCount,
		weekIndexAt
	} from '#lib/engine/index.ts';
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import Sheet from './Sheet.svelte';

	let { plan, onclose }: { plan: Plan; onclose: () => void } = $props();

	// Momentaufnahme beim Öffnen.
	const start = untrack(() => {
		const current = Math.max(0, weekIndexAt(plan, new Date()));
		// Feste Wochen: alles vor der aktuellen Woche, und die aktuelle, wenn darin schon trainiert wurde.
		const trainedNow = session.workouts.some((w) => w.weekIndex === current);
		const keep = Math.min(weekCount(plan.program), current + (trainedNow ? 1 : 0));
		return {
			name: plan.name,
			days: plan.program.days.map((d) => dayTitle(d)),
			weeks: weekCount(plan.program),
			keep,
			// Bereits begonnene Wochen können nicht weggekürzt werden.
			minWeeks: Math.max(4, keep + 1)
		};
	});

	let name = $state(start.name);
	let days = $state([...start.days]);
	let weeks = $state(start.weeks);

	const types = $derived(previewLength(plan.program, weeks, start.keep));
	const deloads = $derived(types.map((t, i) => (t === 'deload' ? i + 1 : 0)).filter(Boolean));
	const structureChanges = $derived(JSON.stringify(types) !== JSON.stringify(plan.program.weekTypes));
	const changed = $derived(
		structureChanges ||
		name.trim() !== start.name || weeks !== start.weeks || days.some((d, i) => d.trim() !== start.days[i])
	);

	function save() {
		session.updatePlan({
			name: name.trim() || start.name,
			change: (program) => {
				days.forEach((title, i) => {
					if (title.trim() !== start.days[i]) renameDay(program, i, title);
				});
				if (weeks !== start.weeks || structureChanges) setPlanLength(program, weeks, start.keep);
			}
		});
		onclose();
	}
</script>

<Sheet title="Plan anpassen" {onclose}>
	<label class="block">
		<span class="label">Name des Plans</span>
		<input id="plan-name" class="text" bind:value={name} maxlength="60" autocomplete="off" />
	</label>

	<section class="block">
		<span class="label">Trainingstage</span>
		<div class="tile list">
			{#each plan.program.days as day, i (i)}
				<label class="row">
					<span class="wd">{WEEKDAY_SHORT[day.weekDay]}</span>
					<input id="day-name-{i}" class="text inline" bind:value={days[i]} maxlength="40" autocomplete="off" />
				</label>
			{/each}
		</div>
		<span class="muted note">Leer lassen setzt den ursprünglichen Namen zurück.</span>
	</section>

	<section class="block">
		<span class="label">Länge</span>
		<div class="tile length">
			<div class="stepper">
				<button onclick={() => (weeks = Math.max(start.minWeeks, weeks - 1))} disabled={weeks <= start.minWeeks} aria-label="Eine Woche weniger"
					><Icon name="minus" size={18} /></button
				>
				<span><b class="display num">{weeks}</b> Wochen</span>
				<button onclick={() => (weeks = Math.min(52, weeks + 1))} aria-label="Eine Woche mehr"><Icon name="plus" size={18} /></button>
			</div>
			<div class="bar" aria-hidden="true">
				{#each Array.from({ length: weeks }, (_, i) => i) as i (i)}
					<i class:deload={types[i] === 'deload'} class:new={i >= start.weeks} class:fixed={i < start.keep}></i>
				{/each}
			</div>
			<span class="muted note">
				Entlastung in Woche {deloads.join(', ') || '–'}. Die letzte Woche ist immer eine Entlastung, die Wellen werden
				gleichmäßig verteilt{start.keep ? `; die Wochen 1–${start.keep} bleiben, wie trainiert` : ''}.
			</span>
		</div>
	</section>

	<button class="cta center" onclick={save} disabled={!changed}><span>Speichern</span></button>
</Sheet>

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 13px;
		color: var(--mu);
	}
	.text {
		width: 100%;
		padding: 13px 16px;
		border: 0;
		border-radius: 14px;
		background: var(--sf2);
		font-size: 16px;
		font-weight: 600;
	}
	.text:focus {
		outline: 2px solid var(--ac);
	}
	.list {
		padding: 4px 14px;
		background: var(--sf);
	}
	.row {
		display: grid;
		grid-template-columns: 30px 1fr;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
	}
	.wd {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--mu);
	}
	.text.inline {
		padding: 10px 12px;
		font-size: 15px;
	}
	.note {
		font-size: 12px;
	}
	.length {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px 16px;
		background: var(--sf);
	}
	.stepper {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.stepper span {
		color: var(--mu);
	}
	.stepper b {
		font-size: 40px;
		color: var(--tx);
		margin-right: 4px;
	}
	.stepper button {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
	}
	.stepper button:disabled {
		opacity: 0.35;
	}
	.bar {
		display: flex;
		gap: 2px;
		height: 8px;
	}
	.bar i {
		flex: 1;
		border-radius: 3px;
		background: var(--tx);
		opacity: 0.8;
	}
	.bar i.new {
		background: var(--ac);
		opacity: 1;
	}
	.bar i.fixed {
		opacity: 0.45;
	}
	.bar i.deload {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--ok);
		opacity: 1;
	}
	.cta.center {
		justify-content: center;
	}
</style>
