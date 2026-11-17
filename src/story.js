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

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------- inject art ---------- */
const monkContainer = $('#story-monk');
if (monkContainer) monkContainer.innerHTML = monkSVG;
$$('[data-logo]').forEach((el) => (el.innerHTML = logoSVG));

/* ---------- return-to-home flag ---------- */
$$('[data-return-home]').forEach((link) => {
  link.addEventListener('click', () => {
    try {
      sessionStorage.setItem('hm-return-home', '1');
    } catch (_) {}
  });
});

/* ---------- smooth scroll ---------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* =================================================================
   MASCOT ENTRANCE ON OUR STORY PAGE
   ================================================================= */
if (!reduced && $('#story-monk-stage')) {
  gsap.timeline({ defaults: { ease: 'power3.out' } })
    .fromTo('#story-monk-stage', { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 1.15, ease: 'expo.inOut' }, 0.1)
    .fromTo('#story-monk', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out' }, 0.45);
}

/* =================================================================
   EDITORIAL ANIMATIONS — headings, paragraphs, kitchen images
   ================================================================= */
if (!reduced) {
  // Hero Section 1 reveals
  const heroLines = $$('#story-main-heading .line > span');
  gsap.fromTo(heroLines, { yPercent: 112 }, { yPercent: 0, duration: 1.15, stagger: 0.14, ease: 'expo.out', delay: 0.15 });

  const s1Reveals = $$('.story-hero-section [data-reveal]');
  gsap.fromTo(s1Reveals, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.95, stagger: 0.12, ease: 'power3.out', delay: 0.25 });

  // Kitchen Section 2 heading & text reveals on scroll
  const kitchenLines = $$('#story-kitchen-heading .line > span');
  gsap.fromTo(
    kitchenLines,
    { yPercent: 112 },
    {
      yPercent: 0,
      duration: 1.15,
      stagger: 0.14,
      ease: 'expo.out',
      scrollTrigger: { trigger: '#story-kitchen', start: 'top 82%' },
    }
  );

  $$('.story-kitchen-section [data-reveal]').forEach((el, i) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.95,
        delay: i * 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' },
      }
    );
  });

  // Kitchen food image mask reveals
  $$('.story-food-card').forEach((card, i) => {
    const mask = $('.story-food-mask', card);
    const img = $('img', card);
    const tl = gsap.timeline({ scrollTrigger: { trigger: card, start: 'top 84%' } });
    tl.to(mask, { clipPath: 'inset(0% 0 0 0)', duration: 1.35, ease: 'expo.inOut', delay: i * 0.14 })
      .to(img, { scale: 1, duration: 1.65, ease: 'expo.out' }, '<0.15');
  });
} else {
  $$('.story-food-mask').forEach((el) => (el.style.clipPath = 'none'));
  $$('.story-food-mask img').forEach((el) => (el.style.transform = 'none'));
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
