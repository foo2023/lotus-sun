// ── Smooth scroll for navigation links ──
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ── Add animation on scroll ──
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver(function(entries) {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

// Observe all feature cards, download cards, and about items
document.querySelectorAll('.feature-card, .download-card, .about-item, .step').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});

// ── Download button functionality ──
document.querySelectorAll('.download-btn').forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.preventDefault();

    const osType = this.closest('.download-card').querySelector('h3').textContent;
    const optionName = this.closest('.download-option').querySelector('.option-name').textContent;

    let url = '';

    // 👇 根据条件决定下载链接
    if (optionName.includes('NSIS')) {
      url = '/releases/lotus-sun_0.1.0_x64-setup.exe';
    }

    if (optionName.includes('MSI')) {
      url = '/releases/lotus-sun_0.1.0_x64_en-US.msi';
    }

    console.log(`下载: ${osType} - ${optionName}`, url);

    // ✅ 触发下载
    window.location.href = url;
  });
});

// ── Add active state to navigation on scroll ──
window.addEventListener('scroll', () => {
  const sections = document.querySelectorAll('section');
  const navLinks = document.querySelectorAll('.nav-links a');
  
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.clientHeight;
    if (pageYOffset >= sectionTop - 200) {
      current = section.getAttribute('id');
    }
  });
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href').slice(1) === current) {
      link.classList.add('active');
    }
  });
});

// ── Add hover effect to download options ──
document.querySelectorAll('.download-option').forEach(option => {
  option.addEventListener('mouseenter', function() {
    this.style.transform = 'translateX(8px)';
    this.style.transition = 'transform 0.3s ease';
  });
  
  option.addEventListener('mouseleave', function() {
    this.style.transform = 'translateX(0)';
  });
});

// ── Parallax effect for floating elements ──
window.addEventListener('scroll', () => {
  const floatItems = document.querySelectorAll('.float-item');
  const scrollY = window.pageYOffset;
  
  floatItems.forEach((item, index) => {
    const speed = 0.5 + (index * 0.1);
    item.style.transform = `translateY(${scrollY * speed}px)`;
  });
});

// ── Add ripple effect to buttons ──
function createRipple(event) {
  const button = event.currentTarget;
  const ripple = document.createElement('span');
  
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;
  
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  ripple.classList.add('ripple');
  
  button.appendChild(ripple);
  
  setTimeout(() => ripple.remove(), 600);
}

document.querySelectorAll('.cta-button, .download-btn').forEach(button => {
  button.addEventListener('click', createRipple);
});

// ── Add CSS for ripple effect ──
const style = document.createElement('style');
style.textContent = `
  .cta-button, .download-btn {
    position: relative;
    overflow: hidden;
  }
  
  .ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    transform: scale(0);
    animation: ripple-animation 0.6s ease-out;
    pointer-events: none;
  }
  
  @keyframes ripple-animation {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// ── Log page load ──
console.log('Lotus Sun Landing Page Loaded');
