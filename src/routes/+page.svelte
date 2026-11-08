<script lang="ts">
	import { session } from '#lib/data/session.svelte.ts';
	import {
		programLifts,
		BLOCK_LABEL,
		LIFT_LABEL,
		blockOf,
		WEEKDAY_LONG,
		WEEKDAY_SHORT,
		dayPrescription,
		dayTitle,
		estimatedMax,
		estimatedMinutes,
		heroOf,
		isDeload,
		kg,
		nextDayIndex,
		parseIsoDate,
		progressSeries,
		weekCount,
		weekIndexAt,
		rpeLabel,
		weekSlots
	} from '#lib/engine/index.ts';
	import Sparkline from '#lib/ui/Sparkline.svelte';

	const today = new Date();
	const dateLabel = `${WEEKDAY_LONG[today.getDay()]}, ${today.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}`;

	const firstName = $derived((session.profile?.displayName ?? session.user?.displayName ?? '').split(' ')[0]);
	const plan = $derived(session.plan);
	const weekIndex = $derived(plan ? weekIndexAt(plan, today) : 0);
	const weeks = $derived(plan ? weekCount(plan.program) : 0);
	const inPlan = $derived(!!plan && weekIndex >= 0 && weekIndex < weeks);

	// Nächstes Training
	const slots = $derived(plan && inPlan ? weekSlots(plan, session.workouts, weekIndex, today) : []);
	const todaySlot = $derived(slots.find((s) => s.status === 'today'));
	const dayIndex = $derived(
		plan && inPlan ? (todaySlot?.dayIndex ?? nextDayIndex(plan.program, session.workouts, weekIndex)) : null
	);
	const day = $derived(plan && dayIndex != null ? plan.program.days[dayIndex] : null);
	const list = $derived(plan && dayIndex != null ? dayPrescription(plan.program, weekIndex, dayIndex) : []);
	const hero = $derived(heroOf(list));
	const isToday = $derived(dayIndex != null && todaySlot?.dayIndex === dayIndex);
	const inProgress = $derived(
		dayIndex != null &&
			session.workouts.some((w) => w.weekIndex === weekIndex && w.dayIndex === dayIndex && !w.finishedAt)
	);

	// Woche und Block
	const doneCount = $derived(slots.filter((s) => s.status === 'done').length);
	const sessionCount = $derived(slots.filter((s) => s.dayIndex != null).length);
	const nextDeload = $derived(
		plan ? Array.from({ length: weeks }, (_, i) => i).find((i) => i >= weekIndex && isDeload(plan.program, i)) : undefined
	);

	// Fortschritt
	const series = $derived(plan ? progressSeries(plan, session.workouts) : null);
	const progress = $derived(
		plan && series
			? programLifts(plan.program).map((lift) => {
					const values = (series[lift] ?? []).map((p) => p.value);
					const current = values.length ? values[values.length - 1] : estimatedMax(plan.program, lift, weekIndex);
					const start = values[0] ?? current;
					return { lift, values, current, delta: current != null && start != null ? current - start : 0 };
				}).filter((p) => p.current != null)
			: []
	);

	const block = $derived(plan ? blockOf(plan) : null);
	const nextBlock = $derived(block === 'hypertrophy' ? 'strength' : 'hypertrophy');

	// Zuletzt
	const last = $derived(
		[...session.workouts]
			.filter((w) => w.finishedAt)
			.sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))[0]
	);
	const lastSets = $derived(last ? last.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) : 0);
	const totalDone = $derived(session.workouts.filter((w) => w.finishedAt).length);

	function shortDate(iso: string) {
		const d = parseIsoDate(iso);
		return `${WEEKDAY_SHORT[d.getDay()]}, ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`;
	}
	function signed(n: number) {
		const r = Math.round(n * 10) / 10;
		return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${kg(Math.abs(r))}`;
	}
</script>

<main class="page">
	<div class="eyebrow"><span>{dateLabel}</span>{#if inPlan}<b>Woche {weekIndex + 1} von {weeks}</b>{/if}</div>
	<h1 class="title">{firstName ? `Hallo, ${firstName}.` : 'Hallo.'}</h1>

	{#if !plan}
		<p class="muted lead">
			Beantworte ein paar kurze Fragen zu Ziel, Zeit und Erfahrung. Daraus entsteht dein Plan mit Gewichten für jede Woche.
		</p>
		<a class="cta" href="/start" data-tour="create"><span>Plan erstellen</span><small>ca. 1 min</small></a>
	{:else if weekIndex < 0}
		<p class="muted lead">Dein Plan startet am Montag, {parseIsoDate(plan.startDate).toLocaleDateString('de-DE')}.</p>
	{:else if !inPlan}
		<section class="tile card">
			<div class="label"><b>{block ? `${BLOCK_LABEL[block]} geschafft` : 'Plan geschafft'}</b></div>
			<p class="muted">
				{weeks} Wochen durchgezogen.{block && (plan.goal === 'strength' || plan.goal === 'powerlifting')
					? ` Als Nächstes passt ein ${BLOCK_LABEL[nextBlock]}.`
					: ''} Prüfe vorher deine Bestwerte im Profil.
			</p>
			<a class="cta" href="/start"><span>Nächsten Block planen</span></a>
		</section>
	{:else}
		<!-- Nächstes Training -->
		{#if day}
			<section class="tile card next" aria-label="Nächstes Training" data-tour="next">
				<div class="label">
					<b>{isToday ? 'Heute' : 'Als Nächstes'}</b>
					<span class="muted">{isToday ? '' : `geplant für ${WEEKDAY_LONG[day.weekDay]}`}</span>
				</div>
				<div class="next-main">
					<div>
						<h2 class="display">{dayTitle(day)}</h2>
						<p class="muted meta">
							{list.length} Übungen{isDeload(plan.program, weekIndex) ? ' · Entlastungswoche' : ''}
						</p>
					</div>
					{#if hero?.weight}
						<div class="hero-num">
							<span class="display num">{kg(hero.weight)}</span>
							<small class="muted">kg · {hero.exercise}</small>
							<small class="muted">{hero.sets} × {hero.reps} Wdh. · RPE {rpeLabel(hero.rpe)}</small>
						</div>
					{/if}
				</div>
				<a class="cta" href="/training?w={weekIndex}&d={dayIndex}">
					<span>{inProgress ? 'Training fortsetzen' : 'Training starten'}</span>
					<small>~{estimatedMinutes(list)} min</small>
				</a>
			</section>
		{:else}
			<section class="tile card">
				<div class="label"><b>Woche geschafft</b></div>
				<p class="muted">Alle Einheiten erledigt. Erhol dich gut, nächste Woche geht's weiter.</p>
			</section>
		{/if}

		<!-- Woche und Block -->
		<div class="pair" data-tour="week">
			<section class="tile small" aria-label="Diese Woche">
				<div class="label"><span class="muted">Diese Woche</span></div>
				<div class="figure"><span class="display num">{doneCount}</span><small class="muted">von {sessionCount}</small></div>
				<div class="dots">
					{#each slots as s (s.weekDay)}
						<span class="dot {s.status}" title="{WEEKDAY_SHORT[s.weekDay]}: {s.status}"><i></i>{WEEKDAY_SHORT[s.weekDay][0]}</span>
					{/each}
				</div>
			</section>
			<a class="tile small" href="/plan" aria-label="Block, zum Plan">
				<div class="label"><span class="muted">{block ? BLOCK_LABEL[block] : 'Plan'}</span></div>
				<div class="figure"><span class="display num">{weekIndex + 1}</span><small class="muted">von {weeks} Wochen</small></div>
				<div class="bar" aria-hidden="true">
					{#each Array.from({ length: weeks }, (_, i) => i) as i (i)}
						<i class:done={i < weekIndex} class:cur={i === weekIndex} class:deload={isDeload(plan.program, i)}></i>
					{/each}
				</div>
				<small class="muted foot">
					{nextDeload === weekIndex ? 'Jetzt: Entlastungswoche' : nextDeload != null ? `Entlastung in Woche ${nextDeload + 1}` : 'Letzte Phase'}
				</small>
			</a>
		</div>
	{/if}

	{#if plan && progress.length}
		<section aria-label="Fortschritt" data-tour="progress">
			<div class="eyebrow head"><span>Fortschritt · geschätzte Bestwerte</span><span>{totalDone} Trainings</span></div>
			<div class="tile progress">
				{#each progress as p (p.lift)}
					<div class="prow">
						<div class="pname">
							<span>{LIFT_LABEL[p.lift]}</span>
							<small class:up={p.delta > 0.05} class:muted={p.delta <= 0.05}>{signed(p.delta)} kg seit Start</small>
						</div>
						<Sparkline
							values={p.values.length ? p.values : [p.current ?? 0]}
							label="{LIFT_LABEL[p.lift]}: von {kg(Math.round(p.values[0] ?? p.current ?? 0))} auf {kg(Math.round(p.current ?? 0))} kg"
						/>
						<b class="display num pval">{kg(Math.round(p.current ?? 0))}</b>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if last}
		<section aria-label="Zuletzt">
			<div class="eyebrow head"><span>Zuletzt</span><a class="all" href="/verlauf">Alle Trainings</a></div>
			<a class="tile lastw" href="/verlauf/{encodeURIComponent(last.id)}">
				<div>
					<b>{last.dayName}</b>
					<small class="muted">{shortDate(last.date)} · Woche {last.weekIndex + 1}</small>
				</div>
				<span class="muted num">{lastSets ? `${lastSets} Sätze` : 'erledigt'}</span>
			</a>
		</section>
	{/if}
</main>

<style>
	.lead {
		margin: 0;
		font-size: 16px;
		max-width: 36ch;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
	}
	.card p {
		margin: 0;
	}
	.label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		font-size: 13px;
	}
	.label b {
		color: var(--ac-ink);
		font-weight: 650;
	}
	.next-main {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
	}
	.next-main h2 {
		margin: 0;
		font-size: 34px;
		text-wrap: balance;
	}
	.meta {
		margin: 6px 0 0 !important;
		font-size: 13px;
	}
	.hero-num {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		flex: none;
	}
	.hero-num .display {
		font-size: 64px;
		color: var(--ac-ink);
	}
	.hero-num small {
		font-size: 12px;
		white-space: nowrap;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.small {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px 16px;
		text-decoration: none;
		min-width: 0;
	}
	.figure {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.figure .display {
		font-size: 44px;
	}
	.figure small {
		font-size: 13px;
	}
	.dots {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
		text-align: center;
	}
	.dot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		color: var(--mu);
	}
	.dot i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--sf2);
	}
	.dot.rest i {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--sf2);
	}
	.dot.done i {
		background: var(--tx);
	}
	.dot.today,
	.dot.next {
		color: var(--ac-ink);
		font-weight: 700;
	}
	.dot.today i,
	.dot.next i {
		background: var(--ac);
	}
	.dot.missed i {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--mu);
	}
	.bar {
		display: flex;
		gap: 2px;
		height: 8px;
	}
	.bar i {
		flex: 1;
		border-radius: 3px;
		background: var(--sf2);
	}
	.bar i.done {
		background: var(--tx);
	}
	.bar i.cur {
		background: var(--ac);
	}
	.bar i.deload:not(.cur) {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--ok);
	}
	.foot {
		font-size: 12px;
	}
	.head {
		margin-bottom: 10px;
	}
	.progress {
		padding: 4px 18px;
	}
	.prow {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 96px 62px;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--sf2);
	}
	.prow:last-child {
		border: 0;
	}
	.pname {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.pname span {
		font-weight: 600;
	}
	.pname small {
		font-size: 12px;
	}
	.pname small.up {
		color: var(--ok);
	}
	.pval {
		font-size: 32px;
		text-align: right;
	}
	.all {
		color: var(--ac-ink);
		font-weight: 600;
		text-decoration: none;
	}
	.lastw {
		text-decoration: none;
		color: inherit;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
	}
	.lastw div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.lastw small {
		font-size: 12px;
	}
	@media (max-width: 360px) {
		.pair {
			grid-template-columns: 1fr;
		}
		.next-main {
			flex-direction: column;
			align-items: flex-start;
		}
		.hero-num {
			align-items: flex-start;
		}
	}
</style>
