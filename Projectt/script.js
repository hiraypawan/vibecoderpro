// Get all elements
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');
const heroButton = document.querySelector('.hero-button');
const features = document.querySelectorAll('.feature');
const pricingTiers = document.querySelectorAll('.pricing-tier');
const footerLinks = document.querySelectorAll('.footer-link');

// Mobile menu functionality
navToggle.addEventListener('click', () => {
  nav.classList.toggle('nav-open');
});

// Smooth scroll functionality
const scrollLinks = document.querySelectorAll('a.scroll-link');
scrollLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const id = link.getAttribute('href');
    const element = document.querySelector(id);
    element.scrollIntoView({ behavior: 'smooth' });
  });
});

// Animation functionality
window.addEventListener('scroll', () => {
  const scrollPosition = window.scrollY;
  features.forEach(feature => {
    const featureTop = feature.offsetTop;
    if (scrollPosition > featureTop - window.innerHeight / 2) {
      feature.classList.add('animate');
    }
  });
});

// Pricing tier hover functionality
pricingTiers.forEach(tier => {
  tier.addEventListener('mouseover', () => {
    tier.classList.add('hover');
  });
  tier.addEventListener('mouseout', () => {
    tier.classList.remove('hover');
  });
});

// Footer link hover functionality
footerLinks.forEach(link => {
  link.addEventListener('mouseover', () => {
    link.classList.add('hover');
  });
  link.addEventListener('mouseout', () => {
    link.classList.remove('hover');
  });
});

// Hero button click functionality
heroButton.addEventListener('click', () => {
  const hero = document.querySelector('.hero');
  hero.classList.add('animate');
  setTimeout(() => {
    hero.classList.remove('animate');
  }, 1000);
});

// Add event listener to window for resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  if (width < 768) {
    nav.classList.remove('nav-open');
  }
});

// Function to handle scrolling to top
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Add event listener to scroll to top button
const scrollTopButton = document.querySelector('.scroll-to-top');
scrollTopButton.addEventListener('click', scrollToTop);

// Function to handle scrolling to section
function scrollToSection(id) {
  const section = document.querySelector(id);
  section.scrollIntoView({ behavior: 'smooth' });
}

// Add event listeners to navigation links
const navLinks = document.querySelectorAll('.nav-link');
navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const id = link.getAttribute('href');
    scrollToSection(id);
  });
});