// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDG0i0jhZpuUoLN9YpgGm_MFgXSQCzz8D8",
    authDomain: "comisiones-app-33035.firebaseapp.com",
    projectId: "comisiones-app-33035",
    storageBucket: "comisiones-app-33035.firebasestorage.app",
    messagingSenderId: "788824483061",
    appId: "1:788824483061:web:426710fdd532d64e53d1bc"
};

// Initialize Firebase (main app)
firebase.initializeApp(firebaseConfig);

// Initialize Firestore and Auth
const db = firebase.firestore();
const auth = firebase.auth();

// Secondary app instance for creating users without signing out admin
let secondaryApp;
try {
    secondaryApp = firebase.app('secondary');
} catch (e) {
    secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary');
}
const secondaryAuth = secondaryApp.auth();

console.log("Firebase inicializado correctamente - Proyecto: comisiones-app-33035");
