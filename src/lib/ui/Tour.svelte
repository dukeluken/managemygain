<script lang="ts">
	// Overlay der geführten Tour: dunkelt die Seite ab, hebt das Ziel-Element hervor
	// und zeigt daneben die Erklärung. Unten immer „Tutorial beenden“.
	import { page } from '$app/state';
	import { session } from '#lib/data/session.svelte.ts';
	import { STEPS, tour } from './tour.svelte.ts';

	let rect = $state<DOMRect | null>(null);
	let searching = $state(false);
	let vh = $state(typeof window !== 'undefined' ? window.innerHeight : 800);
	let direction: 1 | -1 = 1;

	const step = $derived(tour.step);
	const visible = $derived(!!step && !tour.waiting);
	const applicable = $derived(
		STEPS.filter((s) => (s.when === 'noPlan' ? !session.plan : s.when === 'plan' ? !!session.plan : true))
	);
	const position = $derived(step ? applicable.findIndex((s) => s.id === step.id) + 1 : 0);

	// Ziel-Element suchen, sobald Schritt oder Seite wechseln. Fehlt es, Schritt überspringen.
	$effect(() => {
		const current = step;
		void page.url.pathname;
		void page.url.search;
		rect = null;
		if (!current || tour.waiting) return;
		if (!current.target) return;
		searching = true;
		let cancelled = false;
		const started = performance.now();
		const find = () => {
			if (cancelled) return;
			const el = document.querySelector(current.target!);
			if (el) {
				el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
				requestAnimationFrame(() => {
					if (cancelled) return;
					vh = window.innerHeight;
					rect = el.getBoundingClientRect();
					searching = false;
				});
			} else if (performance.now() - started < 1200) requestAnimationFrame(find);
			else {
				searching = false;
				tour.skip(direction);
			}
		};
		requestAnimationFrame(find);
		return () => {
			cancelled = true;
		};
	});

	// Nach einer Aktion (Plan erstellen) automatisch weiter.
	$effect(() => {
		void session.plan;
		void page.url.pathname;
		tour.resumeIfReady();
	});

	function measure() {
		vh = window.innerHeight;
		if (!step?.target) return;
		const el = document.querySelector(step.target);
		if (el) rect = el.getBoundingClientRect();
	}

	const PAD = 8;
	const spot = $derived(
		rect
			? {
					top: rect.top - PAD,
					left: rect.left - PAD,
					width: rect.width + PAD * 2,
					height: Math.min(rect.height + PAD * 2, vh * 0.55)
				}
			: null
	);
	// Karte unter dem Ziel, wenn dort Platz ist, sonst darüber.
	const below = $derived(spot ? vh - (spot.top + spot.height) > 260 : true);

	function next() {
		direction = 1;
		tour.next();
	}
	function back() {
		direction = -1;
		tour.back();
	}
</script>

<svelte:window onresize={measure} onscroll={measure} />

{#if visible && step}
	<div class="blocker" aria-hidden="true"></div>
	{#if spot}
		<div
			class="spot"
			style:top="{spot.top}px"
			style:left="{spot.left}px"
			style:width="{spot.width}px"
			style:height="{spot.height}px"
		></div>
	{:else}
		<div class="dim"></div>
	{/if}

	{#if !searching || !step.target}
		<div
			class="card"
			class:center={!spot}
			role="dialog"
			aria-modal="true"
			aria-labelledby="tour-title"
			style:top={spot && below ? `${spot.top + spot.height + 14}px` : undefined}
			style:bottom={spot && !below ? `${vh - spot.top + 14}px` : undefined}
		>
			<span class="count muted num">Schritt {position} von {applicable.length}</span>
			<h2 id="tour-title">{step.title}</h2>
			<p>{step.text}</p>
			<div class="actions">
				{#if position > 1}
					<button class="ghost" onclick={back}>Zurück</button>
				{/if}
				{#if step.action}
					<button class="cta" onclick={() => tour.runAction()}><span>{step.action.label}</span></button>
				{:else}
					<button class="cta" onclick={next}><span>{step.id === 'done' ? 'Fertig' : 'Weiter'}</span></button>
				{/if}
			</div>
		</div>
	{/if}

	{#if step.id !== 'done'}
		<button class="end" onclick={() => tour.finish()}>Tutorial beenden</button>
	{/if}
{/if}

<style>
	.blocker {
		position: fixed;
		inset: 0;
		z-index: 70;
	}
	.dim {
		position: fixed;
		inset: 0;
		z-index: 71;
		background: rgb(0 0 0 / 0.62);
		pointer-events: none;
	}
	.spot {
		position: fixed;
		z-index: 71;
		border-radius: 22px;
		box-shadow:
			0 0 0 2px var(--ac),
			0 0 0 200vmax rgb(0 0 0 / 0.62);
		pointer-events: none;
		transition:
			top 0.25s ease,
			left 0.25s ease,
			width 0.25s ease,
			height 0.25s ease;
	}
	.card {
		position: fixed;
		z-index: 72;
		left: max(16px, env(safe-area-inset-left, 0px));
		right: max(16px, env(safe-area-inset-right, 0px));
		max-width: 420px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px 18px 16px;
		border-radius: 24px;
		background: color-mix(in srgb, var(--sf) 94%, transparent);
		-webkit-backdrop-filter: blur(20px);
		backdrop-filter: blur(20px);
		box-shadow:
			var(--glass-edge),
			0 18px 40px -16px rgb(0 0 0 / 0.6);
		animation: pop 0.2s ease-out;
	}
	.card.center {
		top: 50%;
		transform: translateY(-50%);
	}
	.count {
		font-size: 12px;
	}
	h2 {
		margin: 0;
		font-family: var(--f-num);
		font-stretch: 75%;
		font-weight: 750;
		font-size: 28px;
		line-height: 1;
		text-wrap: balance;
	}
	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
	}
	.actions {
		display: flex;
		gap: 8px;
		margin-top: 6px;
	}
	.actions .cta {
		flex: 1;
		justify-content: center;
		padding: 14px 18px;
	}
	.actions .ghost {
		background: var(--sf2);
		box-shadow: none;
	}
	.end {
		position: fixed;
		z-index: 73;
		left: 50%;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
		transform: translateX(-50%);
		padding: 10px 18px;
		border-radius: 999px;
		background: rgb(0 0 0 / 0.55);
		color: #fff;
		font-size: 14px;
		font-weight: 600;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
	}
	@keyframes pop {
		from {
			opacity: 0;
			translate: 0 8px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spot {
			transition: none;
		}
	}
</style>
