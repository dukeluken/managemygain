<script lang="ts">
	import { session } from '#lib/data/session.svelte.ts';

	let busy = $state(false);
	async function signIn() {
		busy = true;
		await session.signIn();
		busy = false;
	}
</script>

<main class="page login">
	<div class="brand"><img src="/icon.svg" alt="" width="40" height="40" />managemygain</div>
	<div class="hero">
		<h1 class="display">Dein Training.<br />Jede Woche klar.</h1>
		<p class="muted">Plan erstellen, Woche für Woche trainieren und sehen, wie du stärker wirst. Für Kraftsport jeder Art.</p>
	</div>
	<div class="actions">
		<button class="cta" onclick={signIn} disabled={busy}>
			<span>{busy ? 'Anmeldung läuft …' : 'Mit Google anmelden'}</span>
		</button>
		{#if session.error}<p class="err" role="alert">{session.error}</p>{/if}
	</div>
</main>

<style>
	.login {
		min-height: 100dvh;
		justify-content: space-between;
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		font-family: var(--f-num);
		font-stretch: 75%;
		font-weight: 700;
		font-size: 20px;
		color: var(--ac-ink);
	}
	.brand img {
		border-radius: 11px;
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 {
		margin: 0;
		font-size: clamp(56px, 17vw, 88px);
	}
	p {
		margin: 0;
		max-width: 34ch;
		font-size: 16px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.cta {
		justify-content: center;
	}
	.err {
		color: var(--danger);
		font-size: 14px;
	}
</style>
