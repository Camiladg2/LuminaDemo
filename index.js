// Reemplaza las primeras líneas por esto:
const admin = require("firebase-admin");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const serviceAccount = require("./clave-firebase.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const messaging = getMessaging();

console.log("🚀 Servidor local de notificaciones activo. Escuchando nuevas llamadas...");

// De aquí para abajo tu código de "db.collection('llamadas').onSnapshot..." sigue IGUAL,
// solo asegúrate de cambiar la línea del envío:


// Reemplazamos la Cloud Function por un Listener en tiempo real gratuito
db.collection("llamadas").onSnapshot(async (snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    // Solo actuamos cuando se AÑADE una nueva llamada (igual que onCreate)
    if (change.type === "added") {
      const llamada = change.doc.data();
      console.log(`🛎️ Nueva llamada detectada de Mesa ${llamada.mesa}`);

      try {
        // Obtiene todos los tokens de los meseros
        const meserosSnap = await db.collection("meseros").get();
        const tokens = meserosSnap.docs
          .map(doc => doc.data().tokenFCM)
          .filter(token => token); // Filtra si algún mesero no tiene token

        if (tokens.length === 0) {
          console.log("⚠️ No hay meseros con tokens registrados.");
          return;
        }

        const message = {
          notification: {
            title: `🛎️ Llamada de Mesa ${llamada.mesa}`,
            body: llamada.motivo || "Solicita atención"
          },
          tokens: tokens
        };

        // Envía la notificación multicast
        // REEMPLÁZALO POR ESTO:
        const response = await messaging.sendEachForMulticast(message);

        console.log(`✅ Notificación enviada con éxito a ${response.successCount} meseros.`);
      } catch (e) {
        console.error("❌ Error enviando notificación:", e);
      }
    }
  });
});
