import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './renderer/App';

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
