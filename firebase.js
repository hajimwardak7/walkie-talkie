import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


const firebaseConfig = {

    apiKey:
        "AIzaSyBJjc2bJTzUZuHJW3U5CKQJ2d-zw9rM79c",

    authDomain:
        "walkie-talkie-95917.firebaseapp.com",

    projectId:
        "walkie-talkie-95917",

    storageBucket:
        "walkie-talkie-95917.firebasestorage.app",

    messagingSenderId:
        "291473767270",

    appId:
        "1:291473767270:web:e9e532320f2383f6aea6a7"

};


const app =
    initializeApp(firebaseConfig);


const db =
    getFirestore(app);


export {
    app,
    db
};