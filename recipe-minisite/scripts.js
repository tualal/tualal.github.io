// Mobile navigation toggle
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');

navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
});

// Submenu toggle for mobile
const hasSubmenu = document.querySelectorAll('.has-submenu');

hasSubmenu.forEach(item => {
    item.addEventListener('click', (e) => {
        // Only on mobile (when nav-toggle is visible)
        if (window.innerWidth < 768) {
            // If clicking the parent link (not a submenu link)
            if (e.target.tagName === 'A' && e.target.parentElement.classList.contains('has-submenu')) {
                e.preventDefault();
                item.classList.toggle('active');
            }
        }
    });
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.main-nav')) {
        navMenu.classList.remove('active');
    }
});
