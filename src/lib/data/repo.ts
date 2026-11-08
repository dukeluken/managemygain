// Alle Firestore-Zugriffe an einer Stelle. Bildschirme rufen nur diese Funktionen auf;
// Coach-Freigaben, Regeln und Migration hängen später hier ein.
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	setDoc,
	updateDoc,
	where,
	writeBatch,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase.ts';
import type { Plan, PlanRequest, Profile, Program, Workout } from './types.ts';
import { applyWorkout, createProgram, estimatesAt, isoDate, mondayOf, planName } from '#lib/engine/index.ts';

const now = () => new Date().toISOString();
const profileRef = (uid: string) => doc(db, 'profiles', uid);
const plansCol = (uid: string) => collection(db, 'profiles', uid, 'plans');
const workoutsCol = (uid: string) => collection(db, 'profiles', uid, 'workouts');

// ---------- Profil ----------

export async function ensureProfile(uid: string, displayName: string): Promise<void> {
	const ref = profileRef(uid);
	const snap = await getDoc(ref);
	if (snap.exists()) return;
	const profile: Profile = {
		uid,
		displayName: displayName || 'Athlet',
		roles: ['trainee'],
		activePlanId: null,
		coachId: null,
		effortScale: 'simple',
		createdAt: now(),
		updatedAt: now()
	};
	await setDoc(ref, profile);
}

export function watchProfile(uid: string, cb: (p: Profile | null) => void): Unsubscribe {
	return onSnapshot(profileRef(uid), (snap) => cb(snap.exists() ? (snap.data() as Profile) : null));
}

export function updateProfile(uid: string, patch: Partial<Omit<Profile, 'uid' | 'roles' | 'createdAt'>>) {
	return updateDoc(profileRef(uid), { ...patch, updatedAt: now() });
}

// ---------- Pläne ----------

export function watchPlan(uid: string, planId: string, cb: (p: Plan | null) => void): Unsubscribe {
	return onSnapshot(doc(plansCol(uid), planId), (snap) => cb(snap.exists() ? (snap.data() as Plan) : null));
}

export async function createPlanFromRequest(uid: string, req: PlanRequest, start = new Date()): Promise<Plan> {
	const ref = doc(plansCol(uid));
	const program = createProgram(req);
	const plan: Plan = {
		id: ref.id,
		ownerId: uid,
		authorId: uid,
		source: 'generator',
		name: planName(req),
		goal: req.goal,
		startDate: isoDate(mondayOf(start)),
		status: 'active',
		request: req,
		engine: program.engine === 'splits-v1' ? 'splits-v1' : 'powerlifting-v2',
		program,
		startMaxes: estimatesAt(program, 0),
		createdAt: now(),
		updatedAt: now()
	};
	const batch = writeBatch(db);
	batch.set(ref, plan);
	// Die Bestwerte aus den Einstiegsfragen werden zu den Bestwerten im Profil.
	batch.set(
		profileRef(uid),
		{ activePlanId: plan.id, bests: req.bests, bestsUpdatedAt: now(), updatedAt: now() },
		{ merge: true }
	);
	await batch.commit();
	return plan;
}

/** Alle Pläne des Nutzers, neueste zuerst. */
export function watchPlans(uid: string, cb: (plans: Plan[]) => void): Unsubscribe {
	return onSnapshot(plansCol(uid), (snap) =>
		cb(
			snap.docs
				.map((d) => d.data() as Plan)
				.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
		)
	);
}

/** Name und/oder Programm eines Plans speichern. */
export function updatePlan(uid: string, planId: string, patch: Partial<Pick<Plan, 'name' | 'program'>>) {
	return updateDoc(doc(plansCol(uid), planId), { ...patch, updatedAt: now() });
}

/**
 * Plan samt seiner Trainings löschen. Ist er aktiv, wird `nextActiveId` aktiv
 * (oder keiner).
 */
export async function deletePlan(uid: string, planId: string, nextActiveId?: string | null) {
	const workouts = await getDocs(query(workoutsCol(uid), where('planId', '==', planId)));
	const batch = writeBatch(db);
	workouts.docs.forEach((d) => batch.delete(d.ref));
	batch.delete(doc(plansCol(uid), planId));
	if (nextActiveId !== undefined) batch.update(profileRef(uid), { activePlanId: nextActiveId, updatedAt: now() });
	await batch.commit();
}

/** Programm eines Plans speichern (nach dem Bearbeiten). */
export function saveProgram(uid: string, planId: string, program: Program) {
	return updateDoc(doc(plansCol(uid), planId), { program, updatedAt: now() });
}

// ---------- Trainings ----------

export function watchWorkouts(uid: string, planId: string, cb: (w: Workout[]) => void): Unsubscribe {
	const q = query(workoutsCol(uid), where('planId', '==', planId));
	return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as Workout)));
}

/** Eindeutige Id je Plan, Woche und Tag: ein Training kann nicht doppelt entstehen. */
export function workoutId(planId: string, weekIndex: number, dayIndex: number) {
	return `${planId}_w${weekIndex + 1}_d${dayIndex + 1}`;
}

export function saveWorkout(uid: string, workout: Workout) {
	return setDoc(doc(workoutsCol(uid), workout.id), workout);
}

export function deleteWorkout(uid: string, workoutId: string) {
	return deleteDoc(doc(workoutsCol(uid), workoutId));
}

/** Training abschließen und den Plan aus den geloggten Sätzen nachführen. */
export async function finishWorkout(uid: string, plan: Plan, workout: Workout): Promise<void> {
	const program = structuredClone(plan.program);
	const changed = applyWorkout(program, workout);
	const finished: Workout = { ...workout, finishedAt: now(), estimates: estimatesAt(program, workout.weekIndex) };
	const batch = writeBatch(db);
	batch.set(doc(workoutsCol(uid), finished.id), finished);
	if (changed) batch.update(doc(plansCol(uid), plan.id), { program, updatedAt: now() });
	await batch.commit();
}
