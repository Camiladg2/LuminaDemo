// ========================================================
//  mesero.js — Panel del Mesero — MenuAR
//  • Identificación por nombre al inicio
//  • Notificación cuando cocina marca "listo" (sonido diferente + vibración)
//  • Toast estático (sin rebote)
//  • Pedidos van a Firebase correctamente
//  • Multi-mesero: todos ven todo, se asignan con nombre
// ========================================================

    const FIREBASE_CONFIG = {
        apiKey:            "AIzaSyD3bFl4uHz78sz6_Z2gZgur5l_rJdmqJh4",   // ej: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX"
        authDomain:        "menuardemo.firebaseapp.com",   // ej: "menuAR-demo.firebaseapp.com"
        projectId:         "menuardemo",   // ej: "menuAR-demo"
        storageBucket:     "menuardemo.firebasestorage.app",   // ej: "menuAR-demo.appspot.com"
        messagingSenderId: "1024512044720",   // ej: "123456789012"
        appId:             "1:1024512044720:web:c148b3c34938e2221c1575"    // ej: "1:123456789012:web:abcdefabcdef"
    };

const USE_FIREBASE = FIREBASE_CONFIG.apiKey !== "";

// ── MENÚ (igual que el menú del cliente) ─────────────────
const MENU_ITEMS = [
    { id:"p1", name:"Papas Nativas",        price:"$35.000", priceNum:35000, poster:"Images/papasnativas.jpg" },
    { id:"p2", name:"Plato Estrella",       price:"$17.800", priceNum:17800, poster:"Images/cake.png"         },
    { id:"p3", name:"Summer Tea",           price:"$8.000",  priceNum:8000,  poster:"Images/drink.png"        },
    { id:"p4", name:"Hamburguesa Insignia", price:"$38.000", priceNum:38000, poster:"Images/burguer.png"      },
    { id:"p5", name:"Sushi Boat",           price:"$32.000", priceNum:32000, poster:"Images/sushi.png"        },
];

const TOTAL_MESAS = 12;

// ── ESTADO ───────────────────────────────────────────────
let db               = null;
let nombreMesero     = "";         // identificación del mesero
let llamadas         = [];
let misOrdenes       = [];
let pedidosListos    = [];         // pedidos con estado "listo" pendientes de entrega
let mesaSeleccionada = null;
let carrito          = {};
let soundEnabled     = true;
let toastTimer       = null;
let conocidosLlamadas   = new Set();
let conocidosPedidosListos = new Set(); // pedidos "listo" ya notificados
let ultimaKeyLlamadas   = null;    // para evitar re-animar tarjetas sin cambios reales
let readyFirstSeen   = {};         // id -> timestamp cuando se detectó como "listo"
let readyLastReminder = {};        // id -> timestamp del último recordatorio mostrado
let confirmCallback  = null;

const REMINDER_INTERVAL_MS = 2 * 60 * 1000; // recordar cada 2 minutos si sigue sin entregar

function dismissKey() { return "menuAR_dismissed_" + nombreMesero; }
function getDismissedSet() { return new Set(JSON.parse(localStorage.getItem(dismissKey()) || "[]")); }

// ── PANTALLA DE NOMBRE ───────────────────────────────────
function mostrarPantallaDeNombre() {
    // Verificar si ya hay nombre guardado
    const nombreGuardado = sessionStorage.getItem("menuAR_mesero_nombre");
    if (nombreGuardado) {
        nombreMesero = nombreGuardado;
        document.getElementById("meseroNombreDisplay").textContent = nombreMesero;
        iniciarApp();
        return;
    }
    document.getElementById("loginScreen").style.display = "flex";
}

document.getElementById("loginBtn").addEventListener("click", () => {
    const input = document.getElementById("nombreInput").value.trim();
    if (!input) { document.getElementById("loginError").style.display = "block"; return; }
    nombreMesero = input;
    sessionStorage.setItem("menuAR_mesero_nombre", nombreMesero);
    document.getElementById("meseroNombreDisplay").textContent = nombreMesero;
    document.getElementById("loginScreen").style.display = "none";
    iniciarApp();
});

document.getElementById("nombreInput").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("loginBtn").click();
});

// ── MODAL DE CONFIRMACIÓN GENÉRICA ───────────────────────
function abrirConfirmModal(title, msg, onOk) {
    document.getElementById("confirmModalTitle").textContent = title;
    document.getElementById("confirmModalMsg").textContent = msg;
    confirmCallback = onOk;
    document.getElementById("confirmModal").classList.add("active");
}
document.getElementById("confirmModalOk").addEventListener("click", () => {
    document.getElementById("confirmModal").classList.remove("active");
    const cb = confirmCallback;
    confirmCallback = null;
    if (cb) cb();
});
document.getElementById("confirmModalCancel").addEventListener("click", () => {
    document.getElementById("confirmModal").classList.remove("active");
    confirmCallback = null;
});

// ── CAMBIAR DE PERFIL (mismo dispositivo, otro mesero) ───
document.getElementById("cambiarPerfilBtn").addEventListener("click", () => {
    abrirConfirmModal(
        "Cambiar de mesero",
        `¿Seguro que quieres salir como ${nombreMesero}? El dispositivo quedará libre para que otro mesero inicie sesión con su nombre.`,
        () => {
            sessionStorage.removeItem("menuAR_mesero_nombre");
            location.reload();
        }
    );
});

// ── LIMPIAR MI LISTA (solo vista personal, no borra datos reales) ──
document.getElementById("limpiarMisPedidosBtn").addEventListener("click", () => {
    abrirConfirmModal(
        "Limpiar mi lista",
        "Esto solo oculta los pedidos de tu lista personal en este dispositivo. No se borran de caja ni de cocina, y los demás meseros seguirán viéndolos con normalidad.",
        () => {
            const dismissed = getDismissedSet();
            misOrdenes.forEach(p => dismissed.add(p.id));
            localStorage.setItem(dismissKey(), JSON.stringify([...dismissed]));
            renderMisOrdenes();
            mostrarToast("🧹 Tu lista personal fue limpiada");
        }
    );
});

// ── FIREBASE INIT ─────────────────────────────────────────
async function initFirebase() {
    if (!USE_FIREBASE || db) return;
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore  } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    db = getFirestore(initializeApp(FIREBASE_CONFIG));
    console.log("Firebase Mesero conectado ✓");
}

// ── LISTENERS ────────────────────────────────────────────
async function startListeners() {
    if (USE_FIREBASE) {
        try {
            await initFirebase();
            const { collection, query, where, orderBy, onSnapshot } =
                await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

            // Llamadas pendientes
            onSnapshot(
                query(collection(db,"llamadas"), where("estado","==","pendiente"), orderBy("created_at","desc")),
                snap => {
                    const prevCount = llamadas.length;
                    llamadas = snap.docs.map(d=>({id:d.id,...d.data()}));
                    const hayNuevas = llamadas.some(l=>!conocidosLlamadas.has(l.id));
                    if (hayNuevas && prevCount >= 0) {
                        mostrarToast("🛎️ Nueva llamada de mesa");
                        beepLlamada();
                    }
                    llamadas.forEach(l=>conocidosLlamadas.add(l.id));
                    renderLlamadas(); updateBadgeLlamadas();
                }
            );

            // Pedidos: escuchar estado "listo" para notificar al mesero
            onSnapshot(
                query(collection(db,"pedidos"), orderBy("created_at","desc")),
                snap => {
                    const todosPedidos = snap.docs.map(d=>({id:d.id,...d.data()}));

                    procesarPedidosListos(todosPedidos);

                    misOrdenes = todosPedidos.filter(p=>p.origen==="mesero").slice(0, 30);
                    renderMisOrdenes();
                }
            );

            setLiveStatus("En vivo (Firebase)", false);
        } catch(e) {
            console.warn("Firebase falló, modo demo:", e);
            startLocalMode();
        }
    } else {
        startLocalMode();
    }
}

function startLocalMode() {
    setLiveStatus("Modo demo", true);
    cargarLocal();
    setInterval(cargarLocal, 4000);
}

function cargarLocal() {
    const prevLlamadas = llamadas.length;
    llamadas   = JSON.parse(localStorage.getItem("menuAR_llamadas")||"[]")
                    .filter(l=>l.estado==="pendiente").reverse();
    const hayNuevas = llamadas.some(l=>!conocidosLlamadas.has(l.id));
    if (hayNuevas && prevLlamadas >= 0) { mostrarToast("🛎️ Nueva llamada de mesa"); beepLlamada(); }
    llamadas.forEach(l=>conocidosLlamadas.add(l.id));

    // Detectar listos en local
    const todosPedidos = JSON.parse(localStorage.getItem("menuAR_pedidos")||"[]");
    procesarPedidosListos(todosPedidos);

    misOrdenes = todosPedidos.filter(p=>p.origen==="mesero").reverse();
    renderLlamadas(); renderMisOrdenes(); updateBadgeLlamadas();
}

// ── PROCESAR PEDIDOS "LISTO" (compartido Firebase / local) ─
function procesarPedidosListos(todosPedidos) {
    const nuevos = todosPedidos.filter(p => p.estado === "listo" && !conocidosPedidosListos.has(p.id));

    nuevos.forEach(p => {
        conocidosPedidosListos.add(p.id);
        readyFirstSeen[p.id] = Date.now();
        readyLastReminder[p.id] = Date.now();
    });

    if (nuevos.length > 0) {
        const p = nuevos[0];
        mostrarToast(`✅ ¡Pedido listo! Mesa ${p.mesa} — ve a buscarlo`);
        beepListo();
        vibrar();
    }

    pedidosListos = todosPedidos.filter(p => p.estado === "listo");

    // Limpiar registro de recordatorios de pedidos que ya fueron entregados
    const idsListos = new Set(pedidosListos.map(p => p.id));
    Object.keys(readyFirstSeen).forEach(id => { if (!idsListos.has(id)) delete readyFirstSeen[id]; });
    Object.keys(readyLastReminder).forEach(id => { if (!idsListos.has(id)) delete readyLastReminder[id]; });

    renderEntregar();

    if (nuevos.length > 0) abrirReadyModal();
}

// ── ATENDER / DESCARTAR LLAMADA ──────────────────────────
window.atenderLlamada = async function(id) {
    if (USE_FIREBASE && db) {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        await updateDoc(doc(db,"llamadas",id), { estado:"atendido", atendidoPor: nombreMesero, atendidoAt: new Date().toISOString() });
    } else {
        const todas = JSON.parse(localStorage.getItem("menuAR_llamadas")||"[]");
        const idx = todas.findIndex(l=>l.id===id);
        if (idx!==-1) { todas[idx].estado="atendido"; todas[idx].atendidoPor=nombreMesero; localStorage.setItem("menuAR_llamadas",JSON.stringify(todas)); }
        cargarLocal();
    }
    mostrarToast(`✓ Llamada atendida por ${nombreMesero}`);
};

window.descartarLlamada = async function(id) {
    if (USE_FIREBASE && db) {
        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        await deleteDoc(doc(db,"llamadas",id));
    } else {
        const todas = JSON.parse(localStorage.getItem("menuAR_llamadas")||"[]");
        localStorage.setItem("menuAR_llamadas", JSON.stringify(todas.filter(l=>l.id!==id)));
        cargarLocal();
    }
};

// ── RENDER LLAMADAS ───────────────────────────────────────
// Solo reconstruye el HTML (y por lo tanto la animación de entrada) cuando
// realmente cambió el conjunto de llamadas. Así no "salta" cada vez que
// se refresca por el polling — se queda quieta como en el panel del chef,
// y solo se anima cuando de verdad llega o se va una llamada.
function renderLlamadas() {
    const el  = document.getElementById("llamadasList");
    const key = llamadas.map(l=>l.id).join(",");

    if (llamadas.length === 0) {
        if (key !== ultimaKeyLlamadas) {
            el.innerHTML = `<div class="m-empty"><div class="m-empty-icon">🛎️</div><p>Sin llamadas pendientes</p></div>`;
        }
        ultimaKeyLlamadas = key;
        return;
    }

    if (key === ultimaKeyLlamadas) {
        // Mismo set de llamadas: solo refrescamos el texto de "hace cuánto", sin recrear tarjetas
        el.querySelectorAll("[data-llamada-time]").forEach(span => {
            const l = llamadas.find(x=>x.id===span.dataset.llamadaTime);
            if (l) span.textContent = timeAgo(l.created_at);
        });
        return;
    }

    el.innerHTML = llamadas.map(l => `
        <div class="m-call-card">
            <div class="m-call-icon">🛎️</div>
            <div class="m-call-info">
                <div class="m-call-mesa">Mesa ${l.mesa}</div>
                <div class="m-call-motivo">${l.motivo}</div>
                <div class="m-call-time" data-llamada-time="${l.id}">${timeAgo(l.created_at)}</div>
            </div>
            <div class="m-call-actions">
                <button class="m-btn-atender" onclick="atenderLlamada('${l.id}')">✓ Me encargo (${nombreMesero})</button>
                <button class="m-btn-dismiss" onclick="descartarLlamada('${l.id}')">Descartar</button>
            </div>
        </div>`).join("");
    ultimaKeyLlamadas = key;
}

function updateBadgeLlamadas() {
    const badge = document.getElementById("badgeLlamadas");
    badge.textContent = llamadas.length;
    badge.style.display = llamadas.length > 0 ? "flex" : "none";
}

// ── RENDER "PARA ENTREGAR" ────────────────────────────────
function resumenItems(p) {
    return (p.items||[]).map(i => `${i.name}${i.qty>1?" x"+i.qty:""}`).join(" · ");
}

function renderEntregar() {
    const el = document.getElementById("entregarList");
    if (pedidosListos.length === 0) {
        el.innerHTML = `<div class="m-empty"><div class="m-empty-icon">🍽️</div><p>No hay pedidos listos por entregar</p></div>`;
    } else {
        el.innerHTML = pedidosListos.map(p => {
            const vencido = Date.now() - (readyFirstSeen[p.id]||Date.now()) > REMINDER_INTERVAL_MS;
            return `
            <div class="m-ready-card ${vencido?"recordatorio":""}">
                <div class="m-ready-icon">🍽️</div>
                <div class="m-ready-info">
                    <div class="m-ready-mesa">Mesa ${p.mesa||"—"}</div>
                    <div class="m-ready-items">${resumenItems(p)}</div>
                    <div class="m-ready-time">Listo hace ${timeAgo(p.created_at)}</div>
                </div>
                <button class="m-btn-entregado" onclick="marcarEntregado('${p.id}')">✅ Entregado</button>
            </div>`;
        }).join("");
    }
    updateBadgeEntregar();
}

function updateBadgeEntregar() {
    const badge = document.getElementById("badgeEntregar");
    badge.textContent = pedidosListos.length;
    badge.style.display = pedidosListos.length > 0 ? "flex" : "none";
}

window.marcarEntregado = async function(id) {
    const pedido = pedidosListos.find(p=>p.id===id);
    await actualizarPedidoEstado(id, {
        estado:      "entregado",
        entregadoPor: nombreMesero,
        entregadoAt:  new Date().toISOString()
    });
    delete readyFirstSeen[id];
    delete readyLastReminder[id];
    mostrarToast(`✅ Mesa ${pedido?pedido.mesa:""} entregada por ${nombreMesero}`);
    renderReadyModalList();
    if (document.querySelectorAll("#readyModalList .m-ready-modal-item").length === 0) {
        document.getElementById("readyModal").classList.remove("active");
    }
};

async function actualizarPedidoEstado(id, datos) {
    if (USE_FIREBASE && db) {
        try {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
            await updateDoc(doc(db,"pedidos",id), datos);
            return;
        } catch(e) { console.warn("Firebase falló:", e); }
    }
    const todos = JSON.parse(localStorage.getItem("menuAR_pedidos")||"[]");
    const idx = todos.findIndex(p=>p.id===id);
    if (idx!==-1) { Object.assign(todos[idx],datos); localStorage.setItem("menuAR_pedidos",JSON.stringify(todos)); }
    cargarLocal();
}

// ── MODAL RECORDATORIO "LISTO PARA ENTREGAR" ──────────────
function renderReadyModalList() {
    const el = document.getElementById("readyModalList");
    el.innerHTML = pedidosListos.map(p => `
        <div class="m-ready-modal-item">
            <div class="m-ready-modal-item-info">
                Mesa ${p.mesa||"—"}
                <small>${resumenItems(p)}</small>
            </div>
            <button class="m-btn-entregado" onclick="marcarEntregado('${p.id}')">✅ Entregado</button>
        </div>
    `).join("");
}

function abrirReadyModal() {
    if (pedidosListos.length === 0) return;
    renderReadyModalList();
    document.getElementById("readyModal").classList.add("active");
}

document.getElementById("readyModalDismiss").addEventListener("click", () => {
    document.getElementById("readyModal").classList.remove("active");
    const now = Date.now();
    pedidosListos.forEach(p => { readyLastReminder[p.id] = now; });
});

// Revisa periódicamente si hay pedidos listos sin entregar hace rato y vuelve a avisar
function checkRecordatoriosEntrega() {
    if (pedidosListos.length === 0) return;
    const now = Date.now();
    const vencidos = pedidosListos.filter(p => now - (readyLastReminder[p.id]||readyFirstSeen[p.id]||now) >= REMINDER_INTERVAL_MS);
    if (vencidos.length > 0) {
        vencidos.forEach(p => { readyLastReminder[p.id] = now; });
        mostrarToast(`⏰ Recordatorio: aún tienes ${vencidos.length===1?"1 pedido":vencidos.length+" pedidos"} sin entregar`);
        beepListo();
        vibrar();
        abrirReadyModal();
        renderEntregar();
    }
}
setInterval(checkRecordatoriosEntrega, 30000);

// ── RENDER MIS ÓRDENES ────────────────────────────────────
function renderMisOrdenes() {
    const el = document.getElementById("misOrdenesList");
    const dismissed = getDismissedSet();
    const lista = misOrdenes.filter(p => !dismissed.has(p.id));
    if (lista.length === 0) {
        el.innerHTML = `<div class="m-empty"><div class="m-empty-icon">📋</div><p>Aún no has tomado órdenes hoy</p></div>`;
        return;
    }
    const chips  = {pendiente:"chip-pendiente",preparando:"chip-preparando",listo:"chip-listo",entregado:"chip-entregado",pagado:"chip-entregado"};
    const labels = {pendiente:"Pendiente",preparando:"Preparando",listo:"¡Listo!",entregado:"Entregado",pagado:"Pagado"};
    el.innerHTML = lista.map(p => `
        <div class="m-order-card">
            <div class="m-order-card-header">
                <div class="m-order-mesa">Mesa ${p.mesa||"—"}</div>
                <span class="estado-chip ${chips[p.estado]||"chip-pendiente"}">${labels[p.estado]||p.estado}</span>
            </div>
            <div class="m-order-items">
                ${(p.items||[]).map(i=>`<span>• ${i.name}${i.qty>1?" x"+i.qty:""} — ${i.price}</span>`).join("")}
            </div>
            <div class="m-order-total">${p.total}</div>
            <div class="m-order-time">Tomado por: <strong>${p.tomadoPor||"—"}</strong> · ${timeAgo(p.created_at)}</div>
            ${p.estado==="entregado" ? `<div class="m-order-time">Entregado por: <strong>${p.entregadoPor||"—"}</strong></div>` : ""}
        </div>`).join("");
}

// ── SELECTOR DE MESAS ─────────────────────────────────────
function renderMesaGrid() {
    document.getElementById("mesaGrid").innerHTML =
        Array.from({length:TOTAL_MESAS},(_,i)=>i+1).map(n =>
            `<button class="m-mesa-btn" data-mesa="${n}" onclick="seleccionarMesa(${n})">${n}</button>`
        ).join("");
}

window.seleccionarMesa = function(n) {
    mesaSeleccionada = n;
    document.querySelectorAll(".m-mesa-btn").forEach(b => b.classList.toggle("selected", parseInt(b.dataset.mesa)===n));
};

// ── MENÚ PARA TOMAR ORDEN ─────────────────────────────────
function renderMenuMesero() {
    document.getElementById("meseroMenuList").innerHTML = MENU_ITEMS.map(item => `
        <div class="m-menu-item" id="menuItem_${item.id}">
            <img class="m-menu-item-img" src="${item.poster}" alt="${item.name}" onerror="this.style.display='none'">
            <div class="m-menu-item-info">
                <div class="m-menu-item-name">${item.name}</div>
                <div class="m-menu-item-price">${item.price}</div>
            </div>
            <div class="m-qty-control">
                <button class="m-qty-btn" onclick="cambiarCantidad('${item.id}',-1)">−</button>
                <span class="m-qty-num" id="qty_${item.id}">0</span>
                <button class="m-qty-btn" onclick="cambiarCantidad('${item.id}',+1)">+</button>
            </div>
        </div>`).join("");
}

window.cambiarCantidad = function(id, delta) {
    carrito[id] = Math.max(0, (carrito[id]||0) + delta);
    document.getElementById("qty_"+id).textContent = carrito[id];
    document.getElementById("menuItem_"+id).classList.toggle("selected", carrito[id]>0);
    actualizarCarritoMesero();
};

function actualizarCarritoMesero() {
    const hayItems = Object.values(carrito).some(q=>q>0);
    document.getElementById("meseroCartSection").style.display = hayItems ? "block" : "none";
    if (!hayItems) return;
    let html="", total=0;
    MENU_ITEMS.forEach(item => {
        const qty = carrito[item.id]||0;
        if (qty>0) {
            const sub = item.priceNum * qty;
            total += sub;
            html += `<div class="m-cart-item">
                <span class="m-cart-item-name">${item.name}</span>
                <div class="m-cart-item-right">
                    <span class="m-cart-item-qty">x${qty}</span>
                    <span class="m-cart-item-price">$${sub.toLocaleString("es-CO")}</span>
                </div>
            </div>`;
        }
    });
    document.getElementById("meseroCartItems").innerHTML = html;
    document.getElementById("meseroCartTotal").textContent = "$"+total.toLocaleString("es-CO");
}

// ── CONFIRMAR ORDEN MESERO ───────────────────────────────
document.getElementById("meseroConfirmBtn").addEventListener("click", async () => {
    if (!mesaSeleccionada) { mostrarToast("⚠️ Selecciona una mesa primero"); return; }
    const items = MENU_ITEMS.filter(i=>(carrito[i.id]||0)>0).map(i=>({
        name:i.name, price:i.price, priceNum:i.priceNum, poster:i.poster, qty:carrito[i.id]
    }));
    if (items.length===0) { mostrarToast("⚠️ Agrega al menos un plato"); return; }

    const total = items.reduce((s,i)=>s+i.priceNum*i.qty,0);
    const pedido = {
        mesa:       mesaSeleccionada,
        items,
        total:      "$"+total.toLocaleString("es-CO"),
        estado:     "pendiente",
        origen:     "mesero",
        tomadoPor:  nombreMesero,           // nombre del mesero
        created_at: new Date().toISOString()
    };

    await guardarPedidoMesero(pedido);

    // Mostrar éxito
    document.getElementById("mSuccessDetail").innerHTML =
        `<strong>Mesa ${mesaSeleccionada} — tomado por ${nombreMesero}</strong>` +
        items.map(i=>`<span>• ${i.name} x${i.qty} — ${i.price}</span>`).join("") +
        `<strong>Total: ${pedido.total}</strong>`;
    document.getElementById("mSuccessModal").classList.add("active");

    // Limpiar
    carrito = {}; mesaSeleccionada = null;
    document.querySelectorAll(".m-mesa-btn").forEach(b=>b.classList.remove("selected"));
    document.querySelectorAll(".m-qty-num").forEach(el=>el.textContent="0");
    document.querySelectorAll(".m-menu-item").forEach(el=>el.classList.remove("selected"));
    document.getElementById("meseroCartSection").style.display="none";
});

document.getElementById("meseroClearBtn").addEventListener("click", () => {
    carrito = {};
    document.querySelectorAll(".m-qty-num").forEach(el=>el.textContent="0");
    document.querySelectorAll(".m-menu-item").forEach(el=>el.classList.remove("selected"));
    document.getElementById("meseroCartSection").style.display="none";
});

document.getElementById("mSuccessClose").addEventListener("click", () => {
    document.getElementById("mSuccessModal").classList.remove("active");
    switchTab("tab-pedidos");
});

async function guardarPedidoMesero(pedido) {
    if (USE_FIREBASE) {
        try {
            await initFirebase();
            const { collection: col, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
            await addDoc(col(db,"pedidos"), pedido);
            console.log("Orden del mesero guardada en Firebase ✓");
            return;
        } catch(e) { console.warn("Firebase falló:", e); }
    }
    const existentes = JSON.parse(localStorage.getItem("menuAR_pedidos")||"[]");
    existentes.push({ id:"mesero_"+Date.now(), ...pedido });
    localStorage.setItem("menuAR_pedidos", JSON.stringify(existentes));
}

// ── TABS ─────────────────────────────────────────────────
function switchTab(tabId) {
    document.querySelectorAll(".m-tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===tabId));
    document.querySelectorAll(".m-tab-content").forEach(c=>c.classList.toggle("active",c.id===tabId));
}
document.querySelectorAll(".m-tab").forEach(tab => tab.addEventListener("click",()=>switchTab(tab.dataset.tab)));

// ── SONIDOS ───────────────────────────────────────────────
// Sonido para llamada de mesa (tono simple)
function beepLlamada() {
    if (!soundEnabled) return;
    try {
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = 880;
        g.gain.setValueAtTime(0.3,ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
        osc.start(); osc.stop(ctx.currentTime+0.4);
    } catch(e) {}
}

// Sonido para "pedido listo" — diferente: doble tono ascendente
function beepListo() {
    if (!soundEnabled) return;
    try {
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        [[523,0],[659,0.2],[784,0.4]].forEach(([freq,t]) => {
            const osc = ctx.createOscillator();
            const g   = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.type = "sine"; osc.frequency.value = freq;
            g.gain.setValueAtTime(0.35, ctx.currentTime+t);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+t+0.18);
            osc.start(ctx.currentTime+t);
            osc.stop(ctx.currentTime+t+0.2);
        });
    } catch(e) {}
}

// Vibración en móvil al recibir "listo"
function vibrar() {
    try {
        if (navigator.vibrate) navigator.vibrate([200,100,200,100,400]);
    } catch(e) {}
}

// ── HELPERS ───────────────────────────────────────────────
function setLiveStatus(txt, isDemo) {
    const dot = document.getElementById("liveStatus");
    dot.textContent = txt;
    dot.className = "live-dot" + (isDemo ? " connecting" : "");
}

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now()-new Date(dateStr))/1000);
    if (diff<60)   return diff+"s";
    if (diff<3600) return Math.floor(diff/60)+"min";
    return Math.floor(diff/3600)+"h";
}

// Toast sin rebote — entra y se queda quieto
function mostrarToast(msg) {
    const toast = document.getElementById("mToast");
    document.getElementById("mToastMsg").textContent = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toast.classList.add("show");
    toastTimer = setTimeout(()=>toast.classList.remove("show"), 5000);
}

function updateTime() {
    document.getElementById("mTime").textContent =
        new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});
}
setInterval(updateTime,10000);
setInterval(()=>{renderLlamadas();renderMisOrdenes();},30000);

document.getElementById("soundBtn").addEventListener("click",()=>{
    soundEnabled = !soundEnabled;
    const btn = document.getElementById("soundBtn");
    btn.textContent = soundEnabled ? "🔔" : "🔕";
    btn.classList.toggle("muted",!soundEnabled);
});

// ── INIT ──────────────────────────────────────────────────
function iniciarApp() {
    renderMesaGrid();
    renderMenuMesero();
    updateTime();
    startListeners();
}

mostrarPantallaDeNombre();