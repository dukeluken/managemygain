<script lang="ts">
	import { goto } from '$app/navigation';
	import { session } from '#lib/data/session.svelte.ts';
	import type { Experience, Goal, MainLift, PlanRequest } from '#lib/data/types.ts';
	import { LIFT_LABEL } from '#lib/engine/index.ts';
	import Icon from '#lib/ui/Icon.svelte';

	// Die Antworten bilden ein PlanRequest. Später füllt der KI-Coach dasselbe Objekt.
	let goal = $state<Goal | null>(null);
	let days = $state<2 | 3 | 4 | 5 | null>(null);
	let experience = $state<Experience | null>(null);
	let focus = $state<MainLift | null>(null);
	let stance = $state<'conventional' | 'sumo'>('conventional');
	let lifts = $state<Record<MainLift, string>>({ squat: '', bench: '', deadlift: '' });

	let step = $state(0);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const STEPS = ['goal', 'days', 'experience', 'lifts', 'focus'] as const;
	const current = $derived(STEPS[step]);
	const parse = (v: string) => Number(String(v).replace(',', '.'));
	const liftsValid = $derived((['squat', 'bench', 'deadlift'] as MainLift[]).every((l) => parse(lifts[l]) >= 10 && parse(lifts[l]) <= 500));

	function choose<T>(set: (v: T) => void, value: T) {
		set(value);
		next();
	}
	function next() {
		if (step < STEPS.length - 1) step++;
	}
	function back() {
		if (step > 0) step--;
		else history.length > 1 ? history.back() : goto('/');
	}

	async function create() {
		if (!session.user || !goal || !days || !experience || !focus || !liftsValid) return;
		busy = true;
		error = null;
		const req: PlanRequest = {
			goal,
			daysPerWeek: days,
			experience,
			focus,
			deadliftStance: stance,
			working3RM: { squat: parse(lifts.squat), bench: parse(lifts.bench), deadlift: parse(lifts.deadlift) }
		};
		try {
			await session.createPlan(req);
			goto('/');
		} catch (e) {
			console.error(e);
			error = 'Der Plan konnte nicht gespeichert werden. Prüfe die Verbindung und versuche es noch einmal.';
			busy = false;
		}
	}

	const GOALS: { value: Goal; label: string; hint: string }[] = [
		{ value: 'strength', label: 'Stärker werden', hint: 'Schwerere Gewichte in den großen Grundübungen' },
		{ value: 'hypertrophy', label: 'Muskeln aufbauen', hint: 'Mehr Volumen, etwas mehr Wiederholungen' },
		{ value: 'powerlifting', label: 'Powerlifting', hint: 'Kniebeuge, Bankdrücken, Kreuzheben für den Wettkampf' }
	];
	const LEVELS: { value: Experience; label: string; hint: string }[] = [
		{ value: 'beginner', label: 'Einsteiger', hint: 'Unter einem Jahr regelmäßiges Krafttraining' },
		{ value: 'intermediate', label: 'Fortgeschritten', hint: 'Ein bis drei Jahre' },
		{ value: 'advanced', label: 'Erfahren', hint: 'Mehr als drei Jahre, Fortschritt kommt langsamer' }
	];
</script>

<main class="page">
	<header class="top">
		<button class="icon" onclick={back} aria-label="Zurück"><Icon name="back" /></button>
		<div class="progress" aria-label="Schritt {step + 1} von {STEPS.length}">
			{#each STEPS as s, i (s)}<i class:on={i <= step}></i>{/each}
		</div>
		<span class="count muted num">{step + 1}/{STEPS.length}</span>
	</header>

	{#if current === 'goal'}
		<h1 class="title">Was ist dein Ziel?</h1>
		<div class="options">
			{#each GOALS as g (g.value)}
				<button class="opt tile" class:sel={goal === g.value} onclick={() => choose((v) => (goal = v), g.value)}>
					<b>{g.label}</b><span>{g.hint}</span>
				</button>
			{/each}
		</div>
	{:else if current === 'days'}
		<h1 class="title">Wie oft pro Woche kannst du trainieren?</h1>
		<div class="grid4">
			{#each [2, 3, 4, 5] as const as d (d)}
				<button class="opt tile num-opt" class:sel={days === d} onclick={() => choose((v) => (days = v), d)}>
					<b class="display num">{d}</b><span>Tage</span>
				</button>
			{/each}
		</div>
		<p class="muted hint">Lieber realistisch als ehrgeizig. Ein Plan, den du durchziehst, bringt mehr.</p>
	{:else if current === 'experience'}
		<h1 class="title">Wie lange trainierst du schon?</h1>
		<div class="options">
			{#each LEVELS as l (l.value)}
				<button class="opt tile" class:sel={experience === l.value} onclick={() => choose((v) => (experience = v), l.value)}>
					<b>{l.label}</b><span>{l.hint}</span>
				</button>
			{/each}
		</div>
	{:else if current === 'lifts'}
		<h1 class="title">Was bewegst du gerade?</h1>
		<p class="muted hint">
			Das Gewicht, mit dem du <b>3 saubere Wiederholungen</b> schaffst, mit noch ein bis zwei Wiederholungen Luft. Grob reicht, der Plan passt sich nach jedem Training an.
		</p>
		<div class="tile fields">
			{#each ['squat', 'bench', 'deadlift'] as const as l (l)}
				<label class="field">
					<span>{LIFT_LABEL[l]}</span>
					<span class="input">
						<input
							id="lift-{l}"
							inputmode="decimal"
							placeholder="0"
							bind:value={lifts[l]}
							class="display num"
							autocomplete="off"
						/>
						<small>kg</small>
					</span>
				</label>
			{/each}
		</div>
		<button class="cta" onclick={next} disabled={!liftsValid}><span>Weiter</span></button>
	{:else if current === 'focus'}
		<h1 class="title">Welche Übung soll am meisten wachsen?</h1>
		<div class="options">
			{#each ['squat', 'bench', 'deadlift'] as const as l (l)}
				<button class="opt tile" class:sel={focus === l} onclick={() => (focus = l)}>
					<b>{LIFT_LABEL[l]}</b>
				</button>
			{/each}
		</div>
		{#if goal === 'powerlifting'}
			<div class="stance">
				<span class="muted">Kreuzheben ziehst du</span>
				<div class="seg tile">
					<button class:sel={stance === 'conventional'} onclick={() => (stance = 'conventional')}>konventionell</button>
					<button class:sel={stance === 'sumo'} onclick={() => (stance = 'sumo')}>sumo</button>
				</div>
			</div>
		{/if}
		<button class="cta" onclick={create} disabled={!focus || busy}>
			<span>{busy ? 'Plan wird erstellt …' : 'Plan erstellen'}</span>
		</button>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
	{/if}
</main>

<style>
	.page {
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
		gap: 20px;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.icon {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--glass);
		box-shadow: var(--glass-edge);
	}
	.progress {
		flex: 1;
		display: flex;
		gap: 6px;
	}
	.progress i {
		flex: 1;
		height: 4px;
		border-radius: 4px;
		background: var(--sf2);
		transition: background 0.3s;
	}
	.progress i.on {
		background: var(--ac);
	}
	.count {
		font-size: 13px;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.opt {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 18px 20px;
		text-align: left;
		transition: box-shadow 0.2s;
	}
	.opt b {
		font-size: 17px;
		font-weight: 650;
	}
	.opt span {
		color: var(--mu);
		font-size: 14px;
	}
	.opt.sel {
		box-shadow:
			inset 0 0 0 2px var(--ac),
			var(--glass-edge);
	}
	.grid4 {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 10px;
	}
	.num-opt {
		align-items: center;
		padding: 18px 0 14px;
	}
	.num-opt b {
		font-size: 52px;
	}
	.hint {
		margin: 0;
		font-size: 15px;
		max-width: 40ch;
	}
	.hint b {
		color: var(--tx);
		font-weight: 600;
	}
	.fields {
		padding: 4px 18px;
	}
	.field {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--sf2);
	}
	.field:last-child {
		border: 0;
	}
	.field > span:first-child {
		font-weight: 600;
	}
	.input {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.input input {
		width: 4.2ch;
		text-align: right;
		font-size: 44px;
		background: transparent;
		border: 0;
		color: var(--ac-ink);
		padding: 0;
	}
	.input input::placeholder {
		color: var(--sf2);
	}
	.input input:focus {
		outline: none;
	}
	.input small {
		color: var(--mu);
	}
	.stance {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr;
		padding: 5px;
		border-radius: 999px;
		gap: 4px;
	}
	.seg button {
		padding: 11px 0;
		border-radius: 999px;
		font-weight: 600;
	}
	.seg button.sel {
		background: var(--ac);
		color: var(--on-ac);
	}
	.err {
		color: var(--danger);
		margin: 0;
	}
</style>
