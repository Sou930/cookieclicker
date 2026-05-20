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
 *
 * 追加実績 (シャドウ実績):
 *  - スロータイム      : 0.5x を使用する
 *  - ハイパータイム    : 10x を使用する
 *  - クロノブレイク    : 100x を使用する
 *  - 時を超えた工場長  : 100x で丸1日（86400ゲーム内秒）プレイする
 */

(function () {
  'use strict';

  var MOD_ID      = 'time-factory';
  var STORAGE_KEY = 'CC_TimeFactory_Speed';
  var BASE_FPS    = 30;
  var MIN_SPEED   = 0.5;
  var SLIDER_MAX  = 10;
  var MAX_SPEED   = 100;
  var PRESETS     = [0.5, 1, 2, 3, 5, 10, 100];

  // 100x で経過したゲーム内秒数を累積する（1日 = 86400秒）
  var HYPER_DAY_SEC = 86400;

  var _currentSpeed   = 1;
  var _notifTimer     = null;
  var _hyperSeconds   = 0;   // セーブ/ロードで永続化

  // ── 実績定義 ────────────────────────────────────────────────
  // icon: icons.png のグリッド座標 [col, row]
  // shadow: true → シャドウ実績（ミルク加算なし・隠し）
  var ACHIEV_DEFS = [
    {
      id:   'tf_slow',
      name: 'スロータイム',
      desc: '0.5倍速モードを使用した。<q>ゆっくりしていってね。</q>',
      icon: [23, 7],   // 砂時計系アイコン
      shadow: true
    },
    {
      id:   'tf_hyper',
      name: 'ハイパータイム',
      desc: '10倍速モードを使用した。<q>時よ、止まれ！――いや、加速しろ！</q>',
      icon: [24, 7],
      shadow: true
    },
    {
      id:   'tf_chrono',
      name: 'クロノブレイク',
      desc: '100倍速モードを使用した。<q>時間の壁をぶち抜いた。</q>',
      icon: [25, 7],
      shadow: true
    },
    {
      id:   'tf_hyperday',
      name: '時を超えた工場長',
      desc: '100倍速で丸1日分（86,400秒）プレイした。<q>あなたにとっての1分は、世界にとっての100分。</q>',
      icon: [26, 7],
      shadow: true
    }
  ];

  // ── セーブ/ロードヘルパ ──────────────────────────────────────
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

  // ── 実績登録 ─────────────────────────────────────────────────
  function _registerAchievements() {
    for (var i = 0; i < ACHIEV_DEFS.length; i++) {
      var def = ACHIEV_DEFS[i];
      if (Game.Achievements[def.name]) continue; // 二重登録防止
      var a = new Game.Achievement(def.name, def.desc, def.icon);
      a.pool = def.shadow ? 'shadow' : 'normal';
      // order を既存最大値より大きい値に設定して衝突を避ける
      a.order = 100000 + i;
    }
  }

  // ── 実績解除 ─────────────────────────────────────────────────
  function _tryWin(achievName) {
    var a = Game.Achievements[achievName];
    if (a && !a.won) {
      Game.Win(achievName);
    }
  }

  // ── 速度変更時チェック ────────────────────────────────────────
  function _checkSpeedAchievements(speed) {
    if (speed === 0.5) _tryWin('スロータイム');
    if (speed === 10)  _tryWin('ハイパータイム');
    if (speed === 100) _tryWin('クロノブレイク');
  }

  // ── フレームをまたいだ端数管理 ────────────────────────────────
  var _accumulator = 0;

  function _applySpeed(speed) {
    _currentSpeed = speed;
    if (typeof Game === 'undefined') return;

    if (!Game._tfOrigLogic) {
      Game._tfOrigLogic = Game.Logic;
      Game.Logic = function () {
        // アキュムレータ方式: 1フレームで Logic を speed 回分呼ぶ
        _accumulator += _currentSpeed;
        var calls = Math.floor(_accumulator);
        _accumulator -= calls;
        calls = Math.min(calls, MAX_SPEED);
        for (var i = 0; i < calls; i++) {
          Game._tfOrigLogic.call(Game);
        }

        // 100x 中の経過秒を積算（1フレーム = 1/30秒 × calls 回）
        if (_currentSpeed === 100) {
          _hyperSeconds += calls / BASE_FPS;
          if (_hyperSeconds >= HYPER_DAY_SEC) {
            _tryWin('時を超えた工場長');
          }
        }
      };
    }

    // fps は常に BASE_FPS に固定（実績判定を正常に保つため変更しない）
    Game.fps = BASE_FPS;

    _checkSpeedAchievements(speed);
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

  // ── 公開 API ─────────────────────────────────────────────────
  window.TimeFactory = {
    setSpeed: function (v) {
      v = parseFloat(v);
      if (isNaN(v)) v = 1;
      v = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
      _applySpeed(v);
    }
  };

  // ── MOD 登録 ─────────────────────────────────────────────────
  window.CookieClickerMods.register({
    id: MOD_ID,

    init: function () {
      _currentSpeed = _loadSpeed();

      var tries = 0;
      var interval = setInterval(function () {
        tries++;
        if (typeof Game !== 'undefined' && typeof Game.UpdateMenu === 'function') {
          clearInterval(interval);
          _registerAchievements();
          _applySpeed(_currentSpeed);
          console.log('[TimeFactory] 初期化完了 speed=' + _currentSpeed + 'x  fps=' + Game.fps);
        }
        if (tries > 200) {
          clearInterval(interval);
          console.error('[TimeFactory] Game のロード待ちタイムアウト');
        }
      }, 100);
    },

    save: function () {
      return {
        speed:        _currentSpeed,
        hyperSeconds: _hyperSeconds
      };
    },

    load: function (data) {
      if (!data) return;
      // hyperSeconds の復元
      if (typeof data.hyperSeconds === 'number' && !isNaN(data.hyperSeconds)) {
        _hyperSeconds = Math.max(0, data.hyperSeconds);
      }
      // speed の復元
      var v = parseFloat(data.speed);
      if (!isNaN(v)) {
        v = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
        _applySpeed(v);
      }
    },

    settings: function () {
      var equivFps  = Math.round(BASE_FPS * _currentSpeed);
      var hyperPct  = Math.min(100, Math.floor(_hyperSeconds / HYPER_DAY_SEC * 100));
      var hyperMin  = Math.floor(_hyperSeconds / 60);
      var hyperHour = Math.floor(hyperMin / 60);
      var hyperDisp = _hyperSeconds >= HYPER_DAY_SEC
        ? '達成！'
        : (hyperHour + '時間' + (hyperMin % 60) + '分 / 24時間 (' + hyperPct + '%)');

      var html = '<div style="padding:6px 4px;">';

      // 現在速度表示
      html += '<div style="margin-bottom:8px;">現在の速度: <b>' + _currentSpeed + 'x</b>  ' +
              '<small style="opacity:0.6;">(実効 fps: ' + equivFps + ' / 描画 fps: ' + BASE_FPS + ')</small></div>';

      // スライダー (0.5x ～ 10x)
      var sliderValue = Math.min(SLIDER_MAX, _currentSpeed) * 10;
      html += '<input type="range" min="' + (MIN_SPEED * 10) + '" max="' + (SLIDER_MAX * 10) +
              '" step="1" value="' + sliderValue + '" ' +
              'style="width:100%;cursor:pointer;" ' +
              'oninput="TimeFactory.setSpeed(this.value/10);">';

      // プリセットボタン
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

      // 100x 累積時間プログレス
      html += '<div style="margin-top:12px;font-size:11px;">' +
              '⏳ <b>時を超えた工場長</b> 進捗: ' + hyperDisp + '</div>';
      if (_hyperSeconds < HYPER_DAY_SEC) {
        html += '<div style="background:rgba(255,255,255,0.1);border-radius:4px;margin-top:4px;height:6px;">' +
                '<div style="background:rgba(255,160,60,0.8);width:' + hyperPct + '%;height:100%;border-radius:4px;"></div>' +
                '</div>';
      }

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
