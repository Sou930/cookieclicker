/**
 * smart-helper.js  ―  Cookie Clicker スマートヘルパー MOD
 */

(function () {
  'use strict';

  /* =========================================================
     設定
  ========================================================= */
  var config = {
    autoBuy          : false,
    autoBuyInterval  : 1000,
    autoGC           : false,
    autoGCInterval   : 500,
    skipWrath        : true,
    autoPopWrinkler  : false,
    autoPopInterval  : 5000,
    skipShinyWrinkler: true,
    showTable        : true,
    tableRows        : 10,
    autoClick        : false,
    autoClickInterval: 50,
  };

  /* =========================================================
     タイマー管理
  ========================================================= */
  var _timers = {};

  function _startTimer(key, fn, ms) {
    _stopTimer(key);
    _timers[key] = setInterval(function () {
      try { fn(); } catch (e) { console.error('[SmartHelper] timer error (' + key + '):', e); }
    }, ms);
  }

  function _stopTimer(key) {
    if (_timers[key]) { clearInterval(_timers[key]); delete _timers[key]; }
  }

  function _stopAllTimers() {
    Object.keys(_timers).forEach(function (k) { _stopTimer(k); });
  }

  /* =========================================================
     安全ガード
  ========================================================= */
  function _gameReady() {
    return (
      typeof Game !== 'undefined' && Game &&
      Game.Objects && Game.UpgradesInStore &&
      Array.isArray(Game.UpgradesInStore)
    );
  }

  function _whenReady(fn, retryMs) {
    retryMs = retryMs || 1000;
    function check() {
      if (_gameReady()) {
        try { fn(); } catch (e) { console.error('[SmartHelper] ready hook error:', e); }
        return;
      }
      setTimeout(check, retryMs);
    }
    check();
  }

  function _safeBodyAppend(el) {
    if (document.body) { document.body.appendChild(el); return true; }
    setTimeout(function () { _safeBodyAppend(el); }, 300);
    return false;
  }

  /* =========================================================
     効率計算
     参考: Cookie Clicker Calculator (https://javascriptplayground.web.fc2.com/)
     効率 = 次の1個のコスト / 購入によるΔCpS
     これにより「元を取るまでの秒数」に相当する値で順位付けする。
  ========================================================= */
  function _currentCps() {
    if (!_gameReady()) return 1;
    var cps = (Game.cookiesPs || 0) * (1 - (Game.cpsSucked || 0)) + (Game.computedMouseCps || 0);
    return Math.max(cps, 0.0001);
  }

  /**
   * 建物を1個追加したときのΔCpSを計算する。
   * Game.cookiesPs の差分として取得するため、一時的に amount を+1して
   * CalculateGains を呼び、差を測定してから元に戻す。
   * これにより HTML Calculator と同等のシナジー・マルチプライヤー込みの
   * 正確なΔCpSが得られる。
   */
  function _buildingDeltaCps(obj) {
    if (!obj) return 0;
    try {
      var before = Game.cookiesPs;
      obj.amount += 1;
      Game.CalculateGains();
      var after = Game.cookiesPs;
      obj.amount -= 1;
      Game.CalculateGains();
      return Math.max(after - before, 0);
    } catch (e) {
      // フォールバック: storedCps * globalCpsMult
      return (obj.storedCps || 0) * (Game.globalCpsMult || 1);
    }
  }

  function _buildingEfficiency(obj) {
    if (!obj) return Infinity;
    var price    = obj.price || 0;
    var deltaCps = _buildingDeltaCps(obj);
    if (deltaCps <= 0) return Infinity;
    // 効率 = コスト / ΔCpS (秒単位の回収時間)
    return price / deltaCps;
  }

  function _upgradeEfficiency(up) {
    if (!up || typeof up.getPrice !== 'function') return Infinity;
    // アップグレードはΔCpSが取れないためコスト/現CpSで近似
    return up.getPrice() / _currentCps();
  }

  function _getRankedList() {
    if (!_gameReady()) return [];
    var list = [];

    for (var name in Game.Objects) {
      if (!Object.prototype.hasOwnProperty.call(Game.Objects, name)) continue;
      var obj = Game.Objects[name];
      if (!obj) continue;
      list.push({
        name   : obj.name || name,
        price  : obj.price || 0,
        eff    : _buildingEfficiency(obj),
        canBuy : (Game.cookies || 0) >= (obj.price || 0),
        type   : 'building',
        ref    : obj
      });
    }

    for (var i = 0; i < Game.UpgradesInStore.length; i++) {
      var up = Game.UpgradesInStore[i];
      if (!up || up.bought) continue;
      if (up.pool === 'prestige' || up.pool === 'debug' || up.pool === 'toggle') continue;
      if (typeof up.isVaulted === 'function' && up.isVaulted()) continue;
      if (up.priceLumps > 0) continue;
      list.push({
        name   : up.dname || up.name || ('upgrade-' + i),
        price  : typeof up.getPrice === 'function' ? up.getPrice() : (up.price || 0),
        eff    : _upgradeEfficiency(up),
        canBuy : typeof up.canBuy === 'function' ? up.canBuy() : false,
        type   : 'upgrade',
        ref    : up
      });
    }

    list.sort(function (a, b) { return a.eff - b.eff; });
    return list;
  }

  function _shortNum(n) {
    if (n === Infinity) return '∞';
    if (typeof n !== 'number' || isNaN(n)) return '0';
    var units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    var i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return (i === 0 ? Math.round(n) : n.toFixed(2)) + units[i];
  }

  /* =========================================================
     自動クッキークリック
  ========================================================= */
  function _autoClickTick() {
    if (!_gameReady() || Game.OnAscend) return;
    try {
      var cookie = document.getElementById('bigCookie');
      if (cookie) cookie.click();
    } catch (e) { console.error('[SmartHelper] autoClick error:', e); }
  }

  /* =========================================================
     自動購入
  ========================================================= */
  function _autoBuyTick() {
    if (!_gameReady() || Game.OnAscend || Game.AscendTimer > 0) return;
    var list = _getRankedList();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item.canBuy) continue;
      try { item.ref.buy(1); return; } catch (e) { console.error('[SmartHelper] autoBuy error:', e); }
    }
  }

  /* =========================================================
     自動ゴールデンクッキークリック
  ========================================================= */
  function _autoGCTick() {
    if (!_gameReady() || Game.OnAscend) return;
    var shimmers = Game.shimmers || [];
    for (var i = shimmers.length - 1; i >= 0; i--) {
      var s = shimmers[i];
      if (!s) continue;
      if (s.type !== 'golden' && s.type !== 'reindeer') continue;
      if (config.skipWrath && s.wrath) continue;
      try { if (typeof s.pop === 'function') s.pop(); } catch (e) { console.error('[SmartHelper] autoGC error:', e); }
    }
  }

  /* =========================================================
     自動ラッパーpop
  ========================================================= */
  function _autoPopWrinklerTick() {
    if (!_gameReady()) return;
    var wrinklers = Game.wrinklers || [];
    for (var i = 0; i < wrinklers.length; i++) {
      var w = wrinklers[i];
      if (!w || w.phase !== 2) continue;
      if (config.skipShinyWrinkler && w.type === 1) continue;
      try { w.hp = 0; } catch (e) { console.error('[SmartHelper] wrinkler error:', e); }
    }
  }

  /* =========================================================
     ドラッグ機能
  ========================================================= */
  function _makeDraggable(el, handle) {
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var startX = e.clientX - el.offsetLeft;
      var startY = e.clientY - el.offsetTop;
      handle.style.cursor = 'grabbing';

      function onMove(e) {
        var nx = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  e.clientX - startX));
        var ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, e.clientY - startY));
        el.style.left   = nx + 'px';
        el.style.top    = ny + 'px';
        el.style.right  = 'auto';
        el.style.bottom = 'auto';
      }

      function onUp() {
        handle.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  /* =========================================================
     統合カード UI
  ========================================================= */
  var _cardEl    = null;
  var _activeTab = 'ranking';

  var S = {
    card: [
      'position:fixed',
      'top:44px',
      'right:4px',
      'z-index:99999',
      'background:rgba(12,8,4,0.93)',
      'color:#e8d8b0',
      'font-size:11px',
      'font-family:Georgia,serif',
      'border:1px solid rgba(255,200,100,0.22)',
      'border-radius:6px',
      'box-shadow:0 6px 28px rgba(0,0,0,0.75)',
      'min-width:300px',
      'max-width:340px',
      'overflow:hidden',
    ].join(';'),

    header: [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'background:rgba(255,180,60,0.08)',
      'border-bottom:1px solid rgba(255,200,100,0.18)',
      'padding:6px 10px',
      'cursor:grab',
    ].join(';'),

    tabOn: [
      'display:inline-block',
      'padding:2px 10px',
      'margin-left:3px',
      'border-radius:3px 3px 0 0',
      'background:rgba(255,180,60,0.2)',
      'border:1px solid rgba(255,200,100,0.35)',
      'border-bottom:none',
      'color:#ffd080',
      'cursor:pointer',
      'font-size:10px',
    ].join(';'),

    tabOff: [
      'display:inline-block',
      'padding:2px 10px',
      'margin-left:3px',
      'border-radius:3px 3px 0 0',
      'background:transparent',
      'border:1px solid transparent',
      'color:#806050',
      'cursor:pointer',
      'font-size:10px',
    ].join(';'),

    body: 'padding:8px 10px;',

    row: [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'padding:5px 0',
      'border-bottom:1px solid rgba(255,200,100,0.07)',
    ].join(';'),

    toggleOn: [
      'cursor:pointer',
      'min-width:38px',
      'text-align:center',
      'padding:2px 7px',
      'border-radius:3px',
      'background:rgba(80,190,70,0.22)',
      'border:1px solid rgba(100,200,80,0.45)',
      'color:#7ed87e',
      'font-size:10px',
    ].join(';'),

    toggleOff: [
      'cursor:pointer',
      'min-width:38px',
      'text-align:center',
      'padding:2px 7px',
      'border-radius:3px',
      'background:rgba(50,50,50,0.4)',
      'border:1px solid rgba(100,100,100,0.3)',
      'color:#555',
      'font-size:10px',
    ].join(';'),
  };

  function _buildCard() {
    if (_cardEl) return;
    _cardEl = document.createElement('div');
    _cardEl.id = 'smartHelperCard';
    _cardEl.style.cssText = S.card;
    _safeBodyAppend(_cardEl);
    _renderCard();
  }

  function _removeCard() {
    if (_cardEl && _cardEl.parentNode) _cardEl.parentNode.removeChild(_cardEl);
    _cardEl = null;
  }

  function _renderCard() {
    if (!_cardEl) return;

    // ---- ヘッダー ----
    var html =
      '<div class="sh-drag" style="' + S.header + '">' +
        '<span style="color:#ffd080;font-size:12px;letter-spacing:0.5px;">🍪 SmartHelper</span>' +
        '<div>' +
          '<span style="' + (_activeTab === 'ranking'  ? S.tabOn : S.tabOff) + '" onclick="SmartHelper._tab(\'ranking\')">📊 ランキング</span>' +
          '<span style="' + (_activeTab === 'settings' ? S.tabOn : S.tabOff) + '" onclick="SmartHelper._tab(\'settings\')">⚙️ 設定</span>' +
        '</div>' +
      '</div>';

    // ---- ランキングタブ ----
    if (_activeTab === 'ranking') {
      var cps  = _gameReady() ? _currentCps() : 0;
      var list = _gameReady() ? _getRankedList().slice(0, config.tableRows) : [];

      html += '<div style="' + S.body + '">';
      html += '<div style="opacity:0.45;font-size:10px;margin-bottom:5px;">CpS: ' + _shortNum(cps) + '</div>';
      html += '<table style="border-collapse:collapse;width:100%;">';
      html +=   '<tr style="opacity:0.45;font-size:10px;border-bottom:1px solid rgba(255,200,100,0.15);">' +
                  '<td style="padding:2px 3px;">名前</td>' +
                  '<td style="text-align:right;padding:2px 3px;">コスト</td>' +
                  '<td style="text-align:right;padding:2px 3px;">回収(秒)</td>' +
                '</tr>';

      if (list.length === 0) {
        html += '<tr><td colspan="3" style="opacity:0.3;padding:10px 0;text-align:center;">データなし</td></tr>';
      }
      for (var i = 0; i < list.length; i++) {
        var item    = list[i];
        var color   = item.canBuy ? '#7ed87e' : '#c0b898';
        var badge   = item.type === 'upgrade' ? '<span style="color:#ffd080;">▲</span>' : '🏠';
        var payback = item.eff === Infinity ? '∞' : _shortNum(item.eff) + 's';
        html +=
          '<tr style="color:' + color + ';border-bottom:1px solid rgba(255,200,100,0.05);">' +
            '<td style="padding:2px 3px;">' + badge + ' ' + item.name + '</td>' +
            '<td style="text-align:right;padding:2px 3px;">' + _shortNum(item.price) + '</td>' +
            '<td style="text-align:right;padding:2px 3px;">' + payback + '</td>' +
          '</tr>';
      }
      html += '</table></div>';
    }

    // ---- 設定タブ ----
    if (_activeTab === 'settings') {
      function row(key, label, desc) {
        var on = !!config[key];
        return (
          '<div style="' + S.row + '">' +
            '<div>' +
              '<div>' + label + '</div>' +
              (desc ? '<div style="color:#705040;font-size:10px;margin-top:1px;">' + desc + '</div>' : '') +
            '</div>' +
            '<div style="' + (on ? S.toggleOn : S.toggleOff) + '" onclick="SmartHelper.toggle(\'' + key + '\');return false;">' +
              (on ? 'ON' : 'OFF') +
            '</div>' +
          '</div>'
        );
      }

      html += '<div style="' + S.body + '">' +
        row('autoClick',         '🖱️ 自動クリック',      '毎' + config.autoClickInterval + 'msクッキーをクリック') +
        row('autoBuy',           '🛒 自動購入',           '最効率の建物・アップグレードを自動購入') +
        row('autoGC',            '✨ GC自動クリック',     'ゴールデンクッキーを自動でクリック') +
        row('skipWrath',         '😈 Wrathスキップ',      '怒りクッキーはスキップ') +
        row('autoPopWrinkler',   '🐛 ラッパー自動pop',   'ラッパーを自動で破裂させる') +
        row('skipShinyWrinkler', '✨ 光るラッパー除外',   '光るラッパーはpopしない') +
        row('showTable',         '📊 ランキング自動更新', '2秒ごとにランキングを更新') +
        '</div>';
    }

    _cardEl.innerHTML = html;
    _makeDraggable(_cardEl, _cardEl.querySelector('.sh-drag'));
  }

  /* =========================================================
     公開API
  ========================================================= */
  window.SmartHelper = {
    config: config,

    _tab: function (tab) {
      _activeTab = tab;
      _renderCard();
    },

    toggle: function (key) {
      if (typeof config[key] !== 'boolean') return;
      config[key] = !config[key];
      _applyConfig();
      _renderCard();
    },

    setConfig: function (key, val) {
      config[key] = val;
      _applyConfig();
      _renderCard();
    }
  };

  /* =========================================================
     設定反映
  ========================================================= */
  function _applyConfig() {
    config.showTable
      ? _startTimer('table', _renderCard, 2000)
      : _stopTimer('table');

    config.autoClick
      ? _startTimer('autoClick', _autoClickTick, config.autoClickInterval)
      : _stopTimer('autoClick');

    config.autoBuy
      ? _startTimer('autoBuy', _autoBuyTick, config.autoBuyInterval)
      : _stopTimer('autoBuy');

    config.autoGC
      ? _startTimer('autoGC', _autoGCTick, config.autoGCInterval)
      : _stopTimer('autoGC');

    config.autoPopWrinkler
      ? _startTimer('autoPopWrinkler', _autoPopWrinklerTick, config.autoPopInterval)
      : _stopTimer('autoPopWrinkler');
  }

  /* =========================================================
     MOD登録
  ========================================================= */
  if (window.CookieClickerMods && typeof window.CookieClickerMods.register === 'function') {
    window.CookieClickerMods.register({
      id: 'smart-helper',

      init: function () {
        _whenReady(function () {
          _buildCard();
          _applyConfig();
          _startTimer('table', _renderCard, 2000);
          console.log('[SmartHelper] 起動。window.SmartHelper.config で設定変更可能。');
        }, 1000);
      },

      disable: function () {
        _stopAllTimers();
        _removeCard();
        console.log('[SmartHelper] 停止。');
      }
    });
  } else {
    console.error('[SmartHelper] CookieClickerMods が見つかりません');
  }

})();
