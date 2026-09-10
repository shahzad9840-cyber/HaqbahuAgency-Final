/* Prop Admin Panel — listings logic
   Category tabs (Rent / Commercial) + form fields + preview grid + modal */

(function () {
  'use strict';

  var STORAGE_KEY = 'prop_admin_listings_v1';
  var activeCategory = 'rent';
  var listings = [];
  var photoCache = {};          // id -> dataURL (bade photos localStorage me nahi jaate)
  var pendingPhoto = '';        // abhi form me chuni gayi photo (dataURL ya '')
  var pendingPhotoToken = 0;    // har nayi selection pe badhta hai - purana FileReader result chhod dene ke liye

  /* ---------- chhote helpers ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value == null ? '' : el.value).trim() : '';
  }

  function numVal(id) {
    var raw = val(id);
    if (raw === '') return '';
    var n = Number(raw);
    return isNaN(n) ? '' : n;
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(n) {
    if (n === '' || n === null || typeof n === 'undefined') return '—';
    try { return '\u20B9' + Number(n).toLocaleString('en-IN'); }
    catch (e) { return '\u20B9' + n; }
  }

  function makeId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- storage (content:// me fail ho sakta hai) ---------- */

  var PHOTO_KEY = 'prop_admin_photos_v1';   // photos alag key me — listings ka setItem quota se na mare

  function saveAll() {
    try {
      var lean = listings.map(function (item) {
        var copy = {};
        for (var k in item) {
          if (Object.prototype.hasOwnProperty.call(item, k) && k !== 'photo') copy[k] = item[k];
        }
        return copy;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lean));
    } catch (e) { /* storage band hai — memory me hi chalega */ }

    try {
      var pics = {};
      listings.forEach(function (item) {
        var src = item.photo || photoCache[item.id] || '';
        if (item.id && src) pics[item.id] = src;
      });
      localStorage.setItem(PHOTO_KEY, JSON.stringify(pics));
    } catch (e) { /* photo quota bhar gaya — listings phir bhi safe */ }
  }

  function loadPhotos() {
    try {
      var raw = localStorage.getItem(PHOTO_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch (e) { return {}; }
  }

  function loadAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      var list = Array.isArray(parsed) ? parsed : [];
      var pics = loadPhotos();
      photoCache = {};
      list.forEach(function (item) {
        if (!item || !item.id) return;
        var src = item.photo || pics[item.id] || '';
        if (src) {
          item.photo = src;              // item me wapas daala, warna cardEl/mediaMarkup khali
          photoCache[item.id] = src;     // aur cache bhi bhar diya
        }
      });
      return list;
    } catch (e) { return []; }
  }

  /* ---------- category tabs ---------- */

  var CATEGORIES = ['rent', 'commercial'];

  function normalizeCategory(cat) {
    var c = String(cat == null ? '' : cat).toLowerCase();
    return CATEGORIES.indexOf(c) !== -1 ? c : 'rent';
  }

  function setCategory(cat) {
    activeCategory = normalizeCategory(cat);

    $$('.tab').forEach(function (tab) {
      var isActive = tab.getAttribute('data-category') === activeCategory;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // form ka dropdown bhi saath chalega
    var select = document.getElementById('category');
    if (select) {
      select.value = activeCategory;
      // agar option maujood na ho to value chup-chaap khaali ho jaati hai — pehli category par gira do
      if (select.value !== activeCategory) select.value = CATEGORIES[0];
    }

    syncFields();
    render();
  }

  /* category ke hisaab se form fields dikhao / chhupao.
     data-cat="rent commercial" — dono me dikhega. data-cat nahi to sab me. */
  function syncFields() {
    $$('[data-cat]').forEach(function (field) {
      var list = String(field.getAttribute('data-cat') || '').split(/\s+/);
      var show = list.indexOf(activeCategory) !== -1;

      // .field pe display:flex hai, isliye [hidden] kaam nahi karta — inline display lagao
      field.style.display = show ? '' : 'none';
    });
  }

  function initTabs() {
    var tabs = $$('.tabs .tab');
    if (!tabs.length) return;

    tabs.forEach(function (tab) {
      var cat = normalizeCategory(tab.getAttribute('data-category'));
      tab.setAttribute('data-category', cat);
      tab.addEventListener('click', function () {
        setCategory(cat);
      });
    });

    // pehle se is-active wala tab jeeta — warna pehla tab
    var start = tabs.filter(function (t) {
      return t.classList.contains('is-active');
    })[0] || tabs[0];
    setCategory(start.getAttribute('data-category'));
  }

  /* ---------- photo ---------- */

  function initPhoto() {
    var input = document.getElementById('photo');
    if (!input) return;

    var photoToken = 0;                 // har selection ka apna token — purani read haare
    input.addEventListener('change', function () {
      var token = ++photoToken;
      // purani chuni hui photo hata do — nayi file padhne se pehle
      pendingPhoto = '';
      var file = input.files && input.files[0];
      if (!file) { return; }

      var reader = new FileReader();
      reader.onload = function () {
        if (token !== photoToken) return;   // beech me nayi photo chuni gayi — ye purani hai
        pendingPhoto = String(reader.result || '');
      };
      reader.onerror = function () { pendingPhoto = ''; };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- card render ---------- */

  function mediaMarkup(item) {
    var src = photoCache[item.id] || item.photo || '';
    if (src) {
      return '<img src="' + esc(src) + '" alt="' + esc(item.title || 'Property photo') + '">';
    }
    return '<span aria-hidden="true">\uD83C\uDFE0</span>';
  }

  function metaLines(item) {
    var bits = [];
    if (item.location) bits.push('\uD83D\uDCCD ' + esc(item.location));
    if (item.area !== '' && item.area != null) bits.push('\uD83D\uDCD0 ' + esc(item.area) + ' sq ft');
    if (item.type) bits.push('\uD83C\uDFF7 ' + esc(item.type));
    if (item.bedrooms !== '' && item.bedrooms != null) bits.push('\uD83D\uDECF ' + esc(item.bedrooms) + ' BHK');
    if (item.kitchens !== '' && item.kitchens != null) bits.push('\uD83C\uDF73 ' + esc(item.kitchens) + ' kitchen');
    if (item.address) bits.push('\uD83D\uDCCD ' + esc(item.address));
    return bits;
  }

  function cardEl(item) {
    var card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('data-category', item.category || 'rent');

    var meta = metaLines(item).map(function (line) {
      return '<p class="card-meta">' + line + '</p>';
    }).join('');

    card.innerHTML =
      '<div class="card-media">' +
        mediaMarkup(item) +
        '<span class="card-badge">' + esc(item.category || 'rent') + '</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-title">' + esc(item.title || 'Untitled listing') + '</h3>' +
        '<p class="card-price">' + esc(money(item.price)) +
          '<span class="card-meta"> / month</span></p>' +
        meta +
        (item.notes ? '<p class="card-notes">' + esc(item.notes) + '</p>' : '') +
        '<div class="card-actions">' +
          '<button class="btn btn-ghost" type="button" data-action="view">View</button>' +
          '<button class="btn btn-ghost" type="button" data-action="delete">Delete</button>' +
        '</div>' +
      '</div>';

    card.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action === 'view') openModal(item);
      if (action === 'delete') removeListing(item.id);
    });

    return card;
  }

  function render() {
    var grid = document.getElementById('previewGrid');
    var empty = document.getElementById('emptyState');
    var count = document.getElementById('listingsCount');
    if (!grid) return;

    var visible = listings.filter(function (item) {
      return (item.category || 'rent') === activeCategory;
    });

    grid.innerHTML = '';

    if (visible.length === 0) {
      if (!empty && grid && grid.parentNode) {
        empty = document.createElement('p');
        empty.id = 'emptyState';
        empty.className = 'empty';
        grid.parentNode.insertBefore(empty, grid.nextSibling);
      }
      if (empty) {
        empty.hidden = false;
        empty.textContent = listings.length
          ? 'Is category me koi listing nahi hai.'
          : 'Abhi koi listing nahi hai.';
      }
      if (count) {
        count.textContent = listings.length
          ? 'Is category me koi listing nahi hai.'
          : 'Abhi koi listing nahi hai.';
      }
      return;
    }

    if (empty) empty.hidden = true;

    var frag = document.createDocumentFragment();
    visible.forEach(function (item) { frag.appendChild(cardEl(item)); });
    grid.appendChild(frag);

    if (count) {
      count.textContent = visible.length + ' listing' + (visible.length > 1 ? 's' : '') +
        ' \u2014 ' + activeCategory;
    }
  }

  /* ---------- add / delete ---------- */

  function readForm() {
    return {
      id: makeId(),
      title: val('title'),
      category: val('category') || activeCategory,
      price: numVal('price'),
      location: val('location'),
      area: numVal('area') === '' ? null : numVal('area'),
      type: val('type'),
      bedrooms: numVal('bedrooms') === '' ? null : numVal('bedrooms'),
      kitchens: numVal('kitchens') === '' ? null : numVal('kitchens'),
      address: val('address'),
      notes: val('notes'),
      photo: pendingPhoto || null,
      createdAt: Date.now()
    };
  }

  function initForm() {
    var form = document.getElementById('uploadForm');
    if (!form) return;

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var item = readForm();
      if (!item.title) { form.reportValidity(); return; }

      if (item.photo) photoCache[item.id] = item.photo;

      listings.unshift(item);
      saveAll();

      activeCategory = item.category;
      setCategory(item.category);

      form.reset();
      pendingPhoto = '';
      var select = document.getElementById('category');
      if (select) select.value = activeCategory;

      var first = document.getElementById('title');
      if (first && first.focus) first.focus();
    });
  }

  function removeListing(id) {
    var ok = true;
    try { ok = window.confirm('Ye listing delete kar dein?'); } catch (e) { ok = true; }
    if (!ok) return;

    listings = listings.filter(function (item) { return item.id !== id; });
    delete photoCache[id];
    saveAll();
    render();
  }

  /* ---------- modal ---------- */

  var lastFocus = null;

  function openModal(item) {
    var modal = document.getElementById('modal');
    var titleEl = document.getElementById('modalTitle');
    var body = document.getElementById('modalBody');
    if (!modal || !body) return;

    if (titleEl) titleEl.textContent = item.title || 'Listing';

    var rows = [
      ['Category', item.category || 'rent'],
      ['Location', item.location || '—'],
      ['Area', (item.area === '' || item.area == null) ? '—' : item.area + ' sq ft'],
      ['Type', item.type || '—'],
      ['Bedrooms', (item.bedrooms === '' || item.bedrooms == null) ? '—' : item.bedrooms],
      ['Kitchens', (item.kitchens === '' || item.kitchens == null) ? '—' : item.kitchens],
      ['Address', item.address || '—']
    ];

    var src = photoCache[item.id] || item.photo || '';

    body.innerHTML =
      (src ? '<img src="' + esc(src) + '" alt="' + esc(item.title || 'Property photo') + '">' : '') +
      '<h4>' + esc(item.title || 'Untitled listing') + '</h4>' +
      '<p class="modal-price">' + esc(money(item.price)) + ' / month</p>' +
      '<dl>' + rows.map(function (r) {
        return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
      }).join('') + '</dl>' +
      (item.notes ? '<p>' + esc(item.notes) + '</p>' : '');

    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    var close = document.getElementById('modalClose');
    if (close && close.focus) close.focus();
  }

  function closeModal() {
    var modal = document.getElementById('modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function initModal() {
    var modal = document.getElementById('modal');
    if (!modal) return;

    var close = document.getElementById('modalClose');
    if (close) close.addEventListener('click', closeModal);

    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) closeModal();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Esc') closeModal();
    });
  }

  /* ---------- boot ---------- */

  /* ---------- password gate ---------- */

  var AUTH_KEY = 'PROP_ADMIN_AUTH_V1';
  var RESET_EMAIL = 'shahzad9840@gmail.com';
  var SEED_PASSWORD = 'admin123';   // pehli baar localStorage khaali ho to yahi default seed set hota hai

  var appReady = false;

  /* Password localStorage me rehta hai (PROP_ADMIN_AUTH_V1).
     Pehli baar khaali ho to default seed set ho jaata hai — user se naya puchne ki zaroorat nahi. */
  var memoryPassword = '';   // localStorage band ho (content:// / private mode) to password yahan rehta hai

  function getStoredPassword() {
    try {
      var stored = String(localStorage.getItem(AUTH_KEY) || '');
      if (stored) return stored;
    } catch (e) { /* storage band — neeche memory se chalega */ }
    return memoryPassword;
  }

  function setStoredPassword(pw) {
    var clean = String(pw == null ? '' : pw);
    memoryPassword = clean;
    try {
      localStorage.setItem(AUTH_KEY, clean);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* localStorage khaali ho to default seed daal do — signup flow hata diya gaya */
  function ensureSeedPassword() {
    if (getStoredPassword() === '') {
      setStoredPassword(SEED_PASSWORD);
    }
  }

  function resetHref() {
    var subject = encodeURIComponent('Prop Admin Panel — Password Reset');
    var body = encodeURIComponent('Prop Admin Panel ka password reset karna hai. Please is email ka reply kijiye.');
    return 'mailto:' + RESET_EMAIL + '?subject=' + subject + '&body=' + body;
  }

  function revealApp() {
    var lock = document.getElementById('lock');
    if (lock) {
      lock.style.display = 'none';
      lock.setAttribute('hidden', 'hidden');
      lock.classList.add('is-hidden');
    }
    document.body.classList.remove('is-locked');
    document.body.classList.add('is-unlocked');
  }

  function initApp() {
    if (appReady) return;
    appReady = true;

    listings = loadAll();
    initTabs();
    initForm();
    initPhoto();
    initModal();
    render();
  }

  function initLock() {
    var lock = document.getElementById('lock');
    var form = document.getElementById('lockForm');
    var input = document.getElementById('lockInput');
    var err = document.getElementById('lockError');
    var forgot = document.getElementById('forgotBtn') || document.getElementById('lockForgot');

    if (!lock || !form || !input) return;   // lock screen hi nahi hai to kuch mat karo

    document.body.classList.add('is-locked');

    /* pehli baar default seed set kar do — user khud password banae, ye flow nahi hai */
    ensureSeedPassword();

    /* "Forgot Password" — reset request seedha mail par */
    if (forgot) {
      forgot.addEventListener('click', function () {
        try { window.location.href = resetHref(); }
        catch (e) { /* mail app na mile to chhod do */ }
      });
    }

    function showError(msg) {
      if (input) input.setAttribute('aria-invalid', 'true');
      if (!err) return;
      err.hidden = false;
      err.textContent = msg;
    }

    function clearError() {
      if (input) input.removeAttribute('aria-invalid');
      if (!err) return;
      err.hidden = true;
      err.textContent = '';
    }

    function unlock() {
      clearError();
      input.value = '';
      revealApp();
      bootApp();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var entered = String(input.value || '');

      if (entered === getStoredPassword()) {
        unlock();
      } else {
        showError('Galat password — dobara try karo.');
        input.value = '';
        if (input.focus) input.focus();
      }
    });
  }

  /* bootApp — lock khulne ke baad app ka poora boot yahin se hota hai
     (initApp appReady guard ke saath sirf ek baar chalta hai) */
  function bootApp() { initApp(); }

  function init() {
    // pehle sirf lock screen dikhe — app unlock ke baad hi chalta hai
    document.body.classList.add('is-locked');
    document.body.classList.remove('is-unlocked');
    initLock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();