// ========================================================
//  MENUÁR — script.js  (Firebase Firestore)
// ========================================================
//
//  CONFIGURACIÓN: pega aquí los valores de tu proyecto Firebase.
//  Si los dejas vacíos la app corre en modo demo con localStorage.
//
//  Dónde encontrarlos:
//  Firebase Console → tu proyecto → ⚙️ Configuración → General
//  → "Tu aplicación" → SDK de configuración (versión CDN)
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

// ============ FIREBASE INIT (lazy — solo si hay config) ============
let db = null;
let fbCollection = null;

async function initFirebase() {
    if (!USE_FIREBASE || db) return;
    const { initializeApp }    = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, collection } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    fbCollection = collection(db, "pedidos");
    console.log("Firebase conectado ✓");
}

// ============ OCASIÓN ESPECIAL ============
let ocasionEspecial = null;   // null = sin ocasión; string = tipo de celebración

// ── Bienvenida: selección de ocasión ─────────────────────
function initBienvenida() {
    // Si ya se vio esta sesión, no mostrar de nuevo
    if (sessionStorage.getItem("menuAR_bienvenida_vista")) return;

    const modal = document.getElementById("bienvenidaModal");
    modal.classList.add("active");

    // Botones de ocasión
    document.querySelectorAll(".bv-ocasion-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".bv-ocasion-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            ocasionEspecial = btn.dataset.ocasion;
            // Ir al paso 2 después de un pequeño delay para ver la selección
            setTimeout(() => mostrarObsequio(ocasionEspecial), 280);
        });
    });

    // Saltar (visita normal)
    document.getElementById("bvSkipBtn").addEventListener("click", () => {
        ocasionEspecial = null;
        cerrarBienvenida();
    });

    // Continuar desde paso 2
    document.getElementById("bvContinuarBtn").addEventListener("click", () => {
        cerrarBienvenida();
    });
}

function mostrarObsequio(ocasion) {
    document.getElementById("bvStep1").style.display = "none";
    document.getElementById("bvStep2").style.display = "flex";
    document.getElementById("bvOcasionElegida").textContent =
        `Celebramos contigo: ${ocasion}`;
}

function cerrarBienvenida() {
    sessionStorage.setItem("menuAR_bienvenida_vista", "1");
    const modal = document.getElementById("bienvenidaModal");
    modal.classList.add("closing");
    setTimeout(() => { modal.classList.remove("active","closing"); }, 400);
}

// ============ MESA (desde URL o selector demo) ============
let mesaActual = null;

function detectarMesa() {
    const params = new URLSearchParams(window.location.search);
    const mesaParam = params.get("mesa");
    if (mesaParam && !isNaN(parseInt(mesaParam))) {
        mesaActual = parseInt(mesaParam);
        mostrarBannerMesa(mesaActual);
        ocultarSelectorDemo();
    } else {
        mostrarSelectorDemo();
    }
}

function mostrarBannerMesa(num) {
    const banner = document.getElementById("mesaBanner");
    const label  = document.getElementById("mesaLabel");
    banner.style.display = "flex";
    label.textContent = `Mesa ${num}`;
}

function ocultarSelectorDemo() {
    const sel = document.getElementById("demoSelector");
    if (sel) sel.style.display = "none";
}

function mostrarSelectorDemo() {
    const menuContainer = document.querySelector(".menu-container");
    if (!menuContainer || document.getElementById("demoSelector")) return;

    const div = document.createElement("div");
    div.id = "demoSelector";
    div.className = "demo-selector";
    div.innerHTML = `
        <label>🧪 Modo prueba:</label>
        <select id="mesaSelect">
            <option value="">— Selecciona tu mesa —</option>
            <option value="1">Mesa 1</option>
            <option value="2">Mesa 2</option>
            <option value="3">Mesa 3</option>
            <option value="4">Mesa 4</option>
            <option value="5">Mesa 5</option>
            <option value="6">Mesa 6</option>
        </select>
        <span class="demo-badge">DEMO</span>
    `;
    menuContainer.insertBefore(div, menuContainer.querySelector(".menu-header").nextSibling);

    document.getElementById("mesaSelect").addEventListener("change", (e) => {
        if (e.target.value) {
            mesaActual = parseInt(e.target.value);
            mostrarBannerMesa(mesaActual);
        } else {
            mesaActual = null;
            document.getElementById("mesaBanner").style.display = "none";
        }
    });
}

// ============ CARRITO ============
let cart = []; // cada item: { name, price, priceNum, poster, qty }

function recalcTotal() {
    return cart.reduce((sum, item) => sum + item.priceNum * item.qty, 0);
}

function totalItemsCount() {
    return cart.reduce((sum, item) => sum + item.qty, 0);
}

function formatPrice(num) {
    return "$" + num.toLocaleString("es-CO");
}

function updateFab() {
    const badge = document.getElementById("cartFabBadge");
    const total = totalItemsCount();
    if (total > 0) {
        badge.textContent = total;
        badge.style.display = "flex";
    } else {
        badge.style.display = "none";
    }
}

// Agrega un item al carrito respetando la cantidad seleccionada.
// Si el plato ya está en el carrito, suma la cantidad en vez de duplicar la fila.
function addToCart(item, qty) {
    qty = Math.max(1, qty || 1);
    const existente = cart.find(i => i.name === item.name);
    if (existente) {
        existente.qty += qty;
    } else {
        cart.push({ ...item, qty });
    }
}

// Ajusta la cantidad de un item ya en el carrito (por índice). Si llega a 0, se elimina.
function cambiarCantidadCarrito(index, delta) {
    if (!cart[index]) return;
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }
    renderCart();
    updateFab();
}

document.getElementById("cartFab").addEventListener("click", () => {
    renderCart();
    document.getElementById("cartModal").classList.add("active");
});

// ============ TOAST ============
let toastTimer = null;

function showToast(item, qty) {
    const toast = document.getElementById("toast");
    document.getElementById("toastImg").src  = item.poster || "";
    document.getElementById("toastName").textContent = qty > 1 ? `${item.name} x${qty}` : item.name;
    if (toastTimer) clearTimeout(toastTimer);
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

// ============ CARRITO: render ============
function renderCart() {
    const cartList  = document.getElementById("cartList");
    const cartTotal = document.getElementById("cartTotal");

    if (cart.length === 0) {
        cartList.innerHTML = '<p class="cart-empty">Aún no has agregado platos.</p>';
    } else {
        cartList.innerHTML = cart.map((item, index) => `
            <div class="cart-item">
                <img src="${item.poster}" alt="${item.name}"
                     onerror="this.src='';this.style.background='#3a3a3a'">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <p>${item.price} c/u · ${formatPrice(item.priceNum * item.qty)}</p>
                    ${item.nota ? `<div class="cart-item-nota">✏️ ${item.nota}</div>` : ""}
                    <div class="cart-nota-edit">
                        <input type="text" class="cart-nota-input" data-index="${index}"
                            placeholder="Añadir nota para cocina…"
                            value="${item.nota || ""}" maxlength="120">
                    </div>
                </div>
                <div class="cart-item-qty-control">
                    <button class="qty-btn cart-qty-minus" data-index="${index}" type="button">−</button>
                    <span class="qty-num">${item.qty}</span>
                    <button class="qty-btn cart-qty-plus" data-index="${index}" type="button">+</button>
                </div>
            </div>
        `).join("");

        cartList.querySelectorAll(".cart-qty-minus").forEach(btn => {
            btn.addEventListener("click", (e) => cambiarCantidadCarrito(parseInt(e.currentTarget.dataset.index), -1));
        });
        cartList.querySelectorAll(".cart-qty-plus").forEach(btn => {
            btn.addEventListener("click", (e) => cambiarCantidadCarrito(parseInt(e.currentTarget.dataset.index), +1));
        });
        // Guardar nota en tiempo real mientras el usuario escribe
        cartList.querySelectorAll(".cart-nota-input").forEach(input => {
            input.addEventListener("input", (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                if (cart[idx]) cart[idx].nota = e.currentTarget.value.trim();
            });
        });
    }

    cartTotal.textContent = formatPrice(recalcTotal());
}

function openCartModal() {
    renderCart();
    document.getElementById("cartModal").classList.add("active");
}

// ============ GUARDAR PEDIDO ============
async function guardarPedido(items, total, mesa) {
    const pedido = {
        mesa:       mesa || 0,
        items:      items,
        total:      total,
        estado:     "pendiente",
        origen:     "cliente",
        ocasion:    ocasionEspecial || null,
        created_at: new Date().toISOString()
    };

    if (USE_FIREBASE) {
        try {
            await initFirebase();
            const { addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
            await addDoc(fbCollection, pedido);
            console.log("Pedido guardado en Firebase ✓");
            return;
        } catch (err) {
            console.warn("Firebase falló, guardando en localStorage:", err);
        }
    }

    // Fallback local
    const existentes = JSON.parse(localStorage.getItem("menuAR_pedidos") || "[]");
    existentes.push({ id: "local_" + Date.now(), ...pedido });
    localStorage.setItem("menuAR_pedidos", JSON.stringify(existentes));
    console.log("Pedido guardado en localStorage (modo demo)");
}

// ============ NAVEGACIÓN ============
const navButtons   = document.querySelectorAll(".nav-btn");
const views        = document.querySelectorAll(".view");
const hotspotModel = document.getElementById("hotspotImage");

function switchView(viewId) {
    navButtons.forEach(b => b.classList.remove("active"));
    views.forEach(v => v.classList.remove("active"));
    const btn  = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (btn) btn.classList.add("active");
    const view = document.getElementById(viewId);
    if (view) {
        view.classList.add("active");
        if (viewId === "view-menu") {
            view.querySelectorAll(".menu-card").forEach((card, i) => {
                card.classList.remove("animate__fadeInUp");
                void card.offsetWidth;
                card.style.animationDelay = (i * 0.05) + "s";
                card.classList.add("animate__fadeInUp");
            });
        }
    }
}

function playHotspotAnimation() {
    const play = () => { hotspotModel.currentTime = 0; hotspotModel.play({ repetitions: 1 }); };
    if (hotspotModel.loaded) play();
    else hotspotModel.addEventListener("load", play, { once: true });
}

navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        switchView(btn.dataset.view);
        if (btn.dataset.view === "view-hotspot") playHotspotAnimation();
    });
});

hotspotModel.addEventListener("finished", () => hotspotModel.pause());

// ============ MODAL 3D / AR ============
const modal3D          = document.getElementById("3dModal");
const closeModalBtn    = document.getElementById("closeModalBtn");
const modelViewerModal = document.getElementById("modelViewer");
const dishTitle        = document.querySelector(".dish-title");
const dishPrice        = document.querySelector(".dish-price");
const storyToggle      = document.getElementById("storyToggle");
const storyCard        = document.getElementById("storyCard");
const dishStory        = storyCard.querySelector(".dish-story");

let activeItem = null;
let modalQty   = 1;
let hotspotQty = 1;

function renderModalQty() {
    document.getElementById("modalQtyNum").textContent = modalQty;
}
document.getElementById("modalQtyMinus").addEventListener("click", () => {
    modalQty = Math.max(1, modalQty - 1);
    renderModalQty();
});
document.getElementById("modalQtyPlus").addEventListener("click", () => {
    modalQty = Math.min(20, modalQty + 1);
    renderModalQty();
});

function renderHotspotQty() {
    document.getElementById("hotspotQtyNum").textContent = hotspotQty;
}
document.getElementById("hotspotQtyMinus").addEventListener("click", () => {
    hotspotQty = Math.max(1, hotspotQty - 1);
    renderHotspotQty();
});
document.getElementById("hotspotQtyPlus").addEventListener("click", () => {
    hotspotQty = Math.min(20, hotspotQty + 1);
    renderHotspotQty();
});

document.querySelectorAll(".open-3d").forEach(card => {
    card.addEventListener("click", () => {
        activeItem = {
            name:     card.dataset.name,
            price:    card.dataset.price,
            poster:   card.dataset.poster,
            priceNum: parseInt(card.dataset.price.replace(/\D/g, "")),
            categoria: card.dataset.categoria || ""
        };

        modelViewerModal.setAttribute("src",    card.dataset.model);
        modelViewerModal.setAttribute("poster", card.dataset.poster);
        dishTitle.textContent  = card.dataset.name;
        dishPrice.textContent  = card.dataset.price;
        dishStory.textContent  = card.dataset.story;
        storyCard.classList.remove("active");

        modalQty = 1;
        renderModalQty();

        const content = modal3D.querySelector(".modal-content");
        content.classList.remove("animate__slideInUp");
        void content.offsetWidth;
        content.classList.add("animate__animated", "animate__slideInUp", "animate__faster");
        modal3D.classList.add("active");
    });
});

closeModalBtn.addEventListener("click", () => modal3D.classList.remove("active"));
modal3D.addEventListener("click", e => { if (e.target === modal3D) modal3D.classList.remove("active"); });
storyToggle.addEventListener("click", () => storyCard.classList.toggle("active"));

document.getElementById("arLaunchBtn").addEventListener("click", () => {
    document.getElementById("nativeArBtn")?.click();
});

// ============ ¡LO QUIERO! — modal 3D ============
document.getElementById("orderFromModal").addEventListener("click", () => {
    if (!activeItem) return;
    const nota = document.getElementById("modalNoteInput").value.trim();
    addToCart({ ...activeItem, nota }, modalQty);
    modal3D.classList.remove("active");
    updateFab();
    showToast(activeItem, modalQty);
    openCartModal();
    modalQty = 1;
    renderModalQty();
    document.getElementById("modalNoteInput").value = "";
});

// ============ ¡LO QUIERO! — hotspot ============
document.getElementById("orderFromHotspot").addEventListener("click", () => {
    const nota = document.getElementById("hotspotNoteInput").value.trim();
    const item = { name: "Hamburguesa Insignia", price: "$38.000", poster: "Images/burguer.png", priceNum: 38000, categoria: "hamburguesas", nota };
    addToCart(item, hotspotQty);
    updateFab();
    showToast(item, hotspotQty);
    openCartModal();
    hotspotQty = 1;
    renderHotspotQty();
    document.getElementById("hotspotNoteInput").value = "";
});

// ============ MODAL CARRITO ============
const cartModal = document.getElementById("cartModal");

document.getElementById("closeCartBtn").addEventListener("click", () => {
    cartModal.classList.remove("active");
    switchView("view-menu");
});

document.getElementById("keepBrowsingBtn").addEventListener("click", () => {
    cartModal.classList.remove("active");
    switchView("view-menu");
});

document.getElementById("confirmCartBtn").addEventListener("click", () => {
    if (cart.length === 0) return;
    // Antes de confirmar, preguntar por postre
    cartModal.classList.remove("active");
    mostrarModalPostre();
});

// ── Modal postre ─────────────────────────────────────────
function mostrarModalPostre() {
    document.getElementById("postreModal").classList.add("active");
}

document.querySelectorAll(".postre-elegir-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const card = btn.closest(".postre-card");
        const item = {
            name:     card.dataset.name,
            price:    card.dataset.price,
            priceNum: parseInt(card.dataset.pricenum),
            poster:   card.dataset.poster,
            categoria:"postres",
            nota:     ""
        };
        addToCart(item, 1);
        updateFab();
        document.getElementById("postreModal").classList.remove("active");
        confirmarPedidoFinal();
    });
});

document.getElementById("postreSaltarBtn").addEventListener("click", () => {
    document.getElementById("postreModal").classList.remove("active");
    confirmarPedidoFinal();
});

async function confirmarPedidoFinal() {
    if (cart.length === 0) return;
    const itemsParaGuardar = cart.map(i => ({
        name:      i.name,
        price:     i.price,
        priceNum:  i.priceNum,
        poster:    i.poster,
        qty:       i.qty,
        nota:      i.nota || "",
        categoria: i.categoria || ""
    }));
    await guardarPedido(itemsParaGuardar, formatPrice(recalcTotal()), mesaActual);

    document.getElementById("successItems").innerHTML = cart.map(item => `
        <div class="success-item animate__animated animate__fadeInUp">
            <span>${item.name}${item.qty > 1 ? " x" + item.qty : ""}</span>
            <span>${formatPrice(item.priceNum * item.qty)}</span>
        </div>
    `).join("");

    document.getElementById("successModal").classList.add("active");
    cart = [];
    updateFab();
}

// ============ MODAL ÉXITO ============
const successModal = document.getElementById("successModal");
document.getElementById("successCloseBtn").addEventListener("click", () => {
    successModal.classList.remove("active");
    switchView("view-menu");
});
successModal.addEventListener("click", e => { if (e.target === successModal) successModal.classList.remove("active"); });

// ============ HOTSPOTS ============
document.querySelectorAll(".hotspot-point").forEach(point => {
    point.addEventListener("click", () => {
        const target   = document.getElementById(point.dataset.info);
        const isActive = target.classList.contains("active");
        document.querySelectorAll(".hotspot-card").forEach(c => c.classList.remove("active"));
        if (!isActive) target.classList.add("active");
    });
});

document.getElementById("openHotspotBtn").addEventListener("click", () => {
    switchView("view-hotspot");
    playHotspotAnimation();
});

// ============ LLAMAR AL MESERO ============
const waiterFab           = document.getElementById("waiterFab");
const waiterModal         = document.getElementById("waiterModal");
const waiterConfirmModal  = document.getElementById("waiterConfirmModal");

waiterFab.addEventListener("click", () => {
    // Solo si hay mesa seleccionada
    if (!mesaActual) {
        alert("Por favor selecciona tu mesa primero para llamar al mesero.");
        return;
    }
    waiterModal.classList.add("active");
});

document.getElementById("closeWaiterBtn").addEventListener("click", () => {
    waiterModal.classList.remove("active");
});
waiterModal.addEventListener("click", e => {
    if (e.target === waiterModal) waiterModal.classList.remove("active");
});

document.querySelectorAll(".waiter-reason-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        const reason = btn.dataset.reason;
        await enviarLlamadaMesero(reason);
        waiterModal.classList.remove("active");

        document.getElementById("waiterConfirmMesa").textContent = `Mesa ${mesaActual}`;
        document.getElementById("waiterConfirmReason").textContent = `Motivo: "${reason}"`;
        waiterConfirmModal.classList.add("active");
    });
});

document.getElementById("waiterConfirmClose").addEventListener("click", () => {
    waiterConfirmModal.classList.remove("active");
});

async function enviarLlamadaMesero(reason) {
    const llamada = {
        mesa:       mesaActual,
        motivo:     reason,
        estado:     "pendiente",   // pendiente → atendido
        created_at: new Date().toISOString()
    };

    if (USE_FIREBASE) {
        try {
            await initFirebase();
            const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
            await addDoc(collection(db, "llamadas"), llamada);
            console.log("Llamada al mesero enviada a Firebase ✓");
            return;
        } catch (err) {
            console.warn("Firebase falló:", err);
        }
    }
    // Fallback local
    const existentes = JSON.parse(localStorage.getItem("menuAR_llamadas") || "[]");
    existentes.push({ id: "llamada_" + Date.now(), ...llamada });
    localStorage.setItem("menuAR_llamadas", JSON.stringify(existentes));
}

// ============ PLATO MÁS PEDIDO DEL DÍA ============
async function cargarPlatoDelDia() {
    let todosPedidos = [];
    if (USE_FIREBASE) {
        try {
            await initFirebase();
            const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
            const snap = await getDocs(collection(db, "pedidos"));
            todosPedidos = snap.docs.map(d => d.data());
        } catch(e) {
            todosPedidos = JSON.parse(localStorage.getItem("menuAR_pedidos") || "[]");
        }
    } else {
        todosPedidos = JSON.parse(localStorage.getItem("menuAR_pedidos") || "[]");
    }

    if (todosPedidos.length === 0) return;

    // Contar cuántas veces aparece cada plato
    const conteo = {};
    todosPedidos.forEach(p => {
        (p.items || []).forEach(i => {
            conteo[i.name] = (conteo[i.name] || { count: 0, poster: i.poster, price: i.price, priceNum: i.priceNum, categoria: i.categoria });
            conteo[i.name].count += (i.qty || 1);
            conteo[i.name].poster    = i.poster    || conteo[i.name].poster;
            conteo[i.name].price     = i.price     || conteo[i.name].price;
            conteo[i.name].priceNum  = i.priceNum  || conteo[i.name].priceNum;
            conteo[i.name].categoria = i.categoria || conteo[i.name].categoria;
        });
    });

    const entries = Object.entries(conteo).sort((a, b) => b[1].count - a[1].count);
    if (entries.length === 0) return;

    const [nombre, { count, poster, price, priceNum, categoria }] = entries[0];
    const banner = document.getElementById("platoDiaBanner");
    document.getElementById("platoDiaNombre").textContent = nombre;
    document.getElementById("platoDiaVeces").textContent = count === 1 ? "1 pedido hoy" : `${count} pedidos hoy`;
    document.getElementById("platoDiaImg").src = poster || "";
    banner.style.display = "flex";

    const btn = document.getElementById("platoDiaLoQuieroBtn");
    btn.onclick = () => {
        addToCart({ name: nombre, price: price || "", priceNum: priceNum || 0, poster: poster || "", categoria: categoria || "" }, 1);
        updateFab();
        showToast({ name: nombre, poster: poster || "" }, 1);
        openCartModal();
    };
}

// ============ INIT ============
detectarMesa();
initBienvenida();

// ============ FILTRO DE CATEGORÍAS DEL MENÚ ============
function initFiltrosMenu() {
    const groupBtns = document.querySelectorAll(".filter-group-btn");
    const chips      = document.querySelectorAll(".filter-chip");
    const cards       = document.querySelectorAll("#menuGrid .menu-card");
    const emptyState  = document.getElementById("filterEmpty");
    const menuGrid    = document.getElementById("menuGrid");

    function aplicarFiltro(categoria) {
        let visibles = 0;
        cards.forEach(card => {
            const coincide = categoria === "todos" || card.dataset.categoria === categoria;
            card.classList.toggle("filter-hidden", !coincide);
            if (coincide) visibles++;
        });
        menuGrid.style.display   = visibles === 0 ? "none" : "grid";
        emptyState.style.display = visibles === 0 ? "block" : "none";
    }

    function mostrarChipsDelGrupo(grupo) {
        chips.forEach(chip => {
            const esTodos = chip.dataset.categoria === "todos";
            const pertenece = esTodos || grupo === "todos" || chip.dataset.group === grupo;
            chip.classList.toggle("filter-chip-hidden", !pertenece);
        });
    }

    function activarChip(categoria) {
        chips.forEach(c => c.classList.toggle("active", c.dataset.categoria === categoria));
    }

    groupBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            groupBtns.forEach(b => b.classList.toggle("active", b === btn));
            const grupo = btn.dataset.group;
            mostrarChipsDelGrupo(grupo);
            activarChip("todos");
            aplicarFiltro("todos");
            document.getElementById("filterChipsScroll").scrollTo({ left: 0, behavior: "smooth" });
        });
    });

    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            activarChip(chip.dataset.categoria);
            aplicarFiltro(chip.dataset.categoria);
        });
    });
}
initFiltrosMenu();

// ============ BANNER PROMO 2x1 — solo lunes y miércoles ============
function initPromoBanner() {
    const diaSemana = new Date().getDay(); // 0=domingo … 1=lunes … 3=miércoles
    const esDiaPromo = diaSemana === 1 || diaSemana === 3;
    if (!esDiaPromo) return;
    if (sessionStorage.getItem("menuAR_promo_cerrado") === "1") return;

    document.getElementById("promoBanner").style.display = "flex";
}
document.getElementById("promoCloseBtn").addEventListener("click", () => {
    document.getElementById("promoBanner").style.display = "none";
    sessionStorage.setItem("menuAR_promo_cerrado", "1");
});
initPromoBanner();
cargarPlatoDelDia();
