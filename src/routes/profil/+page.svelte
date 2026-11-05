<script lang="ts">
	import { goto } from '$app/navigation';
	import { session } from '#lib/data/session.svelte.ts';
	import type { ThemePref } from '#lib/data/types.ts';
	import { applyTheme, getThemePref } from '#lib/ui/theme.ts';

	let theme = $state<ThemePref>(getThemePref());
	function setTheme(value: ThemePref) {
		theme = value;
		applyTheme(value);
	}

	const plan = $derived(session.plan);
	const finished = $derived(session.workouts.filter((w) => w.finishedAt).length);
	let confirmNew = $state(false);
</script>

<main class="page">
	<div class="eyebrow"><span>Profil</span></div>
	<h1 class="title">{session.profile?.displayName ?? session.user?.displayName ?? 'Athlet'}</h1>

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

<style>
	.head {
		margin-bottom: 10px;
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
