import React, { useEffect, useState } from "react";
import { getPlayerConfig, buildVideasyUrl } from "../utils/remoteConfig";

interface VideoPlayerProps {
  type: "movie" | "tv";
  params: Record<string, string | number | boolean>;
}

export default function VideoPlayer({ type, params }: VideoPlayerProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [useWebview, setUseWebview] = useState(false);
  const lastSavedRef = React.useRef<number>(0);
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);

  useEffect(() => {
    getPlayerConfig().then(config => {
      try {
        const built = buildVideasyUrl(config, type, params);
        // diagnostic: log the built url and params so we can see why the iframe may be blank
        try { console.info('VideoPlayer: params ->', params); } catch(e){}
        try { console.info('VideoPlayer: built URL ->', built); } catch(e){}
        setUrl(built);
      } catch (e) {
        console.error('VideoPlayer: failed to build url', e);
        setError('Failed to construct player URL');
      }
    }).catch(err => {
      console.error('VideoPlayer: getPlayerConfig failed', err);
      setError('Failed to load player configuration');
    });
  }, [type, params]);

  // If a saved position is found later, rebuild the player URL to include `progress` so playback starts there
  useEffect(() => {
    if (!savedPosition) return;
    if (!params || !params.tmdbId) return;
    getPlayerConfig().then(config => {
        try {
          const rebuilt = buildVideasyUrl(config, type, { ...(params || {}), progress: savedPosition });
          setUrl(rebuilt);
        } catch (e) {
          console.warn('VideoPlayer: failed to rebuild url with progress', e);
        }
    }).catch(e => console.warn('VideoPlayer: getPlayerConfig failed (progress rebuild)', e));
  }, [savedPosition]);

  // When the URL is ready, ask the main process to HEAD it and detect framing restrictions
  useEffect(() => {
    if (!url) return;
    try {
      const check = (window as any).network && (window as any).network.checkUrlHeaders;
      if (typeof check === 'function') {
        check(url).then((res: any) => {
          try { console.info('VideoPlayer: checkUrlHeaders result ->', res); } catch(e){}
          if (!res) return;
          if (res.error) {
            console.warn('checkUrlHeaders error', res.error);
            return;
          }
          const headers = res.headers || {};
          try { console.info('VideoPlayer: headers ->', headers); } catch(e){}
          try { console.info('VideoPlayer: X-Frame-Options ->', headers['x-frame-options'] || headers['X-Frame-Options']); } catch(e){}
          try { console.info('VideoPlayer: Content-Security-Policy ->', headers['content-security-policy'] || headers['Content-Security-Policy']); } catch(e){}
          const xfo = headers['x-frame-options'] || headers['X-Frame-Options'];
          const csp = headers['content-security-policy'] || headers['Content-Security-Policy'];
          if (xfo) {
            console.warn('Remote blocks embedding via X-Frame-Options:', xfo);
            console.info('VideoPlayer: setting useWebview = true (xfo)');
            setUseWebview(true);
          } else if (csp && /frame-ancestors/i.test(csp)) {
            console.warn('Remote blocks embedding via CSP frame-ancestors:', csp);
            console.info('VideoPlayer: setting useWebview = true (csp)');
            setUseWebview(true);
          }
        }).catch((e: any) => console.warn('checkUrlHeaders failed', e));
      }
    } catch (e) {
      console.warn('checkUrlHeaders invocation failed', e);
    }
  }, [url]);

  // Log render choice for debugging
  useEffect(() => {
    try { console.info('VideoPlayer: render state ->', { url, useWebview, error }); } catch (e) {}
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
            try { (window as any).database.watchHistorySet(tmdbId, position); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        // ignore parse errors
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [params]);

  // On iframe load, attempt seek to previously saved position
  const onIFrameLoad = () => {
    try {
      if (!savedPosition || !iframeRef.current) return;
      const contentWindow = iframeRef.current.contentWindow;
      if (contentWindow && typeof contentWindow.postMessage === 'function') {
        contentWindow.postMessage({ type: 'videasy:seek', position: savedPosition }, '*');
        contentWindow.postMessage({ type: 'seek', position: savedPosition }, '*');
      }
    } catch (e) {/* ignore */}
  };

  const onIFrameError = (ev?: any) => {
    console.error('VideoPlayer: iframe error', ev);
    // Try webview fallback if iframe fails to load
    setUseWebview(true);
  };

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
    <div>
      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
        {useWebview ? (
          // Use Electron webview as an in-tab fallback for sites that disallow being framed
          <>
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 5, background: 'rgba(0,0,0,0.45)', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>Using in-app fallback (webview)</div>
            <webview
              src={url}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
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
          <iframe
            onLoad={onIFrameLoad}
            onError={onIFrameError}
            ref={iframeRef}
            src={url}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
            frameBorder="0"
            allowFullScreen
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            title="Videasy Player"
          ></iframe>
        )}
      </div>
    </div>
  );
}
