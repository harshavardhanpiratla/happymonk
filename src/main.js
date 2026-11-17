import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { monkSVG, logoSVG } from './monk.js';

gsap.registerPlugin(ScrollTrigger);
document.documentElement.classList.add('js');

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.innerWidth <= 860;
const initialHash = location.hash && location.hash.length > 1 ? location.hash : null;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------- inject art ---------- */
$('#hero-monk').innerHTML = monkSVG;
$$('[data-logo]').forEach((el) => (el.innerHTML = logoSVG));
$('#year').textContent = new Date().getFullYear();

/* ---------- split helpers ---------- */
const splitChars = (el) => {
  const t = el.textContent;
  el.setAttribute('aria-label', t);
  el.innerHTML = [...t].map((c) => `<span class="ch" aria-hidden="true">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  return $$('.ch', el);
};
const splitWords = (el) => {
  const t = el.textContent.trim();
  el.setAttribute('aria-label', t);
  el.innerHTML = t.split(/\s+/).map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
  return $$('.w', el);
};
const splitLines = (el) => {
  // headings: wrap words into masked lines (word-level is robust across breakpoints)
  const t = el.textContent.trim();
  el.setAttribute('aria-label', t);
  el.innerHTML = t.split(/\s+/).map((w) => `<span class="line" style="display:inline-block" aria-hidden="true"><span>${w}</span></span>`).join(' ');
  return $$('.line > span', el);
};

/* ---------- smooth scroll ---------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
const scrollToHash = (hash) => {
  const target = hash === '#top' ? 0 : $(hash);
  if (target === null) return;
  if (lenis) lenis.scrollTo(target, { offset: hash === '#top' ? 0 : -60, duration: 1.6 });
  else if (target === 0) window.scrollTo(0, 0);
  else target.scrollIntoView();
};
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const h = a.getAttribute('href');
  if (h === '#') { e.preventDefault(); return; } // product/policy URLs pending
  if (h.length > 1) { e.preventDefault(); closeMenu(); scrollToHash(h); history.replaceState(null, '', h); }
});

/* ---------- mobile menu ---------- */
const menuBtn = $('#menu-btn');
function closeMenu() {
  document.body.classList.remove('menu-open');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-label', 'Open menu');
  $('#mobile-menu').setAttribute('aria-hidden', 'true');
  lenis && !document.body.classList.contains('is-intro') && lenis.start();
}
menuBtn.addEventListener('click', () => {
  const open = !document.body.classList.contains('menu-open');
  if (!open) return closeMenu();
  document.body.classList.add('menu-open');
  menuBtn.setAttribute('aria-expanded', 'true');
  menuBtn.setAttribute('aria-label', 'Close menu');
  $('#mobile-menu').setAttribute('aria-hidden', 'false');
  lenis && lenis.stop();
});
window.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

/* =================================================================
   INTRO FILM
   ================================================================= */
const titleChars = splitChars($('#intro-title'));
const heroLines = $$('#hero-title .line > span');
const heroBits = ['#hero-eyebrow', '#hero-sub', '#hero-cta', '#scroll-cue'];

gsap.set(heroLines, { yPercent: 115 });
gsap.set(heroBits, { autoAlpha: 0, y: 18 });
gsap.set('#hero-monk', { autoAlpha: 0, x: () => (isMobile() ? 0 : -window.innerWidth * 0.45), y: () => (isMobile() ? 80 : 0) });

const intro = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' }, onComplete: finishIntro });

/* Scene 1 — brand reveal */
intro.addLabel('title')
  .fromTo('#intro-title', { scale: 0.92 }, { scale: 1, duration: 3.2, ease: 'power2.out' }, 0)
  .fromTo(titleChars, { opacity: 0, yPercent: 40, filter: 'blur(14px)' },
    { opacity: 1, yPercent: 0, filter: 'blur(0px)', duration: 1.3, stagger: { each: 0.085, from: 'center' } }, 0.25)
  .to('#intro-kicker', { opacity: 1, duration: 1 }, 1.4)
  /* hold, then dissolve outward */
  .to(titleChars, { opacity: 0, filter: 'blur(10px)', yPercent: -30, duration: 0.8, stagger: { each: 0.04, from: 'edges' }, ease: 'power2.in' }, 3.1)
  .to('#intro-kicker', { opacity: 0, duration: 0.5 }, 3.1)
  .to('#intro', { backgroundColor: 'rgba(0,0,0,0)', duration: 0.6 }, 3.8)

/* Scene 2 — the mascot arrives & presents the philosophy */
  .addLabel('monk', 3.9)
  .to('#hero-monk', { autoAlpha: 1, x: 0, y: 0, duration: 1.6, ease: 'expo.out' }, 'monk')
  .to('#hero-eyebrow', { autoAlpha: 1, y: 0, duration: 0.8 }, 'monk+=0.4')
  .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.22, ease: 'expo.out' }, 'monk+=0.55')
  .to('#hero-sub', { autoAlpha: 1, y: 0, duration: 0.9 }, 'monk+=1.4')
  .addLabel('end', 'monk+=2.3');

let introDone = false;
function finishIntro() {
  if (introDone) return;
  introDone = true;
  try { localStorage.setItem('hm-intro-seen', '1'); } catch (e) {}
  const out = gsap.timeline({ defaults: { ease: 'power4.inOut' } });
  if (!reduced) {
    // elegant white horizontal wipe: sweeps in from left, exits right
    out.set('#wipe', { transformOrigin: 'left' })
      .to('#wipe', { scaleX: 1, duration: 0.55 })
      .add(enterSite)
      .set('#wipe', { transformOrigin: 'right' })
      .to('#wipe', { scaleX: 0, duration: 0.75, delay: 0.05 });
  } else enterSite();
}
function enterSite() {
  document.body.classList.remove('is-intro');
  $('#intro').setAttribute('hidden', '');
  gsap.set('#hero-monk', { autoAlpha: 1, x: 0, y: 0 });
  gsap.set(heroLines, { yPercent: 0 });
  gsap.set(['#hero-eyebrow', '#hero-sub'], { autoAlpha: 1, y: 0 });
  gsap.to(['#hero-cta', '#scroll-cue'], { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1, delay: 0.5, ease: 'power3.out' });
  gsap.fromTo('#nav', { yPercent: -100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, delay: 0.35, ease: 'power3.out', clearProps: 'transform,opacity' });
  lenis && lenis.start();
  ScrollTrigger.refresh();
  if (initialHash && $(initialHash)) setTimeout(() => scrollToHash(initialHash), reduced ? 0 : 600);
}

/* Start: play full intro naturally from beginning to end; skip if returning from /our-story or reduced motion */
let returnFromStory = false;
try {
  returnFromStory = sessionStorage.getItem('hm-return-home') === '1';
  if (returnFromStory) sessionStorage.removeItem('hm-return-home');
} catch (e) {}
if (reduced || returnFromStory) {
  intro.progress(1);
} else {
  const go = () => intro.play();
  document.fonts && document.fonts.ready ? document.fonts.ready.then(go) : go();
}

/* =================================================================
   SCROLL MOTION SYSTEM
   ================================================================= */
if (!reduced) {
  // hero parallax on exit
  gsap.to('.hero-copy', { yPercent: -18, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('#hero-monk', { yPercent: 10, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  // nav hides on scroll down, shows on scroll up
  const nav = $('#nav');
  ScrollTrigger.create({ start: 120, end: 'max', onUpdate: (s) => nav.classList.toggle('is-hidden', s.direction === 1 && !document.body.classList.contains('menu-open')) });

  // generic fades
  $$('[data-reveal]').forEach((el) => gsap.fromTo(el, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));

  // big headings — masked word rise
  $$('[data-lines]').forEach((el) => {
    const words = splitLines(el);
    gsap.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 1.3, stagger: 0.09, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
  });

  // quote — words light up as you read
  const qWords = splitWords($('.quote-text'));
  gsap.to(qWords, { opacity: 1, stagger: 0.05, ease: 'none', scrollTrigger: { trigger: '.quote-text', start: 'top 80%', end: 'bottom 45%', scrub: 0.6 } });

  // statement — slow, scrubbed word reveal + slight drift
  const sWords = splitWords($('#statement-text'));
  gsap.to(sWords, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: '#statement-text', start: 'top 78%', end: 'bottom 40%', scrub: 1 } });
  gsap.fromTo('#statement-text', { x: '4vw' }, { x: 0, ease: 'none', scrollTrigger: { trigger: '.statement', start: 'top bottom', end: 'bottom top', scrub: true } });

  // product image masks
  $$('.product').forEach((p, i) => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: p, start: 'top 85%' } });
    tl.to($('.product-media', p), { clipPath: 'inset(0% 0 0 0)', duration: 1.4, ease: 'expo.inOut', delay: (i % 4) * 0.1 })
      .to($('img', p), { scale: 1, duration: 1.8, ease: 'expo.out' }, '<0.2')
      .from([$('.product-idx', p), $('h3', p), $('p', p), $('.product-links', p)], { opacity: 0, y: 24, stagger: 0.08, duration: 0.9, ease: 'power3.out' }, '<0.4');
  });

  // proof back panel — border draws, rows stagger
  const panelTl = gsap.timeline({ scrollTrigger: { trigger: '#back-panel', start: 'top 80%' } });
  panelTl.from('#back-panel', { clipPath: 'inset(0 100% 0 0)', duration: 1.2, ease: 'expo.inOut' })
    .from('#back-panel .eyebrow, #back-panel .panel-title', { opacity: 0, y: 20, stagger: 0.08, duration: 0.8 }, '-=0.4')
    .from('.panel-row', { opacity: 0, x: -20, stagger: 0.12, duration: 0.8, ease: 'power3.out' }, '-=0.5')
    .fromTo('.cert', { backgroundColor: 'rgba(0,0,0,0)' }, { backgroundColor: 'rgba(0,0,0,.08)', duration: 0.4, yoyo: true, repeat: 1 });

  // kitchen — reveal masks + parallax
  $$('.k-img').forEach((fig, i) => {
    gsap.to($('.k-inner', fig), { clipPath: 'inset(0 0 0% 0)', duration: 1.5, ease: 'expo.inOut', delay: i * 0.15, scrollTrigger: { trigger: '.kitchen-media', start: 'top 80%' } });
    gsap.fromTo($('img', fig), { yPercent: -12 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  gsap.fromTo('.k-img-2', { y: 60 }, { y: -40, ease: 'none', scrollTrigger: { trigger: '.kitchen', start: 'top bottom', end: 'bottom top', scrub: true } });

  // footer wordmark slides in
  gsap.fromTo('.footer-big', { xPercent: 12 }, { xPercent: 0, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });

  // active nav link
  ['shop', 'story', 'pure', 'faq'].forEach((id) => {
    ScrollTrigger.create({ trigger: `#${id}`, start: 'top 50%', end: 'bottom 50%', onToggle: (s) => $(`#nav-${id}`).classList.toggle('is-active', s.isActive) });
  });
} else {
  $$('.product-media, .k-inner').forEach((el) => (el.style.clipPath = 'none'));
  $$('.product-media img').forEach((el) => (el.style.transform = 'none'));
  $$('.quote-text, #statement-text').forEach((el) => (el.style.opacity = 1));
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

  // Build graduation ticks (24 fine scale marks)
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

  const trail = []; // { y, alpha, spread }
  const particles = []; // { x, y, vx, vy, r, alpha, decay }

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

  // Drag & click-to-scroll
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
    if (document.body.classList.contains('is-intro')) return;
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

  // 60fps render loop linked to GSAP ticker
  gsap.ticker.add(() => {
    if (document.body.classList.contains('is-intro')) return;

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

    // Position thumb & progress beam
    thumb.style.transform = `translate3d(-50%, ${thumbTop.toFixed(2)}px, 0)`;
    beam.style.transform = `translateX(-50%) scaleY(${smoothProgress.toFixed(4)})`;

    // Liquid-motion stretch & morph on core
    const stretchY = reduced ? 1 : 1 + Math.min(speed * 0.038, 0.65);
    const squeezeX = reduced ? 1 : 1 - Math.min(speed * 0.008, 0.22);
    thumbCore.style.transform = `scale(${squeezeX.toFixed(3)}, ${stretchY.toFixed(3)})`;

    // Telemetry readout & ARIA
    const pctInt = Math.round(smoothProgress * 100);
    readout.textContent = String(pctInt).padStart(2, '0');
    sb.setAttribute('aria-valuenow', String(pctInt));

    // Update graduation ticks with proximity wave
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

    // Record light trail point when moving
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

    // Draw canvas: comet wake + ambient halo + energy particles
    ctx.clearRect(0, 0, cw, ch);
    if (reduced) return;

    const trackCenterX = cw - (window.innerWidth <= 860 ? 7 : 10);

    // 1. Comet light trail ribbon
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

    // 2. Dynamic energy aura around thumb when moving or hovered
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

    // 3. Luminous energy particles
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

// re-measure once images load (avoids trigger drift)
window.addEventListener('load', () => ScrollTrigger.refresh());
