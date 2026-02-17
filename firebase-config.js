// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDG0i0jhZpuUoLN9YpgGm_MFgXSQCzz8D8",
    authDomain: "comisiones-app-33035.firebaseapp.com",
    projectId: "comisiones-app-33035",
    storageBucket: "comisiones-app-33035.firebasestorage.app",
    messagingSenderId: "788824483061",
    appId: "1:788824483061:web:426710fdd532d64e53d1bc"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

console.log("Firebase inicializado correctamente - Proyecto: comisiones-app-33035");
