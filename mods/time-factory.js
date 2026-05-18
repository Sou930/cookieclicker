/**
 * time-factory.js  ―  Cookie Clicker Time Factory MOD
 * =====================================================
 * ゲームの進行速度を倍率で変更する。
 *
 * 機能:
 *   - ゲーム速度を 0.5x〜10x の範囲で変更
 *   - Options メニューにスライダーと倍率ボタンを追加
 *   - 現在の速度をステータスバーに表示
 *   - 速度は LocalStorage に保存され再起動後も維持
 */

(function () {
  'use strict';

  /* =========================================================
     定数
  ========================================================= */
  var MOD_ID      = 'time-factory';
  var STORAGE_KEY = 'CC_TimeFactory_Speed';
  var BASE_FPS    = 30;   // Game のデフォルト fps
  var MIN_SPEED   = 0.5;
  var MAX_SPEED   = 10;
  var PRESETS     = [0.5, 1, 2, 3, 5, 10];

  /* =========================================================
     内部状態
  ========================================================= */
  var _currentSpeed = 1;
  var _origLoop     = null;  // 元の Game.Loop
  var _notifTimer   = null;

  /* =========================================================
     速度の保存・読み込み
  ========================================================= */
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

  /* =========================================================
     速度の適用
  ========================================================= */
  function _applySpeed(speed) {
    _currentSpeed = speed;
    if (typeof Game === 'undefined') return;

    // Game.fps を変更するとループ間隔・ロジック回数が変わる
    Game.fps = Math.round(BASE_FPS * speed);

    // 速度変更通知
    _showNotif(speed);
    _saveSpeed(speed);
    _updateMenuIfOpen();
  }

  function _showNotif(speed) {
    if (typeof Game === 'undefined') return;
    if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }
    var label = speed === 1 ? '通常速度に戻しました' : 'ゲーム速度: ' + speed + 'x';
    Game.Notify(
      '⏱ Time Factory',
      label,
      [0, 0],   // アイコン位置 (デフォルトアイコン)
      3,        // 表示秒数
      true      // 即表示
    );
  }

  /* =========================================================
     メニューの更新（Options が開いている場合）
  ========================================================= */
  function _updateMenuIfOpen() {
    if (typeof Game === 'undefined') return;
    // Options タブが表示中なら再描画
    if (Game.onMenu === 'prefs') {
      Game.UpdateMenu();
    }
  }

  /* =========================================================
     Options メニューへのセクション注入
  ========================================================= */
  function _hookMenu() {
    if (typeof Game === 'undefined') return;
    var _origUpdateMenu = Game.UpdateMenu.bind(Game);

    Game.UpdateMenu = function () {
      _origUpdateMenu();
      if (Game.onMenu !== 'prefs') return;

      var menu = document.getElementById('menu');
      if (!menu) return;

      // 既存の注入を削除
      var old = document.getElementById('tfSection');
      if (old) old.parentNode.removeChild(old);

      var section = document.createElement('div');
      section.id = 'tfSection';
      section.style.cssText = 'padding:8px 16px 12px;';

      // ---- ヘッダー ----
      var title = document.createElement('div');
      title.className = 'title';
      title.textContent = '⏱ Time Factory';
      section.appendChild(title);

      // ---- 現在の速度表示 ----
      var currentLabel = document.createElement('div');
      currentLabel.id = 'tfCurrentLabel';
      currentLabel.style.cssText = 'margin:6px 0 4px;font-size:13px;';
      currentLabel.textContent = '現在の速度: ' + _currentSpeed + 'x  (fps: ' + Game.fps + ')';
      section.appendChild(currentLabel);

      // ---- スライダー ----
      var sliderWrap = document.createElement('div');
      sliderWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;';

      var slider = document.createElement('input');
      slider.type  = 'range';
      slider.min   = String(MIN_SPEED * 10);
      slider.max   = String(MAX_SPEED * 10);
      slider.step  = '1';
      slider.value = String(_currentSpeed * 10);
      slider.style.cssText = 'flex:1;cursor:pointer;';
      slider.addEventListener('input', function () {
        var v = parseFloat(slider.value) / 10;
        _applySpeed(v);
        currentLabel.textContent = '現在の速度: ' + v + 'x  (fps: ' + Game.fps + ')';
      });

      sliderWrap.appendChild(slider);
      section.appendChild(sliderWrap);

      // ---- プリセットボタン ----
      var btnWrap = document.createElement('div');
      btnWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;';

      PRESETS.forEach(function (p) {
        var btn = document.createElement('a');
        btn.className = 'option' + (_currentSpeed === p ? ' on' : '');
        btn.textContent = p + 'x';
        btn.style.cssText = 'cursor:pointer;padding:2px 10px;';
        btn.addEventListener('click', function () {
          _applySpeed(p);
          slider.value = String(p * 10);
          currentLabel.textContent = '現在の速度: ' + p + 'x  (fps: ' + Game.fps + ')';
          // ボタンの active 状態を更新
          btnWrap.querySelectorAll('.option').forEach(function (b) {
            b.className = 'option' + (b.textContent === p + 'x' ? ' on' : '');
          });
        });
        btnWrap.appendChild(btn);
      });

      section.appendChild(btnWrap);

      // ---- 注意書き ----
      var note = document.createElement('div');
      note.style.cssText = 'margin-top:8px;font-size:11px;opacity:0.6;';
      note.textContent = '※ 高速モードはCPU負荷が増加します。セーブデータには影響しません。';
      section.appendChild(note);

      // Options の先頭に挿入
      var firstChild = menu.firstChild;
      menu.insertBefore(section, firstChild);
    };
  }

  /* =========================================================
     ステータスバーへの速度表示
  ========================================================= */
  function _hookDraw() {
    if (typeof Game === 'undefined') return;
    var _origDraw = Game.Draw.bind(Game);
    Game.Draw = function () {
      _origDraw();
      _updateSpeedBadge();
    };
  }

  function _updateSpeedBadge() {
    var badge = document.getElementById('tfSpeedBadge');
    if (!badge) {
      // 初回作成: 画面右下に小さなバッジを貼る
      badge = document.createElement('div');
      badge.id = 'tfSpeedBadge';
      badge.style.cssText = [
        'position:fixed',
        'bottom:6px',
        'right:6px',
        'background:rgba(0,0,0,0.55)',
        'color:#fff',
        'font-size:11px',
        'padding:2px 7px',
        'border-radius:4px',
        'pointer-events:none',
        'z-index:9999',
        'font-family:monospace',
      ].join(';');
      document.body.appendChild(badge);
    }
    badge.textContent = '⏱ ' + _currentSpeed + 'x';
    badge.style.display = _currentSpeed === 1 ? 'none' : 'block';
  }

  /* =========================================================
     MOD 登録
  ========================================================= */
  window.CookieClickerMods.register({
    id: MOD_ID,

    init: function () {
      // 保存済み速度を読み込む
      _currentSpeed = _loadSpeed();

      // Game がロード済みか待つ
      var tries = 0;
      var interval = setInterval(function () {
        tries++;
        if (typeof Game !== 'undefined' && typeof Game.UpdateMenu === 'function' && typeof Game.Draw === 'function') {
          clearInterval(interval);
          _hookMenu();
          _hookDraw();
          _applySpeed(_currentSpeed);
          console.log('[TimeFactory] 初期化完了 speed=' + _currentSpeed + 'x  fps=' + Game.fps);
        }
        if (tries > 200) {
          clearInterval(interval);
          console.error('[TimeFactory] Game のロード待ちタイムアウト');
        }
      }, 100);
    },

    disable: function () {
      // 速度を 1x (デフォルト) に戻す
      if (typeof Game !== 'undefined') {
        Game.fps = BASE_FPS;
      }
      // バッジ削除
      var badge = document.getElementById('tfSpeedBadge');
      if (badge) badge.parentNode.removeChild(badge);
      // セクション削除
      var sec = document.getElementById('tfSection');
      if (sec) sec.parentNode.removeChild(sec);
      // 速度をリセット
      _currentSpeed = 1;
      _saveSpeed(1);
      console.log('[TimeFactory] 無効化: fps を ' + BASE_FPS + ' に戻しました');
    },
  });

})();
