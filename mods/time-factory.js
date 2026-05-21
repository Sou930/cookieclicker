/**
 * time-factory.js  ―  Cookie Clicker Time Factory MOD
 * =====================================================
 * 変更点 (今回):
 *  - 実績定義を mods/achievements/time-factory.json に外部化
 *    (dungeon-explorer と同じ方式)
 *  - 解除済み実績は MOD 側の SAVE_KEY (wonAchievements 配列) に保存し、
 *    ロード時は Game.Win を呼ばず won=1 を直接復元することで
 *    起動毎の通知再発火を防止
 *  - achievements プロパティを動的に設定して MOD実績タブに表示
 *
 * 機能:
 *  - ゲームの進行速度を 0.5x〜100x で変更
 *  - スライダー (0.5x ~ 10x) + プリセットボタン (0.5/1/2/3/5/10/100)
 *  - 100x で丸1日分プレイすると実績「時を超えた工場長」
 *
 * バグ修正:
 *  - 倍速時に「毎秒生産Nトリリオン」等の実績が誤解除されるバグを修正
 *    Game.fps は常に BASE_FPS(30) のまま保持し、
 *    1 フレームで Game.Logic を複数回呼び出すことで加速
 */

(function () {
  'use strict';

  var MOD_ID      = 'time-factory';
  var SAVE_KEY    = 'CC_TimeFactory_v2';
  var SPEED_KEY   = 'CC_TimeFactory_Speed';  // 後方互換用
  var BASE_FPS    = 30;
  var MIN_SPEED   = 0.5;
  var SLIDER_MAX  = 10;
  var MAX_SPEED   = 100;
  var PRESETS     = [0.5, 1, 2, 3, 5, 10, 100];

  // 100x で経過したゲーム内秒数を累積する（1日 = 86400秒）
  var HYPER_DAY_SEC = 86400;

  /* ============================================================
     状態
  ============================================================ */
  var state = {
    speed:           1,
    hyperSeconds:    0,
    wonAchievements: []   // 通知重複バグ対策: ここに永続化
  };

  var _currentSpeed = 1;
  var _notifTimer   = null;

  /* ============================================================
     CpS実績ガード
     ------------------------------------------------------------
     倍速中は 1 回の描画フレーム内で Game.Logic を複数回実行する。
     その「追加分」の内部 tick で CpS 再計算が走ると、本体側の
     CpS 実績判定が実時間ベースの通常 tick と混ざって誤発火する
     ことがあるため、追加 tick 中だけ CpS 実績の Game.Win を抑止する。
  ============================================================ */
  function isCpsAchievementName(name) {
    if (typeof Game === 'undefined' || !Game.CpsAchievements) return false;
    for (var i = 0; i < Game.CpsAchievements.length; i++) {
      if (Game.CpsAchievements[i] && Game.CpsAchievements[i].name === name) return true;
    }
    return false;
  }

  function installCpsAchievementGuard() {
    if (typeof Game === 'undefined' || !Game.Win || Game._tfOrigWin) return;
    Game._tfOrigWin = Game.Win;
    Game.Win = function (name) {
      if (Game._tfSuppressCpsAchievements && isCpsAchievementName(name)) return 0;
      return Game._tfOrigWin.apply(Game, arguments);
    };
  }

  /* ============================================================
     実績 — 外部JSON
  ============================================================ */
  var ACHIEVEMENTS_JSON_URL = 'mods/achievements/time-factory.json';
  var TF_ACHIEVEMENTS = [];

  function loadAchievementsJson(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', ACHIEVEMENTS_JSON_URL + '?_=' + Date.now(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      var ok = (xhr.status === 200 || xhr.status === 0) && xhr.responseText;
      if (ok) {
        try { TF_ACHIEVEMENTS = JSON.parse(xhr.responseText); }
        catch (e) { console.warn('[TimeFactory] achievements JSON パースエラー:', e); }
      } else {
        console.warn('[TimeFactory] achievements JSON 読み込み失敗 status=' + xhr.status);
      }
      if (callback) callback();
    };
    xhr.onerror = function () {
      console.warn('[TimeFactory] achievements JSON XHR エラー');
      if (callback) callback();
    };
    xhr.send();
  }

  function registerAchievements() {
    if (typeof Game === 'undefined' || !Game.Achievement) return;
    TF_ACHIEVEMENTS.forEach(function (a) {
      if (!Game.Achievements[a.name]) {
        var achiev = new Game.Achievement(a.name, a.desc, a.icon);
        achiev.pool = a.shadow ? 'shadow' : 'mod';
      }
    });

    /* === 通知バグ修正: 起動時の重複通知を避けるため、
           MOD 側で保存していた won 状態を Game.Win を使わず直接復元 === */
    if (state.wonAchievements && state.wonAchievements.length) {
      state.wonAchievements.forEach(function (name) {
        var a = Game.Achievements[name];
        if (a && !a.won) { a.won = 1; a.date = a.date || Date.now(); }
      });
    }

    /* MOD実績タブに表示されるよう achievements を動的に設定 */
    if (window.CookieClickerMods && window.CookieClickerMods._registered) {
      var reg = window.CookieClickerMods._registered[MOD_ID];
      if (reg) reg.achievements = TF_ACHIEVEMENTS.map(function (a) { return a.name; });
    }
  }

  function winAchiev(name) {
    if (typeof Game === 'undefined' || !Game.Win) return;
    var a = Game.Achievements[name];
    if (!a) return;
    if (state.wonAchievements.indexOf(name) === -1) state.wonAchievements.push(name);
    if (!a.won) Game.Win(name);
    saveState();
  }

  function checkSpeedAchievements(speed) {
    if (speed === 0.5) winAchiev('スロータイム');
    if (speed === 10)  winAchiev('ハイパータイム');
    if (speed === 100) winAchiev('クロノブレイク');
  }

  /* ============================================================
     セーブ/ロード（MOD-Loader の save/load フック + 後方互換）
  ============================================================ */
  function saveState() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      // 後方互換: 旧キーにも速度だけは保存
      localStorage.setItem(SPEED_KEY, String(state.speed));
    } catch (e) {}
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        Object.assign(state, s);
        state.wonAchievements = state.wonAchievements || [];
      } else {
        // 旧バージョンの速度設定だけ移行
        var rawSpeed = localStorage.getItem(SPEED_KEY);
        if (rawSpeed !== null) {
          var v = parseFloat(rawSpeed);
          if (!isNaN(v)) state.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
        }
      }
    } catch (e) {}
    _currentSpeed = state.speed || 1;
  }

  /* ============================================================
     倍速ロジック — フレームをまたいだ端数管理
  ============================================================ */
  var _accumulator = 0;

  function applySpeed(speed) {
    _currentSpeed = speed;
    state.speed   = speed;
    if (typeof Game === 'undefined') return;

    installCpsAchievementGuard();

    if (!Game._tfOrigLogic) {
      Game._tfOrigLogic = Game.Logic;
      Game.Logic = function () {
        // アキュムレータ方式: 1フレームで Logic を speed 回分呼ぶ
        _accumulator += _currentSpeed;
        var calls = Math.floor(_accumulator);
        _accumulator -= calls;
        calls = Math.min(calls, MAX_SPEED);

        var oldSuppress = Game._tfSuppressCpsAchievements;
        try {
          for (var i = 0; i < calls; i++) {
            // 1回目は通常tickとして扱い、2回目以降の追加tickだけCpS実績を抑止
            Game._tfSuppressCpsAchievements = (_currentSpeed !== 1 && i > 0);
            Game._tfOrigLogic.call(Game);
          }
        } finally {
          Game._tfSuppressCpsAchievements = oldSuppress;
        }

        // 100x 中の経過秒を積算（1フレーム = 1/30秒 × calls 回）
        if (_currentSpeed === 100) {
          state.hyperSeconds += calls / BASE_FPS;
          if (state.hyperSeconds >= HYPER_DAY_SEC) {
            winAchiev('時を超えた工場長');
          }
        }
      };
    }

    // fps は常に BASE_FPS に固定（実績判定を正常に保つため変更しない）
    Game.fps = BASE_FPS;

    checkSpeedAchievements(speed);
    showNotif(speed);
    saveState();
    if (Game.onMenu === 'mods' && Game.UpdateMenu) Game.UpdateMenu();
  }

  function showNotif(speed) {
    if (typeof Game === 'undefined') return;
    if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }
    var label = speed === 1 ? '通常速度に戻しました' : 'ゲーム速度: ' + speed + 'x';
    Game.Notify('⏱ Time Factory', label, [0, 0], 3, true);
  }

  /* ============================================================
     公開 API
  ============================================================ */
  window.TimeFactory = {
    setSpeed: function (v) {
      v = parseFloat(v);
      if (isNaN(v)) v = 1;
      v = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
      applySpeed(v);
    }
  };

  /* ============================================================
     MOD 登録
  ============================================================ */
  window.CookieClickerMods.register({
    id: MOD_ID,
    achievements: [],  // loadAchievementsJson 後に上書き

    init: function () {
      loadState();

      var tries = 0;
      var interval = setInterval(function () {
        tries++;
        if (typeof Game !== 'undefined' && typeof Game.UpdateMenu === 'function') {
          clearInterval(interval);
          loadAchievementsJson(function () {
            registerAchievements();
            applySpeed(_currentSpeed);
            console.log('[TimeFactory] 初期化完了 speed=' + _currentSpeed +
                        'x  fps=' + Game.fps +
                        '  実績=' + TF_ACHIEVEMENTS.length);
          });
        }
        if (tries > 200) {
          clearInterval(interval);
          console.error('[TimeFactory] Game のロード待ちタイムアウト');
        }
      }, 100);
    },

    /* mod-loader の save/load フック経由でセーブデータに同梱される */
    save: function () {
      return {
        speed:            state.speed,
        hyperSeconds:     state.hyperSeconds,
        wonAchievements:  state.wonAchievements
      };
    },

    load: function (data) {
      if (!data) return;
      if (typeof data.hyperSeconds === 'number' && !isNaN(data.hyperSeconds)) {
        state.hyperSeconds = Math.max(0, data.hyperSeconds);
      }
      if (Array.isArray(data.wonAchievements)) {
        state.wonAchievements = data.wonAchievements.slice();
        // ロード直後に実績がまだ登録されていれば復元（通知なし）
        if (typeof Game !== 'undefined' && Game.Achievements) {
          state.wonAchievements.forEach(function (name) {
            var a = Game.Achievements[name];
            if (a && !a.won) { a.won = 1; a.date = a.date || Date.now(); }
          });
        }
      }
      var v = parseFloat(data.speed);
      if (!isNaN(v)) {
        v = Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
        applySpeed(v);
      }
      saveState();
    },

    settings: function () {
      var equivFps  = Math.round(BASE_FPS * _currentSpeed);
      var hyperPct  = Math.min(100, Math.floor(state.hyperSeconds / HYPER_DAY_SEC * 100));
      var hyperMin  = Math.floor(state.hyperSeconds / 60);
      var hyperHour = Math.floor(hyperMin / 60);
      var hyperDisp = state.hyperSeconds >= HYPER_DAY_SEC
        ? '達成！'
        : (hyperHour + '時間' + (hyperMin % 60) + '分 / 24時間 (' + hyperPct + '%)');

      var html = '<div class="tf-root">';

      // 現在速度表示
      html += '<div class="tf-current">現在の速度: <b>' + _currentSpeed + 'x</b> ' +
              '<small>(実効 fps: ' + equivFps + ' / 描画 fps: ' + BASE_FPS + ')</small></div>';

      // スライダー (0.5x ～ 10x)
      var sliderValue = Math.min(SLIDER_MAX, _currentSpeed) * 10;
      html += '<input type="range" class="tf-slider" min="' + (MIN_SPEED * 10) + '" max="' + (SLIDER_MAX * 10) +
              '" step="1" value="' + sliderValue + '" ' +
              'oninput="TimeFactory.setSpeed(this.value/10);">';

      // プリセットボタン
      html += '<div class="tf-presets">';
      for (var i = 0; i < PRESETS.length; i++) {
        var p  = PRESETS[i];
        var on = _currentSpeed === p;
        var cls = 'option smallFancyButton tf-btn';
        if (on) cls += ' active';
        else if (p === 100) cls += ' danger';
        html += '<a class="' + cls + '" ' +
                'onclick="TimeFactory.setSpeed(' + p + ');return false;">' + p + 'x</a>';
      }
      html += '</div>';

      // 100x 累積時間プログレス
      html += '<div class="tf-hyper">' +
              '⏳ <b>時を超えた工場長</b> 進捗: ' + hyperDisp + '</div>';
      if (state.hyperSeconds < HYPER_DAY_SEC) {
        html += '<div class="tf-bar-wrap">' +
                '<div class="tf-bar" style="width:' + hyperPct + '%;"></div>' +
                '</div>';
      }

      html += '<div class="tf-note">' +
              '※ 100x は超高速モードです。CPU負荷が大きく増加します。</div>';
      html += '</div>';

      injectStyle();
      return html;
    },

    disable: function () {
      if (typeof Game !== 'undefined') {
        if (Game._tfOrigLogic) {
          Game.Logic = Game._tfOrigLogic;
          delete Game._tfOrigLogic;
        }
        if (Game._tfOrigWin) {
          Game.Win = Game._tfOrigWin;
          delete Game._tfOrigWin;
        }
        delete Game._tfSuppressCpsAchievements;
        Game.fps = BASE_FPS;
      }
      _currentSpeed = 1;
      state.speed   = 1;
      saveState();
      try { delete window.TimeFactory; } catch (e) { window.TimeFactory = undefined; }
      var el = document.getElementById('timeFactoryStyle');
      if (el) el.remove();
      console.log('[TimeFactory] 無効化: 速度を 1x (fps=' + BASE_FPS + ') に戻しました');
    }
  });

  /* ============================================================
     スタイル
  ============================================================ */
  var _styleInjected = false;
  function injectStyle() {
    if (_styleInjected) return;
    _styleInjected = true;
    var css = [
      '.tf-root{padding:6px 4px;font-size:13px;}',
      '.tf-current{margin-bottom:8px;}',
      '.tf-current small{opacity:0.6;}',
      '.tf-slider{width:100%;cursor:pointer;}',
      '.tf-presets{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
      '.tf-btn{min-width:48px;text-align:center;}',
      '.tf-btn.active{background:rgba(120,200,100,0.35) !important;',
        'border-color:rgba(120,200,100,0.7) !important;opacity:1 !important;}',
      '.tf-btn.danger{background:rgba(255,120,120,0.25);',
        'border-color:rgba(255,120,120,0.6);}',
      '.tf-btn:not(.active):not(.danger){opacity:0.7;}',
      '.tf-hyper{margin-top:12px;font-size:11px;}',
      '.tf-bar-wrap{background:rgba(255,255,255,0.1);border-radius:4px;',
        'margin-top:4px;height:6px;overflow:hidden;}',
      '.tf-bar{background:rgba(255,160,60,0.85);height:100%;border-radius:4px;',
        'box-shadow:0 0 6px rgba(255,160,60,0.6);transition:width 0.4s;}',
      '.tf-note{margin-top:8px;font-size:11px;opacity:0.6;}',

      /* モバイル */
      '@media (max-width: 720px){',
        '.tf-presets{gap:4px;}',
        '.tf-btn{min-width:44px;padding:4px 6px !important;font-size:12px;}',
      '}'
    ].join('');
    var el = document.createElement('style');
    el.id  = 'timeFactoryStyle';
    el.textContent = css;
    document.head.appendChild(el);
  }

})();
