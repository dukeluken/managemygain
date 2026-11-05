<script lang="ts">
	import { session } from '#lib/data/session.svelte.ts';
	import {
		WEEKDAY_LONG,
		WEEKDAY_SHORT,
		dayPrescription,
		dayTitle,
		estimatedMinutes,
		heroOf,
		isDeload,
		kg,
		nextDayIndex,
		parseIsoDate,
		weekCount,
		weekIndexAt,
		weekSlots
	} from '#lib/engine/index.ts';

	const today = new Date();
	const dateLabel = `${WEEKDAY_LONG[today.getDay()]}, ${today.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`;

	const plan = $derived(session.plan);
	const weekIndex = $derived(plan ? weekIndexAt(plan, today) : 0);
	const weeks = $derived(plan ? weekCount(plan.program) : 0);
	const inPlan = $derived(!!plan && weekIndex >= 0 && weekIndex < weeks);
	const slots = $derived(plan && inPlan ? weekSlots(plan, session.workouts, weekIndex, today) : []);
	const todaySlot = $derived(slots.find((s) => s.status === 'today'));
	const dayIndex = $derived(
		plan && inPlan ? (todaySlot?.dayIndex ?? nextDayIndex(plan.program, session.workouts, weekIndex)) : null
	);
	const day = $derived(plan && dayIndex != null ? plan.program.days[dayIndex] : null);
	const list = $derived(plan && dayIndex != null ? dayPrescription(plan.program, weekIndex, dayIndex) : []);
	const hero = $derived(heroOf(list));
	const rest = $derived(list.filter((p) => p !== hero));
	const inProgress = $derived(
		dayIndex != null &&
			session.workouts.some((w) => w.weekIndex === weekIndex && w.dayIndex === dayIndex && !w.finishedAt)
	);
	const doneCount = $derived(slots.filter((s) => s.status === 'done').length);
	const sessionCount = $derived(slots.filter((s) => s.dayIndex != null).length);
	const isToday = $derived(todaySlot?.dayIndex === dayIndex && dayIndex != null);
	const scheduledDay = $derived(day ? WEEKDAY_SHORT[day.weekDay] : '');

	function amount(p: { sets: number; reps: string; weight: number | null }) {
		return `${p.sets} × ${p.reps}${p.weight ? ` · ${kg(p.weight)} kg` : ''}`;
	}
</script>

<main class="page">
	{#if !plan}
		<div class="eyebrow"><span>{dateLabel}</span></div>
		<h1 class="title">Los geht's.</h1>
		<p class="muted lead">
			Beantworte ein paar kurze Fragen zu Ziel, Zeit und Erfahrung. Daraus entsteht dein Plan mit Gewichten für jede Woche.
		</p>
		<a class="cta" href="/start"><span>Plan erstellen</span><small>ca. 1 min</small></a>
	{:else if weekIndex < 0}
		<div class="eyebrow"><span>{dateLabel}</span></div>
		<h1 class="title">Bald geht's los.</h1>
		<p class="muted lead">Dein Plan startet am Montag, {parseIsoDate(plan.startDate).toLocaleDateString('de-DE')}.</p>
	{:else if !inPlan}
		<div class="eyebrow"><span>{dateLabel}</span><b>Block geschafft</b></div>
		<h1 class="title">{weeks} Wochen durchgezogen.</h1>
		<p class="muted lead">Zeit für den nächsten Block. Die neuen Gewichte bauen auf deinen geschätzten Bestwerten auf.</p>
		<a class="cta" href="/start"><span>Neuen Plan erstellen</span></a>
	{:else}
		<div class="eyebrow">
			<span>{dateLabel}</span><b>Woche {weekIndex + 1} von {weeks}</b>
		</div>

		{#if day}
			<div>
				<h1 class="title">{dayTitle(day)}</h1>
				<p class="muted sub">
					{isToday ? 'Heute' : `Nächstes Training · geplant für ${scheduledDay}`}{isDeload(plan.program, weekIndex)
						? ' · Entlastungswoche'
						: ''}
				</p>
			</div>

			{#if hero}
				<section class="tile hero" aria-label="Hauptübung">
					<div class="lab"><b>{hero.exercise}</b>{hero.sets} × {hero.reps} Wdh.</div>
					<div class="display num big">{kg(hero.weight)}<small> kg</small></div>
				</section>
			{/if}

			{#if rest.length}
				<section class="tile list" aria-label="Weitere Übungen">
					{#each rest as p, i (i)}
						<div class="row"><b>{p.exercise}</b><span class="num">{amount(p)}</span></div>
					{/each}
				</section>
			{/if}

			<a class="cta" href="/training?w={weekIndex}&d={dayIndex}">
				<span>{inProgress ? 'Training fortsetzen' : 'Training starten'}</span>
				<small>~{estimatedMinutes(list)} min</small>
			</a>
		{:else}
			<div>
				<h1 class="title">Woche geschafft.</h1>
				<p class="muted sub">Alle Einheiten erledigt. Erhol dich gut, nächste Woche geht's weiter.</p>
			</div>
		{/if}

		<section aria-label="Diese Woche">
			<div class="eyebrow week-head"><span>Diese Woche</span><span>{doneCount} von {sessionCount} Einheiten</span></div>
			<div class="tile week">
				{#each slots as s (s.weekDay)}
					<span class="slot {s.status}" title={s.status}>
						<i></i>{WEEKDAY_SHORT[s.weekDay]}
					</span>
				{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	.lead {
		margin: 0;
		font-size: 16px;
		max-width: 36ch;
	}
	.sub {
		margin: 6px 0 0;
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px 18px 18px;
	}
	.lab {
		font-size: 13px;
		color: var(--mu);
	}
	.lab b {
		color: var(--tx);
		font-weight: 600;
		margin-right: 6px;
	}
	.big {
		font-size: 88px;
		color: var(--ac-ink);
	}
	.big small {
		font-size: 30px;
		color: var(--tx);
		letter-spacing: 0;
	}
	.list {
		padding: 4px 18px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--sf2);
	}
	.row:last-child {
		border: 0;
	}
	.row b {
		font-weight: 600;
	}
	.row span {
		color: var(--mu);
		white-space: nowrap;
	}
	.week-head {
		margin-bottom: 10px;
	}
	.week {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
		padding: 12px 8px;
		text-align: center;
	}
	.slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--mu);
	}
	.slot i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--sf2);
	}
	.slot.rest i {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--sf2);
	}
	.slot.done i {
		background: var(--tx);
	}
	.slot.today,
	.slot.next {
		color: var(--ac-ink);
		font-weight: 700;
	}
	.slot.today i,
	.slot.next i {
		background: var(--ac);
	}
	.slot.missed i {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--mu);
	}
</style>
