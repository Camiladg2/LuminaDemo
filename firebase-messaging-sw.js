// IMPORTANTE: Se agregaron las extensiones "-compat.js" para que funcione la sintaxis antigua en el navegador
importScripts('https://gstatic.com');
importScripts('https://gstatic.com');

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD3bFl4uHz78sz6_Z2gZgur5l_rJdmqJh4",
    authDomain: "menuardemo.firebaseapp.com",
    projectId: "menuardemo",
    storageBucket: "menuardemo.firebasestorage.app",
    messagingSenderId: "1024512044720",
    appId: "1:1024512044720:web:c148b3c34938e2221c1575"
};

// Ahora sí funcionará correctamente esta línea
firebase.initializeApp(FIREBASE_CONFIG);

const messaging = firebase.messaging();

// Maneja notificaciones en segundo plano (pantalla apagada o pestaña cerrada)
messaging.onBackgroundMessage((payload) => {
    console.log("Notificación recibida en background:", payload);
    const { title, body } = payload.notification;
    
    // Muestra la notificación nativa del sistema
    self.registration.showNotification(title, {
        body: body,
        icon: '/Images/LogoMenuAr.png',
        badge: '/Images/LogoMenuAr.png',
        vibrate: [200, 100, 200, 100, 400]
    });
});
