// src/firebase/firebase.js

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';


const firebaseConfig = {
  apiKey: "AIzaSyBrKXJjEZE7ccaLjppXfSQRaQrCgbgUVYI",
  authDomain: "rose-perfumeria.firebaseapp.com",
  projectId: "rose-perfumeria",
  storageBucket: "rose-perfumeria.firebasestorage.app",
  messagingSenderId: "210245675833",
  appId: "1:210245675833:web:36cddc8fd07d3d9b46d6e8",
  measurementId: "G-7J80ZNV01B"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Servicios
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export opcional por si lo necesitas luego
export default app;