import React, { useEffect, useState } from "react";
import { getPlayerConfig, buildVideasyUrl } from "../utils/remoteConfig";

interface VideoPlayerProps {
  type: "movie" | "tv";
  params: Record<string, string | number | boolean>;
  player?: string;
}

export default function VideoPlayer({ type, params, player }: VideoPlayerProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [useWebview, setUseWebview] = useState(false);
  const lastSavedRef = React.useRef<number>(0);
  const webviewRef = React.useRef<any>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [headersChecked, setHeadersChecked] = useState(false);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);
  const [viewFullscreen, setViewFullscreen] = useState(false);

  // Helper to build URLs for different named providers
  function buildProviderUrl(config: any, type: "movie" | "tv", params: Record<string, any>, playerName?: string) {
    const color = (params && (params.color as string)) || config.defaultColor || '8B5CF6';
    const wantAutoplayNext = !!((params && params.autoplayNextEpisode) ?? config.enableAutoplayNext);
    const wantAutoplay = !!((params && params.autoplay) ?? false);
    const tmdbId = params && (params.tmdbId || params.tmdb_id || params.id || params.itemId);
    const season = params && (params.season || params.season_number);
    const episode = params && (params.episode || params.episode_number);
    // Normalize player name
    const pn = String(playerName || 'Aether');
    switch (pn) {
      case 'Boreal': {
        // Vidfast: use vidfast.pro as canonical domain
        if (type === 'movie') {
          let u = `https://vidfast.pro/movie/${tmdbId}`;
          u += `?theme=${encodeURIComponent(String(color))}`;
          if (wantAutoplay) u += `&autoplay=1`;
          if (wantAutoplayNext) u += `&autoplayNext=1`;
          return u;
        }
        // tv
        if (season != null && episode != null) {
          let u = `https://vidfast.pro/tv/${tmdbId}/${season}/${episode}?theme=${encodeURIComponent(String(color))}`;
          if (wantAutoplay) u += `&autoplay=1`;
          if (wantAutoplayNext) u += `&autoplayNext=1`;
          return u;
        }
        {
          let u = `https://vidfast.pro/tv/${tmdbId}?theme=${encodeURIComponent(String(color))}`;
          if (wantAutoplay) u += `&autoplay=1`;
          if (wantAutoplayNext) u += `&autoplayNext=1`;
          return u;
        }
      }
      case 'Cygnus': {
        // Vidsrc embed
        if (type === 'movie') {
          let u = `https://vidsrc-embed.ru/embed/movie/${tmdbId}`;
          if (wantAutoplay) u += `?autoplay=1`;
          if (wantAutoplayNext) u += `${wantAutoplay ? '&' : '?'}autoplayNext=1`;
          return u;
        }
        if (season != null && episode != null) {
          let u = `https://vidsrc-embed.ru/embed/tv/${tmdbId}/${season}/${episode}`;
          if (wantAutoplay) u += `?autoplay=1`;
          if (wantAutoplayNext) u += `${wantAutoplay ? '&' : '?'}autoplayNext=1`;
          return u;
        }
        {
          let u = `https://vidsrc-embed.ru/embed/tv/${tmdbId}`;
          if (wantAutoplay) u += `?autoplay=1`;
          if (wantAutoplayNext) u += `${wantAutoplay ? '&' : '?'}autoplayNext=1`;
          return u;
        }
      }
      case 'Draco': {
        // Vidlink
        if (type === 'movie') {
          let u = `https://vidlink.pro/movie/${tmdbId}`;
          if (wantAutoplay) u += `?autoplay=1`;
          if (wantAutoplayNext) u += `${wantAutoplay ? '&' : '?'}autoplayNext=1`;
          return u;
        }
        if (season != null && episode != null) {
          let u = `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`;
          if (wantAutoplay) u += `?autoplay=1`;
          if (wantAutoplayNext) u += `${wantAutoplay ? '&' : '?'}autoplayNext=1`;
          return u;
        }
        {
          let u = `https://vidlink.pro/tv/${tmdbId}`;
          if (wantAutoplay) u += `?autoplay=1`;
          if (wantAutoplayNext) u += `${wantAutoplay ? '&' : '?'}autoplayNext=1`;
          return u;
        }
      }
      case 'Aether':
      default: {
        // Default: Videasy
        return buildVideasyUrl(config, type, params);
      }
    }
  }

  useEffect(() => {
    let mounted = true;
    getPlayerConfig().then(config => {
      if (!mounted) return;
      try {
        const built = buildProviderUrl(config, type, params || {}, player);
        // diagnostic: log the built url and params only when debug enabled
        try { if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: params ->', params); } catch(e){}
        try { if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: built URL ->', built); } catch(e){}
        setUrl(built);
      } catch (e) {
        console.error('VideoPlayer: failed to build url', e);
        setError('Failed to construct player URL');
      }
    }).catch(err => {
      console.error('VideoPlayer: getPlayerConfig failed', err);
      setError('Failed to load player configuration');
    });
    return () => { mounted = false; };
  }, [type, params, player]);

  // If a saved position is found later, rebuild the player URL to include `progress` so playback starts there
  useEffect(() => {
    if (!savedPosition) return;
    if (!params || !params.tmdbId) return;
    getPlayerConfig().then(config => {
        try {
          const rebuilt = buildProviderUrl(config, type, { ...(params || {}), progress: savedPosition }, player);
          setUrl(rebuilt);
        } catch (e) {
          console.warn('VideoPlayer: failed to rebuild url with progress', e);
        }
    }).catch(e => console.warn('VideoPlayer: getPlayerConfig failed (progress rebuild)', e));
  }, [savedPosition]);

  // When the URL is ready, ask the main process to HEAD it and detect framing restrictions
  useEffect(() => {
    if (!url) return;
    // Reset checked state while we validate headers for this URL
    setHeadersChecked(false);
    try {
      const check = (window as any).network && (window as any).network.checkUrlHeaders;
      if (typeof check === 'function') {
        check(url).then((res: any) => {
          try { if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: checkUrlHeaders result ->', res); } catch(e){}
          if (!res) return;
          if (res.error) {
            console.warn('checkUrlHeaders error', res.error);
            return;
          }
          const headers = res.headers || {};
          try { if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: headers ->', headers); } catch(e){}
          try { if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: X-Frame-Options ->', headers['x-frame-options'] || headers['X-Frame-Options']); } catch(e){}
          try { if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: Content-Security-Policy ->', headers['content-security-policy'] || headers['Content-Security-Policy']); } catch(e){}
          const xfo = headers['x-frame-options'] || headers['X-Frame-Options'];
          const csp = headers['content-security-policy'] || headers['Content-Security-Policy'];
          if (xfo) {
            if ((window as any).__JSTREAM_DEBUG) console.warn('Remote blocks embedding via X-Frame-Options:', xfo);
            if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: setting useWebview = true (xfo)');
            setUseWebview(true);
          } else if (csp && /frame-ancestors/i.test(csp)) {
            if ((window as any).__JSTREAM_DEBUG) console.warn('Remote blocks embedding via CSP frame-ancestors:', csp);
            if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: setting useWebview = true (csp)');
            setUseWebview(true);
          }
          }).catch((e: any) => { if ((window as any).__JSTREAM_DEBUG) console.warn('checkUrlHeaders failed', e); }).finally(() => setHeadersChecked(true));
      }
    } catch (e) {
      if ((window as any).__JSTREAM_DEBUG) console.warn('checkUrlHeaders invocation failed', e);
      setHeadersChecked(true);
    }
  }, [url]);

  // Auto-create a BrowserView when the URL is available and headersChecked reports embeddable
  useEffect(() => {
    if (!url || !headersChecked || useWebview || embedBlocked) return;
    let mounted = true;
    try {
      const pv = (window as any).playerView;
      if (pv && typeof pv.create === 'function') {
        pv.create(url).then((res: any) => {
          if (!mounted) return;
          if (res && res.error) {
            setEmbedBlocked(true);
            if ((window as any).__JSTREAM_DEBUG) console.warn('playerView.create returned error', res.error);
          }
        }).catch((e: any) => {
          if (!mounted) return;
          setEmbedBlocked(true);
          if ((window as any).__JSTREAM_DEBUG) console.warn('playerView.create threw', e);
        });
      }
    } catch (e) {
      if ((window as any).__JSTREAM_DEBUG) console.warn('playerView.create invocation failed', e);
      setEmbedBlocked(true);
    }
    const resizeHandler = () => {
      try {
        const pv = (window as any).playerView;
        if (!pv || typeof pv.setBounds !== 'function') return;
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        pv.setBounds({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
      } catch (e) {}
    };
    window.addEventListener('resize', resizeHandler);
    // initial bounds set
    try { resizeHandler(); } catch (e) {}
    return () => {
      mounted = false;
      try { const pv = (window as any).playerView; pv && typeof pv.destroy === 'function' && pv.destroy(); } catch (e) {}
      window.removeEventListener('resize', resizeHandler);
    };
  }, [url, headersChecked, useWebview, embedBlocked]);

  // Listen for webview load failures and fallback to opening externally
  useEffect(() => {
    if (!useWebview) return;
    const w = webviewRef.current;
    if (!w || typeof w.addEventListener !== 'function') return;
    function onFail(e: any) {
      try {
        // mark blocked and open externally
        setEmbedBlocked(true);
        openExternalUrl();
      } catch (err) {
        setEmbedBlocked(true);
      }
    }
    try {
      w.addEventListener('did-fail-load', onFail as any);
    } catch (e) {
      // some environments expose different APIs; attempt to attach via ondid-fail-load
      try { (w as any)['ondid-fail-load'] = onFail; } catch (ex) {}
    }
    return () => {
      try { w.removeEventListener && w.removeEventListener('did-fail-load', onFail as any); } catch (e) {}
    };
  }, [useWebview, url]);

  // Log render choice for debugging
  useEffect(() => {
    try { if ((window as any).__JSTREAM_DEBUG) console.info('VideoPlayer: render state ->', { url, useWebview, error }); } catch (e) {}
  }, [url, useWebview, error]);

  // Load saved progress if any and prepare for initial seek
  useEffect(() => {
    async function loadSaved() {
      try {
        const tmdbId = String(params.tmdbId || params.tmdb_id || params.id || params.itemId);
        if (!tmdbId) return;
        const pos = await (window as any).database.watchHistoryGet(tmdbId);
        if (pos && Number(pos) > 0) setSavedPosition(Number(pos));
      } catch (e) {
        // ignore
      }
    }
    loadSaved();
  }, [params]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      try {
        const msg = ev.data;
        if (!msg) return;
        // message type from the embedded player; standardize on 'videasy:progress'
        if (msg.type === 'videasy:progress' || msg.type === 'progress') {
          const position = Number(msg.position || 0);
          const tmdbId = String(params.tmdbId || params.tmdb_id || params.id || params.itemId);
          // throttle saves to once every 10 seconds and when position changed enough
          if (!tmdbId) return;
          const lastSaved = lastSavedRef.current || 0;
          if (Math.abs(position - lastSaved) > 5) { // save if changed > 5s
            lastSavedRef.current = position;
            try { if ((window as any).__JSTREAM_DEBUG) console.log('VideoPlayer: saving watch history for', tmdbId, 'at position', position); } catch (e) {}
            try { (window as any).database.watchHistorySet(tmdbId, position); } catch (e) { if ((window as any).__JSTREAM_DEBUG) console.error('watchHistorySet failed', e); }
          }
        }
      } catch (e) {
        // ignore parse errors
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [params]);

  // Listen for BrowserView fullscreen events and toggle a body class so UI can adapt
  useEffect(() => {
    try {
      const ev = (window as any).playerViewEvents;
      if (ev && typeof ev.onFullscreenChange === 'function') {
        const unsub = ev.onFullscreenChange((isFs: boolean) => {
          setViewFullscreen(!!isFs);
          try {
            if (isFs) document.documentElement.classList.add('player-view-fullscreen');
            else document.documentElement.classList.remove('player-view-fullscreen');
          } catch (e) {}
        });
        return () => { try { unsub && unsub(); } catch (e) {} };
      }
    } catch (e) {}
    return;
  }, []);

  // Listen for fullscreen requests from embedded player and open separate window
  useEffect(() => {
    try {
      const ev = (window as any).playerViewEvents;
      if (ev && typeof ev.onFullscreenRequest === 'function') {
        const unsub = ev.onFullscreenRequest((requestUrl: string) => {
          console.log('Received fullscreen request with URL:', requestUrl);
          try {
            const pw = (window as any).playerWindow;
            const pv = (window as any).playerView;
            if (pw && typeof pw.open === 'function') {
              const urlToOpen = requestUrl || url;
              console.log('Opening player window with URL:', urlToOpen);
              if (urlToOpen) {
                pw.open(urlToOpen);
                // Destroy the embedded view to stop playback in main window
                if (pv && typeof pv.destroy === 'function') {
                  pv.destroy();
                  setEmbedBlocked(true); // This will hide the player area
                }
              }
            } else {
              console.error('playerWindow API not available');
            }
          } catch (e) {
            console.error('Failed to open player in separate window', e);
          }
        });
        return () => { try { unsub && unsub(); } catch (e) {} };
      } else {
        console.error('onFullscreenRequest not available');
      }
    } catch (e) {
      console.error('Error setting up fullscreen request listener', e);
    }
    return;
  }, [url]);

  // On iframe load, attempt seek to previously saved position
  // Note: BrowserView embeds run in a separate WebContents. Seeking/progress messages
  // from the embedded player are not posted to the window; viewers that need progress
  // reporting should use the in-DOM iframe/webview fallback. For BrowserView we rely
  // on server-side resume or user controls.

  function openExternalUrl(u?: string) {
    try {
      const urlToOpen = u || url;
      if ((window as any).openExternal && typeof (window as any).openExternal.url === 'function') {
        (window as any).openExternal.url(urlToOpen);
        return;
      }
      // fallback to window.open
      window.open(urlToOpen, '_blank');
    } catch (e) {
      // ignore
    }
  }

  // (iframe error handler removed; BrowserView path used instead)

  if (!url && !error) return <div>Loading player...</div>;
  const openExternal = () => {
    try {
      if ((window as any).openExternal && typeof (window as any).openExternal.url === 'function') {
        (window as any).openExternal.url(url);
        return;
      }
      window.open(url, '_blank');
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="videoplayer-wrapper" ref={containerRef}>
      <div className="video-aspect">
        {!headersChecked ? (
          <div style={{ padding: 16 }}>Checking player availability…</div>
        ) : embedBlocked ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ marginBottom: 8, fontSize: '18px', fontWeight: 'bold' }}>The player is now opened on a separate window.</div>
            <div style={{ fontSize: '16px' }}>Enjoy Streaming ❤</div>
          </div>
        ) : useWebview ? (
          // Use Electron webview as an in-tab fallback for sites that disallow being framed
          <>
            <div className="webview-badge">Using in-app fallback (webview)</div>
            <webview
              ref={webviewRef}
              src={url}
              className="video-embed"
              partition="persist:player"
              allowpopups
            />
          </>
        ) : error ? (
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 8 }}>Player error: {error}</div>
            {url && <div style={{ marginBottom: 8, wordBreak: 'break-all' }}><strong>URL:</strong> <a href={url} target="_blank" rel="noreferrer">{url}</a></div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {url && <button className="button" onClick={openExternal}>Open Player</button>}
              <button className="button ghost" onClick={() => { setError(null); setUseWebview(false); }}>Retry</button>
            </div>
          </div>
        ) : (
          // Instead of an in-DOM iframe, create a BrowserView in the main process for
          // better embed isolation and to avoid CSP framing errors. If BrowserView cannot
          // be created, the `playerView.create` call will return an error and we'll
          // fallback to the webview / external options.
          <div style={{ padding: 8 }}>
            <div style={{ marginBottom: 8 }}>Opening player in app (BrowserView)…</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="button"
                onClick={() => {
                  try {
                    const pv = (window as any).playerView;
                    if (pv && typeof pv.create === 'function') {
                      pv.create(url).then((res: any) => {
                        if (res && res.error) {
                          setEmbedBlocked(true);
                          if ((window as any).__JSTREAM_DEBUG) console.warn('playerView.create failed', res.error);
                        }
                      }).catch((e: any) => {
                        setEmbedBlocked(true);
                      });
                    } else {
                      // playerView not available; fall back to opening externally
                      openExternalUrl();
                    }
                  } catch (e) {
                    setEmbedBlocked(true);
                  }
                }}
              >
                Open Player
              </button>
              <button className="button ghost" onClick={() => { setUseWebview(true); setEmbedBlocked(false); }}>Use in-app fallback</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
