// Wellenstruktur eines Plans: Belastungswochen, jede Welle endet mit einer Entlastung,
// die letzte Woche des Plans ist immer eine Entlastung.
//
// Wellen sind 4–6 Wochen lang (3–5 Belastungswochen + 1 Entlastung) und möglichst
// gleich lang. Einsteiger bekommen längere Wellen (ermüden langsamer), Erfahrene kürzere.
// Coaches entlasten typischerweise alle 4–6 Wochen und vor Blockwechseln (Bell et al. 2022/2024).
import type { Experience, Program, ProgramExercise } from '#lib/data/types.ts';

export type WeekType = 'regular' | 'deload';

const PREFERRED: Record<Experience, number> = { beginner: 5.5, intermediate: 4, advanced: 4 };
const MIN_WAVE = 4;
const MAX_WAVE = 6;

/** Wellenlängen für einen Plan von `weeks` Wochen, z. B. 14 → [5, 5, 4]. */
export function waveLengths(weeks: number, level: Experience = 'intermediate'): number[] {
	const total = Math.max(1, Math.round(weeks));
	if (total <= MAX_WAVE) return [total];
	let count = Math.max(1, Math.round(total / PREFERRED[level]));
	while (total / count > MAX_WAVE) count++;
	while (count > 1 && total / count < MIN_WAVE) count--;
	// Passt keine Aufteilung in 4–6 Wochen (nur bei 7): lieber eine kurze Welle (4 + 3)
	// als sechs Belastungswochen am Stück.
	if (total / count > MAX_WAVE) count++;
	const base = Math.floor(total / count);
	const extra = total % count;
	// Längere Wellen zuerst: am Ende des Blocks kürzer und frischer.
	return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

export function typesFromLengths(lengths: number[]): WeekType[] {
	return lengths.flatMap((len) => Array.from({ length: len }, (_, p) => (p === len - 1 ? 'deload' : 'regular') as WeekType));
}

interface Wave {
	loading: number[];
	deload: number | null;
}

/** Bestehende Wochen in Wellen zerlegen (Trennung an den Entlastungswochen). */
function wavesFromTypes(types: WeekType[]): Wave[] {
	const waves: Wave[] = [];
	let current: Wave = { loading: [], deload: null };
	types.forEach((t, i) => {
		if (t === 'deload') {
			current.deload = i;
			waves.push(current);
			current = { loading: [], deload: null };
		} else current.loading.push(i);
	});
	if (current.loading.length) waves.push(current);
	return waves;
}

/**
 * Neue Wellenlängen für `total` Wochen, wobei die ersten `keep` Wochen unverändert
 * bleiben (bereits trainiert). Die laufende Welle wird nicht vor der aktuellen Woche
 * beendet.
 */
export function layoutWithPrefix(types: WeekType[], keep: number, total: number, level: Experience): number[] {
	const fixed = Math.max(0, Math.min(keep, types.length, total - 1));
	if (fixed === 0) return waveLengths(total, level);
	// Abgeschlossene Wellen im festen Teil bleiben, wie sie sind.
	const prefix: number[] = [];
	let waveStart = 0;
	types.slice(0, fixed).forEach((t, i) => {
		if (t === 'deload') {
			prefix.push(i + 1 - waveStart);
			waveStart = i + 1;
		}
	});
	const remaining = total - waveStart;
	const used = fixed - waveStart; // Belastungswochen der laufenden Welle, schon trainiert
	let rest = waveLengths(remaining, level);
	if (rest[0] < used + 1) {
		const first = used + 1;
		const after = remaining - first;
		if (after <= 0) rest = [first];
		else if (after < MIN_WAVE) rest = [first + after];
		else rest = [first, ...waveLengths(after, level)];
	}
	return [...prefix, ...rest];
}

const ARRAY_KEYS = [
	'weekSets',
	'weekReps',
	'weekRpes',
	'weekWeights',
	'weekWeightOverrides',
	'weekTopSingle',
	'weekSingleWeights'
] as const;

/**
 * Programm auf eine neue Wellenstruktur übertragen. Jede neue Woche übernimmt die
 * Vorgaben der passenden Woche der alten Struktur: gleiche Welle (oder die letzte
 * vorhandene), Belastungswochen proportional gestreckt oder gestaucht, Entlastung
 * aus der Entlastung. Eigene Änderungen an Übungen bleiben so erhalten.
 * Gewichte müssen danach neu berechnet werden.
 */
export function remapProgram(program: Program, lengths: number[], keep = 0) {
	const oldTypes = (program.weekTypes ?? []) as WeekType[];
	const oldWaves = wavesFromTypes(oldTypes);
	const newTypes = typesFromLengths(lengths);
	const total = newTypes.length;
	const fixed = Math.max(0, Math.min(keep, oldTypes.length, total));

	// Quelle (alte Woche) für jede neue Woche.
	const source: number[] = [];
	const synthDeload: boolean[] = [];
	let week = 0;
	lengths.forEach((len, w) => {
		const wave = oldWaves[Math.min(w, oldWaves.length - 1)] ?? { loading: [0], deload: null };
		const lastDeload = [...oldWaves].reverse().find((x) => x.deload != null)?.deload ?? null;
		const loadingCount = len - 1;
		for (let p = 0; p < len; p++, week++) {
			if (week < fixed) {
				source.push(week);
				synthDeload.push(false);
				continue;
			}
			if (p === len - 1) {
				const d = wave.deload ?? lastDeload;
				source.push(d ?? wave.loading[wave.loading.length - 1]);
				synthDeload.push(d == null);
			} else {
				const n = wave.loading.length;
				const idx = loadingCount <= 1 || n <= 1 ? 0 : Math.round((p * (n - 1)) / (loadingCount - 1));
				source.push(wave.loading[Math.min(idx, n - 1)]);
				synthDeload.push(false);
			}
		}
	});

	program.days.forEach((day) =>
		day.exercises.forEach((ex: ProgramExercise) => {
			for (const key of ARRAY_KEYS) {
				if (ex[key] === undefined) continue;
				const old = (ex[key] as unknown[]) ?? [];
				const fallback = old[old.length - 1];
				(ex as Record<string, unknown>)[key] = source.map((src, i) => (i < fixed ? old[i] : (old[src] ?? fallback)));
			}
			// Kein alter Entlastungs-Vorbild: aus der Belastungswoche ableiten.
			synthDeload.forEach((synth, i) => {
				if (!synth) return;
				ex.weekSets[i] = Math.max(1, Math.round(Number(ex.weekSets[i]) * 0.6));
				ex.weekRpes[i] = 6;
				ex.weekWeightOverrides[i] = false;
				if (ex.weekTopSingle) ex.weekTopSingle[i] = null;
			});
			// Entlastungswochen: nie ein Top-Single.
			newTypes.forEach((t, i) => {
				if (t === 'deload' && i >= fixed && ex.weekTopSingle) ex.weekTopSingle[i] = null;
			});
			if (ex.anchor && ex.anchor.week >= total) delete ex.anchor;
		})
	);
	program.weekTypes = newTypes;
	program.cycleWeeks = total;
}
