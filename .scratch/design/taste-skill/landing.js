/* Суралц landing: scroll reveal + credit calculator. Everything works without JS (content is visible by default). */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Scroll reveal: once per element, opacity + 16px rise, 700ms. Skipped under reduced motion. */
  const items = [...document.querySelectorAll('[data-reveal]')];
  if (!reduce && 'IntersectionObserver' in window) {
    root.classList.add('rv');
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    items.forEach((el) => {
      /* anything already on screen at load is shown at once */
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.9) el.classList.add('is-in'); else io.observe(el);
    });
    /* safety: never leave content hidden */
    setTimeout(() => items.forEach((el) => el.classList.add('is-in')), 6000);
  }

  /* 2. Credit calculator: course price - credits already spent on its lessons, never below 0 */
  const range = document.getElementById('owned');
  if (range) {
    const COURSE = 45, LESSON = 5, MNT = 1000;
    const $ = (id) => document.getElementById(id);
    const fmt = (n) => n.toLocaleString('en-US');
    const upd = () => {
      const owned = +range.value, spent = owned * LESSON;
      const pay = Math.max(0, COURSE - spent);
      $('ownedOut').textContent = owned;
      $('payCr').textContent = pay;
      $('payMnt').textContent = fmt(pay * MNT);
      $('saved').textContent = Math.min(spent, COURSE);
      $('bar').style.setProperty('--sx', pay / COURSE);
      range.style.setProperty('--fill', (owned / range.max * 100) + '%');
    };
    const dots=[...document.querySelectorAll('#dots i')];
    const dotsUpd=()=>dots.forEach((d,i)=>d.classList.toggle('on',i<+range.value));
    range.addEventListener('input',()=>{upd();dotsUpd();});dotsUpd();
    upd();
  }
})();
