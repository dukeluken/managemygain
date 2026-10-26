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
      saveData: (uid, data) => setDoc(doc(db, 'users', uid), {
        plans: data.plans ?? [],
        activePlanId: data.activePlanId ?? null,
        plan: data.plan ?? null,
        history: data.history ?? [],
        triples: data.triples ?? {},
        bodyWeight: data.bodyWeight ?? '',
        exerciseCatalog: data.exerciseCatalog ?? [],
        updatedAt: serverTimestamp()
      }, { merge: true })
    };
    ready();
  } catch (error) {
    console.error('Firebase initialization failed', error);
    window.mmgFirebase = { configured: false, error };
    ready();
  }
}
