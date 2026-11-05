<script lang="ts">
	import { goto } from '$app/navigation';
	import { session } from '#lib/data/session.svelte.ts';
	import type { Bests, Block, Experience, Goal, MainLift, PlanRequest } from '#lib/data/types.ts';
	import {
		BLOCK_LABEL,
		DAYS_FOR_GOAL,
		GOAL_LABEL,
		LIFT_LABEL,
		hasBlocks,
		kg,
		liftsForGoal,
		splitLabel
	} from '#lib/engine/index.ts';
	import BestField from '#lib/ui/BestField.svelte';
	import Icon from '#lib/ui/Icon.svelte';

	// Die Antworten bilden ein PlanRequest. Später füllt der KI-Coach dasselbe Objekt.
	// Bei einem Folgeplan sind die letzten Antworten vorausgefüllt.
	const prev = session.plan?.request ?? null;
	let goal = $state<Goal | null>(prev?.goal ?? null);
	let block = $state<Block>(prev?.block === 'hypertrophy' ? 'strength' : prev?.block === 'strength' ? 'hypertrophy' : 'hypertrophy');
	let days = $state<number | null>(prev?.daysPerWeek ?? null);
	let experience = $state<Experience | null>(prev?.experience ?? null);
	let focus = $state<Exclude<MainLift, 'press'>>(prev?.focus ?? 'squat');
	let stance = $state<'conventional' | 'sumo'>(prev?.deadliftStance ?? 'conventional');
	const known = session.profile?.bests ?? {};
	let bests = $state<Record<MainLift, number | null>>({
		squat: known.squat ?? null,
		bench: known.bench ?? null,
		deadlift: known.deadlift ?? null,
		press: known.press ?? null
	});

	let step = $state(0);
	let busy = $state(false);
	let error = $state<string | null>(null);

	type Step = 'goal' | 'block' | 'days' | 'experience' | 'bests' | 'focus' | 'summary';
	const steps = $derived<Step[]>([
		'goal',
		...(goal && hasBlocks(goal) ? (['block'] as Step[]) : []),
		'days',
		'experience',
		'bests',
		...(goal === 'powerlifting' ? (['focus'] as Step[]) : []),
		'summary'
	]);
	const current = $derived(steps[Math.min(step, steps.length - 1)]);
	const lifts = $derived(goal ? liftsForGoal(goal) : []);
	const dayOptions = $derived(goal ? DAYS_FOR_GOAL[goal] : []);
	const enteredBests = $derived(lifts.filter((l) => bests[l] != null));

	function next() {
		if (step < steps.length - 1) step++;
	}
	function back() {
		if (step > 0) step--;
		else if (history.length > 1) history.back();
		else goto('/');
	}
	function chooseGoal(g: Goal) {
		goal = g;
		if (days != null && !DAYS_FOR_GOAL[g].includes(days)) days = null;
		next();
	}

	async function create() {
		if (!session.user || !goal || !days || !experience) return;
		busy = true;
		error = null;
		const chosen: Bests = Object.fromEntries(lifts.map((l) => [l, bests[l]]));
		const req: PlanRequest = {
			goal,
			daysPerWeek: days as PlanRequest['daysPerWeek'],
			experience,
			bests: chosen,
			...(hasBlocks(goal) ? { block } : {}),
			...(goal === 'powerlifting' ? { focus, deadliftStance: stance } : {})
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

	const GOALS: { value: Goal; hint: string }[] = [
		{ value: 'hypertrophy', hint: 'Muskeln aufbauen, Bodybuilding-Stil, alle Muskelgruppen' },
		{ value: 'strength', hint: 'Stärker werden in Kniebeuge, Bankdrücken, Kreuzheben und Schulterdrücken' },
		{ value: 'powerlifting', hint: 'Wettkampf in Kniebeuge, Bankdrücken und Kreuzheben' },
		{ value: 'fitness', hint: 'Fit und gesund bleiben, moderate Gewichte, wenig Zeitaufwand' }
	];
	const BLOCKS: { value: Block; hint: string }[] = [
		{ value: 'hypertrophy', hint: 'Mehr Wiederholungen und Sätze. Baut Muskelmasse als Basis für späteren Kraftzuwachs.' },
		{ value: 'strength', hint: 'Weniger Wiederholungen, schwerere Gewichte. Macht aus Muskelmasse Maximalkraft.' }
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
		<div class="progress" aria-label="Schritt {step + 1} von {steps.length}">
			{#each steps as s, i (s)}<i class:on={i <= step}></i>{/each}
		</div>
		<span class="count muted num">{step + 1}/{steps.length}</span>
	</header>

	{#if current === 'goal'}
		<h1 class="title">Was ist dein Ziel?</h1>
		<div class="options">
			{#each GOALS as g (g.value)}
				<button class="opt tile" class:sel={goal === g.value} onclick={() => chooseGoal(g.value)}>
					<b>{GOAL_LABEL[g.value]}</b><span>{g.hint}</span>
				</button>
			{/each}
		</div>
	{:else if current === 'block'}
		<h1 class="title">Welcher Block?</h1>
		<p class="muted hint">
			Gute Programme wechseln zwischen Aufbau- und Kraftblöcken. {prev?.block
				? `Nach deinem ${BLOCK_LABEL[prev.block]} ist jetzt der andere dran.`
				: 'Wenn du unsicher bist, fang mit dem Aufbaublock an.'}
		</p>
		<div class="options">
			{#each BLOCKS as b (b.value)}
				<button
					class="opt tile"
					class:sel={block === b.value}
					onclick={() => {
						block = b.value;
						next();
					}}
				>
					<b>{BLOCK_LABEL[b.value]}</b><span>{b.hint}</span>
				</button>
			{/each}
		</div>
	{:else if current === 'days'}
		<h1 class="title">Wie oft pro Woche kannst du trainieren?</h1>
		<div class="options">
			{#each dayOptions as d (d)}
				<button
					class="opt tile row-opt"
					class:sel={days === d}
					onclick={() => {
						days = d;
						next();
					}}
				>
					<b class="display num">{d}</b>
					<span><b class="plain">{d} Tage</b>{goal ? splitLabel(goal, d) : ''}</span>
				</button>
			{/each}
		</div>
		<p class="muted hint">Lieber realistisch als ehrgeizig. Ein Plan, den du durchziehst, bringt mehr.</p>
	{:else if current === 'experience'}
		<h1 class="title">Wie lange trainierst du schon?</h1>
		<div class="options">
			{#each LEVELS as l (l.value)}
				<button
					class="opt tile"
					class:sel={experience === l.value}
					onclick={() => {
						experience = l.value;
						next();
					}}
				>
					<b>{l.label}</b><span>{l.hint}</span>
				</button>
			{/each}
		</div>
	{:else if current === 'bests'}
		<h1 class="title">Deine Bestwerte</h1>
		<p class="muted hint">
			Dein Maximum für eine Wiederholung. Daraus berechnet der Plan jedes Gewicht. Übungen, die du nicht kennst oder nicht
			machst, lässt du leer; dort trägst du im ersten Training dein Gewicht selbst ein.
		</p>
		<div class="tile fields">
			{#each lifts as l (l)}
				<BestField id="best-{l}" label={LIFT_LABEL[l]} bind:value={bests[l]} />
			{/each}
		</div>
		<button class="cta" onclick={next}>
			<span>{enteredBests.length ? 'Weiter' : 'Ohne Bestwerte weiter'}</span>
		</button>
	{:else if current === 'focus'}
		<h1 class="title">Welche Übung soll am meisten wachsen?</h1>
		<div class="options">
			{#each ['squat', 'bench', 'deadlift'] as const as l (l)}
				<button class="opt tile" class:sel={focus === l} onclick={() => (focus = l)}>
					<b>{LIFT_LABEL[l]}</b>
				</button>
			{/each}
		</div>
		<div class="stance">
			<span class="muted">Kreuzheben ziehst du</span>
			<div class="seg tile">
				<button class:sel={stance === 'conventional'} onclick={() => (stance = 'conventional')}>konventionell</button>
				<button class:sel={stance === 'sumo'} onclick={() => (stance = 'sumo')}>sumo</button>
			</div>
		</div>
		<button class="cta" onclick={next}><span>Weiter</span></button>
	{:else if current === 'summary' && goal && days && experience}
		<h1 class="title">Dein Plan</h1>
		<section class="tile summary">
			<div class="srow"><span class="muted">Ziel</span><b>{GOAL_LABEL[goal]}</b></div>
			{#if hasBlocks(goal)}
				<div class="srow"><span class="muted">Block</span><b>{BLOCK_LABEL[block]}</b></div>
			{/if}
			<div class="srow">
				<span class="muted">Woche</span><b>{days} Tage · {splitLabel(goal, days)}</b>
			</div>
			<div class="srow">
				<span class="muted">Erfahrung</span><b>{LEVELS.find((l) => l.value === experience)?.label}</b>
			</div>
			<div class="srow">
				<span class="muted">Bestwerte</span>
				<b class="num">
					{enteredBests.length
						? enteredBests.map((l) => `${LIFT_LABEL[l]} ${kg(bests[l])}`).join(' · ')
						: 'werden im ersten Training geschätzt'}
				</b>
			</div>
		</section>
		<p class="muted hint">Alles lässt sich später ändern: Übungen im Plan, Bestwerte im Profil.</p>
		<button class="cta" onclick={create} disabled={busy}>
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
	.row-opt {
		flex-direction: row;
		align-items: center;
		gap: 18px;
		padding: 14px 20px;
	}
	.row-opt .display {
		font-size: 44px;
		width: 1ch;
	}
	.row-opt span {
		display: flex;
		flex-direction: column;
	}
	.row-opt .plain {
		color: var(--tx);
		font-size: 16px;
	}
	.hint {
		margin: 0;
		font-size: 15px;
		max-width: 44ch;
	}
	.fields {
		padding: 0 18px;
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
	.summary {
		padding: 4px 18px;
	}
	.srow {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
		padding: 13px 0;
		border-bottom: 1px solid var(--sf2);
	}
	.srow:last-child {
		border: 0;
	}
	.srow b {
		text-align: right;
		font-weight: 600;
	}
	.err {
		color: var(--danger);
		margin: 0;
	}
</style>
