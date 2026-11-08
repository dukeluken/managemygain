// Geführte Tour durch die App. Läuft beim ersten Login automatisch und lässt sich im
// Profil neu starten. Jeder Schritt zeigt auf ein Element (data-tour="…") einer Seite;
// fehlt das Element (z. B. noch kein Fortschritt), wird der Schritt übersprungen.
import { goto } from '$app/navigation';
import { session } from '#lib/data/session.svelte.ts';
import { nextDayIndex, weekCount, weekIndexAt } from '#lib/engine/index.ts';

export interface TourStep {
	id: string;
	/** Seite, auf der der Schritt spielt (null = in der Mitte, ohne Seitenwechsel). */
	route: () => string | null;
	/** CSS-Selektor des hervorgehobenen Elements; ohne Ziel erscheint die Karte mittig. */
	target?: string;
	title: string;
	text: string;
	/** Nur zeigen, wenn noch kein Plan existiert (bzw. nur mit Plan). */
	when?: 'noPlan' | 'plan';
	/** Statt „Weiter“: eine Aktion, nach der die Tour automatisch fortgesetzt wird. */
	action?: { label: string; run: () => void };
}

function trainingRoute(): string | null {
	const plan = session.plan;
	if (!plan) return null;
	const week = Math.min(Math.max(0, weekIndexAt(plan, new Date())), weekCount(plan.program) - 1);
	const day = nextDayIndex(plan.program, session.workouts, week) ?? 0;
	return `/training?w=${week}&d=${day}`;
}

export const STEPS: TourStep[] = [
	{
		id: 'welcome',
		route: () => '/',
		title: 'Willkommen bei managemygain',
		text: 'In zwei Minuten zeigen wir dir die wichtigsten Schritte: Plan erstellen, Woche planen, trainieren und Fortschritt sehen. Tippe auf „Weiter“.'
	},
	{
		id: 'create',
		route: () => '/',
		target: '[data-tour="create"]',
		when: 'noPlan',
		title: 'Dein erster Plan',
		text: 'Ein paar kurze Fragen zu Ziel, Trainingstagen, Erfahrung und Bestwerten. Daraus berechnet die App jedes Gewicht für jede Woche. Danach geht die Tour weiter.',
		action: { label: 'Plan erstellen', run: () => goto('/start') }
	},
	{
		id: 'next',
		route: () => '/',
		target: '[data-tour="next"]',
		when: 'plan',
		title: 'Dein nächstes Training',
		text: 'Hier steht immer, was als Nächstes dran ist, mit dem wichtigsten Gewicht. Verpasst du einen Tag, rückt das Training einfach nach.'
	},
	{
		id: 'week',
		route: () => '/',
		target: '[data-tour="week"]',
		when: 'plan',
		title: 'Woche und Block',
		text: 'Links deine Einheiten dieser Woche, rechts der Fortschritt im Block. Grün umrandet sind die Entlastungswochen, die letzte Woche entlastet immer.'
	},
	{
		id: 'progress',
		route: () => '/',
		target: '[data-tour="progress"]',
		when: 'plan',
		title: 'Deine Gewichte im Plan',
		text: 'So entwickeln sich deine Arbeitsgewichte über den Plan, mit dem Ziel am Ende. Die Linie ist geplant, die Punkte hast du geschafft. Nach jedem Training passt sich der Rest an.'
	},
	{
		id: 'weeks',
		route: () => '/plan',
		target: '[data-tour="weeks"]',
		when: 'plan',
		title: 'Alle Wochen deines Plans',
		text: 'Wische durch die Wochen. „LEICHT“ markiert die Entlastungswochen mit weniger Sätzen und leichteren Gewichten.'
	},
	{
		id: 'days',
		route: () => '/plan',
		target: '[data-tour="days"]',
		when: 'plan',
		title: 'Tage und Übungen bearbeiten',
		text: 'Tippe auf einen Tag und dann auf eine Übung: Sätze, Wiederholungen, RPE und Gewicht ändern, tauschen oder entfernen. Änderungen über mehrere Wochen behalten die Steigerung.'
	},
	{
		id: 'adjust',
		route: () => '/plan',
		target: '[data-tour="adjust"]',
		when: 'plan',
		title: 'Plan anpassen',
		text: 'Planname, Namen der Trainingstage und die Länge in Wochen. Die Entlastungswochen werden dabei automatisch verteilt.'
	},
	{
		id: 'exlist',
		route: trainingRoute,
		target: '[data-tour="exlist"]',
		when: 'plan',
		title: 'Im Training',
		text: 'Alle Übungen des Tages auf einen Blick. Wähle eine aus, trage pro Satz ein, wie schwer er war (leicht, okay, hart oder RPE), und die Satzpause startet. Erledigte Übungen werden grün.'
	},
	{
		id: 'finish',
		route: trainingRoute,
		target: '[data-tour="finish"]',
		when: 'plan',
		title: 'Training beenden',
		text: 'Zum Schluss ein Gesamtfeedback. Es gilt für alle Sätze, die du nicht einzeln bewertet hast. Danach rechnet der Plan die nächsten Wochen nach.'
	},
	{
		id: 'bests',
		route: () => '/profil',
		target: '[data-tour="bests"]',
		title: 'Deine Bestwerte',
		text: 'Dein Maximum für eine Wiederholung. Alle Gewichte im Plan hängen daran. Ändern kannst du sie jederzeit, der Plan rechnet ab dieser Woche neu.'
	},
	{
		id: 'settings',
		route: () => '/profil',
		target: '[data-tour="settings"]',
		title: 'Verlauf und Einstellungen',
		text: 'Hier findest du alle vergangenen Trainings zum Nachbearbeiten und stellst die Satzpause ein. Weiter unten: alle deine Pläne, RPE-Eingabe und Dunkel- oder Hellmodus.'
	},
	{
		id: 'done',
		route: () => null,
		title: 'Bereit',
		text: 'Das war’s. Dieses Tutorial kannst du jederzeit im Profil neu starten. Viel Erfolg beim Training!'
	}
];

class Tour {
	active = $state(false);
	index = $state(0);
	/** Schritt wartet auf eine Aktion (z. B. Plan erstellen). */
	waiting = $state(false);

	get step(): TourStep | null {
		return this.active ? (STEPS[this.index] ?? null) : null;
	}

	/** Schritte, die zum aktuellen Stand passen. */
	#applies(step: TourStep): boolean {
		if (step.when === 'noPlan') return !session.plan;
		if (step.when === 'plan') return !!session.plan;
		return true;
	}

	start() {
		this.active = true;
		this.waiting = false;
		this.index = 0;
		this.#show();
	}

	next() {
		this.#move(1);
	}

	back() {
		this.#move(-1);
	}

	/** Element nicht gefunden: diesen Schritt in die aktuelle Richtung überspringen. */
	skip(direction: 1 | -1 = 1) {
		this.#move(direction);
	}

	#move(direction: 1 | -1) {
		let i = this.index + direction;
		while (i >= 0 && i < STEPS.length && !this.#applies(STEPS[i])) i += direction;
		if (i >= STEPS.length) return this.finish();
		if (i < 0) return;
		this.index = i;
		this.#show();
	}

	#show() {
		const step = STEPS[this.index];
		if (!step) return;
		const route = step.route();
		if (route && location.pathname + location.search !== route) goto(route);
	}

	/** Aktion eines Schritts ausführen (z. B. zum Plan-Erstellen); Tour pausiert bis zum Ergebnis. */
	runAction() {
		const step = this.step;
		if (!step?.action) return;
		this.waiting = true;
		step.action.run();
	}

	/** Nach einer Aktion: weiter, sobald die Bedingung erfüllt ist (vom Layout aufgerufen). */
	resumeIfReady() {
		if (!this.active || !this.waiting) return;
		if (this.step?.id === 'create' && session.plan && location.pathname === '/') {
			this.waiting = false;
			this.next();
		}
	}

	finish() {
		this.active = false;
		this.waiting = false;
		session.setTutorialDone(true);
		if (location.pathname.startsWith('/training')) goto('/');
	}
}

export const tour = new Tour();
