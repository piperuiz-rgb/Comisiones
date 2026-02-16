// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBjUVtfkq-L2TgsxG5Iu20DZrz_457xYD4",
    authDomain: "comisiones-d1a47.firebaseapp.com",
    projectId: "comisiones-d1a47",
    storageBucket: "comisiones-d1a47.firebasestorage.app",
    messagingSenderId: "568383356013",
    appId: "1:568383356013:web:83a200ae3b58fbac815364"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();
// Firestore auto-detects long polling when needed

console.log("Firebase inicializado correctamente - Proyecto: comisiones-d1a47");
