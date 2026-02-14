const cardData = [
  {
    title: "Helvex",
    logo: "Garantía de Calidad",
    image: "/assets/img/marcas/logo_helvex.png",
    content: "Grupo Helvex, líder mexicano en la industria de la construcción, ofrece tecnología y productos de alta calidad en grifería, muebles cerámicos y recubrimientos para baños y cocinas. Con presencia en México, Estados Unidos y Latinoamérica, cuenta con más de mil productos distribuidos por una red de más de 600 socios comerciales. Integra las marcas Helvex, Proyecta y Emizioni, desde su complejo industrial en Guanajuato.",
  },

  {
    title:"T&S",
    logo:"Fiabilidad integrada",
    image: "/assets/img/marcas/ts-logo.png",
    content: "T&S Brass es un fabricante líder de grifería y accesorios especializados para hostelería, industria y plomería comercial. Fundada en 1947, ha sido pionera en innovaciones como la unidad de prelavado y la válvula de pedal. Reconocida por su calidad, durabilidad e intercambiabilidad, la marca opera desde su sede en Carolina del Sur con presencia global en más de 10 regiones, ofreciendo soluciones confiables donde sea que sus clientes las necesiten.",
  },

  {
    title: "American Standard",
    logo: "American Standard. Raising the Standard",
    image: "/assets/img/marcas/logo_american_standard.png",
    content: "Desde 1875, American Standard ha sido parte de la vida de millones de personas, diseñando productos inspirados en sus rutinas. Con calidad, innovación y estilo, creamos espacios que conectan, reconfortan y perduran.",  
  },

  {
    title:"Sloan",
    logo: "Primero la calidad. Siempre verde",
    image: "/assets/img/marcas/sloan-logo.png",
    content: "Principal fabricante mundial de sistemas de plomería comercial, hemos dedicado más de un siglo a ser pioneros en soluciones inteligentes y economizadoras de agua, para cuartos de baño que se fabrican para durar toda la vida",
  },

  {
    title:"Valmex",
    logo: "Calidad certificada",
    image: "/assets/img/marcas/valmex-logo.png",
    content: "Valmex es una empresa mexicana destacada en la fabricación y distribución de soluciones para la construcción, especializada en productos de alta calidad para baños y cocinas. Con presencia en México y Latinoamérica, ofrece un portafolio variado que satisface las necesidades de distribuidores y clientes finales, apoyada en procesos tecnológicos avanzados y un compromiso con la innovación.",
  },

  {
    title:"WASSER",
    logo:"-",
    image: "/assets/img/marcas/wasser-logo.png",
    content: "Somos sinónimo de Diseño y Calidad, una marca internacional de grifería, duchas y accesorios para baño. La mejor opción para remodelar o cambiar tu baño y cocina; con diseños de vanguardia, colecciones de alta calidad, la solución integral para arquitectos y decoradores de interiores especializados en salas de baño.",
  },

  {
    title:"TECHNOBATH",
    logo:"-",
    image: "/assets/img/marcas/technbath-logo.png",
    content: "Somos una marca internacional de llaves, lavabos, wc's, accesorios y muebles para baño. Somos una solución integra paraarquitectos y decoradores de interiores, especializados en salas de baño",
  },

  {
    title:"Grupo Urrea",
    logo:"Solución total en herramientas",
    image: "/assets/img/marcas/urrea-logo.png",
    content: "Con 115 años de experiencia, Grupo Urrea es líder en soluciones para el agua, herramientas y cerrajería. Cuenta con las marcas Urrea, Surtec y Lock, y un portafolio de más de 16,000 productos con presencia en 25 países. Somos la única empresa mexicana que manufactura herramientas mecánicas, produciendo más de un millón de piezas mensuales en siete plantas. Apoyados en innovación, calidad certificada y una red logística eficiente, buscamos ser el proveedor más confiable, rápido y transparente para nuestros clientes y distribuidores, construyendo relaciones duraderas basadas en respeto, lealtad y compromiso.",
  },


  {
    title:"DICA",
    logo:"Calidad que siempre esta en tus manos",
    image: "/assets/img/marcas/dica-logo.png",
    content: "Con más de 20 años de experiencia, Dica ofrece el portafolio más amplio del mercado en soluciones para el hogar. Destacamos por nuestra excelente relación precio-calidad y una red nacional de distribuidores que nos mantiene siempre cerca de ti. Con Dica, lo tienes todo.",
  },




];

const slider = document.getElementById('slider');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
const galleryContainer = document.getElementById('galleryContainer');

function generateCards() {
  slider.innerHTML = '';

  for (let i = 0; i < 2; i++) {
    cardData.forEach((card, index) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.index = index;
      // Accesibilidad y navegación por teclado
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Abrir información de ${card.title}`);
      // El segundo pase del track es duplicado: ocultamos de lectores y tabulación
      if (i === 1) {
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('tabindex', '-1');
      } else {
        el.setAttribute('tabindex', '0');
      }
      el.innerHTML = `
        <div class="card-image">
          <img src="${card.image}" alt="${card.title}" width="300" height="175" loading="lazy" decoding="async" />
        </div>
        <div class="card-header">${card.title}</div>
        <div class="card-logo">${card.logo}</div>
        <div class="card-bg"></div>
      `;
      el.addEventListener('click', () => openModal(index));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(index);
        }
      });
      slider.appendChild(el);
    });
  }
}

function openModal(index) {
  const card = cardData[index];
  modalTitle.innerHTML = `${card.title} <small style="display:block; font-weight: normal;">${card.logo}</small>`;
  modalBody.innerHTML = `<p>${card.content}</p>`;
  modal.classList.add('active');
  slider.classList.add('paused');
  // Atributos ARIA del modal
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-hidden', 'false');
  // Guardar el índice para devolver el foco
  modal.dataset.triggerIndex = String(index);
  // Mover foco al botón de cerrar
  modalClose && modalClose.focus();
}

function closeModal() {
  modal.classList.remove('active');
  slider.classList.remove('paused'); // reanuda la animación
  modal.setAttribute('aria-modal', 'false');
  modal.setAttribute('aria-hidden', 'true');
  // Devolver foco a la tarjeta que abrió el modal
  const idx = Number(modal.dataset.triggerIndex);
  const trigger = document.querySelector(`.card[data-index="${idx}"]:not([aria-hidden="true"])`);
  trigger && trigger.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  generateCards();

  modalClose.addEventListener('click', closeModal);

  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // Pausar animación cuando no está visible en el viewport
  if (galleryContainer && slider) {
    const io = new IntersectionObserver(([entry]) => {
      slider.classList.toggle('paused', !entry.isIntersecting);
    }, { threshold: 0.1 });
    io.observe(galleryContainer);
  }

  // Pausar animación cuando la pestaña está oculta
  document.addEventListener('visibilitychange', () => {
    if (slider) {
      slider.classList.toggle('paused', document.hidden);
    }
  });
});
