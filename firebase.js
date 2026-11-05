import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const config = window.MMG_FIREBASE_CONFIG;
const ready = () => document.dispatchEvent(new Event('mmg-firebase-ready'));
const isConfigured = config?.apiKey && !config.apiKey.startsWith('DEIN_') &&
  config?.projectId && !config.projectId.startsWith('DEIN_') &&
  config?.appId && !config.appId.startsWith('DEINE_');

if (!isConfigured) {
  window.mmgFirebase = { configured: false };
  ready();
} else {
  try {
    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const google = new GoogleAuthProvider();
    google.setCustomParameters({ prompt: 'select_account' });
    const completeRedirectSignIn = () => getRedirectResult(auth);

    window.mmgFirebase = {
      configured: true,
      signIn: async () => {
        // Use redirect only on Firebase's firebaseapp.com Hosting origin. On
        // web.app the cross-site redirect state may be blocked by mobile Chrome.
        if (location.hostname.endsWith('.firebaseapp.com')) return signInWithRedirect(auth, google);
        return signInWithPopup(auth, google);
      },
      completeRedirectSignIn,
      signOut: () => signOut(auth),
      currentUser: () => auth.currentUser,
      watchAuth: callback => onAuthStateChanged(auth, callback),
      loadData: async uid => {
        const snapshot = await getDoc(doc(db, 'users', uid));
        return snapshot.exists() ? snapshot.data() : null;
      },
      // Schreibt nur, wenn die Cloud noch auf der erwarteten Revision steht.
      // Sonst wurde zwischenzeitlich auf einem anderen Gerät gespeichert
      // (Fehlercode mmg/conflict). Liefert die neue Revision zurück.
      saveData: (uid, data, expectedRevision) => runTransaction(db, async transaction => {
        const ref = doc(db, 'users', uid);
        const snapshot = await transaction.get(ref);
        const currentRevision = snapshot.exists() ? Number(snapshot.data().revision) || 0 : 0;
        if (currentRevision !== Number(expectedRevision || 0)) {
          const conflict = new Error('Die Cloud-Daten wurden auf einem anderen Gerät geändert.');
          conflict.code = 'mmg/conflict';
          throw conflict;
        }
        const revision = currentRevision + 1;
        transaction.set(ref, {
          plans: data.plans ?? [],
          activePlanId: data.activePlanId ?? null,
          plan: data.plan ?? null,
          history: data.history ?? [],
          triples: data.triples ?? {},
          bodyWeight: data.bodyWeight ?? '',
          exerciseCatalog: data.exerciseCatalog ?? [],
          revision,
          updatedAt: serverTimestamp()
        });
        return revision;
      }),
      createSharedPlan: (shareId, data) => setDoc(doc(db, 'sharedPlans', shareId), {
        plan: data.plan,
        authorName: data.authorName,
        createdAt: data.createdAt,
        publishedAt: serverTimestamp()
      }),
      loadSharedPlan: async shareId => {
        const snapshot = await getDoc(doc(db, 'sharedPlans', shareId));
        return snapshot.exists() ? snapshot.data() : null;
      }
    };
    ready();
  } catch (error) {
    console.error('Firebase initialization failed', error);
    window.mmgFirebase = { configured: false, error };
    ready();
  }
}
