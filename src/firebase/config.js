import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'

// Replace with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyB0LusXVbOZu9HmZqb4XHYG2jGJtj7Xlvc",
  authDomain: "malachim-baketoum.firebaseapp.com",
  projectId: "malachim-baketoum",
  storageBucket: "malachim-baketoum.firebasestorage.app",
  messagingSenderId: "849289149810",
  appId: "1:849289149810:web:1dd1b66b841cf62c0c71eb",
  measurementId: "G-489GDH6MTM",
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
})

// Secondary app — used only for creating new Auth users without displacing
// the currently signed-in admin/branch_head. createUserWithEmailAndPassword
// on the primary app would auto-sign-in the new user and log out the manager.
const secondaryApp = initializeApp(firebaseConfig, 'secondary')
export const secondaryAuth = getAuth(secondaryApp)

export default app
