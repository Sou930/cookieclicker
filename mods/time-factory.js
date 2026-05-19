/**
 * time-factory.js  ―  Cookie Clicker Time Factory MOD
 * =====================================================
 * 変更点:
 *  - Options への注入と画面右下バッジを廃止
 *  - スライダー・倍率ボタンは MODタブ内の TimeFactory タブ (settings) に移動
 */

(function () {
  'use strict';

  var MOD_ID      = 'time-factory';
  var STORAGE_KEY = 'CC_TimeFactory_Speed';
  var BASE_FPS    = 30;
  var MIN_SPEED   = 0.5;
  var MAX_SPEED   = 10;
  var PRESETS     = [0.5, 1, 2, 3, 5, 10];

  var _currentSpeed = 1;
  var _notifTimer   = null;

  function _saveSpeed(v) {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch (e) {}
  }
  function _loadSpeed() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        var v = parseFloat(raw);
        if (!isNaN(v)) return Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
      }
    } catch (e) {}
    return 1;
  }

  function _applySpeed(speed) {
    _currentSpeed = speed;
    if (typeof Game === 'undefined') return;

    if (!Game._tfOrigLogic) {
      Game._tfOrigLogic = Game.Logic;
      Game.Logic = function () {
        var savedFps = Game.fps;
        Game.fps = BASE_FPS;
        Game._tfOrigLogic.call(Game);
        Game.fps = savedFps;
      };
    }

    Game.fps = Math.round(BASE_FPS * speed);

    _showNotif(speed);
    _saveSpeed(speed);
    if (Game.onMenu === 'mods' && Game.UpdateMenu) Game.UpdateMenu();
  }

  function _showNotif(speed) {
    if (typeof Game === 'undefined') return;
    if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }
    var label = speed === 1 ? '通常速度に戻しました' : 'ゲーム速度: ' + speed + 'x';
    Game.Notify('⏱ Time Factory', label, [0, 0], 3, true);
  }

  /* =========================================================
     公開 API（settings 内 HTML から呼び出される）
  ========================================================= */
  window.TimeFactory = {
    setSpeed: function (v) {
      v = parseFloat(v);
      if (isNaN(v)) v = 1;
      v = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
      _applySpeed(v);
    }
  };

  /* =========================================================
     MOD 登録
  ========================================================= */
  window.CookieClickerMods.register({
    id: MOD_ID,

    init: function () {
      _currentSpeed = _loadSpeed();

      var tries = 0;
      var interval = setInterval(function () {
        tries++;
        if (typeof Game !== 'undefined' && typeof Game.UpdateMenu === 'function') {
          clearInterval(interval);
          _applySpeed(_currentSpeed);
          console.log('[TimeFactory] 初期化完了 speed=' + _currentSpeed + 'x  fps=' + Game.fps);
        }
        if (tries > 200) {
          clearInterval(interval);
          console.error('[TimeFactory] Game のロード待ちタイムアウト');
        }
      }, 100);
    },

    settings: function () {
      var fps = (typeof Game !== 'undefined' && Game.fps) ? Game.fps : '-';
      var html = '<div style="padding:6px 4px;">';
      html += '<div style="margin-bottom:8px;">現在の速度: <b>' + _currentSpeed + 'x</b>  ' +
              '<small style="opacity:0.6;">(fps: ' + fps + ')</small></div>';

      html += '<input type="range" min="' + (MIN_SPEED * 10) + '" max="' + (MAX_SPEED * 10) +
              '" step="1" value="' + (_currentSpeed * 10) + '" ' +
              'style="width:100%;cursor:pointer;" ' +
              'oninput="TimeFactory.setSpeed(this.value/10);">';

      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';
      for (var i = 0; i < PRESETS.length; i++) {
        var p  = PRESETS[i];
        var on = _currentSpeed === p;
        var st = on
          ? 'background:rgba(120,200,100,0.35);border-color:rgba(120,200,100,0.7);'
          : 'opacity:0.7;';
        html += '<a class="option smallFancyButton" style="' + st + '" ' +
                'onclick="TimeFactory.setSpeed(' + p + ');return false;">' + p + 'x</a>';
      }
      html += '</div>';

      html += '<div style="margin-top:8px;font-size:11px;opacity:0.6;">' +
              '※ 高速モードはCPU負荷が増加します。セーブデータには影響しません。</div>';
      html += '</div>';
      return html;
    },

    disable: function () {
      if (typeof Game !== 'undefined') {
        if (Game._tfOrigLogic) {
          Game.Logic = Game._tfOrigLogic;
          delete Game._tfOrigLogic;
        }
        Game.fps = BASE_FPS;
      }
      _currentSpeed = 1;
      _saveSpeed(1);
      try { delete window.TimeFactory; } catch (e) { window.TimeFactory = undefined; }
      console.log('[TimeFactory] 無効化: fps を ' + BASE_FPS + ' に戻しました');
    }
  });

})();
