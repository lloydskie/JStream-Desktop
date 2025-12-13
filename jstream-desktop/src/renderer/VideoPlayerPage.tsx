import React, { useEffect, useState } from "react";
import { Box, Text, Button, Spinner, HStack } from "@chakra-ui/react";
import VideoPlayer from "./VideoPlayer";
import { fetchTMDB } from "../utils/tmdbClient";

export default function VideoPlayerPage({ playerType = 'movie', params = null, onBack }: { playerType?: 'movie'|'tv', params?: Record<string, any> | null, onBack?: () => void }) {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);


  useEffect(() => {
    (async () => {
      if (!params || !params.tmdbId) return;
      setLoading(true);
      try {
        // fetch details based on type
        if (playerType === 'movie') {
          const data = await fetchTMDB(`movie/${params.tmdbId}`);
          setItem(data);
        } else if (playerType === 'tv') {
          const data = await fetchTMDB(`tv/${params.tmdbId}`);
          setItem(data);
        } else {
          setItem(null);
        }
        // load previous saved watch position
        try {
          const row = await (window as any).database.watchHistoryGet(String(params.tmdbId));
          if (row && row.position) setSavedPosition(Number(row.position));
        } catch (e) {
          console.error('Failed to load watch history:', e);
        }
      } catch (err) {
        console.error('Failed to fetch details:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [playerType, params]);

  if (!params || !params.tmdbId) return <Box p={4}><Text>Select a movie or TV show to begin playback.</Text></Box>;
  if (loading) return <Box p={4}><Spinner /></Box>;
  if (!item) return <Box p={4}><Text>Item not found.</Text></Box>;

  return (
    <div className="player-shell">
      <div className="player-top">
        {onBack && <button className="button ghost" onClick={onBack}>← Back</button>}
        <div className="player-title">{item.name || item.title}</div>
      </div>
      <div className="player-content">
        <VideoPlayer type={playerType} params={params || { tmdbId: params.tmdbId }} />
      </div>
    </div>
  );
}
