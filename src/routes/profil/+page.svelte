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
		parseIsoDate,
		weekCount,
		weekIndexAt
	} from '#lib/engine/index.ts';
	import BestField from '#lib/ui/BestField.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { applyTheme, getThemePref } from '#lib/ui/theme.ts';

	let theme = $state<ThemePref>(getThemePref());
	function setTheme(value: ThemePref) {
		theme = value;
		applyTheme(value);
	}

	const plan = $derived(session.plan);
	const finished = $derived(session.workouts.filter((w) => w.finishedAt).length);
	const restLabel = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

	// Alle Pläne; solange die Liste lädt, wenigstens der aktive.
	const plans = $derived(session.plans.length ? session.plans : plan ? [plan] : []);
	let confirmDelete = $state<string | null>(null);
	let deleting = $state(false);
	async function remove(id: string) {
		deleting = true;
		try {
			await session.deletePlan(id);
		} catch (e) {
			console.warn(e);
			session.error = 'Plan konnte nicht gelöscht werden. Prüfe die Verbindung.';
		}
		deleting = false;
		confirmDelete = null;
	}

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

	<section>
		<div class="eyebrow head"><span>Meine Pläne</span><span>{plans.length}</span></div>
		<div class="tile rows">
			{#each plans as p (p.id)}
				{@const active = p.id === session.profile?.activePlanId}
				<div class="plan" class:active>
					<div class="pinfo">
						<span class="pname">{p.name}</span>
						<small class="muted">
							{weekCount(p.program)} Wochen · {p.program.days.length} Tage · seit {parseIsoDate(p.startDate).toLocaleDateString('de-DE', {
								day: 'numeric',
								month: 'short',
								year: 'numeric'
							})}
						</small>
					</div>
					{#if confirmDelete === p.id}
						<div class="confirm">
							<span class="muted">Plan und alle zugehörigen Trainings löschen?</span>
							<div class="btns">
								<button class="ghost" onclick={() => (confirmDelete = null)}>Abbrechen</button>
								<button class="ghost danger" onclick={() => remove(p.id)} disabled={deleting}>
									{deleting ? 'Wird gelöscht …' : 'Löschen'}
								</button>
							</div>
						</div>
					{:else}
						<div class="pactions">
							{#if active}
								<span class="badge">Aktiv</span>
							{:else}
								<button class="small-btn" onclick={() => session.setActivePlan(p.id)}>Aktivieren</button>
							{/if}
							<button class="icon-btn" onclick={() => (confirmDelete = p.id)} aria-label="{p.name} löschen"
								><Icon name="trash" size={16} /></button
							>
						</div>
					{/if}
				</div>
			{:else}
				<p class="muted empty">Noch kein Plan.</p>
			{/each}
			<a class="row link" href="/start">+ Neuen Plan erstellen</a>
		</div>
		<p class="muted note">Ein neuer Plan wird aktiv, die anderen bleiben gespeichert.</p>
	</section>

	<section>
		<div class="eyebrow head"><span>Training</span></div>
		<div class="tile rows">
			<a class="row link" href="/verlauf">Trainingsverlauf <span class="muted num">{finished} Trainings</span></a>
			{#each [['main', 'Satzpause Grundübungen', 'Kniebeuge, Bankdrücken, Kreuzheben, Schulterdrücken'], ['other', 'Satzpause andere Übungen', 'Auch zwischen zwei Übungen']] as const as [key, label, hint] (key)}
				<div class="row rest">
					<span class="bname">{label}<small class="muted">{hint}</small></span>
					<span class="stepper">
						<button
							onclick={() => session.setRestSeconds({ ...session.restSeconds, [key]: Math.max(30, session.restSeconds[key] - 15) })}
							aria-label="{label} 15 Sekunden kürzer"><Icon name="minus" size={16} /></button
						>
						<b class="num">{restLabel(session.restSeconds[key])}</b>
						<button
							onclick={() => session.setRestSeconds({ ...session.restSeconds, [key]: Math.min(600, session.restSeconds[key] + 15) })}
							aria-label="{label} 15 Sekunden länger"><Icon name="plus" size={16} /></button
						>
					</span>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<div class="eyebrow head"><span>Anstrengung im Training</span></div>
		<div class="seg tile" role="radiogroup" aria-label="Anstrengung erfassen">
			<button
				role="radio"
				aria-checked={session.profile?.effortScale !== 'rpe'}
				class:sel={session.profile?.effortScale !== 'rpe'}
				onclick={() => session.setEffortScale('simple')}>leicht / okay / hart</button
			>
			<button
				role="radio"
				aria-checked={session.profile?.effortScale === 'rpe'}
				class:sel={session.profile?.effortScale === 'rpe'}
				onclick={() => session.setEffortScale('rpe')}>RPE</button
			>
		</div>
	</section>

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
	.plan {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 14px 0;
		border-bottom: 1px solid var(--sf2);
	}
	.pinfo {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.pname {
		font-weight: 600;
	}
	.plan.active .pname {
		color: var(--ac-ink);
	}
	.pinfo small {
		font-size: 12px;
	}
	.pactions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.badge {
		font-size: 12px;
		font-weight: 700;
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--ac);
		color: var(--on-ac);
	}
	.small-btn {
		font-size: 13px;
		font-weight: 600;
		padding: 7px 12px;
		border-radius: 999px;
		background: var(--sf2);
	}
	.icon-btn {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
		color: var(--mu);
	}
	.plan .confirm {
		flex-basis: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.danger {
		color: var(--danger);
	}
	.empty {
		margin: 0;
		padding: 14px 0;
	}
	a.link {
		text-decoration: none;
	}
	.rest .stepper {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: none;
	}
	.rest .stepper button {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--sf2);
	}
	.rest .stepper b {
		min-width: 3.4ch;
		text-align: center;
		font-size: 16px;
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
