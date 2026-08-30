// ========================================================
//  caja.js — Panel de Caja / Facturación — MenuAR
//  • Recibe pedidos de clientes Y meseros
//  • Toast estático (sin rebote)
//  • Muestra quién tomó el pedido
//  • Sin botón imprimir ni exportar
// ========================================================

    const FIREBASE_CONFIG = {
        apiKey:            "AIzaSyD3bFl4uHz78sz6_Z2gZgur5l_rJdmqJh4",   // ej: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX"
        authDomain:        "menuardemo.firebaseapp.com",   // ej: "menuAR-demo.firebaseapp.com"
        projectId:         "menuardemo",   // ej: "menuAR-demo"
        storageBucket:     "menuardemo.firebasestorage.app",   // ej: "menuAR-demo.appspot.com"
        messagingSenderId: "1024512044720",   // ej: "123456789012"
        appId:             "1:1024512044720:web:c148b3c34938e2221c1575"    // ej: "1:123456789012:web:abcdefabcdef"
    };

const IVA_RATE     = 0.19;
const USE_FIREBASE = FIREBASE_CONFIG.apiKey !== "";

// ── ESTADO ────────────────────────────────────────────────
let db                 = null;
let pedidos            = [];
let pedidoActivo       = null;
let metodoSeleccionado = "Efectivo";
let soundEnabled       = true;
let toastTimer         = null;
let conocidos          = new Set();

// ── FIREBASE ──────────────────────────────────────────────
async function initFirebase() {
    if (!USE_FIREBASE || db) return;
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore  } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    db = getFirestore(initializeApp(FIREBASE_CONFIG));
    console.log("Firebase Caja conectado ✓");
}

async function startListeners() {
    if (USE_FIREBASE) {
        try {
            await initFirebase();
            const { collection, query, orderBy, onSnapshot } =
                await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

            // Escuchar TODOS los pedidos — de clientes y de meseros
            const q = query(collection(db,"pedidos"), orderBy("created_at","desc"));
            onSnapshot(q, snap => {
                const prevActivos = pedidos.filter(p=>!["pagado","cancelado"].includes(p.estado)).length;
                pedidos = snap.docs.map(d=>({id:d.id,...d.data()}));

                const activos = pedidos.filter(p=>!["pagado","cancelado"].includes(p.estado));
                if (activos.length > prevActivos && prevActivos >= 0) {
                    const nuevo = activos.find(p=>!conocidos.has(p.id));
                    if (nuevo) {
                        const origen = nuevo.origen==="mesero"
                            ? `Tomado por ${nuevo.tomadoPor||"mesero"}`
                            : "App del cliente";
                        mostrarToast(`💳 Nuevo pedido — Mesa ${nuevo.mesa} · ${origen}`);
                        beep();
                    }
                }
                pedidos.forEach(p=>conocidos.add(p.id));
                render();
            });

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
    // Lee tanto pedidos de clientes como de meseros
    const raw = JSON.parse(localStorage.getItem("menuAR_pedidos")||"[]").reverse();
    const prevActivos = pedidos.filter(p=>!["pagado","cancelado"].includes(p.estado)).length;
    pedidos = raw;
    const activos = pedidos.filter(p=>!["pagado","cancelado"].includes(p.estado));
    if (activos.length > prevActivos && prevActivos >= 0) {
        const nuevo = activos.find(p=>!conocidos.has(p.id));
        if (nuevo) { mostrarToast(`💳 Nuevo pedido — Mesa ${nuevo.mesa}`); beep(); }
    }
    pedidos.forEach(p=>conocidos.add(p.id));
    render();
}

// ── ACTUALIZAR PEDIDO ─────────────────────────────────────
async function actualizarPedido(id, datos) {
    if (USE_FIREBASE && db) {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        await updateDoc(doc(db,"pedidos",id), datos);
    } else {
        const todos = JSON.parse(localStorage.getItem("menuAR_pedidos")||"[]");
        const idx = todos.findIndex(p=>p.id===id);
        if (idx!==-1) { Object.assign(todos[idx],datos); localStorage.setItem("menuAR_pedidos",JSON.stringify(todos)); }
        cargarLocal();
    }
}

// ── RENDER ────────────────────────────────────────────────
// "Por facturar" NO incluye pedidos en estado "listo": esos siguen en cocina/
// camino a la mesa y el mesero aún no los ha entregado. Vuelven a aparecer
// aquí automáticamente en cuanto el mesero los marca como "entregado".
function render() {
    const activos    = pedidos.filter(p=>!["pagado","cancelado","listo"].includes(p.estado));
    const facturados = pedidos.filter(p=>p.estado==="pagado");
    renderActivos(activos);
    renderFacturados(facturados);
    renderResumen(pedidos);
    updateQuickStats(activos, pedidos);
    updateBadgeActivos(activos.length);
}

function origenLabel(p) {
    if (p.origen==="mesero") return `📋 ${p.tomadoPor || "Mesero"}`;
    return "📱 Cliente";
}

function renderActivos(lista) {
    const grid = document.getElementById("activosGrid");
    if (lista.length===0) {
        grid.innerHTML=`<div class="c-empty"><div class="c-empty-icon">💳</div><p>Sin pedidos por facturar</p></div>`;
        return;
    }
    const badgeCls = {pendiente:"badge-pendiente",preparando:"badge-preparando",listo:"badge-listo",entregado:"badge-entregado"};
    const badgeTxt = {pendiente:"En espera",preparando:"Preparando",listo:"¡Listo!",entregado:"Entregado"};
    grid.innerHTML = lista.map(p => {
        const esListo = ["listo","entregado"].includes(p.estado);
        return `<div class="c-order-card ${esListo?"listo-card":""}">
            <div class="c-card-header">
                <div class="c-card-mesa">Mesa ${p.mesa||"—"}</div>
                <div class="c-card-meta">
                    <span class="c-estado-badge ${badgeCls[p.estado]||"badge-pendiente"}">${badgeTxt[p.estado]||p.estado}</span>
                    <span class="c-card-time">${timeAgo(p.created_at)}</span>
                    <span class="c-card-origen">${origenLabel(p)}</span>
                </div>
            </div>
            <div class="c-card-items">
                ${(p.items||[]).map(i=>`
                    <div class="c-card-item">
                        <span class="c-card-item-name">${i.name}${i.qty>1?" x"+i.qty:""}</span>
                        <span class="c-card-item-price">${i.price}</span>
                    </div>`).join("")}
            </div>
            <div class="c-card-total-row">
                <span class="c-card-total-label">Total pedido</span>
                <span class="c-card-total-value">${p.total}</span>
            </div>
            <div class="c-card-footer">
                <button class="c-btn-facturar" onclick="abrirFactura('${p.id}')">💳 Facturar / Cobrar</button>
            </div>
        </div>`;
    }).join("");
}

function renderFacturados(lista) {
    const grid = document.getElementById("facturadosGrid");
    if (lista.length===0) {
        grid.innerHTML=`<div class="c-empty"><div class="c-empty-icon">✅</div><p>Aún no hay pedidos facturados</p></div>`;
        return;
    }
    grid.innerHTML = lista.map(p=>`
        <div class="c-order-card facturado-card">
            <div class="c-card-header">
                <div class="c-card-mesa">Mesa ${p.mesa||"—"}</div>
                <div class="c-card-meta">
                    <span class="c-card-time">${timeAgo(p.created_at)}</span>
                    <span class="c-card-origen">${origenLabel(p)}</span>
                </div>
            </div>
            <div class="c-card-items">
                ${(p.items||[]).map(i=>`<div class="c-card-item"><span class="c-card-item-name">${i.name}</span><span class="c-card-item-price">${i.price}</span></div>`).join("")}
            </div>
            <div class="c-card-total-row">
                <span class="c-card-total-label">Total</span>
                <span class="c-card-total-value">${p.total}</span>
            </div>
            <div class="c-card-footer">
                <div class="c-facturado-badge">✅ Pagado — ${p.metodoPago||"—"}
                    <div class="c-facturado-meta">Facturado: ${p.fechaPago?new Date(p.fechaPago).toLocaleTimeString("es-CO"):"—"}</div>
                </div>
            </div>
        </div>`).join("");
}

function renderResumen(todos) {
    const pagados  = todos.filter(p=>p.estado==="pagado");
    const totalNum = pagados.reduce((s,p)=>s+parseRaw(p.total),0);
    const promedio = pagados.length>0 ? Math.round(totalNum/pagados.length) : 0;
    const mesaCounts = {};
    todos.forEach(p=>{ if(p.mesa) mesaCounts[p.mesa]=(mesaCounts[p.mesa]||0)+1; });
    const mesaTop = Object.entries(mesaCounts).sort((a,b)=>b[1]-a[1])[0];

    document.getElementById("sumTotal").textContent    = fmt(totalNum);
    document.getElementById("sumPedidos").textContent  = todos.length;
    document.getElementById("sumPromedio").textContent = fmt(promedio);
    document.getElementById("sumMesaTop").textContent  = mesaTop ? `Mesa ${mesaTop[0]}` : "—";

    const platoCount = {};
    todos.forEach(p=>(p.items||[]).forEach(i=>{
        platoCount[i.name]=(platoCount[i.name]||0)+(i.qty||1);
    }));
    const ranked = Object.entries(platoCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxCount = ranked[0]?.[1]||1;
    document.getElementById("rankingPlatos").innerHTML = ranked.length===0
        ? `<div class="c-empty"><p>Aún sin datos</p></div>`
        : ranked.map(([name,count],i)=>`
            <div class="c-ranking-item">
                <div class="c-rank-pos">${i+1}</div>
                <div class="c-rank-name">${name}</div>
                <div class="c-rank-bar-wrap"><div class="c-rank-bar" style="width:${Math.round(count/maxCount*100)}%"></div></div>
                <div class="c-rank-count">${count} veces</div>
            </div>`).join("");

    const mesaVentas = {};
    pagados.forEach(p=>{ if(p.mesa) mesaVentas[p.mesa]=(mesaVentas[p.mesa]||0)+parseRaw(p.total); });
    document.getElementById("mesaTable").innerHTML = Object.entries(mesaVentas).sort((a,b)=>b[1]-a[1]).length===0
        ? `<div class="c-empty"><p>Aún sin datos</p></div>`
        : Object.entries(mesaVentas).sort((a,b)=>b[1]-a[1]).map(([mesa,total])=>`
            <div class="c-mesa-row">
                <span class="c-mesa-row-label">Mesa ${mesa}</span>
                <span class="c-mesa-row-value">${fmt(total)}</span>
            </div>`).join("");
}

function updateQuickStats(activos, todos) {
    const pagados  = todos.filter(p=>p.estado==="pagado");
    const totalHoy = pagados.reduce((s,p)=>s+parseRaw(p.total),0);
    document.getElementById("qsPendientes").textContent = activos.length;
    document.getElementById("qsTotal").textContent = fmt(totalHoy);
}

function updateBadgeActivos(n) {
    const b = document.getElementById("badgeActivos");
    b.textContent=n; b.style.display=n>0?"flex":"none";
}

// ── MODAL FACTURA ─────────────────────────────────────────
window.abrirFactura = function(id) {
    pedidoActivo = pedidos.find(p=>p.id===id);
    if (!pedidoActivo) return;

    const subtotal = parseRaw(pedidoActivo.total);
    const iva      = Math.round(subtotal * IVA_RATE);
    const total    = subtotal + iva;

    document.getElementById("facturaTitle").textContent = `Factura — Mesa ${pedidoActivo.mesa||"—"}`;
    document.getElementById("facturaOrigen").textContent = origenLabel(pedidoActivo);

    document.getElementById("facturaItems").innerHTML = (pedidoActivo.items||[]).map(i=>`
        <div class="c-factura-item">
            <div>
                <div class="c-factura-item-info">${i.name}</div>
                ${i.qty>1?`<div class="c-factura-item-qty">x${i.qty}</div>`:""}
            </div>
            <div class="c-factura-item-price">${i.price}</div>
        </div>`).join("");

    document.getElementById("fSubtotal").textContent = fmt(subtotal);
    document.getElementById("fIva").textContent      = fmt(iva);
    document.getElementById("fTotal").textContent    = fmt(total);

    metodoSeleccionado = "Efectivo";
    document.querySelectorAll(".c-pago-btn").forEach(b=>b.classList.toggle("active",b.dataset.metodo==="Efectivo"));
    document.getElementById("vueltaSection").style.display = "flex";
    document.getElementById("pagoInput").value = "";
    document.getElementById("vueltaResult").style.display = "none";

    document.getElementById("facturaModal").classList.add("active");
};

document.getElementById("closeFacturaBtn").addEventListener("click",()=>{
    document.getElementById("facturaModal").classList.remove("active");
    pedidoActivo = null;
});

document.querySelectorAll(".c-pago-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
        metodoSeleccionado = btn.dataset.metodo;
        document.querySelectorAll(".c-pago-btn").forEach(b=>b.classList.toggle("active",b===btn));
        document.getElementById("vueltaSection").style.display = metodoSeleccionado==="Efectivo"?"flex":"none";
    });
});

document.getElementById("pagoInput").addEventListener("input",()=>{
    if (!pedidoActivo) return;
    const subtotal = parseRaw(pedidoActivo.total);
    const total    = subtotal + Math.round(subtotal*IVA_RATE);
    const pago     = parseInt(document.getElementById("pagoInput").value)||0;
    const section  = document.getElementById("vueltaResult");
    if (pago>=total) {
        document.getElementById("vueltaNum").textContent = fmt(pago-total);
        section.style.display="block";
    } else {
        section.style.display="none";
    }
});

document.getElementById("confirmarPagoBtn").addEventListener("click", async ()=>{
    if (!pedidoActivo) return;
    const subtotal = parseRaw(pedidoActivo.total);
    const iva      = Math.round(subtotal*IVA_RATE);
    const total    = subtotal+iva;
    const ahora    = new Date().toISOString();

    await actualizarPedido(pedidoActivo.id,{
        estado:      "pagado",
        metodoPago:  metodoSeleccionado,
        fechaPago:   ahora,
        totalConIva: fmt(total)
    });

    document.getElementById("facturaModal").classList.remove("active");
    mostrarToast(`✅ Pago confirmado — Mesa ${pedidoActivo.mesa} · ${fmt(total)} · ${metodoSeleccionado}`);
    pedidoActivo = null;
});

// ── TABS ──────────────────────────────────────────────────
document.querySelectorAll(".c-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
        document.querySelectorAll(".c-tab").forEach(t=>t.classList.toggle("active",t===tab));
        document.querySelectorAll(".c-tab-content").forEach(c=>c.classList.toggle("active",c.id===tab.dataset.tab));
    });
});

// ── HELPERS ───────────────────────────────────────────────
function setLiveStatus(txt,isDemo) {
    const dot=document.getElementById("liveStatus");
    dot.textContent=txt;
    dot.className="live-dot"+(isDemo?" connecting":"");
}

function parseRaw(str) { return parseInt((str||"0").replace(/\D/g,""))||0; }
function fmt(num) { return "$"+num.toLocaleString("es-CO"); }

function timeAgo(dateStr) {
    const diff=Math.floor((Date.now()-new Date(dateStr))/1000);
    if(diff<60)   return diff+"s";
    if(diff<3600) return Math.floor(diff/60)+"min";
    return Math.floor(diff/3600)+"h";
}

// Toast estático (sin rebote)
function mostrarToast(msg) {
    const toast=document.getElementById("cToast");
    document.getElementById("cToastMsg").textContent=msg;
    if(toastTimer) clearTimeout(toastTimer);
    toast.classList.add("show");
    toastTimer=setTimeout(()=>toast.classList.remove("show"),5000);
}

function beep() {
    if(!soundEnabled) return;
    try {
        const ctx=new(window.AudioContext||window.webkitAudioContext)();
        const osc=ctx.createOscillator();
        const g=ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type="sine";
        osc.frequency.setValueAtTime(660,ctx.currentTime);
        osc.frequency.setValueAtTime(880,ctx.currentTime+0.15);
        g.gain.setValueAtTime(0.25,ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.5);
        osc.start(); osc.stop(ctx.currentTime+0.5);
    } catch(e) {}
}

document.getElementById("soundBtn").addEventListener("click",()=>{
    soundEnabled=!soundEnabled;
    const btn=document.getElementById("soundBtn");
    btn.textContent=soundEnabled?"🔔":"🔕";
    btn.classList.toggle("muted",!soundEnabled);
});

// ── LIMPIAR TODOS LOS DATOS DEL DÍA ───────────────────────
document.getElementById("limpiarDiaBtn").addEventListener("click", () => {
    document.getElementById("limpiarDiaModal").classList.add("active");
});
document.getElementById("closeLimpiarDiaBtn").addEventListener("click", () => {
    document.getElementById("limpiarDiaModal").classList.remove("active");
});
document.getElementById("cancelarLimpiarDiaBtn").addEventListener("click", () => {
    document.getElementById("limpiarDiaModal").classList.remove("active");
});

document.getElementById("confirmarLimpiarDiaBtn").addEventListener("click", async () => {
    document.getElementById("limpiarDiaModal").classList.remove("active");
    await limpiarDatosDelDia();
    mostrarToast("🗑️ Datos del día borrados");
});

async function limpiarDatosDelDia() {
    if (USE_FIREBASE && db) {
        try {
            const { collection, getDocs, deleteDoc, doc } =
                await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
            const [snapPedidos, snapLlamadas] = await Promise.all([
                getDocs(collection(db,"pedidos")),
                getDocs(collection(db,"llamadas"))
            ]);
            await Promise.all([
                ...snapPedidos.docs.map(d => deleteDoc(doc(db,"pedidos",d.id))),
                ...snapLlamadas.docs.map(d => deleteDoc(doc(db,"llamadas",d.id)))
            ]);
            return;
        } catch(e) { console.warn("Firebase falló al limpiar:", e); }
    }
    localStorage.removeItem("menuAR_pedidos");
    localStorage.removeItem("menuAR_llamadas");
    conocidos = new Set();
    cargarLocal();
}

// ── INIT ──────────────────────────────────────────────────
startListeners();
