/**
 * pwa.js  ―  Cookie Clicker PWA 登録 & インストール促進
 * ====================================================
 *  - Service Worker を登録（オフライン対応）
 *  - beforeinstallprompt をフックしてホーム画面追加ボタンを左下に表示
 *  - iOS Safari 向けには手動インストール手順を案内
 */

(function () {
  'use strict';

  /* ============================================================
     Service Worker 登録
  ============================================================ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        console.log('[PWA] Service Worker 登録完了 scope=' + reg.scope);
      }).catch(function (err) {
        console.warn('[PWA] Service Worker 登録失敗:', err);
      });
    });
  }

  /* ============================================================
     インストールボタン
  ============================================================ */
  var DISMISS_KEY = 'CC_PWA_InstallDismissed';
  var deferredPrompt = null;
  var btn = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function wasDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }
  function setDismissed() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  }

  function injectStyle() {
    if (document.getElementById('pwaInstallStyle')) return;
    var css = [
      '#pwaInstallBox{position:fixed;left:8px;bottom:8px;z-index:99999;',
        'background:linear-gradient(180deg,#5a3a08 0%,#2e1a04 100%);',
        'border:2px solid #c8900a;border-radius:8px;color:#ffe87a;',
        'font-family:Georgia,"Times New Roman",serif;font-size:12px;',
        'padding:10px 12px;max-width:300px;',
        'box-shadow:0 6px 20px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,220,100,0.25);',
        'animation:pwaSlideIn 0.4s ease-out;}',
      '#pwaInstallBox .pwa-title{font-size:13px;font-weight:bold;',
        'text-shadow:0 1px 0 #000;margin-bottom:6px;}',
      '#pwaInstallBox .pwa-desc{font-size:11px;color:#d8b060;margin-bottom:8px;line-height:1.4;}',
      '#pwaInstallBox .pwa-actions{display:flex;gap:6px;}',
      '#pwaInstallBox button{background:linear-gradient(180deg,#8b6914 0%,#5a3a08 100%);',
        'border:1px solid #c8900a;color:#fff3b0;padding:5px 12px;border-radius:5px;',
        'cursor:pointer;font-family:Georgia,serif;font-size:11px;',
        'box-shadow:0 2px 0 #1a0e02,inset 0 1px 0 rgba(255,220,100,0.22);}',
      '#pwaInstallBox button:hover{filter:brightness(1.2);}',
      '#pwaInstallBox button.dismiss{background:linear-gradient(180deg,#3a2a14 0%,#1a1004 100%);',
        'color:#a08040;border-color:#5a3a10;}',
      '@keyframes pwaSlideIn{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}',
      '@media (max-width:480px){#pwaInstallBox{left:4px;right:4px;bottom:4px;max-width:none;font-size:11px;}}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'pwaInstallStyle';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function showBox(html, onInstall) {
    if (document.getElementById('pwaInstallBox')) return;
    injectStyle();
    var box = document.createElement('div');
    box.id = 'pwaInstallBox';
    box.innerHTML = html;
    document.body.appendChild(box);
    btn = box;

    var installBtn = box.querySelector('.install');
    var dismissBtn = box.querySelector('.dismiss');
    if (installBtn && onInstall) installBtn.onclick = onInstall;
    if (dismissBtn) dismissBtn.onclick = function () {
      setDismissed();
      hideBox();
    };
  }

  function hideBox() {
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    btn = null;
  }

  /* === Android / Chrome 系 === */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (isStandalone() || wasDismissed()) return;

    // ゲームが落ち着いてから表示
    setTimeout(function () {
      showBox(
        '<div class="pwa-title">🍪 ホーム画面に追加</div>' +
        '<div class="pwa-desc">アプリのように起動できます。オフラインでも遊べます！</div>' +
        '<div class="pwa-actions">' +
          '<button class="install">📲 追加する</button>' +
          '<button class="dismiss">あとで</button>' +
        '</div>',
        function () {
          if (!deferredPrompt) { hideBox(); return; }
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function (choice) {
            console.log('[PWA] インストール選択:', choice.outcome);
            if (choice.outcome === 'accepted') setDismissed();
            deferredPrompt = null;
            hideBox();
          });
        }
      );
    }, 8000);
  });

  /* === iOS Safari === */
  window.addEventListener('load', function () {
    if (!isIOS() || isStandalone() || wasDismissed()) return;
    setTimeout(function () {
      showBox(
        '<div class="pwa-title">🍪 ホーム画面に追加</div>' +
        '<div class="pwa-desc">下部の <b>共有</b> ボタン → <b>「ホーム画面に追加」</b> でアプリとしてインストールできます。</div>' +
        '<div class="pwa-actions">' +
          '<button class="dismiss">わかった</button>' +
        '</div>',
        null
      );
    }, 10000);
  });

  /* === インストール完了 === */
  window.addEventListener('appinstalled', function () {
    console.log('[PWA] インストール完了');
    setDismissed();
    hideBox();
  });

})();
