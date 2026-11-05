<!-- Weiches Licht oben im Hintergrund. Gibt den Glas-Kacheln etwas, das durchscheint. -->
<div class="glow" aria-hidden="true"></div>

<style>
	.glow {
		position: fixed;
		inset: -120px -80px auto;
		height: 460px;
		z-index: 0;
		pointer-events: none;
		background:
			radial-gradient(closest-side at 28% 55%, color-mix(in srgb, var(--ac) var(--glow-strength), transparent), transparent),
			radial-gradient(closest-side at 82% 35%, color-mix(in srgb, var(--ac) calc(var(--glow-strength) / 2), transparent), transparent);
	}
</style>
