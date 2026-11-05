// Globaler Zustand: angemeldeter Nutzer, Profil, aktiver Plan und dessen Trainings.
// Die Daten kommen live aus Firestore (inkl. Offline-Cache). Bildschirme schreiben
// nur über die Aktionen hier, nie direkt in Firestore.
import {
	GoogleAuthProvider,
	onAuthStateChanged,
	signInWithPopup,
	signInWithRedirect,
	signOut as fbSignOut
} from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';
import {
	applyWorkout,
	createProgram,
	dayTitle,
	applyBests,
	estimatesAt,
	isoDate,
	mondayOf,
	planName,
	weekCount,
	weekIndexAt
} from '#lib/engine/index.ts';
import { auth } from './firebase.ts';
import {
	createPlanFromRequest,
	ensureProfile,
	finishWorkout,
	saveProgram,
	saveWorkout,
	updateProfile,
	watchPlan,
	watchProfile,
	watchWorkouts
} from './repo.ts';
import type { Bests, MainLift, Plan, PlanRequest, Profile, Program, Workout } from './types.ts';

export interface SessionUser {
	uid: string;
	displayName: string | null;
}

class Session {
	user = $state<SessionUser | null>(null);
	profile = $state<Profile | null>(null);
	plan = $state<Plan | null>(null);
	workouts = $state<Workout[]>([]);
	/** false, bis Auth und (falls angemeldet) Profil und Plan geladen sind. */
	ready = $state(false);
	error = $state<string | null>(null);
	/** Nur Entwicklung: Beispieldaten im Speicher, ohne Firebase. */
	demo = $state(false);

	#subs: Unsubscribe[] = [];
	#planSubs: Unsubscribe[] = [];
	#planId: string | null = null;
	#started = false;

	start() {
		if (this.#started) return;
		this.#started = true;
		if (import.meta.env.DEV && isDemoRequested()) {
			this.#startDemo();
			return;
		}
		onAuthStateChanged(auth, async (user) => {
			this.#clear();
			this.user = user ? { uid: user.uid, displayName: user.displayName } : null;
			if (!user) {
				this.ready = true;
				return;
			}
			this.ready = false;
			try {
				await ensureProfile(user.uid, user.displayName ?? '');
			} catch (e) {
				// Offline beim ersten Start: Profil kommt, sobald Verbindung besteht.
				console.warn(e);
			}
			this.#subs.push(
				watchProfile(user.uid, (profile) => {
					this.profile = profile;
					this.#followPlan(user.uid, profile?.activePlanId ?? null);
				})
			);
		});
	}

	// ---------- Aktionen ----------

	async createPlan(req: PlanRequest): Promise<void> {
		if (!this.user) return;
		if (this.demo) {
			this.plan = demoPlan(req, new Date());
			this.workouts = [];
			if (this.profile) this.profile = { ...this.profile, bests: req.bests, activePlanId: this.plan.id };
			return;
		}
		await createPlanFromRequest(this.user.uid, req);
	}

	/** Zwischenstand speichern. Wird nicht abgewartet: Firestore puffert offline. */
	saveWorkout(workout: Workout) {
		if (!this.user) return;
		if (this.demo) {
			this.#upsertLocal(workout);
			return;
		}
		saveWorkout(this.user.uid, workout).catch((e) => console.warn(e));
	}

	async finishWorkout(workout: Workout): Promise<void> {
		if (!this.user || !this.plan) return;
		const plan = $state.snapshot(this.plan) as Plan;
		if (this.demo) {
			const program = structuredClone(plan.program);
			applyWorkout(program, workout);
			const finished = {
				...workout,
				finishedAt: new Date().toISOString(),
				estimates: estimatesAt(program, workout.weekIndex)
			};
			this.plan = { ...plan, program };
			this.#upsertLocal(finished);
			return;
		}
		await finishWorkout(this.user.uid, plan, workout);
	}

	/**
	 * Plan ändern: `change` bekommt eine Kopie des Programms und verändert sie.
	 * Die Anzeige aktualisiert sofort, gespeichert wird im Hintergrund.
	 */
	editPlan(change: (program: Program) => void) {
		if (!this.user || !this.plan) return;
		const program = structuredClone($state.snapshot(this.plan.program)) as Program;
		change(program);
		this.plan = { ...this.plan, program };
		if (this.demo) return;
		saveProgram(this.user.uid, this.plan.id, program).catch((e) => {
			console.warn(e);
			this.error = 'Änderung konnte nicht gespeichert werden. Sie wird nachgeholt, sobald Verbindung besteht.';
		});
	}

	/**
	 * Eigene Bestwerte ändern. Der aktive Plan rechnet ab der aktuellen Woche mit
	 * den neuen Werten; vergangene Wochen bleiben, wie sie trainiert wurden.
	 */
	setBests(bests: Bests) {
		if (!this.user || !this.profile) return;
		const merged = { ...(this.profile.bests ?? {}), ...bests };
		this.profile = { ...this.profile, bests: merged, bestsUpdatedAt: new Date().toISOString() };
		if (this.plan) {
			const week = Math.min(Math.max(0, weekIndexAt(this.plan, new Date())), weekCount(this.plan.program) - 1);
			this.editPlan((program) => applyBests(program, bests, week));
		}
		if (this.demo) return;
		updateProfile(this.user.uid, { bests: merged, bestsUpdatedAt: new Date().toISOString() }).catch((e) => {
			console.warn(e);
			this.error = 'Bestwerte konnten nicht gespeichert werden. Sie werden nachgeholt, sobald Verbindung besteht.';
		});
	}

	async signIn() {
		this.error = null;
		const google = new GoogleAuthProvider();
		google.setCustomParameters({ prompt: 'select_account' });
		try {
			// Auf firebaseapp.com klappt Redirect zuverlässig; sonst Popup (mobiles Chrome
			// blockiert dort den seitenübergreifenden Redirect-Zustand).
			if (location.hostname.endsWith('.firebaseapp.com')) await signInWithRedirect(auth, google);
			else await signInWithPopup(auth, google);
		} catch (e) {
			const code = (e as { code?: string }).code ?? '';
			if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
				this.error = 'Anmeldung hat nicht geklappt. Prüfe die Verbindung und versuche es noch einmal.';
			}
		}
	}

	signOut() {
		if (this.demo) {
			sessionStorage.removeItem('mmg-demo');
			location.href = '/';
			return;
		}
		return fbSignOut(auth);
	}

	// ---------- intern ----------

	#upsertLocal(workout: Workout) {
		const others = this.workouts.filter((w) => w.id !== workout.id);
		this.workouts = [...others, structuredClone(workout)];
	}

	#followPlan(uid: string, planId: string | null) {
		if (planId === this.#planId && (planId === null ? this.ready : true)) return;
		this.#planSubs.forEach((u) => u());
		this.#planSubs = [];
		this.#planId = planId;
		this.plan = null;
		this.workouts = [];
		if (!planId) {
			this.ready = true;
			return;
		}
		let planLoaded = false;
		let workoutsLoaded = false;
		const check = () => {
			if (planLoaded && workoutsLoaded) this.ready = true;
		};
		this.#planSubs.push(
			watchPlan(uid, planId, (plan) => {
				this.plan = plan;
				planLoaded = true;
				check();
			}),
			watchWorkouts(uid, planId, (list) => {
				this.workouts = list;
				workoutsLoaded = true;
				check();
			})
		);
	}

	#clear() {
		[...this.#subs, ...this.#planSubs].forEach((u) => u());
		this.#subs = [];
		this.#planSubs = [];
		this.#planId = null;
		this.profile = null;
		this.plan = null;
		this.workouts = [];
	}

	#startDemo() {
		this.demo = true;
		this.user = { uid: 'demo', displayName: 'Demo Athlet' };
		const now = new Date();
		const params = new URLSearchParams(location.search);
		const mode = params.get('demo');
		// Für Screenshots: ?demo&theme=light
		if (params.get('theme') === 'light') document.documentElement.dataset.theme = 'light';
		if (mode !== 'leer') {
			const start = new Date(now);
			start.setDate(start.getDate() - 14);
			this.plan = demoPlan(DEMO_REQUEST, start);
			this.workouts = demoHistory(this.plan, now);
		}
		this.profile = {
			uid: 'demo',
			displayName: 'Demo Athlet',
			roles: ['trainee'],
			activePlanId: this.plan?.id ?? null,
			coachId: null,
			effortScale: 'simple',
			bests: mode === 'leer' ? undefined : DEMO_REQUEST.bests,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString()
		};
		this.ready = true;
	}
}

// ---------- Demo-Daten (nur Entwicklung) ----------

function isDemoRequested(): boolean {
	try {
		if (new URLSearchParams(location.search).has('demo')) sessionStorage.setItem('mmg-demo', '1');
		return sessionStorage.getItem('mmg-demo') === '1';
	} catch {
		return false;
	}
}

const DEMO_REQUEST: PlanRequest = {
	goal: 'strength',
	daysPerWeek: 4,
	experience: 'intermediate',
	block: 'strength',
	bests: { squat: 140, bench: 100, deadlift: 175, press: 62.5 }
};

function demoPlan(req: PlanRequest, start: Date): Plan {
	const ts = new Date().toISOString();
	const program = createProgram(req);
	return {
		id: 'demo-plan',
		ownerId: 'demo',
		authorId: 'demo',
		source: 'generator',
		name: planName(req),
		goal: req.goal,
		startDate: isoDate(mondayOf(start)),
		status: 'active',
		request: req,
		engine: program.engine === 'splits-v1' ? 'splits-v1' : 'powerlifting-v2',
		program,
		startMaxes: estimatesAt(program, 0),
		createdAt: ts,
		updatedAt: ts
	};
}

/**
 * Erledigte Trainings für alle Einheiten vor heute. Der erfundene Verlauf steigt von
 * etwas unter dem Startwert bis genau zum aktuellen Planwert, damit ein neues
 * Training in der Demo nahtlos anschließt. Setzt dafür auch plan.startMaxes.
 */
function demoHistory(plan: Plan, now: Date): Workout[] {
	const result: Workout[] = [];
	const start = new Date(`${plan.startDate}T12:00:00`);
	const end = estimatesAt(plan.program, weekIndexAt(plan, now));
	const lifts = Object.keys(end) as MainLift[];
	const base = Object.fromEntries(
		lifts.map((l, k) => [l, end[l] ? Math.round(end[l]! * (0.96 - 0.01 * k) * 10) / 10 : null])
	) as Partial<Record<MainLift, number | null>>;
	plan.startMaxes = base;
	plan.program.days.forEach((day, dayIndex) => {
		for (let week = 0; week < 6; week++) {
			const date = new Date(start);
			date.setDate(start.getDate() + week * 7 + ((day.weekDay + 6) % 7));
			if (date >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue;
			result.push({
				id: `demo_w${week + 1}_d${dayIndex + 1}`,
				ownerId: 'demo',
				planId: plan.id,
				weekIndex: week,
				dayIndex,
				dayName: dayTitle(day),
				date: isoDate(date),
				startedAt: date.toISOString(),
				finishedAt: date.toISOString(),
				exercises: []
			});
		}
	});
	result.sort((a, b) => a.date.localeCompare(b.date));
	result.forEach((w, i) => {
		const t = (i + 1) / result.length;
		w.estimates = Object.fromEntries(
			lifts.map((l) => [l, base[l] && end[l] ? Math.round((base[l]! + (end[l]! - base[l]!) * t) * 10) / 10 : null])
		) as Workout['estimates'];
	});
	return result;
}

export const session = new Session();
