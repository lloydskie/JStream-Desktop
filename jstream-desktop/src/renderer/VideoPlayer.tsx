import React, { useEffect, useState } from "react";
import { getPlayerConfig, buildVideasyUrl } from "../utils/remoteConfig";

interface VideoPlayerProps {
  type: "movie" | "tv" | "anime";
  params: Record<string, string | number | boolean>;
}

export default function VideoPlayer({ type, params }: VideoPlayerProps) {
  const [url, setUrl] = useState("");
  const lastSavedRef = React.useRef<number>(0);
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);

  useEffect(() => {
    getPlayerConfig().then(config => {
      setUrl(buildVideasyUrl(config, type, params));
    });
  }, [type, params]);

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

  if (!url) return <div>Loading player...</div>;

  return (
    <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
      <iframe
        onLoad={onIFrameLoad}
        ref={iframeRef}
        src={url}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        frameBorder="0"
        allowFullScreen
        allow="encrypted-media"
        title="Videasy Player"
      ></iframe>
    </div>
  );
}
