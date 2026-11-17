import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { logoSVG } from './monk.js';
import { getProductBySlug } from './products-data.js';

gsap.registerPlugin(ScrollTrigger);
document.documentElement.classList.add('js');

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------- inject logo ---------- */
$$('[data-logo]').forEach((el) => (el.innerHTML = logoSVG));

/* ---------- return-to-home flag ---------- */
$$('[data-return-home]').forEach((link) => {
  link.addEventListener('click', () => {
    try {
      sessionStorage.setItem('hm-return-home', '1');
    } catch (_) {}
  });
});

/* ---------- mobile menu ---------- */
const menuBtn = $('#ed-menu-btn');
const mobileMenu = $('#ed-mobile-menu');
let lenis = null;

function closeMenu() {
  if (!menuBtn || !mobileMenu) return;
  document.body.classList.remove('menu-open');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-label', 'Open menu');
  mobileMenu.setAttribute('aria-hidden', 'true');
  lenis && lenis.start();
}
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    if (!open) return closeMenu();
    document.body.classList.add('menu-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Close menu');
    mobileMenu.setAttribute('aria-hidden', 'false');
    lenis && lenis.stop();
  });
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
}

/* ---------- populate product detail page if on /products/:slug ---------- */
if (document.body.classList.contains('product-detail-page')) {
  const params = new URLSearchParams(location.search);
  const pathParts = location.pathname
    .replace(/\/index\.html$/i, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);
  const lastPart = (pathParts[pathParts.length - 1] || '').replace(/\.html$/i, '');
  const slug = params.get('product') || (lastPart && lastPart !== 'product' ? lastPart : 'pure-coffee');
  const product = getProductBySlug(slug);

  document.title = `${product.name} — Happy Monk Pantry`;
  const imgEl = $('#pd-image');
  if (imgEl) {
    imgEl.src = product.image;
    imgEl.alt = product.imageAlt;
  }
  const titleText = $('#pd-title-text');
  if (titleText) titleText.textContent = product.name;
  const kh = $('#pd-kitchen-heading');
  if (kh) kh.textContent = product.kitchenHeading;
  const kc = $('#pd-kitchen-copy');
  if (kc) kc.textContent = product.kitchenCopy;
  const rh = $('#pd-recipe-heading');
  if (rh) rh.textContent = product.recipeHeading;
  const rc = $('#pd-recipe-copy');
  if (rc) rc.textContent = product.recipeCopy;
}

/* ---------- smooth scroll ---------- */
if (!reduced) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* =================================================================
   ANIMATIONS — SHOP THE RANGE & PRODUCT DETAIL
   ================================================================= */
if (!reduced) {
  // Masked heading reveals
  $$('[data-ed-lines] .line > span').forEach((span) => {
    gsap.fromTo(
      span,
      { yPercent: 112 },
      {
        yPercent: 0,
        duration: 1.15,
        ease: 'expo.out',
        scrollTrigger: { trigger: span, start: 'top 90%' },
      }
    );
  });

  // Generic fade-ins
  $$('[data-reveal]').forEach((el, i) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 22 },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        delay: Math.min(i * 0.06, 0.3),
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
      }
    );
  });

  // Shop page product cards — staggered cinematic reveal
  $$('.ed-product-card').forEach((card, i) => {
    const media = $('.ed-card-media', card);
    const img = $('img', card);
    const titleSpan = $('.ed-card-title .line > span', card);
    const meta = $('.ed-card-meta', card);
    const desc = $('.ed-card-desc', card);
    const cta = $('.ed-card-cta', card);

    const tl = gsap.timeline({
      scrollTrigger: { trigger: card, start: 'top 86%' },
    });
    tl.fromTo(
      card,
      { y: 32, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.95, ease: 'power3.out', delay: (i % 3) * 0.1 }
    )
      .fromTo(
        media,
        { clipPath: 'inset(100% 0 0 0)' },
        { clipPath: 'inset(0% 0 0 0)', duration: 1.25, ease: 'expo.inOut' },
        '<0.05'
      )
      .fromTo(img, { scale: 1.18 }, { scale: 1, duration: 1.6, ease: 'expo.out' }, '<0.15')
      .fromTo(titleSpan, { yPercent: 110 }, { yPercent: 0, duration: 1.0, ease: 'expo.out' }, '<0.25')
      .fromTo(
        [meta, desc, cta],
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, stagger: 0.07, duration: 0.75, ease: 'power3.out' },
        '<0.15'
      );
  });

  // Product detail page — hero image reveal, title reveal, proof card reveal
  if (document.body.classList.contains('product-detail-page')) {
    gsap.fromTo(
      '#pd-photo-mask',
      { clipPath: 'inset(100% 0 0 0)' },
      { clipPath: 'inset(0% 0 0 0)', duration: 1.25, ease: 'expo.inOut', delay: 0.08 }
    );
    gsap.fromTo(
      '#pd-image',
      { scale: 1.15 },
      { scale: 1, duration: 1.6, ease: 'expo.out', delay: 0.2 }
    );
    gsap.fromTo(
      '#pd-title-text',
      { yPercent: 112 },
      { yPercent: 0, duration: 1.15, ease: 'expo.out', delay: 0.15 }
    );

    const proofTl = gsap.timeline({
      scrollTrigger: { trigger: '#pd-proof-card', start: 'top 84%' },
    });
    proofTl
      .fromTo(
        '#pd-proof-card',
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'expo.inOut' }
      )
      .from(
        '#pd-proof-card .pd-proof-eyebrow, #pd-proof-card .pd-proof-card-title',
        { opacity: 0, y: 16, stagger: 0.08, duration: 0.7 },
        '-=0.4'
      )
      .from(
        '.pd-proof-row',
        { opacity: 0, x: -16, stagger: 0.1, duration: 0.75, ease: 'power3.out' },
        '-=0.45'
      );
  }
} else {
  $$('.ed-card-media, #pd-photo-mask').forEach((el) => (el.style.clipPath = 'none'));
  $$('.ed-card-media img, #pd-image').forEach((el) => (el.style.transform = 'none'));
}

/* =================================================================
   CINEMATIC RIGHT-SIDE SCROLLBAR — liquid morph, light trail, particles & drag
   ================================================================= */
(function initCinematicScrollbar() {
  const sb = $('#hm-scrollbar');
  const canvas = $('#sb-canvas');
  const track = $('#sb-track');
  const ticksWrap = $('#sb-ticks');
  const beam = $('#sb-beam');
  const thumb = $('#sb-thumb');
  const thumbCore = $('.sb-thumb-core', thumb);
  const readout = $('#sb-readout');
  if (!sb || !canvas || !track || !thumb) return;

  const ctx = canvas.getContext('2d');
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cw = 36;
  let ch = window.innerHeight;
  let trackTop = 14;
  let trackH = ch - 28;
  let thumbH = 54;
  let maxScroll = 1;

  const tickEls = [];
  const TICK_COUNT = 25;
  for (let i = 0; i < TICK_COUNT; i++) {
    const t = document.createElement('span');
    t.className = 'sb-tick';
    const pct = i / (TICK_COUNT - 1);
    t.style.top = `${pct * 100}%`;
    if (i % 6 === 0) t.style.width = '7px';
    ticksWrap.appendChild(t);
    tickEls.push({ el: t, pct });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = sb.getBoundingClientRect();
    cw = rect.width || 36;
    ch = rect.height || window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tRect = track.getBoundingClientRect();
    trackTop = tRect.top - rect.top;
    trackH = tRect.height || ch - 28;

    const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, ch + 1);
    maxScroll = Math.max(1, docH - window.innerHeight);
    const ratio = window.innerHeight / docH;
    thumbH = Math.round(Math.max(44, Math.min(108, trackH * ratio)));
    thumb.style.height = `${thumbH}px`;
  }

  let scrollY = window.scrollY || 0;
  let targetProgress = 0;
  let smoothProgress = 0;
  let lastThumbCenterY = trackTop + thumbH * 0.5;
  let velocity = 0;
  let scrollIdleTimer = null;
  let isHovered = false;
  let isDragging = false;
  let dragOffsetY = 0;
  let pointerY = -100;

  const trail = [];
  const particles = [];

  function spawnParticles(y, vel, count) {
    if (reduced) return;
    const trackCenterX = cw - (window.innerWidth <= 860 ? 7 : 10);
    for (let i = 0; i < count; i++) {
      const dir = vel >= 0 ? -1 : 1;
      particles.push({
        x: trackCenterX + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * (thumbH * 0.55),
        vx: -Math.random() * 0.65 - 0.1,
        vy: dir * (Math.random() * 1.4 + 0.3) + (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.45 + 0.45,
        alpha: Math.min(1, 0.45 + Math.random() * 0.5),
        decay: 0.016 + Math.random() * 0.02,
      });
    }
    if (particles.length > 90) particles.splice(0, particles.length - 90);
  }

  function onScrollUpdate() {
    scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight + 1);
    maxScroll = Math.max(1, docH - window.innerHeight);
    targetProgress = Math.max(0, Math.min(1, scrollY / maxScroll));

    sb.classList.add('is-scrolling');
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => sb.classList.remove('is-scrolling'), 420);
  }

  window.addEventListener('scroll', onScrollUpdate, { passive: true });
  window.addEventListener('resize', () => { resize(); onScrollUpdate(); });
  resize();
  onScrollUpdate();

  function scrollToProgress(p, immediate = false) {
    const clamped = Math.max(0, Math.min(1, p));
    const destY = clamped * maxScroll;
    if (lenis) {
      lenis.scrollTo(destY, immediate ? { immediate: true } : { duration: 0.9 });
    } else {
      window.scrollTo({ top: destY, behavior: immediate ? 'auto' : 'smooth' });
    }
    targetProgress = clamped;
  }

  sb.addEventListener('pointerenter', (e) => {
    isHovered = true;
    pointerY = e.clientY;
  });
  sb.addEventListener('pointermove', (e) => {
    pointerY = e.clientY;
    if (!isDragging) return;
    const usable = Math.max(1, trackH - thumbH);
    const yInTrack = e.clientY - trackTop - dragOffsetY;
    scrollToProgress(yInTrack / usable, true);
  });
  sb.addEventListener('pointerleave', () => {
    isHovered = false;
    if (!isDragging) pointerY = -100;
  });
  sb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resize();
    const thumbRect = thumb.getBoundingClientRect();
    const clickedThumb = e.clientY >= thumbRect.top - 6 && e.clientY <= thumbRect.bottom + 6;
    if (clickedThumb) {
      dragOffsetY = e.clientY - thumbRect.top;
    } else {
      dragOffsetY = thumbH * 0.5;
      const usable = Math.max(1, trackH - thumbH);
      const yInTrack = e.clientY - trackTop - dragOffsetY;
      scrollToProgress(yInTrack / usable, false);
    }
    isDragging = true;
    sb.classList.add('is-dragging');
    try { sb.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    sb.classList.remove('is-dragging');
    try { sb.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  sb.addEventListener('pointerup', endDrag);
  sb.addEventListener('pointercancel', endDrag);

  gsap.ticker.add(() => {
    const lerpFactor = isDragging ? 0.45 : 0.24;
    smoothProgress += (targetProgress - smoothProgress) * lerpFactor;
    if (Math.abs(targetProgress - smoothProgress) < 0.0001) smoothProgress = targetProgress;

    const usable = Math.max(0, trackH - thumbH);
    const thumbTop = smoothProgress * usable;
    const thumbCenterY = trackTop + thumbTop + thumbH * 0.5;

    const dy = thumbCenterY - lastThumbCenterY;
    lastThumbCenterY = thumbCenterY;
    velocity = velocity * 0.76 + dy * 0.24;
    const speed = Math.abs(velocity);

    thumb.style.transform = `translate3d(-50%, ${thumbTop.toFixed(2)}px, 0)`;
    beam.style.transform = `translateX(-50%) scaleY(${smoothProgress.toFixed(4)})`;

    const stretchY = reduced ? 1 : 1 + Math.min(speed * 0.038, 0.65);
    const squeezeX = reduced ? 1 : 1 - Math.min(speed * 0.008, 0.22);
    thumbCore.style.transform = `scale(${squeezeX.toFixed(3)}, ${stretchY.toFixed(3)})`;

    const pctInt = Math.round(smoothProgress * 100);
    readout.textContent = String(pctInt).padStart(2, '0');
    sb.setAttribute('aria-valuenow', String(pctInt));

    for (let i = 0; i < tickEls.length; i++) {
      const item = tickEls[i];
      item.el.classList.toggle('is-passed', item.pct <= smoothProgress + 0.005);
      if (isHovered || isDragging || speed > 0.25) {
        const tickY = trackTop + item.pct * trackH;
        const distThumb = Math.abs(tickY - thumbCenterY);
        const distPtr = isHovered ? Math.abs(tickY - pointerY) : 999;
        const d = Math.min(distThumb, distPtr);
        const wave = Math.max(0, 1 - d / 90);
        const scale = 1 + wave * 1.9;
        item.el.style.transform = `scaleX(${scale.toFixed(2)})`;
      } else {
        item.el.style.transform = '';
      }
    }

    if (!reduced && (speed > 0.12 || isHovered || isDragging)) {
      trail.push({
        y: thumbCenterY,
        alpha: Math.min(0.9, 0.22 + speed * 0.055 + (isDragging ? 0.25 : 0)),
        spread: Math.min(10, 2.5 + speed * 0.35),
      });
      if (trail.length > 28) trail.shift();
      if (speed > 0.45) {
        spawnParticles(thumbCenterY, velocity, speed > 3 ? 2 : 1);
      } else if ((isHovered || isDragging) && Math.random() < 0.18) {
        spawnParticles(thumbCenterY, (Math.random() - 0.5) * 2, 1);
      }
    }

    ctx.clearRect(0, 0, cw, ch);
    if (reduced) return;

    const trackCenterX = cw - (window.innerWidth <= 860 ? 7 : 10);

    if (trail.length > 1) {
      for (let i = 0; i < trail.length - 1; i++) {
        const p0 = trail[i];
        const p1 = trail[i + 1];
        p0.alpha *= 0.91;
        if (p0.alpha <= 0.01) continue;
        const ratio = (i + 1) / trail.length;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(trackCenterX, p0.y);
        ctx.lineTo(trackCenterX, p1.y);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(p0.alpha * ratio * 0.65).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.5, p0.spread * ratio);
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowBlur = 12 * ratio;
        ctx.stroke();
        ctx.restore();
      }
      while (trail.length && trail[0].alpha <= 0.015) trail.shift();
    }

    const auraAlpha = Math.min(0.55, speed * 0.035 + (isHovered || isDragging ? 0.22 : 0.05));
    if (auraAlpha > 0.02) {
      const auraR = thumbH * 0.75 + Math.min(40, speed * 3);
      const grad = ctx.createRadialGradient(trackCenterX, thumbCenterY, 1, trackCenterX, thumbCenterY, auraR);
      grad.addColorStop(0, `rgba(255, 255, 255, ${auraAlpha.toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(255, 255, 255, ${(auraAlpha * 0.35).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, Math.max(0, thumbCenterY - auraR), cw, auraR * 2);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.alpha -= pt.decay;
      if (pt.alpha <= 0.01) {
        particles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${pt.alpha.toFixed(3)})`;
      ctx.fill();
    }
  });
})();

window.addEventListener('load', () => ScrollTrigger.refresh());
