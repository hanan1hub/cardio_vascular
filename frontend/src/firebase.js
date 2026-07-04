// Import Firebase functions
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAZ1HXOaZhONh90Zj_qKyzwdfocbEZOv44",
  authDomain: "cardiotrix-local.firebaseapp.com",
  projectId: "cardiotrix-local",
  storageBucket: "cardiotrix-local.firebasestorage.app",
  messagingSenderId: "470307257114",
  appId: "1:470307257114:web:2f8e6df8f841b31df48aa3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use modern persistent cache (replaces deprecated enableIndexedDbPersistence).
// This does NOT interfere with getDocFromServer unlike the old API.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

export default app;