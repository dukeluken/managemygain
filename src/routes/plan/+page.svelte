<script lang="ts">
	import { session } from '#lib/data/session.svelte.ts';
	import {
		WEEKDAY_SHORT,
		dayPrescription,
		dayTitle,
		isDeload,
		kg,
		weekCount,
		weekIndexAt,
		weekSlots
	} from '#lib/engine/index.ts';
	import Icon from '#lib/ui/Icon.svelte';

	const today = new Date();
	const plan = $derived(session.plan);
	const weeks = $derived(plan ? weekCount(plan.program) : 0);
	const current = $derived(plan ? Math.min(Math.max(0, weekIndexAt(plan, today)), weeks - 1) : 0);

	let chosen = $state<number | null>(null);
	const week = $derived(chosen ?? current);
	let open = $state<number | null>(null);

	const slots = $derived(plan ? weekSlots(plan, session.workouts, week, today) : []);
	const nextDeload = $derived(
		plan ? Array.from({ length: weeks }, (_, i) => i).find((i) => i > week && isDeload(plan.program, i)) : undefined
	);

	const STATUS: Record<string, string> = {
		done: 'erledigt',
		today: 'heute',
		next: 'als Nächstes',
		missed: 'offen',
		planned: '',
		rest: ''
	};

	function amount(p: { sets: number; reps: string; weight: number | null }) {
		return `${p.sets} × ${p.reps}${p.weight ? ` · ${kg(p.weight)} kg` : ''}`;
	}
</script>

<main class="page">
	{#if !plan}
		<h1 class="title">Noch kein Plan.</h1>
		<a class="cta" href="/start"><span>Plan erstellen</span></a>
	{:else}
		<div class="eyebrow">
			<span>{plan.name}</span><span>{weeks} Wochen</span>
		</div>
		<div>
			<h1 class="title">Woche {week + 1}</h1>
			<p class="muted sub">
				{isDeload(plan.program, week) ? 'Entlastungswoche · weniger Sätze, leichtere Gewichte' : 'Aufbau'}{nextDeload != null &&
				!isDeload(plan.program, week)
					? ` · Entlastung in Woche ${nextDeload + 1}`
					: ''}
			</p>
		</div>

		<div class="weeks" role="tablist" aria-label="Wochen">
			{#each Array.from({ length: weeks }, (_, i) => i) as i (i)}
				<button
					role="tab"
					aria-selected={i === week}
					class:cur={i === week}
					class:now={i === current}
					onclick={() => {
						chosen = i;
						open = null;
					}}
				>
					<span class="num">{i + 1}</span>
					{#if isDeload(plan.program, i)}<small>LEICHT</small>{/if}
				</button>
			{/each}
		</div>

		<section class="tile days" aria-label="Tage der Woche {week + 1}">
			{#each slots as s (s.weekDay)}
				{#if s.dayIndex == null}
					<div class="day rest">
						<span class="d">{WEEKDAY_SHORT[s.weekDay]}</span><span class="t">Ruhetag</span><span></span>
					</div>
				{:else}
					{@const d = plan.program.days[s.dayIndex]}
					<button
						class="day {s.status}"
						aria-expanded={open === s.dayIndex}
						onclick={() => (open = open === s.dayIndex ? null : s.dayIndex)}
					>
						<span class="d">{WEEKDAY_SHORT[s.weekDay]}</span>
						<span class="t">{dayTitle(d)}</span>
						<span class="s">{STATUS[s.status]}<Icon name="chevron" size={16} /></span>
					</button>
					{#if open === s.dayIndex}
						<div class="sub-list">
							{#each dayPrescription(plan.program, week, s.dayIndex) as p, i (i)}
								<div class="ex"><span>{p.exercise}</span><span class="num muted">{amount(p)}</span></div>
							{/each}
							{#if s.status !== 'done'}
								<a class="start" href="/training?w={week}&d={s.dayIndex}">Dieses Training starten</a>
							{/if}
						</div>
					{/if}
				{/if}
			{/each}
		</section>
	{/if}
</main>

<style>
	.sub {
		margin: 6px 0 0;
	}
	.weeks {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
		margin-inline: calc(var(--gutter) * -1);
		padding-inline: var(--gutter);
	}
	.weeks::-webkit-scrollbar {
		display: none;
	}
	.weeks button {
		flex: 0 0 auto;
		width: 38px;
		height: 46px;
		border-radius: 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		font-size: 14px;
		font-weight: 600;
		color: var(--mu);
		background: var(--glass);
		box-shadow: var(--glass-edge);
	}
	.weeks button small {
		font-size: 8px;
		letter-spacing: 0.04em;
		color: var(--ok);
	}
	.weeks button.now {
		color: var(--tx);
	}
	.weeks button.cur {
		background: var(--ac);
		color: var(--on-ac);
	}
	.weeks button.cur small {
		color: var(--on-ac);
	}
	.days {
		padding: 2px 16px;
	}
	.day {
		width: 100%;
		display: grid;
		grid-template-columns: 36px 1fr auto;
		gap: 10px;
		align-items: center;
		padding: 14px 0;
		border-bottom: 1px solid var(--sf2);
		text-align: left;
	}
	.days > :last-child {
		border-bottom: 0;
	}
	.d {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--mu);
	}
	.t {
		font-weight: 600;
	}
	.s {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--mu);
	}
	.day[aria-expanded='true'] .s :global(svg) {
		transform: rotate(90deg);
	}
	.day.rest .t {
		color: var(--mu);
		font-weight: 400;
	}
	.day.done .s {
		color: var(--ok);
	}
	.day.today .d,
	.day.today .t,
	.day.next .d,
	.day.next .t {
		color: var(--ac-ink);
	}
	.day.missed .s {
		color: var(--danger);
	}
	.sub-list {
		display: flex;
		flex-direction: column;
		padding: 0 0 12px 46px;
		font-size: 14px;
		border-bottom: 1px solid var(--sf2);
	}
	.ex {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 0;
	}
	.ex span:last-child {
		white-space: nowrap;
	}
	.start {
		margin-top: 8px;
		color: var(--ac-ink);
		font-weight: 600;
		text-decoration: none;
	}
</style>
