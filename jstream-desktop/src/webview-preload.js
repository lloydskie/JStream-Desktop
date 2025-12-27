// jstream-desktop/src/webview-preload.js
(function() {
  document.title = '[JSTREAM PRELOAD ACTIVE]';
  console.log('[JSTREAM] webview-preload.js running');
  function styleIframe(i) {
    try {
      i.style.setProperty('height', '100%', 'important');
      i.style.setProperty('width', '100%', 'important');
      i.style.setProperty('display', 'block', 'important');
      i.style.setProperty('border', '0', 'important');
      i.style.setProperty('flex', '1 1 auto', 'important');
      i.setAttribute && i.setAttribute('allowfullscreen', '');
    } catch (e) {}
  }
  function ensureAncestors(el) {
    try {
      let cur = el.parentElement;
      let depth = 0;
      while (cur && depth < 10) {
        try {
          cur.style.setProperty('height', '100%', 'important');
          cur.style.setProperty('minHeight', '0', 'important');
          cur.style.setProperty('flex', '1 1 auto', 'important');
          cur.style.setProperty('box-sizing', 'border-box', 'important');
          if (window.getComputedStyle(cur).display === 'inline') cur.style.setProperty('display', 'block', 'important');
        } catch (e) {}
        cur = cur.parentElement; depth++;
      }
    } catch (e) {}
  }
  function styleAllIframes() {
    document.documentElement && document.documentElement.style.setProperty('height', '100%', 'important');
    document.body && document.body.style.setProperty('height', '100%', 'important');
    Array.from(document.querySelectorAll('iframe')).forEach(i => { 
      styleIframe(i); 
      ensureAncestors(i); 
    });
  }
  // Inject aggressive CSS
  const style = document.createElement('style');
  style.innerHTML = `
    html, body, #root, .video-aspect, .player-modal-box, .video-embed, webview, iframe {
      height: 100% !important;
      min-height: 0 !important;
      width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
      display: block !important;
      border: 0 !important;
      flex: 1 1 auto !important;
      position: static !important;
      padding: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
      background: #000 !important;
    }
    iframe[allowfullscreen] { height: 100% !important; width: 100% !important; }
  `;
  document.head.appendChild(style);

  // requestAnimationFrame loop to re-apply inline styles
  function enforceAll() {
    try {
      document.documentElement && document.documentElement.style.setProperty('height', '100%', 'important');
      document.body && document.body.style.setProperty('height', '100%', 'important');
      Array.from(document.querySelectorAll('iframe')).forEach(i => {
        i.style.setProperty('height', '100%', 'important');
        i.style.setProperty('width', '100%', 'important');
        i.style.setProperty('display', 'block', 'important');
        i.style.setProperty('border', '0', 'important');
        i.style.setProperty('flex', '1 1 auto', 'important');
        i.setAttribute && i.setAttribute('allowfullscreen', '');
        // Ancestors
        let cur = i.parentElement, depth = 0;
        while (cur && depth < 10) {
          cur.style.setProperty('height', '100%', 'important');
          cur.style.setProperty('minHeight', '0', 'important');
          cur.style.setProperty('flex', '1 1 auto', 'important');
          cur.style.setProperty('box-sizing', 'border-box', 'important');
          if (window.getComputedStyle(cur).display === 'inline') cur.style.setProperty('display', 'block', 'important');
          cur = cur.parentElement; depth++;
        }
      });
    } catch (e) { console.warn('[JSTREAM] enforceAll error', e); }
    requestAnimationFrame(enforceAll);
  }
  enforceAll();
)();
(function() {
  document.title = '[JSTREAM PRELOAD ACTIVE]';
  console.log('[JSTREAM] webview-preload.js running');
  function styleIframe(i) {
    try {
      i.style.setProperty('height', '100%', 'important');
      i.style.setProperty('width', '100%', 'important');
      i.style.setProperty('display', 'block', 'important');
      i.style.setProperty('border', '0', 'important');
      i.style.setProperty('flex', '1 1 auto', 'important');
      i.setAttribute && i.setAttribute('allowfullscreen', '');
    } catch (e) {}
  }
  function ensureAncestors(el) {
    try {
      let cur = el.parentElement;
      let depth = 0;
      while (cur && depth < 10) {
        try {
          cur.style.setProperty('height', '100%', 'important');
          cur.style.setProperty('minHeight', '0', 'important');
          cur.style.setProperty('flex', '1 1 auto', 'important');
          cur.style.setProperty('box-sizing', 'border-box', 'important');
          if (window.getComputedStyle(cur).display === 'inline') cur.style.setProperty('display', 'block', 'important');
        } catch (e) {}
        cur = cur.parentElement; depth++;
      }
    } catch (e) {}
  }
  function styleAllIframes() {
    document.documentElement && document.documentElement.style.setProperty('height', '100%', 'important');
    document.body && document.body.style.setProperty('height', '100%', 'important');
      Array.from(document.querySelectorAll('iframe')).forEach(i => { 
        styleIframe(i); 
        ensureAncestors(i); 
      });
  }
    // Inject aggressive CSS
    const style = document.createElement('style');
    style.innerHTML = `
      html, body, #root, .video-aspect, .player-modal-box, .video-embed, webview, iframe {
        height: 100% !important;
        min-height: 0 !important;
        width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
        display: block !important;
        border: 0 !important;
        flex: 1 1 auto !important;
        position: static !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
        background: #000 !important;
      }
      iframe[allowfullscreen] { height: 100% !important; width: 100% !important; }
    `;
    document.head.appendChild(style);

    // requestAnimationFrame loop to re-apply inline styles
    function enforceAll() {
      try {
        document.documentElement && document.documentElement.style.setProperty('height', '100%', 'important');
        document.body && document.body.style.setProperty('height', '100%', 'important');
        Array.from(document.querySelectorAll('iframe')).forEach(i => {
          i.style.setProperty('height', '100%', 'important');
          i.style.setProperty('width', '100%', 'important');
          i.style.setProperty('display', 'block', 'important');
          i.style.setProperty('border', '0', 'important');
          i.style.setProperty('flex', '1 1 auto', 'important');
          i.setAttribute && i.setAttribute('allowfullscreen', '');
          // Ancestors
          let cur = i.parentElement, depth = 0;
          while (cur && depth < 10) {
            cur.style.setProperty('height', '100%', 'important');
            cur.style.setProperty('minHeight', '0', 'important');
            cur.style.setProperty('flex', '1 1 auto', 'important');
            cur.style.setProperty('box-sizing', 'border-box', 'important');
            if (window.getComputedStyle(cur).display === 'inline') cur.style.setProperty('display', 'block', 'important');
            cur = cur.parentElement; depth++;
          }
        });
      } catch (e) { console.warn('[JSTREAM] enforceAll error', e); }
      requestAnimationFrame(enforceAll);
    }
    enforceAll();
})();
