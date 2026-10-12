/* ==========================================================================
   FEELWONDER — 企業 AI 需求評估：問卷流程、篩選與送出
   ========================================================================== */
(function () {
  'use strict';

  /* ===== 設定常數（之後調整門檻或連結只需改這裡） ===== */

  /* 篩選：預算為以下任一選項，且時程不是 NURTURE_TIMINGS → 符合條件；否則 → 培養名單 */
  var QUALIFY_BUDGETS = ['10–30 萬', '30–60 萬', '60 萬以上'];
  var NURTURE_TIMINGS = ['先了解看看'];

  /* 外部預約頁（Google 日曆預約頁或 Calendly）網址。未填（非 https 網址）時顯示「我們將於 1 個工作天內聯繫您」 */
  var BOOKING_URL = "【待填】";

  /* 企業 AI 資料外洩自我檢查表下載連結 */
  var CHECKLIST_URL = "【待補】";

  /* 表單送出位址 */
  var SUBMIT_URL = 'api/submit.php';

  /* Cloudflare Turnstile site key；留空時略過驗證（secret 設在 api/config.php） */
  var TURNSTILE_SITE_KEY = '';

  /* ===== 題目（依設計稿） ===== */
  var STEP_TITLES = { 1: '情境與痛點', 2: '規模與資料', 3: '時程與聯絡' };
  var QUESTIONS = {
    1: [
      { key: 'industry', title: '公司所屬產業', opts: ['會計 / 法律事務所', '醫療 / 診所', '製造業', '設計 / 創意', '顧問 / 專業服務', '其他'] },
      { key: 'pain', title: '最想解決的問題', multi: true, opts: ['同仁把資料貼到外部 AI', '內部文件很難找', '老師傅經驗傳承', '新人訓練太花時間', '重複回答相同問題', 'AI 訂閱與用量費用'] },
      { key: 'aiuse', title: '公司目前使用 AI 的狀況', opts: ['還沒開始用', '同仁各自用個人帳號', '公司有付費雲端 AI', '已有內部 AI 系統'] }
    ],
    2: [
      { key: 'size', title: '公司員工人數', opts: ['1–9 人', '10–29 人', '30–99 人', '100 人以上'] },
      { key: 'data', title: '想放進 AI 的資料，敏感程度', opts: ['一般資料', '含客戶個資或財務', '高度機密（合約、設計、製程）'] },
      { key: 'budget', title: '這次 AI 導入的預算', opts: ['尚未規劃', '10 萬以下', '10–30 萬', '30–60 萬', '60 萬以上'] }
    ],
    3: [
      { key: 'timing', title: '希望多快開始', opts: ['一個月內', '三個月內', '半年內', '先了解看看'] },
      { key: 'role', title: '您在這次導入中的角色', opts: ['負責人 / 最終決策者', '主管，參與決策', '承辦人員，負責評估'] }
    ]
  };

  var form = document.getElementById('assessment');
  if (!form) return;

  var panels = Array.prototype.slice.call(form.querySelectorAll('.step-panel'));
  var stepTitle = document.getElementById('step-title');
  var stepNum = document.getElementById('step-num');
  var progressbar = form.querySelector('.progress__bars');
  var bars = Array.prototype.slice.call(progressbar.children);
  var btnBack = document.getElementById('btn-back');
  var btnNext = document.getElementById('btn-next');
  var warnChoice = document.getElementById('warn-choice');
  var warnContact = document.getElementById('warn-contact');
  var CONTACT_WARN = warnContact.textContent;
  var step = 1;
  var submitting = false;
  var turnstileToken = '';

  function isUrl(v) { return /^https:\/\/\S+$/.test(v || ''); }

  /* ---------- 產生題目 ---------- */
  function renderQuestions() {
    var num = 0;
    [1, 2, 3].forEach(function (s) {
      var panel = form.querySelector('.step-panel[data-step="' + s + '"]');
      var before = panel.firstElementChild; // 第 3 步：題目放在聯絡資料之前
      QUESTIONS[s].forEach(function (q) {
        num += 1;
        q.num = num;
        var fs = document.createElement('fieldset');
        fs.className = 'q';
        fs.setAttribute('data-key', q.key);
        var legend = document.createElement('legend');
        legend.textContent = num + '. ' + q.title + ' ';
        if (q.multi) {
          var hint = document.createElement('span');
          hint.className = 'q__hint';
          hint.textContent = '（可複選）';
          legend.appendChild(hint);
        }
        fs.appendChild(legend);
        var choices = document.createElement('div');
        choices.className = 'choices';
        q.opts.forEach(function (opt, i) {
          var label = document.createElement('label');
          label.className = 'choice';
          var input = document.createElement('input');
          input.type = q.multi ? 'checkbox' : 'radio';
          input.name = q.key;
          input.value = opt;
          input.id = 'q-' + q.key + '-' + i;
          var text = document.createElement('span');
          text.textContent = opt;
          label.appendChild(input);
          label.appendChild(text);
          choices.appendChild(label);
        });
        fs.appendChild(choices);
        panel.insertBefore(fs, before);
      });
    });
  }

  function valueOf(q) {
    var inputs = form.querySelectorAll('input[name="' + q.key + '"]:checked');
    var vals = Array.prototype.map.call(inputs, function (el) { return el.value; });
    return q.multi ? vals : (vals[0] || '');
  }

  /* ---------- 步驟切換 ---------- */
  function showStep(n, moveFocus) {
    step = n;
    panels.forEach(function (p) { p.hidden = Number(p.getAttribute('data-step')) !== n; });
    stepTitle.textContent = STEP_TITLES[n];
    stepNum.textContent = n;
    bars.forEach(function (b, i) { b.classList.toggle('is-on', i < n); });
    progressbar.setAttribute('aria-valuenow', String(n));
    progressbar.setAttribute('aria-valuetext', '第 ' + n + ' 步，共 3 步：' + STEP_TITLES[n]);
    btnBack.hidden = n === 1;
    btnNext.textContent = n === 3 ? '送出，取得建議' : '下一步';
    warnChoice.hidden = true;
    warnContact.hidden = true;
    if (n === 3) initTurnstile();
    if (moveFocus) {
      scrollToEl(form);
      stepTitle.focus({ preventScroll: true });
    }
  }

  function scrollToEl(el) {
    var top = el.getBoundingClientRect().top + window.pageYOffset - 24;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
  }

  /* ---------- 驗證 ---------- */
  function missingChoices(n) {
    return QUESTIONS[n].filter(function (q) { return !q.multi && !valueOf(q); });
  }

  function checkChoices(n) {
    var missing = missingChoices(n);
    QUESTIONS[n].forEach(function (q) {
      var fs = form.querySelector('fieldset[data-key="' + q.key + '"]');
      fs.classList.toggle('is-missing', missing.indexOf(q) >= 0);
    });
    if (!missing.length) { warnChoice.hidden = true; return true; }
    warnChoice.hidden = false;
    var first = form.querySelector('fieldset[data-key="' + missing[0].key + '"] input');
    if (first) first.focus();
    return false;
  }

  function checkContact() {
    var name = document.getElementById('f-name');
    var email = document.getElementById('f-email');
    var nameOk = name.value.trim().length > 0;
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    name.setAttribute('aria-invalid', nameOk ? 'false' : 'true');
    email.setAttribute('aria-invalid', emailOk ? 'false' : 'true');
    if (nameOk && emailOk) { warnContact.hidden = true; return true; }
    warnContact.textContent = CONTACT_WARN;
    warnContact.hidden = false;
    (nameOk ? email : name).focus();
    return false;
  }

  /* 選了選項就清除該題的提示 */
  form.addEventListener('change', function (e) {
    var fs = e.target.closest('fieldset.q');
    if (fs && fs.classList.contains('is-missing')) {
      fs.classList.remove('is-missing');
      if (!form.querySelector('.step-panel:not([hidden]) fieldset.is-missing')) warnChoice.hidden = true;
    }
  });
  form.addEventListener('input', function (e) {
    if (e.target.getAttribute('aria-invalid') === 'true') {
      e.target.removeAttribute('aria-invalid');
      if (!form.querySelector('[aria-invalid="true"]')) warnContact.hidden = true;
    }
  });

  /* ---------- 篩選 ---------- */
  function isQualified(ans) {
    return QUALIFY_BUDGETS.indexOf(ans.budget) >= 0 &&
      !!ans.timing && NURTURE_TIMINGS.indexOf(ans.timing) < 0;
  }

  /* ---------- 送出 ---------- */
  function collect() {
    var map = {}, answers = [];
    [1, 2, 3].forEach(function (s) {
      QUESTIONS[s].forEach(function (q) {
        var v = valueOf(q);
        map[q.key] = v;
        answers.push({ key: q.key, question: q.num + '. ' + q.title, answer: q.multi ? v.join('、') : v });
      });
    });
    return { map: map, answers: answers };
  }

  function field(id) { return document.getElementById(id).value.trim(); }

  function submit() {
    if (submitting) return;
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      warnContact.textContent = '正在確認您不是機器人，請稍候再按一次送出。';
      warnContact.hidden = false;
      return;
    }
    submitting = true;
    btnNext.disabled = true;
    btnNext.textContent = '送出中…';

    var data = collect();
    var qualified = isQualified(data.map);
    var payload = {
      answers: data.answers,
      contact: { name: field('f-name'), company: field('f-company'), phone: field('f-phone'), email: field('f-email') },
      result: qualified ? 'qualified' : 'nurture',
      website: document.getElementById('f-website').value,
      turnstileToken: turnstileToken,
      page: location.href
    };

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);

    fetch(SUBMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || !body.ok) throw new Error('HTTP ' + res.status + (body.error ? '：' + body.error : ''));
        });
      })
      .catch(function (err) {
        /* 寄信失敗仍顯示結果頁，只在 console 記錄 */
        console.error('[assessment] 表單送出失敗', err);
      })
      .then(function () {
        clearTimeout(timer);
        showResult(qualified, data.map);
      });
  }

  /* ---------- 結果畫面 ---------- */
  function showResult(qualified, ans) {
    form.hidden = true;
    var section;
    if (qualified) {
      section = document.getElementById('result-qualified');
      document.getElementById('chip-industry').textContent = ans.industry || '產業未填';
      document.getElementById('chip-size').textContent = ans.size || '人數未填';
      document.getElementById('chip-budget').textContent = '預算 ' + (ans.budget || '未填');
      var hasBooking = isUrl(BOOKING_URL);
      Array.prototype.forEach.call(section.querySelectorAll('[data-booking]'), function (el) {
        el.hidden = el.getAttribute('data-booking') !== (hasBooking ? 'on' : 'off');
      });
      if (hasBooking) {
        document.getElementById('booking-frame').src = BOOKING_URL;
        document.getElementById('booking-link').href = BOOKING_URL;
      }
    } else {
      section = document.getElementById('result-nurture');
    }
    section.hidden = false;
    scrollToEl(document.getElementById('main'));
    section.focus({ preventScroll: true });
  }

  /* 檢查表連結 */
  var checklist = document.getElementById('checklist-link');
  if (checklist) {
    if (isUrl(CHECKLIST_URL)) {
      checklist.href = CHECKLIST_URL;
      checklist.textContent = '下載檢查表';
    } else {
      checklist.setAttribute('aria-disabled', 'true');
      checklist.addEventListener('click', function (e) { e.preventDefault(); });
    }
  }

  /* ---------- Cloudflare Turnstile（有 site key 才載入） ---------- */
  var turnstileStarted = false;
  function initTurnstile() {
    if (!TURNSTILE_SITE_KEY || turnstileStarted) return;
    turnstileStarted = true;
    window.fwTurnstileReady = function () {
      window.turnstile.render('#turnstile-box', {
        sitekey: TURNSTILE_SITE_KEY,
        callback: function (token) {
          turnstileToken = token;
          if (warnContact.textContent.indexOf('機器人') >= 0) warnContact.hidden = true;
        },
        'expired-callback': function () { turnstileToken = ''; }
      });
    };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=fwTurnstileReady';
    s.async = true;
    document.head.appendChild(s);
  }

  /* ---------- 事件 ---------- */
  btnBack.addEventListener('click', function () {
    if (step > 1) showStep(step - 1, true);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!checkChoices(step)) return;
    if (step < 3) { showStep(step + 1, true); return; }
    if (!checkContact()) return;
    submit();
  });

  renderQuestions();
  form.hidden = false;
  showStep(1, false);
})();
