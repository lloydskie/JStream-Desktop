import React from 'react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { Tabs, TabList, TabPanels, Tab, TabPanel } from '@chakra-ui/tabs';
import HomeGrid from './HomeGrid';
import DetailsPage from './DetailsPage';
import VideoPlayerPage from './VideoPlayerPage';
import VideoPlayer from './VideoPlayer';
import ProfilePage from './ProfilePage';
import ErrorBoundary from './ErrorBoundary';
import SearchPage from './SearchPage';
import MoviesPage from './MoviesPage';
import TVPage from './TVPage';
import AnimePage from './AnimePage';
import CollectionsPage from './CollectionsPage';
import PersonPage from './PersonPage';
import { useState, useEffect } from 'react';
// search UI removed from header per request
import { fetchTMDB } from '../utils/tmdbClient';
import { getPlayerConfig, buildVideasyUrl } from '../utils/remoteConfig';
import { attachGlobalScrollCapture } from './utils/scrollCapture';

// App-level state: selected movie and active tab index

export default function App() {
  // App component mounted
  React.useEffect(() => { console.log('App mounted'); }, []);
  // Attach global scroll capture so hovered scrollable elements receive wheel events
  React.useEffect(() => {
    const detach = attachGlobalScrollCapture();
    return () => detach && detach();
  }, []);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [selectedTmdbId, setSelectedTmdbId] = useState<number | null>(null);
  const [detailsTmdbId, setDetailsTmdbId] = useState<number | null>(null);
  const [detailsType, setDetailsType] = useState<'movie'|'tv'|null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [playerType, setPlayerType] = useState<'movie' | 'tv'>('movie');
  const [playerParams, setPlayerParams] = useState<Record<string, any> | null>(null);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerModalType, setPlayerModalType] = useState<'movie'|'tv'>('movie');
  const [playerModalParams, setPlayerModalParams] = useState<Record<string, any> | null>(null);
  // header search removed — SearchPage provides dedicated search UI
  const [genres, setGenres] = useState<any[]>([]);
  const [tvGenres, setTvGenres] = useState<any[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | ''>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  

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
      // fetch genre lists for movies and tv
      try {
        const g = await fetchTMDB('genre/movie/list');
        setGenres(g.genres || []);
      } catch (e) {
        console.warn('Failed to fetch movie genres', e);
      }
      try {
        const tg = await fetchTMDB('genre/tv/list');
        setTvGenres(tg.genres || []);
      } catch (e) {
        console.warn('Failed to fetch tv genres', e);
      }
    })();
  }, []);

  function handleSelectMovie(tmdbId: number, type?: 'movie'|'tv') {
    setDetailsTmdbId(tmdbId);
    setDetailsType(type || null);
    setActiveIndex(6); // switch to Details tab (moved after Collections)
  }

  function handleSelectPerson(personId: number) {
    setSelectedPersonId(personId);
    // Person panel is appended at the end of TabPanels
    setActiveIndex(9);
  }

  // header search removed

  function handlePlayMovie(tmdbId: number | string, type: 'movie'|'tv' = 'movie', params: Record<string, any> = {}) {
    const idStr = String(tmdbId);
    setSelectedTmdbId(Number(idStr) || null);
    setPlayerType(type);
    // enable full set of player features by default when opening the embedded player
    const featureParams = {
      overlay: true,
      episodeSelector: true,
      autoplayNextEpisode: true,
      nextEpisode: true,
      // color can be provided via params.color, otherwise remoteConfig.defaultColor will be used
      // default player color requested by user (without '#')
      color: 'D81F26',
    };
    const combined = { ...(params || {}), ...featureParams, tmdbId: idStr };
    setPlayerParams(combined);
    // Open the player in a fullscreen modal (user requested modal iframe)
    setPlayerModalType(type);
    setPlayerModalParams(combined);
    setPlayerModalOpen(true);
    try { (window as any).database.setPersonalization('last_selected_movie', idStr); } catch(e) { /* ignore */ }
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

  // Close modal on Escape
  useEffect(() => {
    function escHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') setPlayerModalOpen(false);
    }
    window.addEventListener('keydown', escHandler);
    return () => window.removeEventListener('keydown', escHandler);
  }, []);

  // Prevent background scrolling and interaction while modal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    if (playerModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prevOverflow || '';
    }
    return () => { document.body.style.overflow = prevOverflow || ''; };
  }, [playerModalOpen]);

  // dedicated SearchPage handles queries

  // full UI mode:

  return (
    <>
    <ChakraProvider value={defaultSystem}>
      <ErrorBoundary>
        <div className="app-shell" aria-hidden={playerModalOpen} style={playerModalOpen ? { pointerEvents: 'none' } : undefined}>
          <Tabs index={activeIndex} onChange={index => setActiveIndex(index)} isFitted variant="enclosed">
          <header className="app-header">
            <div className="brand"><div className="logo">JStream</div></div>
            <div className="top-nav">
              <TabList mb="1em">
                <Tab>Home</Tab>
                <Tab>Movies</Tab>
                <Tab>TV Shows</Tab>
                <Tab>Anime</Tab>
                <Tab>Search</Tab>
                <Tab>Collections</Tab>
              </TabList>
            </div>
            <div className="header-controls">
              <button className="profile-btn button ghost" title="Profile" onClick={()=> setActiveIndex(8)}>👤</button>
              <button aria-label="Open menu" className="hamburger button ghost" onClick={()=> setIsMobileMenuOpen(true)} style={{marginLeft:8}}>☰</button>
            </div>
          </header>

          {isMobileMenuOpen ? (
            <div className="mobile-menu-overlay surface-card" role="dialog" aria-modal={true}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{color:'#fff',fontSize:18}}>Menu</div>
                <button aria-label="Close menu" className="close-btn" onClick={()=> setIsMobileMenuOpen(false)}>✕</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <label style={{color:'#fff',fontSize:12}}>Genre</label>
                  <select className="genre-select" value={selectedGenre} onChange={e=> { const v = e.target.value; setSelectedGenre(v? parseInt(v): ''); }} aria-label="Genre select mobile">
                    <option value="">All genres</option>
                    {genres.map(g=> (<option key={g.id} value={g.id}>{g.name}</option>))}
                  </select>
                </div>
                <div>
                  <label style={{color:'#fff',fontSize:12}}>Search</label>
                  <div style={{position:'relative', marginTop:6}}>
                    <input id="mobile-search" className="search-input input" placeholder="Search..." onFocus={() => { setActiveIndex(4); setIsMobileMenuOpen(false); }} />
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <button className="menu-link" onClick={() => { setActiveIndex(0); setIsMobileMenuOpen(false); }}>Home</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(1); setIsMobileMenuOpen(false); }}>Movies</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(2); setIsMobileMenuOpen(false); }}>TV Shows</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(3); setIsMobileMenuOpen(false); }}>Anime</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(4); setIsMobileMenuOpen(false); }}>Search</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(5); setIsMobileMenuOpen(false); }}>Collections</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(6); setIsMobileMenuOpen(false); }}>Details</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(7); setIsMobileMenuOpen(false); }}>Player</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(8); setIsMobileMenuOpen(false); }}>Profile</button>
                </div>
              </div>
            </div>
          ) : null}
          <TabPanels>
            <TabPanel><HomeGrid onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} selectedTmdbId={selectedTmdbId} selectedGenre={selectedGenre} /></TabPanel>
            <TabPanel><MoviesPage genres={genres} onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
            <TabPanel><TVPage genres={tvGenres} onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
            <TabPanel><AnimePage genres={[...genres, ...tvGenres.filter(t=> !genres.find(g=>g.id===t.id))]} onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
            <TabPanel><SearchPage movieGenres={genres} tvGenres={tvGenres} onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
            <TabPanel><CollectionsPage onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
            <TabPanel><DetailsPage tmdbId={detailsTmdbId} itemTypeHint={detailsType} onPlay={handlePlayMovie} onSelect={handleSelectMovie} onSelectPerson={handleSelectPerson} /></TabPanel>
            <TabPanel><VideoPlayerPage playerType={playerType} params={playerParams} onBack={handleBackFromPlayer} /></TabPanel>
            <TabPanel><ProfilePage /></TabPanel>
            <TabPanel><PersonPage personId={selectedPersonId} onSelectWork={handleSelectMovie} /></TabPanel>
          </TabPanels>
          {/* Modal removed — Play now opens the Player tab where `VideoPlayerPage` renders the embedded player */}
        </Tabs>
        </div>
      </ErrorBoundary>
    </ChakraProvider>
    {playerModalOpen && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '90%', height: '90%', background: '#000', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}>
          <button aria-label="Close player" onClick={() => setPlayerModalOpen(false)} style={{ position: 'absolute', right: 12, top: 12, zIndex: 10, background: 'rgba(255,255,255,0.06)', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6 }}>✕</button>
          <div style={{ width: '100%', height: '100%' }}>
            <VideoPlayer type={playerModalType} params={playerModalParams || { tmdbId: selectedTmdbId }} />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
