import React from 'react';
import { createPortal } from 'react-dom';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { Tabs, TabList, TabPanels, Tab, TabPanel } from '@chakra-ui/tabs';
import HomeGrid from './HomeGrid';
import DetailsModal from './DetailsModal';
import VideoPlayerPage from './VideoPlayerPage';
import VideoPlayer from './VideoPlayer';
import ProfilePage from './ProfilePage';
import MyListPage from './MyListPage';
import ErrorBoundary from './ErrorBoundary';
import SearchPage from './SearchPage';
import MoviesPage from './MoviesPage';
import BrowseLanguagesPage from './BrowseLanguagesPage';
import TVPage from './TVPage';
import AnimePage from './AnimePage';
import CollectionsPage from './CollectionsPage';
import PersonPage from './PersonPage';
import NewPopularPage from './NewPopularPage';
import ContinueWatching from './components/ContinueWatching';
import TopSearches from './components/TopSearches';
import HeroBanner from './components/HeroBanner';
import CustomSelect from './components/CustomSelect';
import WelcomeScreen from './WelcomeScreen';
import { useState, useEffect } from 'react';
// search UI removed from header per request
import { fetchTMDB } from '../utils/tmdbClient';
import { getPlayerConfig, buildVideasyUrl } from '../utils/remoteConfig';
import { attachGlobalScrollCapture } from './utils/scrollCapture';

// App-level state: selected movie and active tab index

// Initialize a global guard for direct controller assignments so direct
// calls to `__appTrailerController.resume()` are blocked while the
// details modal is open. This runs at module load so it is in place
// before other modules assign the controller.
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
        // Wrap resume so it respects the modal-open guard
        if (typeof orig.resume === 'function') {
          wrapped.resume = function(...args: any[]) {
            try {
              if (win.__heroModalOpen) {
                try { console.debug('TrailerController: blocked direct resume while modal open'); } catch (e) {}
                return;
              }
            } catch (e) { /* ignore */ }
            return orig.resume.apply(orig, args);
          };
        }
        // Pass through pause and other methods
        if (typeof orig.pause === 'function') wrapped.pause = function(...a: any[]) { return orig.pause.apply(orig, a); };
        for (const k of Object.keys(orig)) {
          if (!(k in wrapped)) wrapped[k] = (orig as any)[k];
        }
        internalController = wrapped;
      } catch (e) {
        try { internalController = val; } catch (err) {}
      }
    }
  });
  // If controller was already present, reassign to trigger wrapping
  try {
    if (internalController) {
      const tmp = internalController;
      delete (window as any).__appTrailerController;
      (window as any).__appTrailerController = tmp;
    }
  } catch (e) { /* ignore */ }
} catch (e) { /* ignore */ }

export default function App() {
  // Account state - show welcome screen if no account is logged in
  const [currentAccountId, setCurrentAccountId] = useState<string | null | undefined>(undefined); // undefined = loading, null = no account
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [currentAccountAvatar, setCurrentAccountAvatar] = useState<{ emoji?: string; image?: string } | null>(null);
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenBar, setShowFullscreenBar] = useState(false);
  
  // Check fullscreen state on mount and listen for changes
  useEffect(() => {
    (async () => {
      try {
        const fullscreen = await (window as any).windowControls?.isFullscreen();
        setIsFullscreen(fullscreen || false);
      } catch (e) {}
    })();
    
    // Listen for fullscreen changes from main process
    const cleanup = (window as any).windowControls?.onFullscreenChange?.((fullscreen: boolean) => {
      setIsFullscreen(fullscreen);
      if (!fullscreen) {
        setShowFullscreenBar(false);
      }
    });
    
    return () => cleanup?.();
  }, []);
  
  // Handle mouse movement at top of screen to show fullscreen exit bar
  useEffect(() => {
    if (!isFullscreen) return;
    
    let hideTimeout: ReturnType<typeof setTimeout>;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY <= 10) {
        setShowFullscreenBar(true);
        clearTimeout(hideTimeout);
      } else if (e.clientY > 50 && showFullscreenBar) {
        hideTimeout = setTimeout(() => setShowFullscreenBar(false), 500);
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(hideTimeout);
    };
  }, [isFullscreen, showFullscreenBar]);
  
  // Add/remove fullscreen class on body for CSS styling
  useEffect(() => {
    if (isFullscreen) {
      document.body.classList.add('app-fullscreen');
    } else {
      document.body.classList.remove('app-fullscreen');
    }
    return () => {
      document.body.classList.remove('app-fullscreen');
    };
  }, [isFullscreen]);
  
  // Add/remove show-fullscreen-bar class when bar is visible (hides navbar)
  useEffect(() => {
    if (showFullscreenBar) {
      document.body.classList.add('show-fullscreen-bar');
    } else {
      document.body.classList.remove('show-fullscreen-bar');
    }
    return () => {
      document.body.classList.remove('show-fullscreen-bar');
    };
  }, [showFullscreenBar]);
  
  // Check for current account on mount
  useEffect(() => {
    (async () => {
      try {
        const accountId = await (window as any).accounts.current();
        setCurrentAccountId(accountId);
        if (accountId) {
          // Load avatar info
          const accounts = await (window as any).accounts.list();
          const account = accounts?.find((a: any) => a.id === accountId);
          const avatarImage = await (window as any).accounts.loadAvatar(accountId);
          setCurrentAccountAvatar({
            emoji: account?.avatar,
            image: avatarImage || undefined
          });
        }
      } catch (e) {
        console.error('Failed to get current account:', e);
        setCurrentAccountId(null);
      }
      setAccountsLoaded(true);
    })();
  }, []);

  // Handler when account is selected from WelcomeScreen
  const handleAccountSelected = async (accountId: string) => {
    setCurrentAccountId(accountId);
    // Load avatar for selected account
    try {
      const accounts = await (window as any).accounts.list();
      const account = accounts?.find((a: any) => a.id === accountId);
      const avatarImage = await (window as any).accounts.loadAvatar(accountId);
      setCurrentAccountAvatar({
        emoji: account?.avatar,
        image: avatarImage || undefined
      });
    } catch (e) {
      console.error('Failed to load avatar:', e);
    }
  };

  // Handler when a new account is created
  const handleAccountCreated = async (account: { id: string; name: string; avatar: string; avatarImage?: string }) => {
    setCurrentAccountId(account.id);
    // Use the avatar image passed directly if available, otherwise load it
    if (account.avatarImage) {
      setCurrentAccountAvatar({
        emoji: account.avatar,
        image: account.avatarImage
      });
    } else {
      try {
        const avatarImage = await (window as any).accounts.loadAvatar(account.id);
        setCurrentAccountAvatar({
          emoji: account.avatar,
          image: avatarImage || undefined
        });
      } catch (e) {
        console.error('Failed to load avatar:', e);
        setCurrentAccountAvatar({ emoji: account.avatar });
      }
    }
  };

  // Log the defaultSystem so we can verify it's present in the renderer bundle
  try { console.debug('Chakra defaultSystem:', defaultSystem); } catch (e) { console.debug('Chakra defaultSystem: <failed to read>'); }
  // Use default Chakra theme by leaving ChakraProvider without an explicit theme
  // App component mounted
  React.useEffect(() => { console.log('App mounted'); }, []);
  // Intercept resume events at app-level to prevent accidental resume while details modal is open
  useEffect(() => {
    function onResumeIntercept(evt: Event) {
      try {
        const isOpen = Boolean((window as any).__heroModalOpen);
        if (isOpen) {
          try { console.debug('App: intercepted app:resume-hero-trailer while modal open — blocking resume'); } catch (e) {}
          // prevent other listeners from running (stopImmediatePropagation in capture phase)
          try { (evt as any).stopImmediatePropagation && (evt as any).stopImmediatePropagation(); } catch (e) {}
        }
      } catch (e) { /* ignore */ }
    }
    // use capture so we run before other listeners
    window.addEventListener('app:resume-hero-trailer', onResumeIntercept as EventListener, true);
    return () => window.removeEventListener('app:resume-hero-trailer', onResumeIntercept as EventListener, true);
  }, []);
  // Attach global scroll capture so hovered scrollable elements receive wheel events
  React.useEffect(() => {
    const detach = attachGlobalScrollCapture();
    return () => detach && detach();
  }, []);

  // Ensure the app opens on Home on first run after account sign-in.
  // Some environments may have a stale saved tab; treat the very first
  // app start as an opportunity to show Home and then remember we've
  // performed the initial normalization so we don't override user
  // preference on subsequent runs.
  React.useEffect(() => {
    try {
      if (!accountsLoaded) return;
      // Only run once ever (per-machine) — use a separate flag
      const seenFlag = localStorage.getItem('jstream_seenInitialTab');
      if (!seenFlag) {
        // Mark we've normalized the initial tab
        localStorage.setItem('jstream_seenInitialTab', '1');
        // If current account is set, ensure we show Home
        if (currentAccountId) {
          setActiveIndex(0);
        }
      }
    } catch (e) { /* ignore */ }
  }, [accountsLoaded, currentAccountId]);
  const [activeIndex, setActiveIndex] = useState<number>(() => {
    // Restore active tab from localStorage on initial load
    try {
      const saved = localStorage.getItem('jstream_activeTab');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch (e) {}
    return 0;
  });
  
  // Save active tab to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('jstream_activeTab', String(activeIndex));
    } catch (e) {}
  }, [activeIndex]);
  
  const [selectedTmdbId, setSelectedTmdbId] = useState<number | null>(null);
  // legacy details page state removed — using modal state below
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsModalTmdbId, setDetailsModalTmdbId] = useState<number | null>(null);
  const [detailsModalType, setDetailsModalType] = useState<'movie'|'tv'|null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [playerType, setPlayerType] = useState<'movie' | 'tv'>('movie');
  const [playerParams, setPlayerParams] = useState<Record<string, any> | null>(null);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerModalType, setPlayerModalType] = useState<'movie'|'tv'>('movie');
  const [playerModalParams, setPlayerModalParams] = useState<Record<string, any> | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<'Aether'|'Boreal'|'Cygnus'|'Draco'>('Aether');
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  // Player modal TV selectors
  const [playerSeasons, setPlayerSeasons] = useState<any[] | null>(null);
  const [playerSeasonEpisodes, setPlayerSeasonEpisodes] = useState<any[] | null>(null);
  const [playerSelectedSeason, setPlayerSelectedSeason] = useState<number | null>(null);
  const [playerSelectedEpisode, setPlayerSelectedEpisode] = useState<number | null>(null);
  // Fetch seasons when TV player opens
  // Serialize playerModalParams to ensure in-place updates still trigger effects
  const playerModalParamsKey = React.useMemo(() => JSON.stringify(playerModalParams || {}), [playerModalParams]);

  // Debug: log when player modal opens and the selected player/params
  React.useEffect(() => {
    try {
      if (!playerModalOpen) return;
      console.info('App: player modal opened; selectedPlayer ->', selectedPlayer, 'playerModalParams ->', playerModalParams);
    } catch (e) {}
  }, [playerModalOpen, selectedPlayer, playerModalParamsKey]);

  // Propagate selectedPlayer into playerModalParams while the modal is open so
  // TV player receives immediate updates when the user switches providers.
  React.useEffect(() => {
    try {
      if (!playerModalOpen) return;
      console.info('App: propagating selectedPlayer to playerModalParams ->', selectedPlayer);
      setPlayerModalParams((p: any) => ({ ...(p || {}), player: selectedPlayer }));
    } catch (e) {}
  }, [selectedPlayer, playerModalOpen]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!playerModalOpen || playerModalType !== 'tv') return;
        const tmdbId = playerModalParams && (playerModalParams.tmdbId || playerModalParams.id || playerModalParams.showId);
        if (!tmdbId) return;
        const details = await fetchTMDB(`tv/${tmdbId}`);
        if (!mounted) return;
        const seasons = details.seasons || [];
        setPlayerSeasons(seasons);
        // default to Season 1 if available, otherwise first season
        const hasSeason1 = seasons.find((s: any) => Number(s.season_number) === 1);
        const defaultSeason = hasSeason1 ? 1 : (seasons[0] && (seasons[0].season_number || seasons[0].id)) || 1;
        const initialSeason = (playerModalParams && (playerModalParams.season || playerModalParams.season_number)) || defaultSeason;
        if (initialSeason) {
          const seasonNum = Number(initialSeason);
          setPlayerSelectedSeason(seasonNum);
          try { setPlayerModalParams((p: any) => ({ ...(p || {}), season: seasonNum })); } catch (err) { }
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [playerModalOpen, playerModalType]);

  // Fetch episodes for selected season
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!playerModalOpen || playerModalType !== 'tv' || !playerSelectedSeason) {
          setPlayerSeasonEpisodes([]);
          return;
        }
        const tmdbId = playerModalParams && (playerModalParams.tmdbId || playerModalParams.id || playerModalParams.showId);
        if (!tmdbId) return;
        const seasonData = await fetchTMDB(`tv/${tmdbId}/season/${playerSelectedSeason}`);
        if (!mounted) return;
        const episodes = seasonData.episodes || [];
        setPlayerSeasonEpisodes(episodes);
        // default to Episode 1 if available, otherwise first episode
        const hasEp1 = episodes.find((ep: any) => Number(ep.episode_number) === 1);
        const defaultEp = hasEp1 ? (episodes.find((ep: any) => Number(ep.episode_number) === 1).episode_number) : (episodes[0] && (episodes[0].episode_number || episodes[0].id)) || 1;
        const initialEp = (playerModalParams && (playerModalParams.episode || playerModalParams.episode_number)) || defaultEp;
        if (initialEp) {
          const epNum = Number(initialEp);
          setPlayerSelectedEpisode(epNum);
          try { setPlayerModalParams((p: any) => ({ ...(p || {}), episode: epNum })); } catch (err) { }
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [playerModalOpen, playerModalType, playerSelectedSeason]);

  React.useEffect(() => {
    const scroller = document.getElementById('season-scroller');
    const pager = document.getElementById('season-pager');
    if (!scroller || !pager) return;
    function updatePager() {
      const pageWidth = scroller.clientWidth || 1;
      const total = Math.max(1, Math.ceil(scroller.scrollWidth / pageWidth));
      // Ensure pager has correct number of bars
      if (pager.childElementCount !== total) {
        pager.innerHTML = '';
        for (let i = 0; i < total; i++) {
          const bar = document.createElement('div');
          bar.className = 'bar';
          pager.appendChild(bar);
        }
      }
      const active = Math.min(total - 1, Math.round(scroller.scrollLeft / pageWidth));
      Array.from(pager.children).forEach((c, idx) => c.classList.toggle('active', idx === active));
    }
    updatePager();
    scroller.addEventListener('scroll', updatePager, { passive: true });
    window.addEventListener('resize', updatePager);
    return () => { scroller.removeEventListener('scroll', updatePager); window.removeEventListener('resize', updatePager); };
  }, [playerSeasons]);

  // Helper to truncate a string to a limited number of words
  function truncateWords(input?: string | null, maxWords: number = 6) {
    if (!input) return '';
    const parts = String(input).trim().split(/\s+/);
    if (parts.length <= maxWords) return parts.join(' ');
    return parts.slice(0, maxWords).join(' ') + '…';
  }
  // header search removed — SearchPage provides dedicated search UI
  const [genres, setGenres] = useState<any[]>([]);
  const [tvGenres, setTvGenres] = useState<any[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | ''>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = useState('');
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const [prevActiveIndex, setPrevActiveIndex] = useState<number | null>(null);
  const [featuredMovie, setFeaturedMovie] = useState<any | null>(null);
  

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
    // Open details modal instead of navigating to a details page/tab
    try { console.debug('App.handleSelectMovie called', { tmdbId, type }); } catch (e) {}
    // Close any preview portals (home grid previews) before opening the details modal
    try { window.dispatchEvent(new Event('app:close-previews')); } catch (e) { /* ignore */ }
    // Pause any hero/trailer players in the UI so only the details modal plays trailers
    try {
      const ctrl = (window as any).__appTrailerController;
      if (ctrl && typeof ctrl.pause === 'function') ctrl.pause();
      else window.dispatchEvent(new CustomEvent('app:pause-hero-trailer'));
    } catch (e) {
      try { window.dispatchEvent(new CustomEvent('app:pause-hero-trailer')); } catch (e) { /* ignore */ }
    }
    setDetailsModalTmdbId(tmdbId);
    setDetailsModalType(type || null);
    setDetailsModalOpen(true);
  }

  function handleGoToCollections(collectionId?: number) {
    setSelectedCollectionId(collectionId || null);
    setActiveIndex(8); // switch to Collections tab
  }

  function handleSelectPerson(personId: number) {
    setSelectedPersonId(personId);
    // Person panel is appended at the end of TabPanels
    setActiveIndex(10);
  }

  // header search removed

  function handlePlayMovie(tmdbId: number | string, type: 'movie'|'tv' = 'movie', params: Record<string, any> = {}) {
    const idStr = String(tmdbId);
    const historyKey = `${type}:${idStr}`;
    // If a details modal is open, suppress its resume behavior and close it so
    // the player modal can appear above it. DetailsModal checks
    // `window.__suppressHeroResume` and will skip resuming the page hero.
    try { (window as any).__suppressHeroResume = true; } catch (e) { /* ignore */ }
    try { if (detailsModalOpen) setDetailsModalOpen(false); } catch (e) { /* ignore */ }
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
    // include the currently selected player provider so the modal's VideoPlayer
    // receives the desired provider immediately
    setPlayerModalParams({ ...(combined || {}), player: selectedPlayer });
    // initialize player season/episode state from params if present
    try {
      if (type === 'tv') {
        const s = params && (params.season || params.season_number || params.seasonNum);
        const e = params && (params.episode || params.episode_number || params.ep);
        setPlayerSelectedSeason(s ? Number(s) : null);
        setPlayerSelectedEpisode(e ? Number(e) : null);
      } else {
        setPlayerSelectedSeason(null);
        setPlayerSelectedEpisode(null);
      }
    } catch (err) { /* ignore */ }
    setPlayerModalOpen(true);
    try { (window as any).database.setPersonalization('last_selected_movie', idStr); } catch(e) { /* ignore */ }
    // Allow DetailsModal cleanup to finish without suppressing future resumes.
    try { delete (window as any).__suppressHeroResume; } catch (e) { /* ignore */ }
    // Save to watch history when starting to play
    try { (window as any).database.watchHistorySet(historyKey, 0); } catch(e) { console.error('watchHistorySet on play failed', e); }
    try { (window as any).database.recentWatchesAdd(historyKey); } catch(e) { /* ignore */ }
  }

  // Close player modal and reload page to reset state
  function handleClosePlayerModal() {
    setPlayerModalOpen(false);
    window.location.reload();
  }

  function handleBackFromPlayer() {
    setActiveIndex(0); // back to Home
  }

  // Reset selectedCollectionId when navigating away from Collections tab
  useEffect(() => {
    if (activeIndex !== 8) {
      setSelectedCollectionId(null);
    }
  }, [activeIndex]);

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

  // Show loading screen while checking for account
  if (!accountsLoaded) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#141414',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  // Show welcome/onboarding screen if no account is logged in
  if (currentAccountId === null) {
    return (
      <>
        {/* Fullscreen exit bar - rendered via portal to body for highest z-index */}
        {isFullscreen && showFullscreenBar && createPortal(
          <div className="fullscreen-exit-bar" style={{
            height: '60px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.8), transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            animation: 'slideDown 0.2s ease-out',
            gap: '24px',
          }}>
            <span style={{ color: '#9ca3af', fontSize: '14px' }}>Press F11 or Escape to exit fullscreen</span>
            <button
              onClick={() => (window as any).windowControls.exitFullscreen()}
              style={{
                background: '#dc2626',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                padding: '10px 20px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.5)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.4)'; }}
              title="Exit Fullscreen"
            >
              ✕ Exit Fullscreen
            </button>
          </div>,
          document.body
        )}
        {/* Custom title bar for frameless window - hidden in fullscreen */}
        {!isFullscreen && (
          <div className="title-bar">
            <div className="title-bar-content">
              <span className="title-text">JStream</span>
              <div className="title-bar-controls">
                <button 
                  className="title-bar-button minimize" 
                  onClick={() => (window as any).windowControls.minimize()}
                  title="Minimize"
                >
                  ─
                </button>
                <button 
                  className="title-bar-button maximize" 
                  onClick={() => (window as any).windowControls.fullscreen()}
                  title="Fullscreen (F11)"
                >
                  ⛶
                </button>
                <button 
                  className="title-bar-button close" 
                  onClick={() => (window as any).windowControls.close()}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
        <WelcomeScreen
          onAccountSelected={handleAccountSelected}
          onAccountCreated={handleAccountCreated}
        />
      </>
    );
  }

                  return (
            <>
            {/* Fullscreen exit bar - rendered via portal to body for highest z-index */}
            {isFullscreen && showFullscreenBar && createPortal(
              <div className="fullscreen-exit-bar" style={{
                height: '60px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.95), rgba(0,0,0,0.8), transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 24px',
                animation: 'slideDown 0.2s ease-out',
                gap: '24px',
              }}>
                <span style={{ color: '#9ca3af', fontSize: '14px' }}>Press F11 or Escape to exit fullscreen</span>
                <button
                  onClick={() => (window as any).windowControls.exitFullscreen()}
                  style={{
                    background: '#dc2626',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    padding: '10px 20px',
                    cursor: 'pointer',
                    fontSize: '15px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.5)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.4)'; }}
                  title="Exit Fullscreen"
                >
                  ✕ Exit Fullscreen
                </button>
              </div>,
              document.body
            )}
            {/* Custom title bar for frameless window - hidden in fullscreen */}
            {!isFullscreen && (
              <div className="title-bar">
                <div className="title-bar-content">
                  <span className="title-text">JStream</span>
                  <div className="title-bar-controls">
                    <button 
                      className="title-bar-button minimize" 
                      onClick={() => (window as any).windowControls.minimize()}
                      title="Minimize"
                    >
                      ─
                    </button>
                    <button 
                      className="title-bar-button maximize" 
                      onClick={() => (window as any).windowControls.fullscreen()}
                      title="Fullscreen (F11)"
                    >
                      ⛶
                    </button>
                    <button 
                      className="title-bar-button close" 
                      onClick={() => (window as any).windowControls.close()}
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
            <ChakraProvider value={defaultSystem}>
              <ErrorBoundary>
                {featuredMovie && <HeroBanner movie={featuredMovie} onPlay={handlePlayMovie} onMore={handleSelectMovie} fullBleed isModalOpen={playerModalOpen || activeIndex === 10} isVisible={activeIndex === 0} />}
                <Tabs index={activeIndex} onChange={index => setActiveIndex(index)} isFitted variant="enclosed" isLazy lazyBehavior="unmount" style={{width: '100%'}}>

                          {/* Header is portaled to #header-root so it can overlay the full-bleed hero without being constrained */}
                          {(() => {
                            const headerNode = typeof document !== 'undefined' ? document.getElementById('header-root') : null;
                            const headerJsx = (
                              <header className="app-header">
                                <div className="brand"><img src="https://quijano.pages.dev/store/files/assets/jstreamv2/original-logo-backup.png" alt="JStream" className="logo-img" style={{ height: '36px', width: 'auto' }} /></div>
                                <TabList mb="1em">
                                  <Tab>Home</Tab>
                                  <Tab>Shows</Tab>
                                  <Tab>Movies</Tab>
                                  <Tab>New & Popular</Tab>
                                  <Tab>My List</Tab>
                                  <Tab>Browse by Languages</Tab>
                                </TabList>
                                <div className="header-controls">
                                  {/* Header search: expands inline when toggled. Typing will switch to Search tab. */}
                                  {searchOpen ? (
                                    <input
                                      ref={(el) => { searchInputRef.current = el; if (el) el.focus(); }}
                                      className={`header-search-input input ${searchOpen ? 'open' : ''}`}
                                      placeholder="Titles, peoples, gneres"
                                      value={headerSearchQuery}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setHeaderSearchQuery(v);
                                        // If user starts typing, show SearchPage and remember previous tab
                                        if (v && v.length > 0) {
                                          if (activeIndex !== 6 && prevActiveIndex === null) setPrevActiveIndex(activeIndex);
                                          setActiveIndex(6);
                                        } else {
                                          // If cleared while on Search, restore previous tab
                                          if (activeIndex === 6 && prevActiveIndex !== null) {
                                            setActiveIndex(prevActiveIndex);
                                            setPrevActiveIndex(null);
                                            setSearchOpen(false);
                                          }
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          setSearchOpen(false);
                                        }
                                      }}
                                      onBlur={() => {
                                        // close the inline input when it loses focus and is empty
                                        if (!headerSearchQuery) setSearchOpen(false);
                                      }}
                                    />
                                  ) : (
                                    <button
                                      className="search-btn button ghost"
                                      title="Search"
                                      onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current && searchInputRef.current.focus(), 0); }}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18,display:'block'}}>
                                        <circle cx="11" cy="11" r="6" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                      </svg>
                                    </button>
                                  )}

                                  <button className="profile-btn button ghost" title="Profile" onClick={() => setActiveIndex(7)}>
                                    {currentAccountAvatar?.image ? (
                                      <img src={currentAccountAvatar.image} alt="Profile" style={{width:28,height:28,objectFit:'cover',borderRadius:'50%'}} />
                                    ) : currentAccountAvatar?.emoji ? (
                                      <span style={{fontSize:20,display:'block',lineHeight:'28px'}}>{currentAccountAvatar.emoji}</span>
                                    ) : (
                                      <img src="/assets/profile-placeholder.svg" alt="Profile" style={{width:28,height:28,objectFit:'cover',borderRadius:6}} />
                                    )}
                                  </button>
                                  <button aria-label="Open menu" className="hamburger button ghost" onClick={() => setIsMobileMenuOpen(true)} style={{marginLeft:8}}>☰</button>
                                </div>
                              </header>
                            );
                            return headerNode ? createPortal(headerJsx, headerNode) : headerJsx;
                          })()}

                  {isMobileMenuOpen ? (
            <div className="mobile-menu-overlay surface-card" role="dialog" aria-modal={true}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{color:'#fff',fontSize:18}}>Menu</div>
                <button aria-label="Close menu" className="close-btn" onClick={()=> setIsMobileMenuOpen(false)}>✕</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <label style={{color:'#fff',fontSize:12}}>Genre</label>
                  <div style={{marginTop:6}}>
                    <CustomSelect
                      value={selectedGenre === '' ? '' : selectedGenre}
                      options={[{ value: '', label: 'All genres' }, ...(genres || []).map((g: any) => ({ value: g.id, label: g.name }))]}
                      onChange={(v) => { const val = v === '' ? '' : Number(v); setSelectedGenre(val === '' ? '' : val); }}
                      placeholder="All genres"
                      id="mobile-genre-select"
                    />
                  </div>
                </div>
                <div>
                  <label style={{color:'#fff',fontSize:12}}>Search</label>
                  <div style={{position:'relative', marginTop:6}}>
                    <input id="mobile-search" className="search-input input" placeholder="Search..." onFocus={() => { setActiveIndex(6); setIsMobileMenuOpen(false); }} />
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <button className="menu-link" onClick={() => { setActiveIndex(0); setIsMobileMenuOpen(false); }}>Home</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(1); setIsMobileMenuOpen(false); }}>Shows</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(2); setIsMobileMenuOpen(false); }}>Movies</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(3); setIsMobileMenuOpen(false); }}>New & Popular</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(4); setIsMobileMenuOpen(false); }}>My List</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(5); setIsMobileMenuOpen(false); }}>Browse by Languages</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(6); setIsMobileMenuOpen(false); }}>Search</button>
                  <button className="menu-link" onClick={() => { setActiveIndex(7); setIsMobileMenuOpen(false); }}>Profile</button>
                </div>
              </div>
            </div>
          ) : null}
          {activeIndex === 0 && <ContinueWatching onPlay={handlePlayMovie} onSelect={handleSelectMovie} />}
          {activeIndex === 0 && <TopSearches onPlay={handlePlayMovie} onSelect={handleSelectMovie} />}
            <div className="app-shell" aria-hidden={playerModalOpen || detailsModalOpen} style={playerModalOpen || detailsModalOpen ? { pointerEvents: 'none' } : undefined}>
              <TabPanels style={{width: '100%', padding: 0}}>
                <TabPanel sx={{padding: 0}}><HomeGrid onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} selectedTmdbId={selectedTmdbId} selectedGenre={selectedGenre} isModalOpen={playerModalOpen} onSetFeatured={setFeaturedMovie} /></TabPanel>
                <TabPanel sx={{padding: 0}}><TVPage genres={tvGenres} onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
                <TabPanel sx={{padding: 0}}><MoviesPage genres={genres} onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
                <TabPanel sx={{padding: 0}}><NewPopularPage onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
                <TabPanel sx={{padding: 0}}><MyListPage onPlay={handlePlayMovie} onSelect={handleSelectMovie} /></TabPanel>
                <TabPanel sx={{padding: 0}}><BrowseLanguagesPage onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} /></TabPanel>
                <TabPanel sx={{padding: 0}}>
                  <SearchPage
                    movieGenres={genres}
                    tvGenres={tvGenres}
                    externalQuery={headerSearchQuery}
                    onSelectMovie={handleSelectMovie}
                    onPlayMovie={handlePlayMovie}
                    onSelectPerson={handleSelectPerson}
                    onSelectCollection={handleGoToCollections}
                    onQueryEmpty={() => {
                      // If SearchPage's internal query becomes empty, restore previous tab if available
                      setActiveIndex(prevActiveIndex ?? 0);
                      setSearchOpen(false);
                      setHeaderSearchQuery('');
                      setPrevActiveIndex(null);
                    }}
                  />
                </TabPanel>
                <TabPanel sx={{padding: 0}}><ProfilePage onSignOut={() => { setCurrentAccountId(null); setCurrentAccountAvatar(null); }} /></TabPanel>
                <TabPanel sx={{padding: 0}}><CollectionsPage onSelectMovie={handleSelectMovie} onPlayMovie={handlePlayMovie} selectedCollectionId={selectedCollectionId} /></TabPanel>
                {/* Details page converted to modal — removed page panel */}
                <TabPanel><VideoPlayerPage playerType={playerType} params={playerParams} onBack={handleBackFromPlayer} player={selectedPlayer} /></TabPanel>
                <TabPanel><PersonPage personId={selectedPersonId} onSelectWork={handleSelectMovie} /></TabPanel>
              </TabPanels>
            </div>
          {/* Modal removed — Play now opens the Player tab where `VideoPlayerPage` renders the embedded player */}
          </Tabs>
          {playerModalOpen && (
            <div className="player-modal-overlay" onClick={handleClosePlayerModal}>
              <div className={`player-modal-box movie-mode`} onClick={(e) => e.stopPropagation()}>
                <button aria-label="Close player" onClick={handleClosePlayerModal} className="player-modal-close">✕</button>
                {/* Main content: VideoPlayer on left, season/episode panel on right for TV */}
                <div className="player-modal-content">
                    <div className="player-modal-left">
                      <VideoPlayer player={selectedPlayer} type={playerModalType} params={playerModalParams || { tmdbId: selectedTmdbId }} />
                    </div>
                </div>

              </div>
              {/* Player selector bar centered below the modal box (outside the box) */}
              <div className="player-modal-selector" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ color: '#fff', fontSize: 13, marginRight: 8 }}>Player:</div>
                  {(['Aether','Boreal','Cygnus','Draco'] as const).map((name) => (
                    <button
                      key={name}
                      onClick={() => { try { console.info('App: player selector clicked ->', name); } catch(e){}; setSelectedPlayer(name); }}
                      className={`button ${selectedPlayer === name ? '' : 'ghost'}`}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 4,
                        background: selectedPlayer === name ? '#E50914' : 'transparent',
                        color: selectedPlayer === name ? '#fff' : undefined,
                        border: selectedPlayer === name ? 'none' : '1px solid rgba(255,255,255,0.06)'
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                {/* Inline season/episode selectors for TV (simple, no thumbnails) */}
                {playerModalType === 'tv' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ color: '#fff', fontSize: 13, marginRight: 4 }}>Season</label>
                    <select
                      value={playerSelectedSeason ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setPlayerSelectedSeason(val);
                        try {
                          const newParams = { ...(playerModalParams || {}), season: val };
                          setPlayerModalParams(newParams);
                          console.info('App: setPlayerModalParams (season) ->', newParams);
                        } catch (err) {}
                      }}
                      style={{ padding: '6px 8px', borderRadius: 6, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <option value="">Select season</option>
                      {(playerSeasons || []).map((s: any) => {
                        const seasonVal = s.season_number || s.id;
                        return <option key={String(seasonVal)} value={seasonVal}>{s.name || `Season ${seasonVal}`}</option>;
                      })}
                    </select>

                    <label style={{ color: '#fff', fontSize: 13, marginRight: 4 }}>Episode</label>
                    <select
                      value={playerSelectedEpisode ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setPlayerSelectedEpisode(val);
                        try {
                          const newParams = { ...(playerModalParams || {}), episode: val };
                          setPlayerModalParams(newParams);
                          console.info('App: setPlayerModalParams (episode) ->', newParams);
                        } catch (err) {}
                      }}
                      style={{ padding: '6px 8px', borderRadius: 6, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <option value="">Select episode</option>
                      {(playerSeasonEpisodes || []).map((ep: any) => {
                        const val = ep.episode_number || ep.id;
                        const label = ep.episode_number ? `${ep.episode_number}. ${ep.name}` : (ep.name || `Episode ${val}`);
                        return <option key={String(val)} value={val}>{label}</option>;
                      })}
                    </select>
                  </div>
                ) : null}
              </div>
            </div>
          )}
                {detailsModalOpen && (
                  <DetailsModal
                    tmdbId={detailsModalTmdbId || undefined}
                    itemTypeHint={detailsModalType || undefined}
                    onPlay={handlePlayMovie}
                    onSelect={(id, t) => { /* replace modal content by opening selected id */ handleSelectMovie(id, t); }}
                    onSelectPerson={(pid) => { handleSelectPerson(pid); setDetailsModalOpen(false); }}
                    onGoToCollections={(cid) => { handleGoToCollections(cid); setDetailsModalOpen(false); }}
                    onClose={() => {
                      setDetailsModalOpen(false);
                      // resume global hero trailers when the modal closes
                      try {
                        const ctrl = (window as any).__appTrailerController;
                        if (ctrl && typeof ctrl.resume === 'function') ctrl.resume();
                        else window.dispatchEvent(new CustomEvent('app:resume-hero-trailer'));
                      } catch (e) { try { window.dispatchEvent(new CustomEvent('app:resume-hero-trailer')); } catch (e) { /* ignore */ } }
                    }}
                  />
                )}
        </ErrorBoundary>
      </ChakraProvider>
    </>
  );
}
