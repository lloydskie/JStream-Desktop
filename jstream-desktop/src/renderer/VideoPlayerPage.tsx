import React, { useEffect, useState } from "react";
import { Box, Text, Button, Spinner, HStack } from "@chakra-ui/react";
import VideoPlayer from "./VideoPlayer";
import { fetchTMDB } from "../utils/tmdbClient";

export default function VideoPlayerPage({ tmdbId, onBack }: { tmdbId?: number | null, onBack?: () => void }) {
  // Video Player Page
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [savedPosition, setSavedPosition] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!tmdbId) return;
      setLoading(true);
      try {
        const data = await fetchTMDB(`movie/${tmdbId}`);
        setMovie(data);
        // load previous saved watch position
        try {
          const row = await (window as any).database.watchHistoryGet(String(tmdbId));
          if (row && row.position) setSavedPosition(Number(row.position));
        } catch (e) {
          console.error('Failed to load watch history:', e);
        }
      } catch (err) {
        console.error('Failed to fetch movie details:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [tmdbId]);

  if (!tmdbId) return <Box p={4}><Text>Select a movie from Home or Search to begin playback.</Text></Box>;
  if (loading) return <Box p={4}><Spinner /></Box>;
  if (!movie) return <Box p={4}><Text>Movie not found.</Text></Box>;

  return (
    <Box p={4}>
      {onBack && <Button mb={4} onClick={onBack}>Back to Home</Button>}
      <Text fontSize="2xl" fontWeight="bold" mb={2}>{movie.title}</Text>
      <Text mb={4}>{movie.overview}</Text>
      {savedPosition !== null && (
        <HStack mb={4}>
          <Text>Resume at: {Math.floor(savedPosition / 60)}:{String(Math.floor(savedPosition % 60)).padStart(2,'0')}</Text>
          <Button size="sm" onClick={() => {
            // send a message to the iframe to seek if supported; otherwise, save as demo
            const iframe = document.querySelector('iframe');
            if (iframe) {
              try { (iframe as HTMLIFrameElement).contentWindow?.postMessage({ action: 'seek', time: savedPosition }, '*'); } catch (e) { /* ignored */ }
            }
          }}>Resume</Button>
          <Button size="sm" onClick={async () => {
            // Save demo position as current
            try {
              await (window as any).database.watchHistorySet(String(tmdbId), 0);
              setSavedPosition(0);
            } catch (e) { console.error('Failed to set position', e); }
          }}>Mark Reset</Button>
        </HStack>
      )}
      <VideoPlayer type="movie" params={{ tmdbId }} />
    </Box>
  );
}
