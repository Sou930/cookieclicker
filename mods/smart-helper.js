/**
 * smart-helper.js  ―  Cookie Clicker スマートヘルパー MOD
 * ==========================================================
 * Frozen Cookies の主要機能を再実装した軽量版。
 *
 * 安全化ポイント:
 *   - Game 初期化完了を待ってから起動
 *   - Game.Objects / Game.UpgradesInStore の未定義をガード
 *   - document.body が無い場合は DOM 追加を遅延
 *   - 例外が出ても MOD 全体が止まりにくいようにする
 *
 * 機能:
 *   1. 効率ランキング表示
 *   2. 自動購入 (建物・アップグレード)
 *   3. 自動ゴールデンクッキークリック
 *   4. 自動ラッパーpop
 *
 * 設定は window.SmartHelper.config で行う。
 */

(function () {
  'use strict';

  /* =========================================================
     設定
  ========================================================= */
  var config = {
    autoBuy         : false,
    autoBuyInterval : 1000,
    autoGC          : false,
    autoGCInterval  : 500,
    skipWrath       : true,
    autoPopWrinkler : false,
    autoPopInterval : 5000,
    skipShinyWrinkler: true,
    showTable       : true,
    tableRows       : 10,
  };

  /* =========================================================
     タイマー管理
  ========================================================= */
  var _timers = {};

  function _startTimer(key, fn, ms) {
    _stopTimer(key);
    _timers[key] = setInterval(function () {
      try {
        fn();
      } catch (e) {
        console.error('[SmartHelper] timer error (' + key + '):', e);
      }
    }, ms);
  }

  function _stopTimer(key) {
    if (_timers[key]) {
      clearInterval(_timers[key]);
      delete _timers[key];
    }
  }

  function _stopAllTimers() {
    Object.keys(_timers).forEach(function (k) { _stopTimer(k); });
  }

  /* =========================================================
     安全ガード
  ========================================================= */
  function _gameReady() {
    return (
      typeof Game !== 'undefined' &&
      Game &&
      Game.Objects &&
      Game.UpgradesInStore &&
      Array.isArray(Game.UpgradesInStore)
    );
  }

  function _whenReady(fn, retryMs) {
    retryMs = retryMs || 1000;

    function check() {
      if (_gameReady()) {
        try {
          fn();
        } catch (e) {
          console.error('[SmartHelper] ready hook error:', e);
        }
        return;
      }
      setTimeout(check, retryMs);
    }

    check();
  }

  function _safeBodyAppend(el) {
    if (document.body) {
      document.body.appendChild(el);
      return true;
    }
    setTimeout(function () { _safeBodyAppend(el); }, 300);
    return false;
  }

  /* =========================================================
     効率計算
     ========================================================= */
  function _currentCps() {
    if (!_gameReady()) return 1;
    var cps = (Game.cookiesPs || 0) * (1 - (Game.cpsSucked || 0)) + (Game.computedMouseCps || 0);
    return Math.max(cps, 0.0001);
  }

  function _buildingEfficiency(obj) {
    if (!obj) return Infinity;
    var price = obj.price || 0;
    var deltaCps = (obj.storedCps || 0) * (Game.globalCpsMult || 1);
    if (deltaCps <= 0) return Infinity;
    return price * 1.15 / _currentCps() + price / deltaCps;
  }

  function _upgradeEfficiency(up) {
    if (!up || typeof up.getPrice !== 'function') return Infinity;
    var price = up.getPrice();
    return price / _currentCps();
  }

  /* =========================================================
     購入候補ランキング
     ========================================================= */
  function _getRankedList() {
    if (!_gameReady()) return [];

    var list = [];

    for (var name in Game.Objects) {
      if (!Object.prototype.hasOwnProperty.call(Game.Objects, name)) continue;
      var obj = Game.Objects[name];
      if (!obj) continue;

      var eff = _buildingEfficiency(obj);
      list.push({
        name   : obj.dname || obj.name || name,
        price  : obj.price || 0,
        eff    : eff,
        canBuy : (Game.cookies || 0) >= (obj.price || 0),
        type   : 'building',
        ref    : obj
      });
    }

    for (var i = 0; i < Game.UpgradesInStore.length; i++) {
      var up = Game.UpgradesInStore[i];
      if (!up) continue;
      if (up.bought) continue;
      if (up.pool === 'prestige' || up.pool === 'debug' || up.pool === 'toggle') continue;
      if (typeof up.isVaulted === 'function' && up.isVaulted()) continue;
      if (up.priceLumps > 0) continue;

      var eff2 = _upgradeEfficiency(up);
      list.push({
        name   : up.dname || up.name || ('upgrade-' + i),
        price  : typeof up.getPrice === 'function' ? up.getPrice() : (up.price || 0),
        eff    : eff2,
        canBuy : typeof up.canBuy === 'function' ? up.canBuy() : false,
        type   : 'upgrade',
        ref    : up
      });
    }

    list.sort(function (a, b) { return a.eff - b.eff; });
    return list;
  }

  /* =========================================================
     効率テーブル UI
     ========================================================= */
  var _tableEl = null;

  function _createTable() {
    if (_tableEl) return;
    _tableEl = document.createElement('div');
    _tableEl.id = 'smartHelperTable';
    _tableEl.style.cssText = [
      'position:fixed',
      'bottom:8px',
      'left:8px',
      'z-index:99999',
      'background:rgba(0,0,0,0.82)',
      'color:#e8d8b0',
      'font-size:11px',
      'font-family:Georgia,serif',
      'border:1px solid rgba(255,200,100,0.3)',
      'border-radius:4px',
      'padding:6px 8px',
      'min-width:280px',
      'max-width:340px',
      'pointer-events:none',
      'line-height:1.5'
    ].join(';');

    _safeBodyAppend(_tableEl);
  }

  function _removeTable() {
    if (_tableEl && _tableEl.parentNode) {
      _tableEl.parentNode.removeChild(_tableEl);
    }
    _tableEl = null;
  }

  function _shortNum(n) {
    if (n === Infinity) return '∞';
    if (typeof n !== 'number' || isNaN(n)) return '0';
    var units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    var i = 0;
    while (n >= 1000 && i < units.length - 1) {
      n /= 1000;
      i++;
    }
    return (i === 0 ? Math.round(n) : n.toFixed(2)) + units[i];
  }

  function _updateTable() {
    if (!config.showTable) {
      _removeTable();
      return;
    }
    if (!_gameReady()) return;

    _createTable();
    if (!_tableEl) return;

    var list = _getRankedList().slice(0, config.tableRows);
    var cps = _currentCps();
    var html = '<b style="color:#ffd080;">📊 効率ランキング</b> <span style="opacity:0.5;font-size:10px;">CpS: ' + _shortNum(cps) + '</span><br>';
    html += '<table style="border-collapse:collapse;width:100%;">';
    html += '<tr style="opacity:0.6;font-size:10px;"><td>名前</td><td style="text-align:right;">コスト</td><td style="text-align:right;">回収(秒)</td></tr>';

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var color = item.canBuy ? '#a0e8a0' : '#e8e8e8';
      var badge = item.type === 'upgrade' ? '<span style="color:#ffd080;">▲</span>' : '🏠';
      var payback = item.eff === Infinity ? '∞' : _shortNum(item.eff) + 's';

      html += '<tr style="color:' + color + ';">' +
        '<td>' + badge + ' ' + item.name + '</td>' +
        '<td style="text-align:right;">' + _shortNum(item.price) + '</td>' +
        '<td style="text-align:right;">' + payback + '</td>' +
        '</tr>';
    }

    html += '</table>';
    _tableEl.innerHTML = html;
  }

  /* =========================================================
     自動購入
     ========================================================= */
  function _autoBuyTick() {
    if (!_gameReady()) return;
    if (Game.OnAscend || Game.AscendTimer > 0) return;

    var list = _getRankedList();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item.canBuy) continue;

      try {
        if (item.type === 'upgrade') {
          item.ref.buy(1);
          return;
        } else if (item.type === 'building') {
          item.ref.buy(1);
          return;
        }
      } catch (e) {
        console.error('[SmartHelper] autoBuy error:', e);
      }
    }
  }

  /* =========================================================
     自動ゴールデンクッキークリック
     ========================================================= */
  function _autoGCTick() {
    if (!_gameReady()) return;
    if (Game.OnAscend) return;

    var shimmers = Game.shimmers || [];
    for (var i = shimmers.length - 1; i >= 0; i--) {
      var s = shimmers[i];
      if (!s) continue;
      if (s.type !== 'golden' && s.type !== 'reindeer') continue;
      if (config.skipWrath && s.wrath) continue;

      try {
        if (typeof s.pop === 'function') s.pop();
      } catch (e) {
        console.error('[SmartHelper] autoGC error:', e);
      }
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
      if (!w) continue;
      if (w.phase !== 2) continue;
      if (config.skipShinyWrinkler && w.type === 1) continue;

      try {
        w.hp = 0;
      } catch (e) {
        console.error('[SmartHelper] wrinkler error:', e);
      }
    }
  }

  /* =========================================================
     パネル UI
     ========================================================= */
  var _panelEl = null;

  function _buildPanel() {
    if (_panelEl) return;
    _panelEl = document.createElement('div');
    _panelEl.id = 'smartHelperPanel';
    _panelEl.style.cssText = [
      'position:fixed',
      'top:40px',
      'right:4px',
      'z-index:99999',
      'background:rgba(0,0,0,0.82)',
      'color:#e8d8b0',
      'font-size:11px',
      'font-family:Georgia,serif',
      'border:1px solid rgba(255,200,100,0.3)',
      'border-radius:4px',
      'padding:6px 8px',
      'min-width:180px'
    ].join(';');

    _safeBodyAppend(_panelEl);
    _refreshPanel();
  }

  function _removePanel() {
    if (_panelEl && _panelEl.parentNode) {
      _panelEl.parentNode.removeChild(_panelEl);
    }
    _panelEl = null;
  }

  function _refreshPanel() {
    if (!_panelEl) return;

    function btn(key, label) {
      var on = !!config[key];
      return '<a style="display:inline-block;cursor:pointer;padding:1px 5px;margin:1px 2px;border-radius:3px;' +
        (on
          ? 'background:rgba(100,200,80,0.35);border:1px solid rgba(100,200,80,0.7);'
          : 'background:rgba(60,60,60,0.5);border:1px solid rgba(120,120,120,0.4);') +
        '" onclick="SmartHelper.toggle(\'' + key + '\');return false;">' +
        (on ? '✅' : '⬜') + ' ' + label + '</a><br>';
    }

    _panelEl.innerHTML =
      '<b style="color:#ffd080;">🍪 SmartHelper</b><br>' +
      '<div style="margin-top:4px;">' +
      btn('autoBuy', '自動購入') +
      btn('autoGC', 'GC自動クリック') +
      btn('skipWrath', 'Wrathスキップ') +
      btn('autoPopWrinkler', 'ラッパー自動pop') +
      btn('skipShinyWrinkler', '光るラッパー除外') +
      btn('showTable', '効率テーブル表示') +
      '</div>';
  }

  /* =========================================================
     公開API
     ========================================================= */
  window.SmartHelper = {
    config: config,

    toggle: function (key) {
      if (typeof config[key] !== 'boolean') return;
      config[key] = !config[key];
      _applyConfig();
      _refreshPanel();
    },

    setConfig: function (key, val) {
      config[key] = val;
      _applyConfig();
      _refreshPanel();
    }
  };

  /* =========================================================
     設定反映
     ========================================================= */
  function _applyConfig() {
    if (config.showTable) {
      _startTimer('table', _updateTable, 2000);
    } else {
      _stopTimer('table');
      _removeTable();
    }

    if (config.autoBuy) {
      _startTimer('autoBuy', _autoBuyTick, config.autoBuyInterval);
    } else {
      _stopTimer('autoBuy');
    }

    if (config.autoGC) {
      _startTimer('autoGC', _autoGCTick, config.autoGCInterval);
    } else {
      _stopTimer('autoGC');
    }

    if (config.autoPopWrinkler) {
      _startTimer('autoPopWrinkler', _autoPopWrinklerTick, config.autoPopInterval);
    } else {
      _stopTimer('autoPopWrinkler');
    }
  }

  /* =========================================================
     MOD登録
     ========================================================= */
  var _mod = {
    id: 'smart-helper',

    init: function () {
      _whenReady(function () {
        _buildPanel();
        _applyConfig();
        console.log('[SmartHelper] 起動。window.SmartHelper.config で設定変更可能。');
      }, 1000);
    },

    disable: function () {
      _stopAllTimers();
      _removeTable();
      _removePanel();
      console.log('[SmartHelper] 停止。');
    }
  };

  if (window.CookieClickerMods && typeof window.CookieClickerMods.register === 'function') {
    window.CookieClickerMods.register(_mod);
  } else {
    console.error('[SmartHelper] CookieClickerMods が見つかりません');
  }

})();
