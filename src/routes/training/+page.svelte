<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { workoutId } from '#lib/data/repo.ts';
	import { session } from '#lib/data/session.svelte.ts';
	import type { Feel, LoggedExercise, Workout } from '#lib/data/types.ts';
	import { dayPrescription, dayTitle, feelToRpe, isoDate, kg } from '#lib/engine/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import { onDestroy } from 'svelte';

	const weekIndex = Number(page.url.searchParams.get('w'));
	const dayIndex = Number(page.url.searchParams.get('d'));
	const plan = session.plan;
	const day = plan?.program.days[dayIndex];
	const step = Number(plan?.program.rounding) || 2.5;

	function firstNumber(reps: string): number | null {
		const n = Number.parseInt(reps, 10);
		return Number.isFinite(n) ? n : null;
	}

	function draft(): Workout | null {
		if (!plan || !day || !session.user) return null;
		const existing = session.workouts.find((w) => w.weekIndex === weekIndex && w.dayIndex === dayIndex);
		if (existing) return structuredClone($state.snapshot(existing)) as Workout;
		const exercises: LoggedExercise[] = dayPrescription(plan.program, weekIndex, dayIndex).map((p) => ({
			exercise: p.exercise,
			lift: p.lift,
			isMain: p.isMain,
			target: { sets: p.sets, reps: p.reps, rpe: p.rpe, weight: p.weight },
			sets: Array.from({ length: p.sets }, () => ({
				weight: p.weight,
				reps: firstNumber(p.reps),
				feel: null,
				rpe: null,
				done: false
			}))
		}));
		return {
			id: workoutId(plan.id, weekIndex, dayIndex),
			ownerId: session.user.uid,
			planId: plan.id,
			weekIndex,
			dayIndex,
			dayName: dayTitle(day),
			date: isoDate(new Date()),
			startedAt: new Date().toISOString(),
			finishedAt: null,
			exercises
		};
	}

	let workout = $state<Workout | null>(draft());

	// Erste Übung mit offenem Satz.
	function firstOpen(w: Workout | null): [number, number] {
		if (!w) return [0, 0];
		for (let e = 0; e < w.exercises.length; e++) {
			const s = w.exercises[e].sets.findIndex((x) => !x.done);
			if (s >= 0) return [e, s];
		}
		return [Math.max(0, w.exercises.length - 1), 0];
	}
	const start = firstOpen(workout);
	let exIndex = $state(start[0]);
	let setIndex = $state(start[1]);

	const ex = $derived(workout?.exercises[exIndex]);
	const set = $derived(ex?.sets[setIndex]);
	const allDone = $derived(!!workout && workout.exercises.every((e) => e.sets.every((s) => s.done)));
	const doneSets = $derived(workout ? workout.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) : 0);
	const totalSets = $derived(workout ? workout.exercises.reduce((n, e) => n + e.sets.length, 0) : 0);

	// ---------- Eingaben ----------
	let weightText = $state('');
	$effect(() => {
		weightText = set?.weight != null ? kg(set.weight) : '';
	});

	function commitWeight() {
		if (!set) return;
		const n = Number(weightText.replace(',', '.'));
		set.weight = weightText.trim() === '' || !Number.isFinite(n) ? null : Math.max(0, n);
		// Gewichtsänderung gilt auch für die folgenden offenen Sätze dieser Übung.
		ex?.sets.forEach((s, i) => {
			if (i > setIndex && !s.done) s.weight = set.weight;
		});
	}

	function nudgeWeight(delta: number) {
		if (!set) return;
		set.weight = Math.max(0, Math.round(((set.weight ?? 0) + delta) * 100) / 100);
		ex?.sets.forEach((s, i) => {
			if (i > setIndex && !s.done) s.weight = set.weight;
		});
	}

	function nudgeReps(delta: number) {
		if (!set) return;
		set.reps = Math.max(1, (set.reps ?? 0) + delta);
	}

	// ---------- Pause ----------
	let restLeft = $state(0);
	let restTotal = $state(0);
	let timer: ReturnType<typeof setInterval> | undefined;
	function startRest(seconds: number) {
		clearInterval(timer);
		restTotal = restLeft = seconds;
		timer = setInterval(() => {
			restLeft = Math.max(0, restLeft - 1);
			if (restLeft === 0) {
				clearInterval(timer);
				navigator.vibrate?.(200);
			}
		}, 1000);
	}
	onDestroy(() => clearInterval(timer));
	const restLabel = $derived(`${Math.floor(restLeft / 60)}:${String(restLeft % 60).padStart(2, '0')}`);

	// ---------- Speichern ----------
	function persist() {
		if (!workout) return;
		session.saveWorkout($state.snapshot(workout) as Workout);
	}

	function log(feel: Feel) {
		if (!ex || !set) return;
		commitWeight();
		set.feel = feel;
		set.rpe = feelToRpe(feel, ex.target.rpe);
		set.done = true;
		persist();
		const nextSet = ex.sets.findIndex((s) => !s.done);
		if (nextSet >= 0) {
			setIndex = nextSet;
			startRest(ex.isMain ? 180 : 90);
		} else {
			const nextEx = workout!.exercises.findIndex((e) => e.sets.some((s) => !s.done));
			if (nextEx >= 0) {
				exIndex = nextEx;
				setIndex = workout!.exercises[nextEx].sets.findIndex((s) => !s.done);
				startRest(120);
			} else {
				clearInterval(timer);
				restLeft = 0;
			}
		}
	}

	function select(e: number, s?: number) {
		exIndex = e;
		const sets = workout!.exercises[e].sets;
		setIndex = s ?? Math.max(0, sets.findIndex((x) => !x.done));
	}

	function addSet() {
		if (!ex) return;
		const last = ex.sets[ex.sets.length - 1];
		ex.sets.push({ weight: last?.weight ?? null, reps: last?.reps ?? null, feel: null, rpe: null, done: false });
		setIndex = ex.sets.length - 1;
		persist();
	}

	let finishing = $state(false);
	let confirmLeave = $state(false);
	async function finish() {
		if (!workout) return;
		finishing = true;
		try {
			await session.finishWorkout($state.snapshot(workout) as Workout);
		} catch (e) {
			console.warn(e);
		}
		goto('/');
	}
	function leave() {
		if (doneSets > 0 && !allDone) confirmLeave = true;
		else goto('/');
	}
</script>

{#if !workout || !ex}
	<main class="page">
		<h1 class="title">Training nicht gefunden.</h1>
		<a class="cta" href="/"><span>Zurück zu Heute</span></a>
	</main>
{:else}
	<main class="page">
		<header class="top">
			<div>
				<small class="muted">Übung {exIndex + 1} von {workout.exercises.length}</small>
				<strong>{ex.exercise}</strong>
			</div>
			<button class="round tile" onclick={leave} aria-label="Training verlassen"><Icon name="close" size={18} /></button>
		</header>

		<nav class="dots" aria-label="Übungen">
			{#each workout.exercises as e, i (i)}
				<button
					class:on={i === exIndex}
					class:done={e.sets.every((s) => s.done)}
					onclick={() => select(i)}
					aria-label="{e.exercise}{e.sets.every((s) => s.done) ? ', erledigt' : ''}"
				></button>
			{/each}
		</nav>

		{#if set}
			<section class="tile card" aria-label="Aktueller Satz">
				<div class="target muted">
					Satz {setIndex + 1} von {ex.sets.length} · Ziel {ex.target.reps} Wdh.{ex.target.weight ? ` · ${kg(ex.target.weight)} kg` : ''}
				</div>
				<label class="weight">
					<input
						id="weight"
						class="display num"
						inputmode="decimal"
						placeholder="–"
						aria-label="Gewicht in kg"
						bind:value={weightText}
						onblur={commitWeight}
						onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
						style:width="{Math.max(2, weightText.length) + 0.4}ch"
					/>
					<span class="unit">kg</span>
				</label>
				<div class="steppers">
					<div class="stepper">
						<button onclick={() => nudgeWeight(-step)} aria-label="{kg(step)} kg weniger"><Icon name="minus" size={18} /></button>
						<span class="muted">±{kg(step)} kg</span>
						<button onclick={() => nudgeWeight(step)} aria-label="{kg(step)} kg mehr"><Icon name="plus" size={18} /></button>
					</div>
					<div class="stepper">
						<button onclick={() => nudgeReps(-1)} aria-label="Eine Wiederholung weniger"><Icon name="minus" size={18} /></button>
						<span class="reps display num">× {set.reps ?? '–'}</span>
						<button onclick={() => nudgeReps(1)} aria-label="Eine Wiederholung mehr"><Icon name="plus" size={18} /></button>
					</div>
				</div>
			</section>
		{/if}

		<section class="sets" aria-label="Sätze">
			{#each ex.sets as s, i (i)}
				<button class="set" class:cur={i === setIndex} class:done={s.done} onclick={() => select(exIndex, i)}>
					<span class="n num">{i + 1}</span>
					<span class="num">{s.weight != null ? `${kg(s.weight)} kg` : '–'} × {s.reps ?? '–'}</span>
					<span class="tag">{s.done ? `✓ ${s.feel}` : i === setIndex ? 'jetzt' : ''}</span>
				</button>
			{/each}
			<button class="add" onclick={addSet}>+ Satz hinzufügen</button>
		</section>

		{#if allDone}
			<button class="cta" onclick={finish} disabled={finishing}>
				<span>{finishing ? 'Wird gespeichert …' : 'Training abschließen'}</span>
				<small>{doneSets} Sätze</small>
			</button>
		{:else if set && !set.done}
			<div class="feel-wrap">
				<div class="muted q">Wie schwer war Satz {setIndex + 1}?</div>
				<div class="feel tile">
					<button onclick={() => log('leicht')}>leicht</button>
					<button onclick={() => log('okay')}>okay</button>
					<button onclick={() => log('hart')}>hart</button>
				</div>
			</div>
		{:else if set?.done}
			<div class="feel-wrap">
				<div class="muted q">Satz {setIndex + 1} erledigt ({set.feel}). Neu bewerten:</div>
				<div class="feel tile">
					<button onclick={() => log('leicht')}>leicht</button>
					<button onclick={() => log('okay')}>okay</button>
					<button onclick={() => log('hart')}>hart</button>
				</div>
			</div>
		{/if}

		{#if restLeft > 0}
			<section class="rest" aria-live="polite">
				<div class="rest-row">
					<span class="muted">Pause</span>
					<b class="num">{restLabel}</b>
					<button class="skip" onclick={() => (restLeft = 0)}>überspringen</button>
				</div>
				<div class="bar"><i style:width="{(restLeft / restTotal) * 100}%"></i></div>
			</section>
		{/if}

		{#if !allDone && doneSets > 0}
			<button class="finish-early muted" onclick={finish} disabled={finishing}>Training jetzt beenden ({doneSets} von {totalSets} Sätzen)</button>
		{/if}
	</main>

	{#if confirmLeave}
		<div class="sheet-backdrop" role="presentation" onclick={() => (confirmLeave = false)}></div>
		<div class="sheet tile" role="dialog" aria-modal="true" aria-labelledby="leave-title">
			<h2 id="leave-title">Training unterbrechen?</h2>
			<p class="muted">Deine {doneSets} Sätze sind gespeichert. Du kannst später auf „Heute“ weitermachen.</p>
			<button class="cta" onclick={() => goto('/')}><span>Unterbrechen</span></button>
			<button class="ghost" onclick={() => (confirmLeave = false)}>Weiter trainieren</button>
		</div>
	{/if}
{/if}

<style>
	.page {
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.top small {
		display: block;
		font-size: 12px;
	}
	.top strong {
		font-size: 18px;
	}
	.round {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		flex: none;
	}
	.dots {
		display: flex;
		gap: 6px;
	}
	.dots button {
		flex: 1;
		height: 4px;
		border-radius: 4px;
		background: var(--sf2);
	}
	.dots button.done {
		background: var(--tx);
	}
	.dots button.on {
		background: var(--ac);
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 16px 18px 18px;
		border-radius: 28px;
	}
	.target {
		font-size: 13px;
		text-align: center;
	}
	.weight {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 8px;
	}
	.weight input {
		font-size: 120px;
		color: var(--ac-ink);
		background: transparent;
		border: 0;
		padding: 0;
		text-align: center;
		min-width: 2ch;
		max-width: 6ch;
	}
	.weight input:focus {
		outline: none;
		text-decoration: underline 3px var(--ac);
		text-underline-offset: 10px;
	}
	.unit {
		font-size: 16px;
		color: var(--mu);
	}
	.steppers {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px 26px;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 12px;
	}
	.stepper button {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
	}
	.reps {
		font-size: 30px;
		color: var(--tx);
		min-width: 2.6ch;
		text-align: center;
	}
	.sets {
		display: flex;
		flex-direction: column;
	}
	.set {
		display: grid;
		grid-template-columns: 28px 1fr auto;
		align-items: center;
		gap: 8px;
		padding: 10px 4px;
		text-align: left;
		border-radius: 12px;
	}
	.set .n {
		color: var(--mu);
		font-size: 12px;
	}
	.set.cur {
		color: var(--ac-ink);
		font-weight: 600;
	}
	.tag {
		font-size: 12px;
		color: var(--mu);
	}
	.set.done .tag {
		color: var(--ok);
	}
	.add {
		align-self: flex-start;
		padding: 8px 4px;
		color: var(--ac-ink);
		font-weight: 600;
		font-size: 14px;
	}
	.q {
		font-size: 13px;
		margin-bottom: 8px;
	}
	.feel {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
		padding: 5px;
		border-radius: 999px;
	}
	.feel button {
		padding: 15px 0;
		border-radius: 999px;
		font-weight: 600;
		transition: background 0.15s;
	}
	.feel button:active {
		background: var(--ac);
		color: var(--on-ac);
	}
	@media (hover: hover) {
		.feel button:hover {
			background: var(--ac);
			color: var(--on-ac);
		}
	}
	.rest {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.rest-row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: 13px;
	}
	.rest-row b {
		color: var(--ac-ink);
		font-size: 15px;
	}
	.skip {
		margin-left: auto;
		color: var(--mu);
		font-size: 13px;
	}
	.bar {
		height: 6px;
		background: var(--sf2);
		border-radius: 6px;
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--ac);
		transition: width 1s linear;
	}
	.finish-early {
		font-size: 13px;
		padding: 8px;
	}
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgb(0 0 0 / 0.45);
	}
	.sheet {
		position: fixed;
		z-index: 31;
		left: max(12px, env(safe-area-inset-left, 0px));
		right: max(12px, env(safe-area-inset-right, 0px));
		bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
		max-width: 520px;
		margin: 0 auto;
		padding: 22px 20px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		border-radius: 28px;
		background: color-mix(in srgb, var(--sf) 82%, transparent);
	}
	.sheet h2 {
		margin: 0;
		font-size: 20px;
	}
	.sheet p {
		margin: 0 0 6px;
	}
</style>
