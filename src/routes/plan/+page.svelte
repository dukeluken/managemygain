<script lang="ts">
	import { session } from '#lib/data/session.svelte.ts';
	import {
		WEEKDAY_LONG,
		WEEKDAY_SHORT,
		WEEK_ORDER,
		BLOCK_LABEL,
		blockDescription,
		blockOf,
		addExercise,
		amountLabel,
		dayPrescription,
		dayTitle,
		exerciseCatalog,
		isDeload,
		moveDay,
		weekCount,
		weekIndexAt,
		weekSlots
	} from '#lib/engine/index.ts';
	import ExerciseEditor from '#lib/ui/ExerciseEditor.svelte';
	import ExercisePicker from '#lib/ui/ExercisePicker.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import PlanSettings from '#lib/ui/PlanSettings.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';

	const today = new Date();
	const plan = $derived(session.plan);
	const weeks = $derived(plan ? weekCount(plan.program) : 0);
	const current = $derived(plan ? Math.min(Math.max(0, weekIndexAt(plan, today)), weeks - 1) : 0);

	let chosen = $state<number | null>(null);
	const week = $derived(chosen ?? current);
	let open = $state<number | null>(null);
	let editing = $state<{ dayIndex: number; exIndex: number } | null>(null);
	let adding = $state<number | null>(null);
	let movingDay = $state<number | null>(null);
	let settings = $state(false);

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
				{isDeload(plan.program, week)
					? 'Entlastungswoche · weniger Sätze, leichtere Gewichte'
					: (blockOf(plan) ? BLOCK_LABEL[blockOf(plan)!] : 'Training')}{nextDeload != null &&
				!isDeload(plan.program, week)
					? ` · Entlastung in Woche ${nextDeload + 1}`
					: ''}
			</p>
		</div>

		<div class="weeks" role="tablist" aria-label="Wochen" data-tour="weeks">
			{#each Array.from({ length: weeks }, (_, i) => i) as i (i)}
				<button
					role="tab"
					aria-selected={i === week}
					class:cur={i === week}
					class:now={i === current}
					onclick={() => {
						chosen = i;
					}}
				>
					<span class="num">{i + 1}</span>
					{#if isDeload(plan.program, i)}<small>LEICHT</small>{/if}
				</button>
			{/each}
		</div>

		<section class="tile days" aria-label="Tage der Woche {week + 1}" data-tour="days">
			{#each slots as s (s.weekDay)}
				{#if s.dayIndex == null}
					<div class="day rest">
						<span class="d">{WEEKDAY_SHORT[s.weekDay]}</span><span class="t">Ruhetag</span><span></span>
					</div>
				{:else}
					{@const dayIndex = s.dayIndex}
					{@const d = plan.program.days[dayIndex]}
					<button
						class="day {s.status}"
						aria-expanded={open === dayIndex}
						onclick={() => (open = open === dayIndex ? null : dayIndex)}
					>
						<span class="d">{WEEKDAY_SHORT[s.weekDay]}</span>
						<span class="t">{dayTitle(d)}</span>
						<span class="s">{STATUS[s.status]}<Icon name="chevron" size={16} /></span>
					</button>
					{#if open === dayIndex}
						<div class="sub-list">
							{#each dayPrescription(plan.program, week, dayIndex) as p, exIndex (exIndex)}
								<button class="ex" onclick={() => (editing = { dayIndex, exIndex })}>
									<span class="name">{p.exercise}</span>
									<span class="num muted amount">{amountLabel(p)}</span>
									<Icon name="edit" size={16} />
								</button>
							{/each}
							<div class="day-actions">
								<button class="link" onclick={() => (adding = dayIndex)}>+ Übung</button>
								<button class="link" onclick={() => (movingDay = dayIndex)}>Wochentag ändern</button>
								{#if s.status !== 'done'}
									<a class="link strong" href="/training?w={week}&d={dayIndex}">Starten</a>
								{/if}
							</div>
						</div>
					{/if}
				{/if}
			{/each}
		</section>
		<p class="muted hint">{blockDescription(plan)}. Tippe auf einen Tag und dann auf eine Übung, um sie zu ändern.</p>
		<button class="ghost adjust" onclick={() => (settings = true)} data-tour="adjust"><Icon name="edit" size={18} />Plan anpassen</button>
	{/if}
</main>

{#if plan && settings}
	<PlanSettings {plan} onclose={() => (settings = false)} />
{/if}

{#if plan && editing}
	<ExerciseEditor
		program={plan.program}
		dayIndex={editing.dayIndex}
		exIndex={editing.exIndex}
		{week}
		onclose={() => (editing = null)}
	/>
{/if}

{#if plan && adding != null}
	{@const dayIndex = adding}
	<Sheet title="Übung hinzufügen" onclose={() => (adding = null)}>
		<p class="muted note">
			Wird am {WEEKDAY_LONG[plan.program.days[dayIndex].weekDay]} in allen Wochen angehängt, mit 3 Sätzen.
		</p>
		<ExercisePicker
			catalog={exerciseCatalog(plan.goal)}
			onpick={(item) => {
				session.editPlan((prog) => addExercise(prog, dayIndex, item, week));
				adding = null;
			}}
		/>
	</Sheet>
{/if}

{#if plan && movingDay != null}
	{@const dayIndex = movingDay}
	{@const day = plan.program.days[dayIndex]}
	<Sheet title="{dayTitle(day)} verschieben" onclose={() => (movingDay = null)}>
		<p class="muted note">Gilt für alle Wochen. Liegt dort schon ein Training, tauschen beide Tage.</p>
		<div class="weekdays">
			{#each WEEK_ORDER as wd (wd)}
				{@const other = plan.program.days.find((x, i) => i !== dayIndex && x.weekDay === wd)}
				<button
					class:sel={day.weekDay === wd}
					onclick={() => {
						session.editPlan((prog) => moveDay(prog, dayIndex, wd));
						movingDay = null;
					}}
				>
					<b>{WEEKDAY_SHORT[wd]}</b>
					<small>{day.weekDay === wd ? 'jetzt' : other ? 'tauschen' : 'frei'}</small>
				</button>
			{/each}
		</div>
	</Sheet>
{/if}

{#if session.error}
	<p class="toast" role="alert">{session.error}</p>
{/if}

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
		display: grid;
		grid-template-columns: 1fr auto 16px;
		align-items: center;
		gap: 10px;
		padding: 9px 0;
		text-align: left;
		color: var(--mu);
	}
	.ex .name {
		color: var(--tx);
	}
	.amount {
		white-space: nowrap;
	}
	.day-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		margin-top: 8px;
	}
	.link {
		color: var(--ac-ink);
		font-weight: 600;
		font-size: 14px;
		text-decoration: none;
		padding: 6px 0;
	}
	.link.strong {
		margin-left: auto;
	}
	.hint {
		margin: 0;
		font-size: 13px;
	}
	.adjust {
		align-self: stretch;
		padding: 15px 20px;
	}
	.note {
		margin: 0;
		font-size: 13px;
	}
	.weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
	}
	.weekdays button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 12px 0;
		border-radius: 14px;
		background: var(--sf2);
	}
	.weekdays small {
		font-size: 10px;
		color: var(--mu);
	}
	.weekdays button.sel {
		background: var(--ac);
		color: var(--on-ac);
	}
	.weekdays button.sel small {
		color: var(--on-ac);
	}
	.toast {
		position: fixed;
		z-index: 50;
		left: 16px;
		right: 16px;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 96px);
		max-width: 520px;
		margin: 0 auto;
		padding: 12px 16px;
		border-radius: 16px;
		background: var(--bar);
		color: var(--bar-tx);
		font-size: 14px;
	}
</style>
