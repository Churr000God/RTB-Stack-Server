// Archivo: main.js
document.addEventListener('DOMContentLoaded', () => {
  console.log('JS cargado ✅');

  // Cargar HEADER
  fetch('/components/header.html')
    .then(res => res.text())
    .then(headerHTML => {
      document.getElementById('header-container').innerHTML = headerHTML;

      const headerEl = document.querySelector('header.navbar');
      const menuButton = document.getElementById('mobile-menu-button');
      const mobileMenu = document.getElementById('mobile-menu');
      const navLinks = document.querySelectorAll('.nav-links a');
      const mobileLinks = mobileMenu ? mobileMenu.querySelectorAll('a') : [];

      // Marcar enlace activo por ruta
      const normalizePath = (p) => p.replace(/\/+$/,'');
      const currentPath = normalizePath(window.location.pathname);
      [...navLinks, ...mobileLinks].forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        const hrefPath = normalizePath(new URL(href, location.origin).pathname);
        if (hrefPath === currentPath) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }
      });

      if (menuButton && mobileMenu) {
        let isOpen = false;
        const firstMobileLink = mobileMenu.querySelector('a');

        const openMenu = () => {
          isOpen = true;
          mobileMenu.classList.add('open');
          mobileMenu.setAttribute('aria-hidden', 'false');
          mobileMenu.setAttribute('aria-modal', 'true');
          menuButton.setAttribute('aria-expanded', 'true');
          firstMobileLink && firstMobileLink.focus();
        };

        const closeMenu = () => {
          isOpen = false;
          mobileMenu.classList.remove('open');
          mobileMenu.setAttribute('aria-hidden', 'true');
          mobileMenu.setAttribute('aria-modal', 'false');
          menuButton.setAttribute('aria-expanded', 'false');
          menuButton.focus();
        };

        menuButton.addEventListener('click', () => {
          isOpen ? closeMenu() : openMenu();
        });

        // Cerrar con Escape
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && isOpen) closeMenu();
        });

        // Focus trap dentro del menú móvil
        document.addEventListener('keydown', (e) => {
          if (!isOpen || e.key !== 'Tab') return;
          const focusables = mobileMenu.querySelectorAll('a, button');
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (!first || !last) return;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        });

        // Cerrar al hacer click fuera
        document.addEventListener('click', (e) => {
          const withinMenu = mobileMenu.contains(e.target);
          const isButton = menuButton.contains(e.target);
          if (isOpen && !withinMenu && !isButton) closeMenu();
        });

        // Cerrar al navegar en móvil
        mobileLinks.forEach(link => {
          link.addEventListener('click', closeMenu);
        });

        // Cerrar el menú si se cambia a vista de escritorio
        window.addEventListener('resize', () => {
          if (window.innerWidth > 1024 && isOpen) closeMenu();
        });
      }

      // Activar clase 'active' en enlaces desktop por clic
      navLinks.forEach(link => {
        link.addEventListener('click', () => {
          navLinks.forEach(l => {
            l.classList.remove('active');
            l.removeAttribute('aria-current');
          });
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        });
      });

      // Reducir header al hacer scroll
      const handleScroll = () => {
        const scrolled = window.scrollY > 8;
        headerEl && headerEl.classList.toggle('scrolled', scrolled);
      };
      handleScroll();
      window.addEventListener('scroll', handleScroll, { passive: true });
    })
    .catch(err => console.error('Error al cargar header:', err));

  // Cargar FOOTER
  fetch('/components/footer.html')
    .then(res => res.text())
    .then(footerHTML => {
      document.getElementById('footer-container').innerHTML = footerHTML;

      const yearEl = document.getElementById('year');
      if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
      }

      // Marcar enlace activo por ruta en footer (normalizado)
      const normalizePath = (p) => p.replace(/\/+$/,'');
      const currentPathFooter = normalizePath(window.location.pathname);
      const footerLinks = document.querySelectorAll('.footer-links a');
      footerLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        const hrefPath = normalizePath(new URL(href, location.origin).pathname);
        if (hrefPath === currentPathFooter) {
          link.setAttribute('aria-current', 'page');
        }
      });

      // Lazy load del mapa cuando entra al viewport
      const mapIframe = document.querySelector('.footer-map iframe');
      if (mapIframe) {
        const src = mapIframe.getAttribute('data-src');
        const io = new IntersectionObserver(([entry], obs) => {
          if (entry.isIntersecting) {
            if (src && !mapIframe.src) {
              mapIframe.src = src;
            }
            obs.disconnect();
          }
        }, { rootMargin: '200px' });
        io.observe(mapIframe);
      }
    })
    .catch(err => console.error('Error al cargar footer:', err));
});
