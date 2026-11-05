<script lang="ts">
	// Kleine Verlaufskurve: 2px Linie, zarte Fläche, betonter Endpunkt.
	// Eine einzige Reihe, darum keine Legende; die Werte stehen als Text daneben.
	let { values, label }: { values: number[]; label: string } = $props();

	const W = 120;
	const H = 40;
	const PAD = 5;

	const points = $derived.by(() => {
		if (!values.length) return [];
		const min = Math.min(...values);
		const max = Math.max(...values);
		const span = max - min || 1;
		const n = values.length;
		return values.map((v, i) => ({
			x: n === 1 ? W - PAD : PAD + (i * (W - 2 * PAD)) / (n - 1),
			// Bei flachem Verlauf mittig zeichnen statt am Boden.
			y: max === min ? H / 2 : H - PAD - ((v - min) / span) * (H - 2 * PAD)
		}));
	});
	const line = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
	const area = $derived(points.length > 1 ? `${line} L${points[points.length - 1].x},${H} L${points[0].x},${H} Z` : '');
	const end = $derived(points[points.length - 1]);
	const gid = `spark-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label={label}>
	<title>{label}</title>
	<defs>
		<linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="var(--ac)" stop-opacity="0.28" />
			<stop offset="1" stop-color="var(--ac)" stop-opacity="0" />
		</linearGradient>
	</defs>
	<line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} class="base" />
	{#if area}<path d={area} fill="url(#{gid})" />{/if}
	{#if points.length > 1}<path d={line} class="line" />{/if}
	{#if end}<circle cx={end.x} cy={end.y} r="4" class="dot" />{/if}
</svg>

<style>
	svg {
		display: block;
		width: 120px;
		max-width: 100%;
		height: 40px;
		overflow: visible;
	}
	.base {
		stroke: var(--sf2);
		stroke-width: 1;
	}
	.line {
		fill: none;
		stroke: var(--ac-ink);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.dot {
		fill: var(--ac-ink);
		stroke: var(--sf);
		stroke-width: 2;
	}
</style>
