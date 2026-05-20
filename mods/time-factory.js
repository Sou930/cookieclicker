/**
 * time-factory.js  ―  Cookie Clicker Time Factory MOD
 * =====================================================
 * 変更点:
 *  - Options への注入と画面右下バッジを廃止
 *  - スライダー・倍率ボタンは MODタブ内の TimeFactory タブ (settings) に移動
 *  - 100x ボタンを追加（スライダーは従来通り 0.5～10x）
 *  - セーブ/ロードに対応 (save/load フックを通じて速度を記録)
 *
 * バグ修正:
 *  - 倍速時に「毎秒生産Nトリリオン」等の実績が誤解除されるバグを修正
 *  - 原因: Game.fps を上げると Game.Logic 内の cookiesPs 計算も狂い、
 *          実績判定用の「毎秒生産量」が speed 倍に水増しされていた
 *  - 修正: Game.fps は常に BASE_FPS(30) のまま保持し、
 *          代わりに 1 フレームで Game.Logic を複数回呼び出すことで加速する
 *          (0.5x 時は確率的に 1 フレームおきにスキップして減速)
 */

(function () {
  'use strict';

  var MOD_ID      = 'time-factory';
  var STORAGE_KEY = 'CC_TimeFactory_Speed';
  var BASE_FPS    = 30;
  var MIN_SPEED   = 0.5;
  var SLIDER_MAX  = 10;        // スライダーで指定できる上限
  var MAX_SPEED   = 100;       // setSpeed() で許容する上限 (ボタンで 100x)
  var PRESETS     = [0.5, 1, 2, 3, 5, 10, 100];

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

  // フレームをまたいだ端数呼び出し管理用アキュムレータ
  var _accumulator = 0;

  function _applySpeed(speed) {
    _currentSpeed = speed;
    if (typeof Game === 'undefined') return;

    // Game.fps は常に BASE_FPS(30) のまま固定し、
    // 1フレームごとに Logic を「speed 回分」呼ぶことで加速する。
    // これにより cookiesPs ベースの実績判定が狂わない。
    if (!Game._tfOrigLogic) {
      Game._tfOrigLogic = Game.Logic;
      Game.Logic = function () {
        // アキュムレータに speed を積み、整数部だけ呼び出す。
        // 端数は次フレームへ繰り越すことで長期平均が正確に speed 倍になる。
        // 例) 0.5x → 2フレームに1回、2x → 毎フレーム2回、2.5x → 交互に2/3回
        _accumulator += _currentSpeed;
        var calls = Math.floor(_accumulator);
        _accumulator -= calls;
        // 暴走防止（MAX_SPEED 回を上限に制限）
        calls = Math.min(calls, MAX_SPEED);
        for (var i = 0; i < calls; i++) {
          Game._tfOrigLogic.call(Game);
        }
      };
    }

    // fps は常に BASE_FPS に固定（実績判定を正常に保つため変更しない）
    Game.fps = BASE_FPS;

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

    /* セーブ/ロード フック（mod-loader から呼ばれる） */
    save: function () {
      return { speed: _currentSpeed };
    },
    load: function (data) {
      if (!data) return;
      var v = parseFloat(data.speed);
      if (!isNaN(v)) {
        v = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
        _applySpeed(v);
      }
    },

    settings: function () {
      var equivFps = Math.round(BASE_FPS * _currentSpeed);
      var html = '<div style="padding:6px 4px;">';
      html += '<div style="margin-bottom:8px;">現在の速度: <b>' + _currentSpeed + 'x</b>  ' +
              '<small style="opacity:0.6;">(実効 fps: ' + equivFps + ' / 描画 fps: ' + BASE_FPS + ')</small></div>';

      // スライダーは MIN_SPEED ～ SLIDER_MAX に固定。100x はボタンのみ。
      var sliderValue = Math.min(SLIDER_MAX, _currentSpeed) * 10;
      html += '<input type="range" min="' + (MIN_SPEED * 10) + '" max="' + (SLIDER_MAX * 10) +
              '" step="1" value="' + sliderValue + '" ' +
              'style="width:100%;cursor:pointer;" ' +
              'oninput="TimeFactory.setSpeed(this.value/10);">';

      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';
      for (var i = 0; i < PRESETS.length; i++) {
        var p  = PRESETS[i];
        var on = _currentSpeed === p;
        var extra = (p === 100)
          ? 'background:rgba(255,120,120,0.35);border-color:rgba(255,120,120,0.7);'
          : '';
        var st = on
          ? 'background:rgba(120,200,100,0.35);border-color:rgba(120,200,100,0.7);'
          : (extra || 'opacity:0.7;');
        html += '<a class="option smallFancyButton" style="' + st + '" ' +
                'onclick="TimeFactory.setSpeed(' + p + ');return false;">' + p + 'x</a>';
      }
      html += '</div>';

      html += '<div style="margin-top:8px;font-size:11px;opacity:0.6;">' +
              '※ 100x は超高速モードです。CPU負荷が大きく増加します。</div>';
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
      console.log('[TimeFactory] 無効化: 速度を 1x (fps=' + BASE_FPS + ') に戻しました');
    }
  });

})();
