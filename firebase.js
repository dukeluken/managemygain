import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
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

    window.mmgFirebase = {
      configured: true,
      signIn: async () => {
        if (matchMedia('(max-width: 700px)').matches) {
          return signInWithRedirect(auth, google);
        }
        return signInWithPopup(auth, google);
      },
      signOut: () => signOut(auth),
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
