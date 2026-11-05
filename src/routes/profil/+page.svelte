<script lang="ts">
	import { goto } from '$app/navigation';
	import { session } from '#lib/data/session.svelte.ts';
	import type { MainLift, ThemePref } from '#lib/data/types.ts';
	import {
		ALL_LIFTS,
		LIFT_LABEL,
		estimatedMax,
		kg,
		liftsForGoal,
		weekCount,
		weekIndexAt
	} from '#lib/engine/index.ts';
	import BestField from '#lib/ui/BestField.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { applyTheme, getThemePref } from '#lib/ui/theme.ts';

	let theme = $state<ThemePref>(getThemePref());
	function setTheme(value: ThemePref) {
		theme = value;
		applyTheme(value);
	}

	const plan = $derived(session.plan);
	const finished = $derived(session.workouts.filter((w) => w.finishedAt).length);
	let confirmNew = $state(false);

	// Bestwerte: eigene Werte aus dem Profil, daneben die aktuelle Schätzung des Plans.
	const lifts = $derived(plan ? liftsForGoal(plan.goal) : ALL_LIFTS);
	const bests = $derived(session.profile?.bests ?? {});
	const week = $derived(plan ? Math.min(Math.max(0, weekIndexAt(plan, new Date())), weekCount(plan.program) - 1) : 0);
	function estimate(lift: MainLift): number | null {
		if (!plan) return null;
		const v = estimatedMax(plan.program, lift, week);
		return v ? Math.round(v / 2.5) * 2.5 : null;
	}

	let editing = $state(false);
	let draft = $state<Record<MainLift, number | null>>({ squat: null, bench: null, deadlift: null, press: null });
	function openEditor() {
		draft = { squat: bests.squat ?? null, bench: bests.bench ?? null, deadlift: bests.deadlift ?? null, press: bests.press ?? null };
		editing = true;
	}
	function saveBests() {
		const changed = Object.fromEntries(lifts.filter((l) => (bests[l] ?? null) !== draft[l]).map((l) => [l, draft[l]]));
		if (Object.keys(changed).length) session.setBests(changed);
		editing = false;
	}
</script>

<main class="page">
	<div class="eyebrow"><span>Profil</span></div>
	<h1 class="title">{session.profile?.displayName ?? session.user?.displayName ?? 'Athlet'}</h1>

	<section>
		<div class="eyebrow head"><span>Bestwerte · 1 Wiederholung</span><button class="edit" onclick={openEditor}>Ändern</button></div>
		<div class="tile rows">
			{#each lifts as l (l)}
				{@const est = estimate(l)}
				{@const own = bests[l] ?? null}
				<div class="row best">
					<span class="bname">
						{LIFT_LABEL[l]}
						{#if est != null && own != null && est - own >= 2.5}
							<button class="take" onclick={() => session.setBests({ [l]: est })}>
								Plan schätzt {kg(est)} kg · übernehmen
							</button>
						{:else if own == null}
							<small class="muted">{est != null ? `geschätzt ${kg(est)} kg` : 'noch offen'}</small>
						{/if}
					</span>
					<b class="display num">{own != null ? kg(own) : '–'}</b>
				</div>
			{/each}
		</div>
		<p class="muted note">Alle Gewichte im Plan werden aus diesen Werten berechnet. Änderungen gelten ab dieser Woche.</p>
	</section>

	{#if plan}
		<section>
			<div class="eyebrow head"><span>Aktueller Plan</span></div>
			<div class="tile rows">
				<div class="row"><span>{plan.name}</span><span class="muted num">{finished} Trainings</span></div>
				{#if confirmNew}
					<div class="row confirm">
						<span class="muted">Der aktuelle Plan bleibt gespeichert, aktiv wird der neue.</span>
						<div class="btns">
							<button class="ghost" onclick={() => (confirmNew = false)}>Abbrechen</button>
							<button class="cta small" onclick={() => goto('/start')}><span>Neuen Plan erstellen</span></button>
						</div>
					</div>
				{:else}
					<button class="row link" onclick={() => (confirmNew = true)}>Neuen Plan erstellen</button>
				{/if}
			</div>
		</section>
	{/if}

	<section>
		<div class="eyebrow head"><span>Darstellung</span></div>
		<div class="seg tile" role="radiogroup" aria-label="Farbschema">
			{#each [['dark', 'Dunkel'], ['light', 'Hell'], ['system', 'System']] as const as [value, label] (value)}
				<button role="radio" aria-checked={theme === value} class:sel={theme === value} onclick={() => setTheme(value)}>
					{label}
				</button>
			{/each}
		</div>
	</section>

	<button class="ghost out" onclick={() => session.signOut()}>Abmelden</button>
</main>

{#if editing}
	<Sheet title="Bestwerte ändern" onclose={() => (editing = false)}>
		<p class="muted note">Dein Maximum für eine Wiederholung. Leer lassen, wenn du es nicht weißt.</p>
		<div class="sheet-fields">
			{#each lifts as l (l)}
				<BestField id="edit-best-{l}" label={LIFT_LABEL[l]} bind:value={draft[l]} />
			{/each}
		</div>
		<button class="cta center" onclick={saveBests}><span>Speichern und Plan anpassen</span></button>
	</Sheet>
{/if}

<style>
	.head {
		margin-bottom: 10px;
		align-items: baseline;
	}
	.edit {
		color: var(--ac-ink);
		font-weight: 600;
		font-size: 13px;
	}
	.best .display {
		font-size: 34px;
	}
	.bname {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		font-weight: 600;
	}
	.bname small {
		font-weight: 400;
		font-size: 12px;
	}
	.take {
		font-size: 12px;
		font-weight: 600;
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--ac);
		color: var(--on-ac);
	}
	.note {
		margin: 8px 0 0;
		font-size: 13px;
	}
	.sheet-fields {
		padding: 0 16px;
		border-radius: var(--r-tile);
		background: var(--sf);
	}
	.cta.center {
		justify-content: center;
	}
	.rows {
		padding: 2px 18px;
	}
	.row {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 14px 0;
		border-bottom: 1px solid var(--sf2);
		text-align: left;
	}
	.rows > :last-child {
		border: 0;
	}
	.link {
		color: var(--ac-ink);
		font-weight: 600;
	}
	.confirm {
		flex-direction: column;
		align-items: stretch;
	}
	.btns {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.btns > * {
		flex: 1;
	}
	.cta.small {
		padding: 13px 18px;
		justify-content: center;
	}
	.seg {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 5px;
		gap: 4px;
		border-radius: 999px;
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
	.out {
		align-self: flex-start;
	}
</style>
