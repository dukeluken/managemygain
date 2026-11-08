<script lang="ts">
	// Gewichtsentwicklung einer Grundübung über den Plan:
	// Linie = geplant (vergangen durchgezogen, kommend gestrichelt), Punkte = geschafft,
	// senkrechte Linie = aktuelle Woche. Senken = Entlastungswochen.
	import type { TrajectoryWeek } from '#lib/engine/index.ts';
	import { kg } from '#lib/engine/index.ts';

	let { weeks, current, label }: { weeks: TrajectoryWeek[]; current: number; label: string } = $props();

	const W = 300;
	const H = 72;
	const PX = 6;
	const PY = 8;

	const values = $derived(weeks.flatMap((w) => [w.planned, w.actual]).filter((v): v is number => v != null));
	const min = $derived(values.length ? Math.min(...values) : 0);
	const max = $derived(values.length ? Math.max(...values) : 1);
	const span = $derived(max - min || 1);
	const x = (i: number) => PX + (weeks.length <= 1 ? 0 : (i * (W - 2 * PX)) / (weeks.length - 1));
	const y = (v: number) => H - PY - ((v - min) / span) * (H - 2 * PY);

	function path(from: number, to: number) {
		let d = '';
		for (let i = from; i <= to; i++) {
			const v = weeks[i]?.planned;
			if (v == null) continue;
			d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
		}
		return d;
	}
	const cur = $derived(Math.max(0, Math.min(current, weeks.length - 1)));
	const past = $derived(path(0, cur));
	const future = $derived(path(cur, weeks.length - 1));
	const area = $derived.by(() => {
		const pts = weeks.map((w, i) => (w.planned != null ? `${x(i).toFixed(1)},${y(w.planned).toFixed(1)}` : null)).filter(Boolean);
		if (pts.length < 2) return '';
		const first = weeks.findIndex((w) => w.planned != null);
		const last = weeks.length - 1 - [...weeks].reverse().findIndex((w) => w.planned != null);
		return `M${pts.join('L')}L${x(last)},${H}L${x(first)},${H}Z`;
	});
	const gid = `traj-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label={label}>
	<defs>
		<linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="var(--ac)" stop-opacity="0.22" />
			<stop offset="1" stop-color="var(--ac)" stop-opacity="0" />
		</linearGradient>
	</defs>
	<line class="base" x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} />
	{#if area}<path d={area} fill="url(#{gid})" />{/if}
	<line class="now" x1={x(cur)} x2={x(cur)} y1="0" y2={H} />
	{#if past}<path class="line" d={past} />{/if}
	{#if future}<path class="line future" d={future} />{/if}
</svg>
<!-- Punkte als HTML über der Grafik, damit sie bei gestreckter SVG rund bleiben -->
<div class="dots" aria-hidden="true">
	{#each weeks as w (w.week)}
		{#if w.actual != null}
			<i
				class="done"
				style:left="{(x(w.week) / W) * 100}%"
				style:top="{(y(w.actual) / H) * 100}%"
				title="Woche {w.week + 1}: {kg(w.actual)} kg geschafft"
			></i>
		{/if}
	{/each}
	{#if weeks[cur]?.planned != null}
		<i class="cur" style:left="{(x(cur) / W) * 100}%" style:top="{(y(weeks[cur].planned!) / H) * 100}%"></i>
	{/if}
</div>

<style>
	svg {
		display: block;
		width: 100%;
		height: 72px;
		overflow: visible;
	}
	.base {
		stroke: var(--sf2);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.now {
		stroke: var(--mu);
		stroke-width: 1;
		stroke-dasharray: 2 3;
		opacity: 0.6;
		vector-effect: non-scaling-stroke;
	}
	.line {
		fill: none;
		stroke: var(--ac-ink);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	.line.future {
		stroke-dasharray: 4 4;
		opacity: 0.75;
	}
	.dots {
		position: relative;
		height: 0;
		margin-top: -72px;
		height: 72px;
		pointer-events: none;
	}
	.dots i {
		position: absolute;
		width: 8px;
		height: 8px;
		margin: -4px 0 0 -4px;
		border-radius: 50%;
	}
	.dots i.done {
		background: var(--tx);
		box-shadow: 0 0 0 2px var(--sf);
	}
	.dots i.cur {
		width: 10px;
		height: 10px;
		margin: -5px 0 0 -5px;
		background: var(--ac);
		box-shadow: 0 0 0 2px var(--sf);
	}
</style>
