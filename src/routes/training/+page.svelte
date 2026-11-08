<script lang="ts">
	import { goto, pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { workoutId } from '#lib/data/repo.ts';
	import { session } from '#lib/data/session.svelte.ts';
	import type { Feel, LoggedExercise, Workout } from '#lib/data/types.ts';
	import {
		amountLabel,
		backoffFromSingle,
		dayPrescription,
		dayTitle,
		doubleProgression,
		feelToRpe,
		isoDate,
		kg,
		lastPerformance,
		repRange,
		rpeLabel,
		rpeToFeel,
		usesMaxLoad
	} from '#lib/engine/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
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
		const id = workoutId(plan.id, weekIndex, dayIndex);
		const exercises: LoggedExercise[] = dayPrescription(plan.program, weekIndex, dayIndex).map((p, i) => {
			const range = repRange(p.reps);
			const source = day.exercises[i];
			// Doppelte Progression für Spannen (z. B. 8–12), wenn das Gewicht nicht aus einem
			// Bestwert berechnet wird: Gewicht und Wiederholungen aus dem letzten Mal ableiten.
			const last = range && !usesMaxLoad(plan.program, source, weekIndex) ? lastPerformance(session.workouts, p.exercise, id) : null;
			const dp = range && last ? doubleProgression(range, p.sets, p.rpe, last) : null;
			const weight = dp?.weight ?? p.weight;
			const hint =
				dp?.hint ??
				(range && !usesMaxLoad(plan.program, source, weekIndex)
					? `Wähle ein Gewicht für etwa ${range[0]} Wdh. Schaffst du in allen Sätzen ${range[1]}, gibt es beim nächsten Mal mehr Gewicht.`
					: undefined);
			return {
				exercise: p.exercise,
				lift: p.lift,
				isMain: p.isMain,
				target: {
					sets: p.sets,
					reps: p.reps,
					rpe: p.rpe,
					weight,
					...(hint ? { hint } : {}),
					...(p.topSingle ? { topSingle: p.topSingle } : {})
				},
				sets: [
					// Top-Single zuerst, danach die Back-offs.
					...(p.topSingle
						? [{ kind: 'single' as const, weight: p.topSingle.weight, reps: 1, feel: null, rpe: null, done: false }]
						: []),
					...Array.from({ length: p.sets }, (_, k) => ({
						...(p.topSingle ? { kind: 'backoff' as const } : {}),
						weight,
						reps: dp?.reps[k] ?? firstNumber(p.reps),
						feel: null,
						rpe: null,
						done: false
					}))
				]
			};
		});
		return {
			id,
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

	// Ansicht: Übersicht aller Übungen oder eine einzelne Übung. Die geöffnete Übung liegt
	// im Browserverlauf (Shallow Routing), damit „Zurück“ zur Übersicht führt.
	const exIndex = $derived(typeof page.state.exercise === 'number' ? page.state.exercise : null);
	let setIndex = $state(0);

	function openExercise(i: number) {
		const sets = workout!.exercises[i].sets;
		setIndex = Math.max(0, sets.findIndex((s) => !s.done));
		pushState('', { exercise: i });
	}
	function backToList() {
		if (exIndex != null) history.back();
	}

	type ExStatus = 'done' | 'partial' | 'open';
	function status(e: LoggedExercise): ExStatus {
		const done = e.sets.filter((s) => s.done).length;
		return done === e.sets.length && done > 0 ? 'done' : done > 0 ? 'partial' : 'open';
	}

	const ex = $derived(exIndex != null ? workout?.exercises[exIndex] : undefined);
	const set = $derived(ex?.sets[setIndex]);
	const allDone = $derived(!!workout && workout.exercises.every((e) => e.sets.every((s) => s.done)));
	const doneExercises = $derived(workout ? workout.exercises.filter((e) => status(e) === 'done').length : 0);
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

	// Anstrengung: leicht/okay/hart oder RPE-Zahl (Einstellung im Profil, hier umschaltbar).
	const rpeMode = $derived(session.profile?.effortScale === 'rpe');
	const RPE_SCALE = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

	function log(feel: Feel | null, rpe?: number) {
		if (!ex || !set) return;
		commitWeight();
		const targetRpe = set.kind === 'single' ? (ex.target.topSingle?.rpe ?? 8) : ex.target.rpe;
		if (rpe != null) {
			set.rpe = rpe;
			set.feel = rpeToFeel(rpe, targetRpe);
		} else if (feel) {
			set.feel = feel;
			set.rpe = feelToRpe(feel, targetRpe);
		}
		set.done = true;
		if (set.kind === 'single') adjustBackoffs(ex, set);
		persist();
		const nextSet = ex.sets.findIndex((s) => !s.done);
		if (nextSet >= 0) {
			setIndex = nextSet;
			startRest(ex.isMain ? session.restSeconds.main : session.restSeconds.other);
		} else {
			// Übung fertig: kurz das Häkchen zeigen, dann zurück zur Übersicht.
			if (workout!.exercises.some((e) => e.sets.some((s) => !s.done))) startRest(session.restSeconds.other);
			else {
				clearInterval(timer);
				restLeft = 0;
			}
			setTimeout(backToList, 450);
		}
	}

	/** Back-off-Gewichte aus dem tatsächlichen Single ableiten (Tagesform, ±10 %). */
	let backoffNote = $state<Record<string, string>>({});
	function adjustBackoffs(e: LoggedExercise, single: LoggedExercise['sets'][number]) {
		const planned = e.target.topSingle;
		if (!planned?.weight || !e.target.weight || !single.weight || single.rpe == null) return;
		const w = backoffFromSingle(e.target.weight, { weight: planned.weight, rpe: planned.rpe }, { weight: single.weight, rpe: single.rpe }, step);
		e.sets.forEach((s) => {
			if (s.kind === 'backoff' && !s.done) s.weight = w;
		});
		const diff = w - e.target.weight;
		backoffNote[e.exercise] =
			diff === 0
				? `Single wie geplant. Back-offs bleiben bei ${kg(w)} kg.`
				: `Single ${diff > 0 ? 'leichter' : 'schwerer'} als geplant: Back-offs ${diff > 0 ? '+' : '−'}${kg(Math.abs(diff))} kg auf ${kg(w)} kg.`;
	}

	// Anzeigename des aktuellen Satzes (Single zählt nicht bei den Back-offs mit).
	const setName = $derived(
		set?.kind === 'single' ? 'Top-Single' : set?.kind === 'backoff' ? `Back-off ${setIndex}` : `Satz ${setIndex + 1}`
	);

	function selectSet(i: number) {
		setIndex = i;
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
	let finishOpen = $state(false);
	/** Übungen mit offenen Sätzen, die beim Beenden als „nicht gemacht“ markiert wurden. */
	let skipped = $state<Record<number, boolean>>({});
	const unrated = $derived(
		workout
			? workout.exercises
					.map((e, i) => ({ e, i, open: e.sets.filter((s) => !s.done).length }))
					.filter((x) => x.open > 0)
			: []
	);

	/**
	 * Training beenden: Das Gesamtfeedback gilt für alle noch unbewerteten Sätze der
	 * Übungen, die als gemacht markiert sind. Nicht gemachte bleiben offen.
	 */
	function finishWith(feel: Feel | null, rpe?: number) {
		if (!workout) return;
		for (const { e, i } of unrated) {
			if (skipped[i]) continue;
			for (const s of e.sets) {
				if (s.done) continue;
				s.reps ??= firstNumber(e.target.reps);
				if (rpe != null) {
					s.rpe = rpe;
					s.feel = rpeToFeel(rpe, e.target.rpe);
				} else if (feel) {
					s.feel = feel;
					s.rpe = feelToRpe(feel, e.target.rpe);
				}
				s.done = true;
			}
		}
		workout.feedback = { feel: rpe != null ? null : feel, rpe: rpe ?? null };
		finish();
	}
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

{#snippet restBar()}
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
{/snippet}

{#snippet effortButtons(onfeel: (feel: Feel) => void, onrpe: (rpe: number) => void, target: number | null)}
	{#if rpeMode}
		<div class="rpe-grid">
			{#each RPE_SCALE as value (value)}
				<button class:target={value === target} onclick={() => onrpe(value)}>{rpeLabel(value)}</button>
			{/each}
		</div>
		<span class="muted hint">RPE 10 = nichts mehr übrig · 9 = noch 1 Wdh. · 8 = noch 2 · 7 = noch 3</span>
	{:else}
		<div class="feel tile">
			<button onclick={() => onfeel('leicht')}>leicht</button>
			<button onclick={() => onfeel('okay')}>okay</button>
			<button onclick={() => onfeel('hart')}>hart</button>
		</div>
	{/if}
{/snippet}

{#if !workout}
	<main class="page">
		<h1 class="title">Training nicht gefunden.</h1>
		<a class="cta" href="/"><span>Zurück zum Start</span></a>
	</main>
{:else if !ex}
	<!-- Übersicht: alle Übungen des Tages -->
	<main class="page">
		<header class="top">
			<div>
				<small class="muted">Woche {weekIndex + 1} · {doneExercises} von {workout.exercises.length} Übungen erledigt</small>
				<h1 class="title day">{workout.dayName}</h1>
			</div>
			<button class="round tile" onclick={leave} aria-label="Training verlassen"><Icon name="close" size={18} /></button>
		</header>

		{@render restBar()}

		<section class="exlist" aria-label="Übungen" data-tour="exlist">
			{#each workout.exercises as e, i (i)}
				{@const st = status(e)}
				<button class="excard tile {st}" onclick={() => openExercise(i)}>
					<span class="exnum num" aria-hidden="true">
						{#if st === 'done'}<Icon name="check" size={18} />{:else}{i + 1}{/if}
					</span>
					<span class="exmain">
						<b>{e.exercise}</b>
						<small class="num">
							{amountLabel(e.target)}
						</small>
					</span>
					<span class="exprog num">
						{#if st === 'done'}erledigt{:else}{e.sets.filter((s) => s.done).length}/{e.sets.length}{/if}
					</span>
				</button>
			{/each}
		</section>

		<button class="cta finish" onclick={() => (finishOpen = true)} data-tour="finish">
			<span>Training beenden</span><small>{doneSets} von {totalSets} Sätzen</small>
		</button>
	</main>
{:else}
	<!-- Eine Übung -->
	<main class="page">
		<header class="top ex-top">
			<button class="round tile" onclick={backToList} aria-label="Zur Übersicht"><Icon name="back" size={18} /></button>
			<small class="muted">Übung {exIndex! + 1} von {workout.exercises.length}</small>
		</header>
		<h1 class="title exname">{ex.exercise}</h1>

		{#if set}
			<section class="tile card" aria-label="Aktueller Satz">
				<div class="target muted">
					{#if set.kind === 'single'}
						<b class="kind">Top-Single</b> · 1 Wdh.{ex.target.topSingle?.weight ? ` · ${kg(ex.target.topSingle.weight)} kg` : ''} ·
						<b class="rpe">RPE {rpeLabel(ex.target.topSingle?.rpe ?? 8)}</b>
					{:else}
						{set.kind === 'backoff' ? 'Back-off' : 'Satz'}
						{set.kind === 'backoff' ? setIndex : setIndex + 1} von {set.kind === 'backoff' ? ex.sets.length - 1 : ex.sets.length}
						· Ziel {ex.target.reps} Wdh.{ex.target.weight ? ` · ${kg(ex.target.weight)} kg` : ''} ·
						<b class="rpe">RPE {rpeLabel(ex.target.rpe)}</b>
					{/if}
				</div>
				{#if set.kind === 'single'}
					<p class="dp">Eine schwere Wiederholung, nicht maximal. Danach richten sich die Back-offs nach deiner Tagesform.</p>
				{:else if set.kind === 'backoff' && backoffNote[ex.exercise]}
					<p class="dp up">{backoffNote[ex.exercise]}</p>
				{/if}
				{#if ex.target.hint}
					<p class="dp" class:up={ex.target.hint.includes('geschafft')}>{ex.target.hint}</p>
				{/if}
				<label class="weight">
					<input
						id="weight"
						class="display num"
						inputmode="decimal"
						placeholder="0"
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
				<button class="set" class:cur={i === setIndex} class:done={s.done} onclick={() => selectSet(i)}>
					<span class="n num">{s.kind === 'single' ? 'S' : s.kind === 'backoff' ? i : i + 1}</span>
					<span class="num">{s.weight != null ? `${kg(s.weight)} kg` : '–'} × {s.reps ?? '–'}</span>
					<span class="tag"
						>{s.done ? (rpeMode && s.rpe != null ? `✓ RPE ${rpeLabel(s.rpe)}` : `✓ ${s.feel}`) : i === setIndex ? 'jetzt' : ''}</span
					>
				</button>
			{/each}
			<button class="add" onclick={addSet}>+ Satz hinzufügen</button>
		</section>

		{#if set}
			<div class="feel-wrap">
				<div class="q-row">
					<span class="muted q">
						{set.done
							? `${setName} erledigt${rpeMode && set.rpe != null ? ` (RPE ${rpeLabel(set.rpe)})` : ` (${set.feel})`}. Neu bewerten:`
							: rpeMode
								? `RPE ${setName === 'Top-Single' ? 'des Top-Singles' : `von ${setName}`}? Ziel ${rpeLabel(set.kind === 'single' ? (ex.target.topSingle?.rpe ?? 8) : ex.target.rpe)}`
								: `Wie schwer war ${setName === 'Top-Single' ? 'das Top-Single' : setName}?`}
					</span>
					<button class="switch-scale" onclick={() => session.setEffortScale(rpeMode ? 'simple' : 'rpe')}>
						{rpeMode ? 'leicht/okay/hart' : 'RPE eingeben'}
					</button>
				</div>
				{@render effortButtons((f) => log(f), (r) => log(null, r), set.kind === 'single' ? (ex.target.topSingle?.rpe ?? 8) : ex.target.rpe)}
			</div>
		{/if}

		{@render restBar()}
	</main>
{/if}

{#if workout && finishOpen}
	<Sheet title="Training beenden" onclose={() => (finishOpen = false)}>
		{#if unrated.length}
			<p class="muted note">
				Diese Übungen haben noch offene Sätze. Dein Gesamtfeedback wird für sie übernommen. Nimm den Haken weg, wenn du eine
				Übung nicht gemacht hast.
			</p>
			<div class="unrated">
				{#each unrated as { e, i, open } (i)}
					<label class="urow">
						<input
							id="done-{i}"
							type="checkbox"
							checked={!skipped[i]}
							onchange={(ev) => (skipped[i] = !(ev.currentTarget as HTMLInputElement).checked)}
						/>
						<span><b>{e.exercise}</b><small class="muted">{open} {open === 1 ? 'Satz' : 'Sätze'} ohne Bewertung</small></span>
					</label>
				{/each}
			</div>
		{:else}
			<p class="muted note">Alle Sätze sind bewertet. Wie war das Training insgesamt?</p>
		{/if}
		<span class="q">{rpeMode ? 'RPE für das Training insgesamt' : 'Wie war das Training insgesamt?'}</span>
		{@render effortButtons((f) => finishWith(f), (r) => finishWith(null, r), null)}
		{#if finishing}<p class="muted note">Wird gespeichert …</p>{/if}
	</Sheet>
{/if}

{#if confirmLeave}
	<Sheet title="Training unterbrechen?" onclose={() => (confirmLeave = false)}>
		<p class="muted note">Deine {doneSets} Sätze sind gespeichert. Du kannst später auf der Startseite weitermachen.</p>
		<button class="cta center" onclick={() => goto('/')}><span>Unterbrechen</span></button>
		<button class="ghost" onclick={() => (confirmLeave = false)}>Weiter trainieren</button>
	</Sheet>
{/if}

<style>
	.page {
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
	}
	.day {
		font-size: 36px;
		margin-top: 2px;
	}
	.ex-top {
		justify-content: flex-start;
	}
	.exname {
		font-size: 40px;
		line-height: 0.95;
		margin-top: -4px;
	}
	.exlist {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.excard {
		display: grid;
		grid-template-columns: 36px 1fr auto;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 20px;
		text-align: left;
		transition: box-shadow 0.2s, background-color 0.2s;
	}
	.exnum {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
		font-weight: 700;
		font-size: 14px;
	}
	.exmain {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.exmain b {
		font-size: 16px;
		font-weight: 650;
	}
	.exmain small {
		font-size: 12.5px;
		color: var(--mu);
	}
	.exprog {
		font-size: 13px;
		color: var(--mu);
		white-space: nowrap;
	}
	.excard.partial {
		box-shadow:
			inset 0 0 0 1.5px var(--ac),
			var(--glass-edge);
	}
	.excard.partial .exprog {
		color: var(--ac-ink);
		font-weight: 600;
	}
	.excard.done {
		background: color-mix(in srgb, var(--ok) 16%, var(--glass));
		box-shadow:
			inset 0 0 0 1.5px color-mix(in srgb, var(--ok) 70%, transparent),
			var(--glass-edge);
	}
	.excard.done .exnum {
		background: var(--ok);
		color: var(--bg);
	}
	.excard.done .exprog {
		color: var(--ok);
		font-weight: 600;
	}
	.finish {
		margin-top: 6px;
	}
	.note {
		margin: 0;
		font-size: 13px;
	}
	.unrated {
		display: flex;
		flex-direction: column;
		padding: 2px 14px;
		border-radius: 16px;
		background: var(--sf);
	}
	.urow {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--sf2);
	}
	.urow:last-child {
		border: 0;
	}
	.urow input {
		width: 20px;
		height: 20px;
		accent-color: var(--ac);
	}
	.urow span {
		display: flex;
		flex-direction: column;
	}
	.urow small {
		font-size: 12px;
	}
	.cta.center {
		justify-content: center;
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
	.round {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		flex: none;
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
	.weight input::placeholder {
		color: var(--mu);
		opacity: 0.35;
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
	}
	.q-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 8px;
	}
	.switch-scale {
		font-size: 12px;
		color: var(--ac-ink);
		font-weight: 600;
		white-space: nowrap;
	}
	.dp {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.4;
		text-align: center;
		color: var(--mu);
		max-width: 34ch;
	}
	.dp.up {
		color: var(--ok);
		font-weight: 600;
	}
	.target .kind {
		color: var(--ac-ink);
	}
	.target .rpe {
		color: var(--tx);
		font-weight: 600;
	}
	.rpe-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}
	.rpe-grid button {
		padding: 14px 0;
		border-radius: 16px;
		background: var(--glass);
		box-shadow: var(--glass-edge);
		font-family: var(--f-num);
		font-stretch: 75%;
		font-weight: 700;
		font-size: 22px;
		font-variant-numeric: tabular-nums;
	}
	.rpe-grid button.target {
		box-shadow:
			inset 0 0 0 2px var(--ac),
			var(--glass-edge);
	}
	.rpe-grid button:active {
		background: var(--ac);
		color: var(--on-ac);
	}
	.hint {
		display: block;
		margin-top: 8px;
		font-size: 12px;
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
</style>
