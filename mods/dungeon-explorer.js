/**
 * smart-helper.js  ―  Cookie Clicker スマートヘルパー MOD
 * UI は MOD メニュー内に統合されます。
 */

(function () {
  'use strict';

  /* =========================================================
     設定
  ========================================================= */
  var STORAGE_KEY = 'CC_SmartHelper_Config';
  var config = {
    autoBuy          : false,
    autoBuyInterval  : 1000,
    autoGC           : false,
    autoGCInterval   : 500,
    skipWrath        : true,
    autoPopWrinkler  : false,
    autoPopInterval  : 5000,
    skipShinyWrinkler: true,
    tableRows        : 10,
    autoClick        : false,
    autoClickInterval: 50,
  };

  function _saveConfig() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch(e) {}
  }
  function _loadConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k in saved) if (k in config) config[k] = saved[k];
      }
    } catch(e) {}
  }

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

  /* =========================================================
     効率計算
     建物・アップグレード共に「ΔCpS」を Game.CalculateGains の差分で取得し、
     回収秒 = price / ΔCpS で同じスケールで順位付けする。
  ========================================================= */
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
      return (obj.storedCps || 0) * (Game.globalCpsMult || 1);
    }
  }

  function _upgradeDeltaCps(up) {
    if (!up) return 0;
    try {
      var before = Game.cookiesPs;
      var prev = up.bought;
      up.bought = 1;
      Game.CalculateGains();
      var after = Game.cookiesPs;
      up.bought = prev;
      Game.CalculateGains();
      return Math.max(after - before, 0);
    } catch (e) {
      return 0;
    }
  }

  function _buildingEfficiency(obj) {
    if (!obj) return Infinity;
    var price    = obj.price || 0;
    var deltaCps = _buildingDeltaCps(obj);
    if (deltaCps <= 0) return Infinity;
    return price / deltaCps;
  }

  function _upgradeEfficiency(up) {
    if (!up || typeof up.getPrice !== 'function') return Infinity;
    var price    = up.getPrice();
    var deltaCps = _upgradeDeltaCps(up);
    if (deltaCps <= 0) return Infinity;
    return price / deltaCps;
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
      var eff = _upgradeEfficiency(up);
      // ΔCpS が取れないアップグレード(クリック系・追加要素など)は自動購入対象外
      if (eff === Infinity) continue;
      list.push({
        name   : up.dname || up.name || ('upgrade-' + i),
        price  : typeof up.getPrice === 'function' ? up.getPrice() : (up.price || 0),
        eff    : eff,
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

  function _currentCps() {
    if (!_gameReady()) return 0;
    return (Game.cookiesPs || 0) * (1 - (Game.cpsSucked || 0)) + (Game.computedMouseCps || 0);
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
     MOD メニュー内 UI (settings コールバック)
  ========================================================= */
  function _renderSettings() {
    var html = '';

    // ── 設定トグル ──
    function row(key, label, desc) {
      var on = !!config[key];
      var onStyle  = on  ? 'background:rgba(120,200,100,0.35);border-color:rgba(120,200,100,0.7);' : 'opacity:0.45;';
      var offStyle = !on ? 'background:rgba(200,80,80,0.35);border-color:rgba(200,80,80,0.7);'    : 'opacity:0.45;';
      return (
        '<div class="listing">' +
          '<a class="option smallFancyButton" style="' + onStyle + '" ' +
            'onclick="SmartHelper.toggle(\'' + key + '\', true);return false;">ON</a>' +
          '<a class="option smallFancyButton" style="' + offStyle + '" ' +
            'onclick="SmartHelper.toggle(\'' + key + '\', false);return false;">OFF</a>' +
          ' <b style="margin-left:4px;">' + label + '</b>' +
          (desc ? '<br><label>' + desc + '</label>' : '') +
        '</div>'
      );
    }

    html +=
      row('autoClick',         '🖱️ 自動クリック',      '毎' + config.autoClickInterval + 'msクッキーをクリック') +
      row('autoBuy',           '🛒 自動購入',           '最効率の建物・アップグレードを自動購入') +
      row('autoGC',            '✨ GC自動クリック',     'ゴールデンクッキーを自動でクリック') +
      row('skipWrath',         '😈 Wrathスキップ',      '怒りクッキーはスキップ') +
      row('autoPopWrinkler',   '🐛 ラッパー自動pop',    'ラッパーを自動で破裂させる') +
      row('skipShinyWrinkler', '✨ 光るラッパー除外',   '光るラッパーはpopしない');

    // ── ランキング ──
    var cps  = _currentCps();
    var list = _getRankedList().slice(0, config.tableRows);

    html += '<div style="margin-top:10px;padding:8px;background:rgba(0,0,0,0.25);border-radius:4px;">';
    html += '<div style="opacity:0.6;font-size:11px;margin-bottom:6px;">' +
              '📊 効率ランキング  <span style="float:right;">CpS: ' + _shortNum(cps) +
              '  <a class="option" style="font-size:9px;padding:1px 6px;margin-left:4px;" ' +
              'onclick="Game.UpdateMenu();return false;">⟳更新</a></span>' +
            '</div>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:11px;">';
    html +=   '<tr style="opacity:0.5;border-bottom:1px solid rgba(255,255,255,0.15);">' +
                '<td style="padding:2px 4px;">名前</td>' +
                '<td style="text-align:right;padding:2px 4px;">コスト</td>' +
                '<td style="text-align:right;padding:2px 4px;">回収(秒)</td>' +
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
        '<tr style="color:' + color + ';border-bottom:1px solid rgba(255,255,255,0.05);">' +
          '<td style="padding:2px 4px;">' + badge + ' ' + item.name + '</td>' +
          '<td style="text-align:right;padding:2px 4px;">' + _shortNum(item.price) + '</td>' +
          '<td style="text-align:right;padding:2px 4px;">' + payback + '</td>' +
        '</tr>';
    }
    html += '</table></div>';

    return html;
  }

  /* =========================================================
     公開API
  ========================================================= */
  window.SmartHelper = {
    config: config,

    toggle: function (key, val) {
      if (typeof config[key] !== 'boolean') return;
      config[key] = (typeof val === 'boolean') ? val : !config[key];
      _saveConfig();
      _applyConfig();
      if (typeof Game !== 'undefined' && Game.UpdateMenu && Game.onMenu === 'mods') {
        Game.UpdateMenu();
      }
    },

    setConfig: function (key, val) {
      config[key] = val;
      _saveConfig();
      _applyConfig();
    }
  };

  /* =========================================================
     設定反映
  ========================================================= */
  function _applyConfig() {
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
        _loadConfig();
        _whenReady(function () {
          _applyConfig();
          console.log('[SmartHelper] 起動。MODメニューから設定できます。');
        }, 1000);
      },

      disable: function () {
        _stopAllTimers();
        console.log('[SmartHelper] 停止。');
      },

      settings: function () {
        return _renderSettings();
      }
    });
  } else {
    console.error('[SmartHelper] CookieClickerMods が見つかりません');
  }

})();
