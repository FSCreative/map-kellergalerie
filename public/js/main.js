(function () {
  'use strict';

  // ----- Sticky header -----
  var header = document.getElementById('siteHeader');
  function onScroll() {
    header.classList.toggle('scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ----- Mobile nav -----
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.classList.toggle('open', open);
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.classList.remove('open');
        document.body.classList.remove('nav-open');
      });
    });
  }

  // ----- Reveal on scroll -----
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('visible'); });
  }

  // ----- Category filter -----
  var filterBar = document.getElementById('filterBar');
  if (filterBar) {
    var cards = document.querySelectorAll('#exGrid .card');
    filterBar.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      filterBar.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      var f = chip.dataset.filter;
      cards.forEach(function (card) {
        var cats = (card.dataset.cats || '').split(',').map(function (s) { return s.trim(); });
        var show = f === 'alle' || cats.indexOf(f) !== -1;
        card.classList.toggle('hidden-by-filter', !show);
        if (show) card.classList.add('visible');
      });
    });
  }

  // ----- Lightbox -----
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    var lbCaption = lb.querySelector('.lb-caption');
    var images = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox]'));
    var current = 0;

    function openLb(i) {
      current = i;
      lbImg.src = images[i].src;
      lbCaption.textContent = images[i].alt || '';
      lb.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeLb() {
      lb.hidden = true;
      document.body.style.overflow = '';
    }
    function step(d) {
      if (!images.length) return;
      openLb((current + d + images.length) % images.length);
    }

    images.forEach(function (img, i) {
      img.addEventListener('click', function (e) {
        e.preventDefault();
        openLb(i);
      });
    });
    lb.querySelector('.lb-close').addEventListener('click', closeLb);
    lb.querySelector('.lb-prev').addEventListener('click', function () { step(-1); });
    lb.querySelector('.lb-next').addEventListener('click', function () { step(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });

    // Touch swipe
    var touchX = null;
    lb.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) step(dx > 0 ? -1 : 1);
      touchX = null;
    }, { passive: true });
  }

  // ----- Contact form via mailto -----
  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(form);
      var body = 'Name: ' + d.get('name') + '\nE-Mail: ' + d.get('email') + '\n\n' + d.get('message');
      window.location.href = 'mailto:info@map-kellergalerie.at' +
        '?subject=' + encodeURIComponent(d.get('subject')) +
        '&body=' + encodeURIComponent(body);
    });
  }
})();
