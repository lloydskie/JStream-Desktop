import React from 'react';
import { ChakraProvider, DialogRoot, DialogBackdrop, DialogContent, DialogHeader, DialogBody, DialogCloseTrigger, CloseButton, defaultSystem } from '@chakra-ui/react';
import { Tabs, TabList, TabPanels, Tab, TabPanel } from '@chakra-ui/tabs';
import HomeGrid from './HomeGrid';
import MovieDetailModal from './MovieDetailModal';
import VideoPlayerPage from './VideoPlayerPage';
import AccountPage from './AccountPage';
import SettingsPage from './SettingsPage';
import ErrorBoundary from './ErrorBoundary';
import SearchPage from './SearchPage';
import { useState, useEffect } from 'react';

// App-level state: selected movie and active tab index

export default function App() {
  // App component mounted
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [selectedTmdbId, setSelectedTmdbId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTmdbId, setModalTmdbId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const lastSelected = await (window as any).database.getPersonalization('last_selected_movie');
        if (lastSelected) {
          setSelectedTmdbId(parseInt(lastSelected));
        }
      } catch (err) {
        console.error('Failed to load last selected movie:', err);
      }
    })();
  }, []);

  function handleSelectMovie(tmdbId: number) {
    setModalTmdbId(tmdbId);
    setIsModalOpen(true);
  }

  function handlePlayMovie(tmdbId: number) {
    setSelectedTmdbId(tmdbId);
    setActiveIndex(2); // switch to Player tab
    setIsModalOpen(false);
    (window as any).database.setPersonalization('last_selected_movie', tmdbId.toString());
  }

  function handleBackFromPlayer() {
    setActiveIndex(0); // back to Home
  }

  // Keyboard shortcuts
  useEffect(() => {
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'b') {
        setActiveIndex(0);
      }
      if (e.key === 'f') {
        // toggle favorite (for selected movie)
        if (selectedTmdbId) {
          (async () => {
            try {
              const isFav = await (window as any).database.favoritesIs(String(selectedTmdbId), 'movie');
              if (isFav) {
                await (window as any).database.favoritesRemove(String(selectedTmdbId), 'movie');
              } else {
                await (window as any).database.favoritesAdd(String(selectedTmdbId), 'movie');
              }
            } catch (err) { console.error('Keyboard favorite toggle failed', err); }
          })();
        }
      }
    }
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [selectedTmdbId]);

  // full UI mode:

  return (
    <ChakraProvider value={defaultSystem}>
      <ErrorBoundary>
        <Tabs index={activeIndex} onChange={index => setActiveIndex(index)} isFitted variant="enclosed">
          <TabList mb="1em">
            <Tab>Home</Tab>
            <Tab>Search</Tab>
            <Tab>Player</Tab>
            <Tab>Account</Tab>
            <Tab>Settings</Tab>
          </TabList>
          <TabPanels>
            <TabPanel><HomeGrid onSelectMovie={handleSelectMovie} selectedTmdbId={selectedTmdbId} /></TabPanel>
            <TabPanel><SearchPage onSelectMovie={handleSelectMovie} selectedTmdbId={selectedTmdbId} /></TabPanel>
            <TabPanel><VideoPlayerPage tmdbId={selectedTmdbId} onBack={handleBackFromPlayer} /></TabPanel>
            <TabPanel><AccountPage /></TabPanel>
            <TabPanel><SettingsPage /></TabPanel>
          </TabPanels>
        </Tabs>
        <DialogRoot open={isModalOpen} onOpenChange={(open) => setIsModalOpen(open)}>
          <DialogBackdrop />
          <DialogContent>
            <DialogHeader>Movie Details</DialogHeader>
            <DialogCloseTrigger as={CloseButton} />
            <DialogBody>
              <MovieDetailModal tmdbId={modalTmdbId} onPlay={handlePlayMovie} />
            </DialogBody>
          </DialogContent>
        </DialogRoot>
      </ErrorBoundary>
    </ChakraProvider>
  );
}
