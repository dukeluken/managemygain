<script lang="ts">
	import { session } from '#lib/data/session.svelte.ts';
	import type { Workout } from '#lib/data/types.ts';
	import { WEEKDAY_SHORT, kg, parseIsoDate, rpeLabel } from '#lib/engine/index.ts';
	import Icon from '#lib/ui/Icon.svelte';

	const finished = $derived(
		[...session.workouts]
			.filter((w) => w.finishedAt)
			.sort((a, b) => b.date.localeCompare(a.date) || String(b.finishedAt).localeCompare(String(a.finishedAt)))
	);

	function dateLabel(iso: string) {
		const d = parseIsoDate(iso);
		return `${WEEKDAY_SHORT[d.getDay()]}, ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`;
	}
	function stats(w: Workout) {
		const sets = w.exercises.flatMap((e) => e.sets.filter((s) => s.done));
		const volume = sets.reduce((n, s) => n + (s.weight ?? 0) * (s.reps ?? 0), 0);
		return { sets: sets.length, volume };
	}
	function feedbackLabel(w: Workout) {
		if (!w.feedback) return '';
		return w.feedback.rpe != null ? `RPE ${rpeLabel(w.feedback.rpe)}` : (w.feedback.feel ?? '');
	}
</script>

<main class="page">
	<div class="eyebrow"><span>{session.plan?.name ?? 'Verlauf'}</span><span>{finished.length} Trainings</span></div>
	<h1 class="title">Trainingsverlauf</h1>

	{#if finished.length}
		<section class="list">
			{#each finished as w (w.id)}
				{@const st = stats(w)}
				<a class="tile item" href="/verlauf/{encodeURIComponent(w.id)}">
					<span class="when">
						<b>{dateLabel(w.date)}</b>
						<small class="muted">Woche {w.weekIndex + 1}</small>
					</span>
					<span class="what">
						<b>{w.dayName}</b>
						<small class="muted num">
							{st.sets} Sätze{st.volume ? ` · ${kg(Math.round(st.volume))} kg bewegt` : ''}{feedbackLabel(w)
								? ` · ${feedbackLabel(w)}`
								: ''}
						</small>
					</span>
					<Icon name="chevron" size={16} />
				</a>
			{/each}
		</section>
		<p class="muted note">Tippe auf ein Training, um Sätze, Gewichte oder Bewertungen nachträglich zu ändern.</p>
	{:else}
		<p class="muted note">Noch keine abgeschlossenen Trainings in diesem Plan.</p>
	{/if}
</main>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.item {
		display: grid;
		grid-template-columns: 78px 1fr 16px;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 20px;
		text-decoration: none;
		color: inherit;
	}
	.when,
	.what {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.when b {
		font-size: 14px;
	}
	.what b {
		font-weight: 650;
	}
	small {
		font-size: 12px;
	}
	.item :global(svg) {
		color: var(--mu);
	}
	.note {
		margin: 0;
		font-size: 13px;
	}
</style>
