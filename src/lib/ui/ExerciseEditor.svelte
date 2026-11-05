<script lang="ts">
	// Übung im Plan bearbeiten: Sätze, Wiederholungen, Gewicht für eine oder alle
	// folgenden Wochen; außerdem tauschen, verschieben, entfernen.
	import { session } from '#lib/data/session.svelte.ts';
	import type { Program } from '#lib/data/types.ts';
	import {
		editExercise,
		exerciseCatalog,
		kg,
		liftOfCategory,
		moveExercise,
		prescribe,
		removeExercise,
		swapExercise,
		weekCount
	} from '#lib/engine/index.ts';
	import ExercisePicker from './ExercisePicker.svelte';
	import Icon from './Icon.svelte';
	import Sheet from './Sheet.svelte';
	import { untrack } from 'svelte';

	let {
		program,
		dayIndex,
		exIndex,
		week,
		onclose
	}: { program: Program; dayIndex: number; exIndex: number; week: number; onclose: () => void } = $props();

	// Werte beim Öffnen als Momentaufnahme übernehmen (das Sheet wird pro Übung neu geöffnet).
	const { ex, p, weeks, isLift, overridden, count } = untrack(() => {
		const ex = program.days[dayIndex].exercises[exIndex];
		return {
			ex,
			p: prescribe(ex, week),
			weeks: weekCount(program),
			isLift: liftOfCategory(ex.category) !== null,
			overridden: Boolean(ex.weekWeightOverrides?.[week]),
			count: program.days[dayIndex].exercises.length
		};
	});

	let mode = $state<'edit' | 'swap'>('edit');
	let scope = $state<'week' | 'rest'>('rest');
	let sets = $state(p.sets);
	let reps = $state(p.reps);
	let auto = $state(isLift && !overridden);
	let weightText = $state(p.weight != null ? kg(p.weight) : '');
	let confirmDelete = $state(false);

	const catalog = $derived(exerciseCatalog(session.plan?.goal ?? 'strength'));
	const group = $derived(catalog.find((c) => c.name === ex.exercise)?.group ?? null);
	const lastWeek = weeks;

	/** undefined = Gewicht nicht anfassen, null = automatisch/leer, Zahl = eigenes Gewicht. */
	function weightPatch(): number | null | undefined {
		if (isLift && auto) return overridden ? null : undefined;
		const text = weightText.trim();
		if (text === '') return p.weight != null || overridden ? null : undefined;
		const n = Number(text.replace(',', '.'));
		if (!Number.isFinite(n) || n < 0) return undefined;
		// Bei Hauptübungen heißt „automatisch aus“ ausdrücklich: eigenes Gewicht festhalten.
		return n === p.weight && (overridden || !isLift) ? undefined : n;
	}

	function save() {
		const to = scope === 'week' ? week + 1 : lastWeek;
		session.editPlan((prog) =>
			editExercise(prog, dayIndex, exIndex, week, to, {
				sets: sets !== p.sets ? sets : undefined,
				reps: reps.trim() !== p.reps ? reps : undefined,
				weight: weightPatch()
			})
		);
		onclose();
	}

	function act(change: (prog: Program) => void) {
		session.editPlan(change);
		onclose();
	}
</script>

<Sheet title={mode === 'swap' ? 'Übung tauschen' : ex.exercise} {onclose}>
	{#if mode === 'swap'}
		<p class="muted note">Gilt für diesen Tag im ganzen Plan. Gewichte werden ab Woche {week + 1} neu berechnet.</p>
		<ExercisePicker
			{catalog}
			suggestGroup={group}
			onpick={(item) => act((prog) => swapExercise(prog, dayIndex, exIndex, item, week))}
		/>
	{:else}
		<div class="seg" role="radiogroup" aria-label="Gültigkeit">
			<button role="radio" aria-checked={scope === 'week'} class:sel={scope === 'week'} onclick={() => (scope = 'week')}>
				Nur Woche {week + 1}
			</button>
			<button role="radio" aria-checked={scope === 'rest'} class:sel={scope === 'rest'} onclick={() => (scope = 'rest')}>
				{week + 1 >= weeks ? `Woche ${week + 1}` : `Woche ${week + 1} bis ${weeks}`}
			</button>
		</div>

		<div class="tile fields">
			<div class="field">
				<span>Sätze</span>
				<div class="stepper">
					<button onclick={() => (sets = Math.max(1, sets - 1))} aria-label="Ein Satz weniger"><Icon name="minus" size={18} /></button>
					<b class="display num">{sets}</b>
					<button onclick={() => (sets = Math.min(20, sets + 1))} aria-label="Ein Satz mehr"><Icon name="plus" size={18} /></button>
				</div>
			</div>
			<label class="field">
				<span>Wiederholungen</span>
				<input id="edit-reps" class="display num" bind:value={reps} inputmode="text" maxlength="12" autocomplete="off" />
			</label>
			<div class="field col">
				<div class="row">
					<span>Gewicht</span>
					{#if isLift && auto}
						<span class="auto num">{p.weight != null && !overridden ? `${kg(p.weight)} kg` : 'wird berechnet'}</span>
					{:else}
						<span class="wrap">
							<input
								id="edit-weight"
								class="display num"
								bind:value={weightText}
								inputmode="decimal"
								placeholder="–"
								autocomplete="off"
							/>
							<small>kg</small>
						</span>
					{/if}
				</div>
				{#if isLift}
					<label class="check">
						<input id="edit-auto" type="checkbox" bind:checked={auto} />
						<span>Automatisch aus deinen Bestwerten berechnen</span>
					</label>
				{/if}
			</div>
		</div>

		<button class="cta" onclick={save}><span>Speichern</span></button>

		<div class="actions">
			<button class="ghost" onclick={() => (mode = 'swap')}><Icon name="swap" size={18} />Tauschen</button>
			<button
				class="ghost icon"
				disabled={exIndex === 0}
				onclick={() => act((prog) => moveExercise(prog, dayIndex, exIndex, -1))}
				aria-label="Nach oben"><Icon name="up" size={18} /></button
			>
			<button
				class="ghost icon"
				disabled={exIndex >= count - 1}
				onclick={() => act((prog) => moveExercise(prog, dayIndex, exIndex, 1))}
				aria-label="Nach unten"><Icon name="down" size={18} /></button
			>
			{#if confirmDelete}
				<button class="ghost danger" onclick={() => act((prog) => removeExercise(prog, dayIndex, exIndex))}>
					Wirklich entfernen
				</button>
			{:else}
				<button class="ghost icon" onclick={() => (confirmDelete = true)} aria-label="Übung entfernen"
					><Icon name="trash" size={18} /></button
				>
			{/if}
		</div>
		<p class="muted note">Tauschen, Verschieben und Entfernen gelten für diesen Tag im ganzen Plan.</p>
	{/if}
</Sheet>

<style>
	.note {
		margin: 0;
		font-size: 13px;
	}
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		padding: 5px;
		border-radius: 999px;
		background: var(--sf2);
	}
	.seg button {
		padding: 11px 6px;
		border-radius: 999px;
		font-weight: 600;
		font-size: 14px;
	}
	.seg button.sel {
		background: var(--ac);
		color: var(--on-ac);
	}
	.fields {
		padding: 2px 16px;
		background: var(--sf);
	}
	.field {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		padding: 8px 0;
		border-bottom: 1px solid var(--sf2);
	}
	.field:last-child {
		border: 0;
	}
	.field.col {
		flex-direction: column;
		align-items: stretch;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.field > span:first-child,
	.row > span:first-child {
		font-weight: 600;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.stepper b {
		font-size: 34px;
		min-width: 1.6ch;
		text-align: center;
	}
	.stepper button {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
	}
	input.display {
		width: 5.5ch;
		text-align: right;
		font-size: 34px;
		border: 0;
		background: transparent;
		padding: 0;
		color: var(--ac-ink);
	}
	input.display:focus {
		outline: none;
		text-decoration: underline 2px var(--ac);
		text-underline-offset: 6px;
	}
	.wrap {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.wrap small,
	.auto {
		color: var(--mu);
	}
	.auto {
		font-size: 15px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		color: var(--mu);
	}
	.check input {
		width: 20px;
		height: 20px;
		accent-color: var(--ac);
	}
	.cta {
		justify-content: center;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.actions .ghost {
		background: var(--sf2);
		box-shadow: none;
	}
	.actions .ghost:first-child {
		flex: 1;
	}
	.actions .icon {
		width: 48px;
		padding: 13px 0;
	}
	.actions .ghost:disabled {
		opacity: 0.35;
	}
	.danger {
		color: var(--danger);
	}
</style>
