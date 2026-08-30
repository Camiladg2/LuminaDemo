const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const modal = document.getElementById('3dModal');

// Desplegar la pantalla completa al tocar el postre 3D
openModalBtn.addEventListener('click', () => {
    modal.classList.add('active');
});

// Ocultar al dar clic en la X
closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('active');
});

// Cerrar si pulsan sobre el fondo oscuro exterior
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('active');
    }
});
