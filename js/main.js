/* ==========================================================================
   FEELWONDER — 捲動轉場與進場動畫（GSAP 3.12.5 + ScrollTrigger）
   只在 <html class="motion"> 時由 index.html 載入；GSAP 載入失敗時退回靜態版。
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var MOBILE_QUERY = '(max-width: 767px)';
  var DEFAULT_FRAMES = { desktop: 120, mobile: 60 };
  /* 轉場 ③ 價格標籤切換點（捲動進度 0–1）：入門型／標準型／高效型。
     對齊 lineup 影片中三台主機依序亮起的時間（約 12%、39%、76%）；重做影片後請重新對齊 */
  var LINEUP_STEPS = [0, 0.38, 0.75];
  /* 三台主機在影格中的水平位置（寬度比例）；畫面被裁切時（例如直式手機）鏡頭會平移到亮起的那台 */
  var LINEUP_CENTERS = [0.218, 0.508, 0.795];

  if (!root.classList.contains('motion')) return;
  if (!window.gsap || !window.ScrollTrigger || !window.FrameSequence) {
    root.classList.remove('motion');
    return;
  }

  var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  var mq = window.matchMedia(MOBILE_QUERY);
  var cfg = window.FW_FRAMES || {};

  function variant() { return mq.matches ? 'mobile' : 'desktop'; }

  function frameUrls(name) {
    var vr = variant();
    var n = (cfg[name] && cfg[name][vr]) || DEFAULT_FRAMES[vr];
    var v = cfg.v ? '?v=' + cfg.v : '';
    var urls = [];
    for (var i = 1; i <= n; i++) {
      urls.push('assets/frames/' + name + '/' + vr + '/' + ('000' + i).slice(-4) + '.webp' + v);
    }
    return urls;
  }

  /* ---------- 影格序列：捲動進度 ↔ 影格（可逆） ---------- */
  var sequences = [];

  function setupSequence(section, onProgress, centerX) {
    var seq = new window.FrameSequence({
      canvas: section.querySelector('.scrolly__canvas'),
      urls: frameUrls(section.getAttribute('data-seq')),
      centerX: centerX
    });
    seq.section = section;
    seq.near = false;
    sequences.push(seq);
    seq.resize();

    seq.trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: function (self) {
        seq.setProgress(self.progress);
        if (onProgress) onProgress(self.progress);
      },
      onRefresh: function (self) {
        seq.setProgress(self.progress, true);
        if (onProgress) onProgress(self.progress);
      }
    });
    return seq;
  }

  /* 進入視窗前 1 個螢幕高才預載；離開 3 個螢幕高以上就釋放，避免手機記憶體不足 */
  var nearObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var seq = entry.target._seq;
      if (entry.isIntersecting) { seq.near = true; seq.preload(); }
    });
  }, { rootMargin: '100% 0px 100% 0px' });

  var farObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var seq = entry.target._seq;
      if (!entry.isIntersecting && seq.near) { seq.near = false; seq.release(); }
    });
  }, { rootMargin: '300% 0px 300% 0px' });

  /* 轉場 ① 主視覺 */
  var hero = document.querySelector('.scrolly--hero');
  if (hero) {
    hero._seq = setupSequence(hero);
    var heroFade = hero.querySelectorAll('[data-hero-fade]');
    var heroScrim = hero.querySelector('.scrim--hero');
    var heroEnd = hero.querySelector('[data-hero-end]');
    var heroTimeline = function () {
      return gsap.timeline({
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: true }
      });
    };
    var mm = gsap.matchMedia();
    mm.add('(min-width: 768px)', function () {
      heroTimeline()
        .to(heroFade, { autoAlpha: 0, y: -64, ease: 'power1.in', duration: 0.38 }, 0.1)
        .to(heroScrim, { autoAlpha: 0, ease: 'none', duration: 0.38 }, 0.1)
        .fromTo(heroEnd, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.12 }, 0.82)
        .set({}, {}, 1);
    });
    /* 手機：首屏只有 logo、主標、副標；往下捲一點，按鈕與信任列才浮現 */
    mm.add(MOBILE_QUERY, function () {
      heroTimeline()
        .fromTo(hero.querySelectorAll('.hero__content .btn-row, .hero__trust'),
          { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.1, stagger: 0.04 }, 0.03)
        .to(hero.querySelector('.scroll-cue'), { autoAlpha: 0, ease: 'none', duration: 0.05 }, 0.03)
        .to(hero.querySelector('.hero__content'), { autoAlpha: 0, y: -64, ease: 'power1.in', duration: 0.3 }, 0.32)
        .to(heroScrim, { autoAlpha: 0, ease: 'none', duration: 0.3 }, 0.32)
        .fromTo(heroEnd, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.12 }, 0.82)
        .set({}, {}, 1);
    });
  }

  /* 轉場 ② 文件流入：結尾浮現文字 */
  var inflow = document.querySelector('.scrolly--inflow');
  if (inflow) {
    inflow._seq = setupSequence(inflow);
    gsap.timeline({
      scrollTrigger: { trigger: inflow, start: 'top top', end: 'bottom bottom', scrub: true }
    })
      .fromTo(inflow.querySelector('.scrim--inflow'), { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', duration: 0.16 }, 0.7)
      .fromTo(inflow.querySelector('.inflow__line'), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.16 }, 0.74)
      .set({}, {}, 1);
  }

  /* 轉場 ③ 三機型：依進度切換左上價格標籤 */
  var lineup = document.querySelector('.scrolly--lineup');
  if (lineup) {
    var labels = lineup.querySelectorAll('.lineup__label');
    var tier = 0;
    gsap.set(labels, { autoAlpha: 0 });
    gsap.set(labels[0], { autoAlpha: 1 });
    var showTier = function (i) {
      if (i === tier) return;
      var dir = i > tier ? 1 : -1;
      gsap.to(labels[tier], { autoAlpha: 0, y: -12 * dir, duration: 0.3, ease: 'power2.out', overwrite: true });
      gsap.fromTo(labels[i], { autoAlpha: 0, y: 12 * dir }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out', overwrite: true });
      if (lineup._seq) {
        gsap.to(lineup._seq, { centerX: LINEUP_CENTERS[i], duration: 0.9, ease: 'power2.inOut', overwrite: true, onUpdate: function () { lineup._seq.redraw(); } });
      }
      tier = i;
    };
    lineup._seq = setupSequence(lineup, function (p) {
      showTier(p >= LINEUP_STEPS[2] ? 2 : (p >= LINEUP_STEPS[1] ? 1 : 0));
    }, LINEUP_CENTERS[0]);
  }

  sequences.forEach(function (seq) {
    nearObserver.observe(seq.section);
    farObserver.observe(seq.section);
  });

  /* 視窗尺寸改變：重新計算 canvas 解析度；跨過 768px 時切換桌機／手機影格 */
  var resizeRaf = 0;
  window.addEventListener('resize', function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = 0;
      sequences.forEach(function (seq) { seq.resize(); });
    });
  });
  var onVariantChange = function () {
    sequences.forEach(function (seq) {
      seq.setUrls(frameUrls(seq.section.getAttribute('data-seq')));
      seq.resize();
      if (seq.near) seq.preload();
    });
  };
  if (mq.addEventListener) mq.addEventListener('change', onVariantChange);
  else if (mq.addListener) mq.addListener(onVariantChange);

  /* ---------- 其他區塊：淡入 + 位移 24px（power2.out） ---------- */
  var revealEls = gsap.utils.toArray('[data-reveal]');
  var reveal = function (els) {
    els = els.filter(function (el) { return !el._revealed; });
    if (!els.length) return;
    els.forEach(function (el) { el._revealed = true; revealObserver.unobserve(el); });
    gsap.to(els, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out', stagger: 0.08, overwrite: true });
  };
  var revealObserver = new IntersectionObserver(function (entries) {
    reveal(entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; }));
  }, { rootMargin: '0px 0px -8% 0px' });
  /* 只用 opacity（不用 visibility），讓鍵盤仍能聚焦到尚未淡入的連結 */
  gsap.set(revealEls, { opacity: 0, y: 24 });
  revealEls.forEach(function (el) { revealObserver.observe(el); });
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-reveal]');
    if (el) reveal([el]);
  });

  /* ---------- 轉場 ④ 頁尾循環影片：接近視窗才載入，離開時暫停 ---------- */
  var video = document.querySelector('.cta__video');
  if (video) {
    var activated = false;
    var play = function () {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    };
    var activate = function () {
      activated = true;
      var suffix = mq.matches ? '-mobile' : '';
      video.muted = true;
      video.poster = video.getAttribute('data-poster' + suffix);
      [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(function (t) {
        var source = document.createElement('source');
        source.src = video.getAttribute('data-' + t[0] + suffix);
        source.type = t[1];
        video.appendChild(source);
      });
      video.addEventListener('playing', function () { video.classList.add('is-playing'); });
      video.load();
    };
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        if (!activated) activate();
        play();
      } else if (activated) {
        video.pause();
      }
    }, { rootMargin: '25% 0px 25% 0px' }).observe(video.closest('.cta'));
  }

  /* 字體載入、或 content-visibility 區塊實際排版後，頁面高度會改變：重新計算捲動位置 */
  var refreshTimer = 0;
  var scheduleRefresh = function () {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 150);
  };
  if (window.ResizeObserver) new ResizeObserver(scheduleRefresh).observe(document.getElementById('main'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleRefresh);
})();
