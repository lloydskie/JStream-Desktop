import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './renderer/App';

// Suppress noisy console output (keep warnings/errors). Set `window.__JSTREAM_DEBUG = true` to re-enable.
try {
  const win: any = window;
  const keep = Boolean(win && win.__JSTREAM_DEBUG);
  if (!keep) {
    // silence common noisy methods in renderer (including warnings)
    console.debug = () => {};
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
  }
} catch (e) { /* ignore */ }

// Early wrapper for __appTrailerController to block direct resume() calls
// while a details modal is open. Placing here ensures it runs before
// other modules that may assign the controller.
try {
  const win = window as any;
  let internalController = win.__appTrailerController;
  Object.defineProperty(win, '__appTrailerController', {
    configurable: true,
    enumerable: true,
    get() { return internalController; },
    set(val) {
      try {
        if (!val) { internalController = val; return; }
        const orig = val;
        const wrapped: any = {};
        if (typeof orig.resume === 'function') {
          wrapped.resume = function(...args: any[]) {
            try {
              if (win.__heroModalOpen) {
                console.debug('EarlyWrapper: blocked direct resume while modal open');
                return;
              }
            } catch (e) { /* ignore */ }
            return orig.resume.apply(orig, args);
          };
        }
        if (typeof orig.pause === 'function') wrapped.pause = function(...a: any[]) { return orig.pause.apply(orig, a); };
        for (const k of Object.keys(orig)) if (!(k in wrapped)) wrapped[k] = (orig as any)[k];
        internalController = wrapped;
      } catch (e) { internalController = val; }
    }
  });
  if (internalController) {
    const tmp = internalController;
    delete (window as any).__appTrailerController;
    (window as any).__appTrailerController = tmp;
  }
} catch (e) { /* ignore */ }

// Global error handlers so the user sees anything that throws during app startup
// Global error handlers are useful during debugging but can be noisy in the dev UI.
// Keep them commented out so we can re-enable easily while developing.
// window.addEventListener('error', (event) => {
//   console.error('Unhandled error:', event.error || event.message);
//   document.body.innerHTML = `<div style="padding:20px"><h2>Unhandled error</h2><pre>${String(event.error || event.message)}</pre></div>`;
// });
//
// window.addEventListener('unhandledrejection', (e) => {
//   console.error('Unhandled rejection:', e.reason);
//   document.body.innerHTML = `<div style="padding:20px"><h2>Unhandled rejection</h2><pre>${String(e.reason)}</pre></div>`;
// });

const container = document.getElementById('root') || (() => {
  const el = document.createElement('div');
  el.id = 'root';
  document.body.appendChild(el);
  return el;
})();

// Renderer entry

const root = createRoot(container);
try {
  root.render(<App />);
} catch (err) {
  // Render error to the document so it's visible in the app window
  console.error('Error during root.render:', err);
  document.body.innerHTML = `<div style="padding:20px"><h2>Renderer error</h2><pre>${String(err)}</pre></div>`;
}
