<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { session } from '#lib/data/session.svelte.ts';
	import type { Feel, LoggedSet, Workout } from '#lib/data/types.ts';
	import { feelToRpe, kg, rpeLabel, rpeToFeel } from '#lib/engine/index.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Keypad from '#lib/ui/Keypad.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { untrack } from 'svelte';

	const id = decodeURIComponent(page.params.id ?? '');
	const original = untrack(() => session.workouts.find((w) => w.id === id) ?? null);
	let draft = $state<Workout | null>(original ? (structuredClone($state.snapshot(original)) as Workout) : null);

	const rpeMode = $derived(session.profile?.effortScale === 'rpe');
	const changed = $derived(!!draft && JSON.stringify($state.snapshot(draft)) !== JSON.stringify(original));

	let keypad = $state<{ e: number; s: number } | null>(null);
	let confirmDelete = $state(false);
	let confirmLeave = $state(false);

	function setFeel(set: LoggedSet, target: number, feel: Feel) {
		set.feel = feel;
		set.rpe = feelToRpe(feel, target);
		set.done = true;
	}
	function nudgeRpe(set: LoggedSet, target: number, delta: number) {
		const next = Math.max(5, Math.min(10, (set.rpe ?? target) + delta));
		set.rpe = next;
		set.feel = rpeToFeel(next, target);
		set.done = true;
	}
	function addSet(e: number) {
		const sets = draft!.exercises[e].sets;
		const last = sets[sets.length - 1];
		sets.push({ weight: last?.weight ?? null, reps: last?.reps ?? null, feel: last?.feel ?? 'okay', rpe: last?.rpe ?? null, done: true });
	}
	function removeSet(e: number, s: number) {
		draft!.exercises[e].sets.splice(s, 1);
	}

	function save() {
		if (!draft) return;
		session.updateWorkout($state.snapshot(draft) as Workout);
		goto('/verlauf');
	}
	async function remove() {
		await session.deleteWorkout(id);
		goto('/verlauf');
	}
	function back() {
		if (changed) confirmLeave = true;
		else goto('/verlauf');
	}
</script>

{#if !draft}
	<main class="page">
		<h1 class="title">Training nicht gefunden.</h1>
		<a class="cta" href="/verlauf"><span>Zum Verlauf</span></a>
	</main>
{:else}
	<main class="page">
		<header class="top">
			<button class="round tile" onclick={back} aria-label="Zurück zum Verlauf"><Icon name="back" size={18} /></button>
			<small class="muted">Woche {draft.weekIndex + 1}</small>
		</header>
		<h1 class="title">{draft.dayName}</h1>
		<label class="date">
			<span class="muted">Datum</span>
			<input id="workout-date" type="date" bind:value={draft.date} />
		</label>

		{#each draft.exercises as ex, e (e)}
			<section class="tile ex">
				<header class="exhead">
					<b>{ex.exercise}</b>
					<small class="muted num">Ziel {ex.target.sets} × {ex.target.reps} · RPE {rpeLabel(ex.target.rpe)}</small>
				</header>
				{#each ex.sets as row, s (s)}
					<div class="set" class:skipped={!row.done}>
						<div class="line">
							<label class="chk" title="Satz gemacht">
								<input
									id="done-{e}-{s}"
									type="checkbox"
									checked={row.done}
									onchange={(ev) => (draft!.exercises[e].sets[s].done = (ev.currentTarget as HTMLInputElement).checked)}
									aria-label="Satz {s + 1} gemacht"
								/>
								<span class="num">{s + 1}</span>
							</label>
							<button class="weight num" onclick={() => (keypad = { e, s })} aria-label="Gewicht Satz {s + 1}">
								{row.weight != null ? kg(row.weight) : '–'} <small>kg</small>
							</button>
							<span class="x muted">×</span>
							<span class="reps">
								<button onclick={() => (draft!.exercises[e].sets[s].reps = Math.max(1, (row.reps ?? 1) - 1))} aria-label="Eine Wiederholung weniger"
									><Icon name="minus" size={14} /></button
								>
								<b class="num">{row.reps ?? '–'}</b>
								<button onclick={() => (draft!.exercises[e].sets[s].reps = Math.min(50, (row.reps ?? 0) + 1))} aria-label="Eine Wiederholung mehr"
									><Icon name="plus" size={14} /></button
								>
							</span>
							<button class="del" onclick={() => removeSet(e, s)} aria-label="Satz {s + 1} entfernen"
								><Icon name="close" size={14} /></button
							>
						</div>
						<div class="line effort">
							{#if rpeMode}
								<span class="muted">RPE</span>
								<span class="reps">
									<button onclick={() => nudgeRpe(draft!.exercises[e].sets[s], ex.target.rpe, -0.5)} aria-label="RPE weniger"><Icon name="minus" size={14} /></button>
									<b class="num">{row.rpe != null ? rpeLabel(row.rpe) : '–'}</b>
									<button onclick={() => nudgeRpe(draft!.exercises[e].sets[s], ex.target.rpe, 0.5)} aria-label="RPE mehr"><Icon name="plus" size={14} /></button>
								</span>
							{:else}
								{#each ['leicht', 'okay', 'hart'] as const as f (f)}
									<button class="chip" class:sel={row.feel === f} onclick={() => setFeel(draft!.exercises[e].sets[s], ex.target.rpe, f)}>{f}</button>
								{/each}
							{/if}
						</div>
					</div>
				{/each}
				<button class="add" onclick={() => addSet(e)}>+ Satz</button>
			</section>
		{/each}

		<div class="savebar">
			<button class="cta center" onclick={save} disabled={!changed}><span>Änderungen speichern</span></button>
		</div>
		<p class="muted note">
			Die Gewichte im Plan werden nicht rückwirkend neu berechnet. Die Steigerung bei Übungen mit Wiederholungsspanne und der Verlauf
			nutzen die korrigierten Werte.
		</p>
		<button class="ghost danger" onclick={() => (confirmDelete = true)}><Icon name="trash" size={16} />Training löschen</button>
	</main>
{/if}

{#if keypad && draft}
	{@const pos = keypad}
	<Keypad
		title="{draft.exercises[pos.e].exercise} · Satz {pos.s + 1}"
		value={draft.exercises[pos.e].sets[pos.s].weight}
		allowClear
		onconfirm={(v) => {
			draft!.exercises[pos.e].sets[pos.s].weight = v;
			keypad = null;
		}}
		oncancel={() => (keypad = null)}
	/>
{/if}

{#if confirmDelete}
	<Sheet title="Training löschen?" onclose={() => (confirmDelete = false)}>
		<p class="muted note">Alle Sätze dieses Trainings werden gelöscht. Das lässt sich nicht rückgängig machen.</p>
		<button class="cta center danger-bg" onclick={remove}><span>Löschen</span></button>
		<button class="ghost" onclick={() => (confirmDelete = false)}>Abbrechen</button>
	</Sheet>
{/if}

{#if confirmLeave}
	<Sheet title="Änderungen verwerfen?" onclose={() => (confirmLeave = false)}>
		<button class="cta center" onclick={save}><span>Speichern</span></button>
		<button class="ghost" onclick={() => goto('/verlauf')}>Verwerfen</button>
	</Sheet>
{/if}

<style>
	.top {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.round {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.date {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 14px;
	}
	.date input {
		padding: 8px 12px;
		border: 0;
		border-radius: 12px;
		background: var(--sf2);
		font-variant-numeric: tabular-nums;
	}
	.ex {
		display: flex;
		flex-direction: column;
		padding: 14px 16px;
		border-radius: 20px;
	}
	.exhead {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-bottom: 8px;
	}
	.exhead b {
		font-size: 16px;
	}
	.exhead small {
		font-size: 12px;
	}
	.set {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 0;
		border-top: 1px solid var(--sf2);
	}
	.set.skipped {
		opacity: 0.45;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.chk {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--mu);
		width: 44px;
	}
	.chk input {
		width: 18px;
		height: 18px;
		accent-color: var(--ac);
	}
	.weight {
		padding: 6px 10px;
		border-radius: 10px;
		background: var(--sf2);
		font-weight: 700;
		color: var(--ac-ink);
		min-width: 76px;
		text-align: right;
	}
	.weight small {
		color: var(--mu);
		font-weight: 500;
	}
	.reps {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.reps button {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
	}
	.reps b {
		min-width: 2.2ch;
		text-align: center;
	}
	.del {
		margin-left: auto;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: var(--mu);
	}
	.effort {
		padding-left: 52px;
		font-size: 13px;
	}
	.chip {
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--sf2);
		font-size: 13px;
		font-weight: 600;
	}
	.chip.sel {
		background: var(--ac);
		color: var(--on-ac);
	}
	.add {
		align-self: flex-start;
		padding-top: 10px;
		color: var(--ac-ink);
		font-weight: 600;
		font-size: 14px;
	}
	.note {
		margin: 0;
		font-size: 12.5px;
	}
	.page {
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
	}
	/* Speichern bleibt beim Scrollen unten sichtbar. */
	.savebar {
		position: sticky;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
		z-index: 5;
	}
	.savebar .cta {
		box-shadow: 0 10px 24px -10px rgb(0 0 0 / 0.6);
	}
	.cta.center {
		justify-content: center;
	}
	.danger {
		color: var(--danger);
		align-self: flex-start;
	}
	.danger-bg {
		background: var(--danger);
		color: #fff;
	}
</style>
