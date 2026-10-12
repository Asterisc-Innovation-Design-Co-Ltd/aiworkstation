/* ==========================================================================
   FEELWONDER — 影格序列播放（canvas）
   - 依容器尺寸以 cover 方式繪製，處理 devicePixelRatio
   - 先載入第 1 張並立即顯示；其餘影格低優先順序、由粗到細預載
   - 尚未載入的影格以「最接近且已載入」的影格代替，捲動可逆
   ========================================================================== */
(function (global) {
  'use strict';

  var MAX_DPR = 2;
  var CONCURRENCY = 4;
  /* 平滑：每個畫面往目標進度靠近的比例（1 = 完全跟手） */
  var EASE = 0.18;

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /* 由粗到細的載入順序：先每 16 張取 1 張，再每 8、4、2、1 張補齊，捲動時很快就有可用影格 */
  function progressiveOrder(n) {
    var order = [], seen = new Uint8Array(n);
    [16, 8, 4, 2, 1].forEach(function (step) {
      for (var i = 0; i < n; i += step) {
        if (!seen[i]) { seen[i] = 1; order.push(i); }
      }
    });
    if (!seen[n - 1]) order.push(n - 1);
    return order;
  }

  function FrameSequence(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.focusX = opts.focusX == null ? 0.5 : opts.focusX;
    this.focusY = opts.focusY == null ? 0.5 : opts.focusY;
    this.onFirstFrame = opts.onFirstFrame || null;
    this.progress = 0;   // 目前繪製的進度（平滑後）
    this.target = 0;     // 捲動進度
    this._raf = 0;
    this._drawn = -1;
    this._force = true;
    this.setUrls(opts.urls);
  }

  FrameSequence.prototype.setUrls = function (urls) {
    this.release();
    this.urls = urls.slice();
    this._generation = (this._generation || 0) + 1;
  };

  /* 釋放已載入的影格（離開視窗很遠時呼叫，降低記憶體用量；影格仍在瀏覽器快取中） */
  FrameSequence.prototype.release = function () {
    this.images = [];
    this.loaded = [];
    this._queue = null;
    this._active = 0;
    this._preloading = false;
    this._drawn = -1;
    this._force = true;
    this._generation = (this._generation || 0) + 1;
  };

  FrameSequence.prototype._load = function (i, priority) {
    var self = this, gen = this._generation;
    if (this.images[i]) return this.images[i]._promise;
    var img = new Image();
    img.decoding = 'async';
    if ('fetchPriority' in img) img.fetchPriority = priority || 'low';
    img._promise = new Promise(function (resolve) {
      img.onload = function () {
        var ready = img.decode ? img.decode().catch(function () {}) : Promise.resolve();
        ready.then(function () {
          if (gen !== self._generation) return resolve(null);
          self.loaded[i] = true;
          self._onLoaded(i);
          resolve(img);
        });
      };
      img.onerror = function () { resolve(null); };
    });
    img.src = this.urls[i];
    this.images[i] = img;
    return img._promise;
  };

  /* 立即載入並顯示第 1 張 */
  FrameSequence.prototype.loadFirst = function () {
    var self = this;
    return this._load(0, 'high').then(function (img) {
      if (img && self.onFirstFrame) self.onFirstFrame();
      return img;
    });
  };

  /* 以低優先順序預載其餘影格 */
  FrameSequence.prototype.preload = function () {
    if (this._preloading) return;
    this._preloading = true;
    var self = this, gen = this._generation;
    this.loadFirst();
    this._queue = progressiveOrder(this.urls.length);
    function next() {
      if (gen !== self._generation || !self._queue || !self._queue.length) return;
      var i = self._queue.shift();
      if (self.images[i]) { next(); return; }
      self._active++;
      self._load(i, 'low').then(function () {
        self._active--;
        next();
      });
    }
    for (var k = 0; k < CONCURRENCY; k++) next();
  };

  FrameSequence.prototype._target = function () {
    return Math.round(this.progress * (this.urls.length - 1));
  };

  FrameSequence.prototype._onLoaded = function (i) {
    if (this._drawn < 0) { this._schedule(); return; }
    var t = this._target();
    if (Math.abs(i - t) < Math.abs(this._drawn - t)) this._schedule();
  };

  /* 設定捲動進度；immediate 為 true 時不做平滑（例如重新計算版面後） */
  FrameSequence.prototype.setProgress = function (p, immediate) {
    this.target = clamp(p, 0, 1);
    if (immediate) this.progress = this.target;
    this._schedule();
  };

  FrameSequence.prototype._schedule = function () {
    if (this._raf) return;
    var self = this;
    this._raf = requestAnimationFrame(function () {
      self._raf = 0;
      var diff = self.target - self.progress;
      if (Math.abs(diff) * (self.urls.length - 1) < 0.5) {
        self.progress = self.target;
      } else {
        self.progress += diff * EASE;
        self._schedule();
      }
      self._draw();
    });
  };

  FrameSequence.prototype._nearestLoaded = function (t) {
    var n = this.urls.length;
    if (this.loaded[t]) return t;
    for (var d = 1; d < n; d++) {
      if (t - d >= 0 && this.loaded[t - d]) return t - d;
      if (t + d < n && this.loaded[t + d]) return t + d;
    }
    return -1;
  };

  FrameSequence.prototype._draw = function () {
    var idx = this._nearestLoaded(this._target());
    if (idx < 0) return;
    if (idx === this._drawn && !this._force) return;
    var img = this.images[idx], c = this.canvas, ctx = this.ctx;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih || !c.width || !c.height) return;
    var s = Math.max(c.width / iw, c.height / ih);
    var dw = iw * s, dh = ih * s;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (c.width - dw) * this.focusX, (c.height - dh) * this.focusY, dw, dh);
    this._drawn = idx;
    this._force = false;
  };

  /* 依容器尺寸與 devicePixelRatio 調整 canvas 解析度 */
  FrameSequence.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(global.devicePixelRatio || 1, MAX_DPR);
    var w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this._force = true;
    this._draw();
  };

  global.FrameSequence = FrameSequence;
})(window);
