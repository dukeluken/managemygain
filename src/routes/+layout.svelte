<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { session } from '#lib/data/session.svelte.ts';
	import Glow from '#lib/ui/Glow.svelte';
	import Login from '#lib/ui/Login.svelte';
	import Nav from '#lib/ui/Nav.svelte';
	import Tour from '#lib/ui/Tour.svelte';
	import { tour } from '#lib/ui/tour.svelte.ts';

	let { children } = $props();
	session.start();

	// Beim ersten Login (Tutorial noch nicht erledigt) startet die Tour einmal automatisch.
	let autoStarted = false;
	$effect(() => {
		if (!autoStarted && session.ready && session.profile && session.profile.tutorialDone !== true && !tour.active) {
			autoStarted = true;
			tour.start();
		}
	});

	// Im Training, beim Plan-Erstellen und beim Bearbeiten eines Trainings keine Leiste.
	const focused = $derived(/^\/(training|start|verlauf\/.)/.test(page.url.pathname));
</script>

<Glow />
{#if !session.ready}
	<div class="splash" aria-busy="true" aria-label="Lädt"><span class="dot"></span></div>
{:else if !session.user}
	<Login />
{:else}
	{@render children()}
	{#if !focused}<Nav />{/if}
	<Tour />
{/if}

<style>
	.splash {
		position: relative;
		z-index: 1;
		min-height: 100dvh;
		display: grid;
		place-items: center;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--ac);
		animation: pulse 1s ease-in-out infinite alternate;
	}
	@keyframes pulse {
		to {
			transform: scale(1.6);
			opacity: 0.4;
		}
	}
</style>
