// firebase-config.ts
// TODO: Replace with your actual Firebase configuration



import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyDTIyYl3LhVn1fO0yYB1qdYDFC67hMpX04",
  authDomain: "jstream-desktop.firebaseapp.com",
  projectId: "jstream-desktop",
  storageBucket: "jstream-desktop.firebasestorage.app",
  messagingSenderId: "964451292182",
  appId: "1:964451292182:web:41c90a08bd43b8ad5e1137",
  // Add your TMDB API key here (never hardcode in code, only in config)
  tmdbApiKey: "YOUR_TMDB_API_KEY"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Secure function to fetch streaming URL for a movie/show by ID
export async function fetchStreamingUrl(contentId: string): Promise<string | null> {
  try {
    const docRef = doc(db, 'streamingSources', contentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      // Assume the document has a 'url' field
      return docSnap.data().url || null;
    } else {
      return null;
    }
  } catch (error) {
    // Suppress Firebase errors to avoid console spam in the renderer.
    return null;
  }
}

// Example test function to check Firebase connection
export async function testFirebaseConnection() {
  try {
    // Try to fetch a known document (replace 'testId' with a real one for your DB)
    const url = await fetchStreamingUrl('testId');
    return url;
  } catch (error) {
    // Suppress test errors
    return null;
  }
}
