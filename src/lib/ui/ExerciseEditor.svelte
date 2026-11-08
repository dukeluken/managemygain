<script lang="ts">
	// Übung im Plan bearbeiten: Sätze, Wiederholungen, RPE, Gewicht für eine Woche oder
	// ab dieser Woche bis Planende (dann mit erhaltener Progression); außerdem tauschen,
	// verschieben, entfernen.
	import { session } from '#lib/data/session.svelte.ts';
	import type { Program } from '#lib/data/types.ts';
	import {
		amountLabel,
		editExercise,
		isDeload,
		rpeLabel,
		exerciseCatalog,
		kg,
		hasCalculatedLoad,
		moveExercise,
		prescribe,
		removeExercise,
		setTopSingle,
		swapExercise,
		weekCount
	} from '#lib/engine/index.ts';
	import ExercisePicker from './ExercisePicker.svelte';
	import Icon from './Icon.svelte';
	import Keypad from './Keypad.svelte';
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
	const { ex, p, weeks, isLift, overridden, personal, count } = untrack(() => {
		const ex = program.days[dayIndex].exercises[exIndex];
		return {
			ex,
			p: prescribe(ex, week),
			weeks: weekCount(program),
			isLift: hasCalculatedLoad(ex),
			overridden: Boolean(ex.weekWeightOverrides?.[week]),
			personal: Boolean(ex.loadScale && ex.loadScale !== 1),
			count: program.days[dayIndex].exercises.length
		};
	});

	let mode = $state<'edit' | 'swap'>('edit');
	let scope = $state<'week' | 'rest'>('rest');
	let sets = $state(p.sets);
	let reps = $state(p.reps);
	let rpe = $state(p.rpe);
	let auto = $state(isLift && !overridden && !personal);
	// Top-Single nur bei Übungen mit Bestwert-Bezug, nie in Entlastungswochen.
	const hadSingle = untrack(() => ex.weekTopSingle?.[week] != null);
	let single = $state(hadSingle);
	const deloadWeek = untrack(() => isDeload(program, week));
	let weightText = $state(p.weight != null ? kg(p.weight) : '');
	let confirmDelete = $state(false);
	let keypadOpen = $state(false);

	const weightValue = $derived.by(() => {
		const n = Number(weightText.replace(',', '.'));
		return weightText.trim() && Number.isFinite(n) ? n : null;
	});

	/** Wiederholungen ±1. Bei Spannen wie „8–12“ verschieben sich beide Grenzen. */
	function stepReps(delta: number) {
		const text = reps.trim();
		const range = text.match(/^(\d+)\s*[–-]\s*(\d+)$/);
		if (range) {
			const lo = Number(range[1]);
			const hi = Number(range[2]);
			if (lo + delta < 1) return;
			reps = `${lo + delta}–${hi + delta}`;
		} else if (/^\d+$/.test(text)) {
			reps = String(Math.max(1, Math.min(50, Number(text) + delta)));
		}
	}

	function confirmWeight(value: number | null) {
		weightText = value != null ? kg(value) : '';
		if (isLift) auto = false;
		keypadOpen = false;
	}

	const catalog = $derived(exerciseCatalog(session.plan?.goal ?? 'strength'));
	const group = $derived(catalog.find((c) => c.name === ex.exercise)?.group ?? null);
	const lastWeek = weeks;

	/** undefined = Gewicht nicht anfassen, null = automatisch/leer, Zahl = eigenes Gewicht. */
	function weightPatch(): number | null | undefined {
		if (isLift && auto) return overridden || personal ? null : undefined;
		const text = weightText.trim();
		if (text === '') return p.weight != null || overridden ? null : undefined;
		const n = Number(text.replace(',', '.'));
		if (!Number.isFinite(n) || n < 0) return undefined;
		// Bei Hauptübungen heißt „automatisch aus“ ausdrücklich: eigenes Gewicht festhalten.
		return n === p.weight && (overridden || !isLift) ? undefined : n;
	}

	function patch() {
		return {
			sets: sets !== p.sets ? sets : undefined,
			reps: reps.trim() !== p.reps ? reps : undefined,
			rpe: rpe !== p.rpe ? rpe : undefined,
			weight: weightPatch()
		};
	}
	const to = $derived(scope === 'week' ? week + 1 : lastWeek);

	// Vorschau: so sehen die nächsten Wochen nach dem Speichern aus.
	const preview = $derived.by(() => {
		const copy = structuredClone($state.snapshot(program)) as Program;
		editExercise(copy, dayIndex, exIndex, week, to, patch());
		if (single !== hadSingle) setTopSingle(copy, dayIndex, exIndex, week, to, single);
		const last = Math.min(weeks, week + 6);
		return Array.from({ length: last - week }, (_, k) => week + k).map((w) => ({
			week: w,
			deload: isDeload(copy, w),
			label: amountLabel(prescribe(copy.days[dayIndex].exercises[exIndex], w))
		}));
	});

	function save() {
		session.editPlan((prog) => {
			editExercise(prog, dayIndex, exIndex, week, to, patch());
			if (single !== hadSingle) setTopSingle(prog, dayIndex, exIndex, week, to, single);
		});
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
			<div class="field">
				<span>Wiederholungen</span>
				<div class="stepper">
					<button onclick={() => stepReps(-1)} aria-label="Eine Wiederholung weniger"><Icon name="minus" size={18} /></button>
					<input
						id="edit-reps"
						class="display num reps"
						bind:value={reps}
						inputmode="text"
						maxlength="12"
						autocomplete="off"
						aria-label="Wiederholungen"
					/>
					<button onclick={() => stepReps(1)} aria-label="Eine Wiederholung mehr"><Icon name="plus" size={18} /></button>
				</div>
			</div>
			<div class="field">
				<span>RPE <small class="muted">Anstrengung</small></span>
				<div class="stepper">
					<button onclick={() => (rpe = Math.max(5, rpe - 0.5))} aria-label="RPE 0,5 weniger"><Icon name="minus" size={18} /></button>
					<b class="display num">{rpeLabel(rpe)}</b>
					<button onclick={() => (rpe = Math.min(10, rpe + 0.5))} aria-label="RPE 0,5 mehr"><Icon name="plus" size={18} /></button>
				</div>
			</div>
			<div class="field col">
				<div class="row">
					<span>Gewicht</span>
					<button class="weight" class:auto={isLift && auto} onclick={() => (keypadOpen = true)} aria-label="Gewicht eingeben">
						{#if isLift && auto}
							<span class="num">{p.weight != null && !overridden ? kg(p.weight) : '–'}</span>
						{:else}
							<span class="display num">{weightValue != null ? kg(weightValue) : '–'}</span>
						{/if}
						<small>kg</small>
					</button>
				</div>
				{#if isLift}
					<label class="check">
						<input id="edit-auto" type="checkbox" bind:checked={auto} />
						<span>Automatisch aus deinen Bestwerten berechnen</span>
					</label>
					{#if !deloadWeek}
						<label class="check">
							<input id="edit-single" type="checkbox" bind:checked={single} />
							<span>Top-Single vor den Sätzen (die Sätze werden zu Back-offs)</span>
						</label>
					{/if}
				{/if}
			</div>
		</div>

		<section class="preview" aria-label="Vorschau">
			<span class="muted note">
				{scope === 'week'
					? 'Gilt nur für diese Woche.'
					: 'Änderungen werden auf die Folgewochen übertragen, die Steigerung bleibt erhalten.'}
			</span>
			<div class="weeks">
				{#each preview as row (row.week)}
					<div class="pw" class:cur={row.week === week} class:dl={row.deload}>
						<span class="w">W{row.week + 1}{row.deload ? ' · leicht' : ''}</span>
						<span class="num">{row.label}</span>
					</div>
				{/each}
			</div>
		</section>

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

{#if keypadOpen}
	<Keypad
		title="{ex.exercise} · Woche {week + 1}{scope === 'rest' && week + 1 < weeks ? ` bis ${weeks}` : ''}"
		value={weightValue ?? (isLift ? p.weight : null)}
		allowClear={!isLift}
		onconfirm={confirmWeight}
		oncancel={() => (keypadOpen = false)}
	/>
{/if}

<style>
	.note {
		margin: 0;
		font-size: 13px;
	}
	.preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.weeks {
		display: flex;
		flex-direction: column;
		padding: 4px 14px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--sf2) 50%, transparent);
		font-size: 13px;
	}
	.pw {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 6px 0;
		color: var(--mu);
	}
	.pw.cur {
		color: var(--tx);
		font-weight: 600;
	}
	.pw.dl .w {
		color: var(--ok);
	}
	.pw .w {
		white-space: nowrap;
	}
	.field small {
		font-weight: 400;
		font-size: 12px;
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
		width: 3.6ch;
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
	.weight {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 4px 12px;
		border-radius: 12px;
		background: var(--sf2);
	}
	.weight .display {
		font-size: 34px;
		color: var(--ac-ink);
	}
	.weight.auto span {
		font-size: 17px;
		font-weight: 600;
		color: var(--mu);
	}
	.weight small {
		color: var(--mu);
	}
	input.reps {
		width: 3.6ch;
		text-align: center !important;
		font-size: 28px !important;
		color: var(--tx) !important;
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
