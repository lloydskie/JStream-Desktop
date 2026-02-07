// JSTREAM webview-preload.js
(function() {
	// Wait for document to be ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	function init() {
		try {
			// Inject even more aggressive CSS
			const style = document.createElement('style');
			style.innerHTML = `
				*, *::before, *::after {
					box-sizing: border-box !important;
					max-width: 100% !important;
					max-height: 100% !important;
					aspect-ratio: unset !important;
				}
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
					max-width: 100% !important;
					max-height: 100% !important;
					aspect-ratio: unset !important;
				}
				iframe[allowfullscreen] { height: 100% !important; width: 100% !important; }
				/* Hide duplicate progress bars */
				.progress-bar:not(:first-of-type), .progress:not(:first-of-type), .seek-bar:not(:first-of-type), .buffer:not(:first-of-type), .progressBar:not(:first-of-type), .seekbar:not(:first-of-type) {
					display: none !important;
				}
			`;
			document.head.appendChild(style);

			// MutationObserver to re-apply styles on DOM changes
			const observer = new MutationObserver(() => {
				enforceAll();
			});
			observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

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
						i.style.setProperty('max-width', '100%', 'important');
						i.style.setProperty('max-height', '100%', 'important');
						i.style.setProperty('aspect-ratio', 'unset', 'important');
						i.setAttribute && i.setAttribute('allowfullscreen', '');
						// Ancestors
						let cur = i.parentElement, depth = 0;
						while (cur && depth < 10) {
							cur.style.setProperty('height', '100%', 'important');
							cur.style.setProperty('minHeight', '0', 'important');
							cur.style.setProperty('flex', '1 1 auto', 'important');
							cur.style.setProperty('box-sizing', 'border-box', 'important');
							cur.style.setProperty('max-width', '100%', 'important');
							cur.style.setProperty('max-height', '100%', 'important');
							cur.style.setProperty('aspect-ratio', 'unset', 'important');
							if (window.getComputedStyle(cur).display === 'inline') cur.style.setProperty('display', 'block', 'important');
							cur = cur.parentElement; depth++;
						}
					});
				} catch (e) { console.warn('[JSTREAM] enforceAll error', e); }
				requestAnimationFrame(enforceAll);
			}
			enforceAll();
		} catch (e) {
			console.warn('[JSTREAM] preload init error', e);
		}
	}
})();
