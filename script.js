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
let cart = [];

function recalcTotal() {
    return cart.reduce((sum, item) => sum + item.priceNum, 0);
}

function formatPrice(num) {
    return "$" + num.toLocaleString("es-CO");
}

function updateFab() {
    const badge = document.getElementById("cartFabBadge");
    if (cart.length > 0) {
        badge.textContent = cart.length;
        badge.style.display = "flex";
    } else {
        badge.style.display = "none";
    }
}

document.getElementById("cartFab").addEventListener("click", () => {
    renderCart();
    document.getElementById("cartModal").classList.add("active");
});

// ============ TOAST ============
let toastTimer = null;

function showToast(item) {
    const toast = document.getElementById("toast");
    document.getElementById("toastImg").src  = item.poster || "";
    document.getElementById("toastName").textContent = item.name;
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
                    <p>${item.price}</p>
                </div>
                <button class="cart-remove-btn" data-index="${index}" title="Quitar">×</button>
            </div>
        `).join("");

        cartList.querySelectorAll(".cart-remove-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                cart.splice(parseInt(e.currentTarget.dataset.index), 1);
                renderCart();
                updateFab();
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

document.querySelectorAll(".open-3d").forEach(card => {
    card.addEventListener("click", () => {
        activeItem = {
            name:     card.dataset.name,
            price:    card.dataset.price,
            poster:   card.dataset.poster,
            priceNum: parseInt(card.dataset.price.replace(/\D/g, ""))
        };

        modelViewerModal.setAttribute("src",    card.dataset.model);
        modelViewerModal.setAttribute("poster", card.dataset.poster);
        dishTitle.textContent  = card.dataset.name;
        dishPrice.textContent  = card.dataset.price;
        dishStory.textContent  = card.dataset.story;
        storyCard.classList.remove("active");

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
    cart.push({ ...activeItem });
    modal3D.classList.remove("active");
    updateFab();
    showToast(activeItem);
    openCartModal();
});

// ============ ¡LO QUIERO! — hotspot ============
document.getElementById("orderFromHotspot").addEventListener("click", () => {
    const item = { name: "Hamburguesa Insignia", price: "$38.000", poster: "Images/burguer.png", priceNum: 38000 };
    cart.push({ ...item });
    updateFab();
    showToast(item);
    openCartModal();
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

document.getElementById("confirmCartBtn").addEventListener("click", async () => {
    if (cart.length === 0) return;

    const itemsParaGuardar = cart.map(i => ({ name: i.name, price: i.price, priceNum: i.priceNum, poster: i.poster }));
    await guardarPedido(itemsParaGuardar, formatPrice(recalcTotal()), mesaActual);

    cartModal.classList.remove("active");

    document.getElementById("successItems").innerHTML = cart.map(item => `
        <div class="success-item animate__animated animate__fadeInUp">
            <span>${item.name}</span>
            <span>${item.price}</span>
        </div>
    `).join("");

    document.getElementById("successModal").classList.add("active");
    cart = [];
    updateFab();
});

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

// ============ INIT ============
detectarMesa();