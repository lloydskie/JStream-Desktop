import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface RawLink {
  url: string;
  text: string;
  section: string;
}

interface DownloadLink {
  url: string;
  rawText: string;
  section: string;
  displayName: string;
  quality: string;
  source: string;
  size: string;
}

interface DownloadModalProps {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  season?: number;
  episode?: number;
  onClose: () => void;
}

function parseLink(raw: RawLink): DownloadLink {
  const text = raw.text.trim();

  // Try to parse "Title | quality | source | size" format
  const parts = text.split('|').map(s => s.trim());
  if (parts.length >= 4) {
    return {
      url: raw.url, rawText: text, section: raw.section || 'Download',
      displayName: parts[0], quality: parts[1], source: parts[2], size: parts[3],
    };
  }
  if (parts.length === 3) {
    return {
      url: raw.url, rawText: text, section: raw.section || 'Download',
      displayName: parts[0], quality: parts[1], source: '', size: parts[2],
    };
  }
  if (parts.length === 2) {
    return {
      url: raw.url, rawText: text, section: raw.section || 'Download',
      displayName: parts[0], quality: '', source: '', size: parts[1],
    };
  }

  // Fallback: extract quality/size from text
  const qualMatch = text.match(/(2160p|1080p|720p|480p|360p|4[kK])/i);
  const sizeMatch = text.match(/(\d+\.?\d*\s*[KMGT]?B)/i);

  // Use a meaningful display name — the text, or extract from URL as last resort
  let displayName = text;
  if (!displayName || displayName.length < 3) {
    try {
      const urlPath = new URL(raw.url).pathname;
      const filename = urlPath.split('/').pop() || '';
      displayName = decodeURIComponent(filename) || raw.url;
    } catch {
      displayName = raw.url;
    }
  }

  return {
    url: raw.url, rawText: text, section: raw.section || 'Download',
    displayName,
    quality: qualMatch ? qualMatch[1] : '',
    source: '',
    size: sizeMatch ? sizeMatch[1] : '',
  };
}

function sectionIcon(section: string): string {
  const s = section.toLowerCase();
  if (s.includes('torrent')) return '🧲';
  if (s.includes('stream')) return '▶️';
  if (s.includes('drive')) return '☁️';
  if (s.includes('caption') || s.includes('subtitle')) return '📝';
  return '📥';
}

function sectionColor(section: string): string {
  const s = section.toLowerCase();
  if (s.includes('torrent')) return '#f59e0b';
  if (s.includes('stream')) return '#3b82f6';
  if (s.includes('drive')) return '#22c55e';
  return '#8b5cf6';
}

function qualityBadgeColor(quality: string): string {
  const q = quality.toLowerCase();
  if (q.includes('2160') || q.includes('4k')) return '#a855f7';
  if (q.includes('1080')) return '#3b82f6';
  if (q.includes('720')) return '#22c55e';
  if (q.includes('480') || q.includes('360')) return '#f59e0b';
  return '#6b7280';
}

export default function DownloadModal({ tmdbId, mediaType, title, season, episode, onClose }: DownloadModalProps) {
  const [links, setLinks] = useState<DownloadLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchDownloadLinks() {
      try {
        setLoading(true);
        setError(null);
        setLinks([]);

        const fetchDownload = (window as any).downloads?.fetchLinks;
        if (!fetchDownload) {
          setError('Download feature is not available.');
          setLoading(false);
          return;
        }

        const result = await fetchDownload(tmdbId, mediaType, season, episode);

        if (!mounted) return;

        if (result && result.error && (!result.links || result.links.length === 0)) {
          setError(result.error);
          setLoading(false);
          return;
        }

        if (result && Array.isArray(result.links) && result.links.length > 0) {
          const parsed = result.links.map((l: RawLink) => parseLink(l));
          setLinks(parsed);
        } else {
          setError('No download links found for this title.');
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to fetch download links.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchDownloadLinks();
    return () => { mounted = false; };
  }, [tmdbId, mediaType, season, episode]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleDownload(url: string) {
    try {
      (window as any).openExternal?.url(url);
    } catch (e) {
      console.error('Failed to open download URL', e);
    }
  }

  // Group links by section (Torrents / Streams / Drive Downloads / etc.)
  const grouped: Record<string, DownloadLink[]> = {};
  for (const link of links) {
    const key = link.section || 'Download';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(link);
  }
  // Sort sections: Torrents first, then Streams, then Drive, then others
  const sectionOrder = ['torrents', 'streams', 'drive downloads', 'download'];
  const sortedSections = Object.keys(grouped).sort((a, b) => {
    const ai = sectionOrder.findIndex(s => a.toLowerCase().includes(s));
    const bi = sectionOrder.findIndex(s => b.toLowerCase().includes(s));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const subtitleText = mediaType === 'tv' && season && episode
    ? `Season ${season}, Episode ${episode}`
    : mediaType === 'tv' && season
    ? `Season ${season}`
    : 'Movie';

  const modal = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483640,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'downloadModalFadeIn 0.2s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @keyframes downloadModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes downloadModalSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .dl-link-btn {
          transition: all 0.15s ease;
        }
        .dl-link-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          filter: brightness(1.15);
        }
        .dl-link-btn:active {
          transform: translateY(0);
        }
        .dl-modal-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .dl-modal-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .dl-modal-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 3px;
        }
        .dl-modal-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.25);
        }
      `}</style>
      <div
        style={{
          background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          borderRadius: 16, width: '92%', maxWidth: 620,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
          animation: 'downloadModalSlideUp 0.3s ease',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 16l-5-5h3V4h4v7h3l-5 5z" fill="#60a5fa"/>
                <path d="M20 18H4v2h16v-2z" fill="#60a5fa"/>
              </svg>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Download</span>
            </div>
            <div style={{
              fontSize: 14, color: '#e2e8f0', fontWeight: 600,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{subtitleText}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8',
              width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#94a3b8'; }}
            aria-label="Close download modal"
          >✕</button>
        </div>

        {/* Body */}
        <div className="dl-modal-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 24px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 16 }}>
              <div style={{
                width: 48, height: 48, border: '3px solid rgba(96,165,250,0.2)',
                borderTopColor: '#60a5fa', borderRadius: '50%',
                animation: 'dlSpin 0.8s linear infinite',
              }} />
              <style>{`@keyframes dlSpin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ color: '#94a3b8', fontSize: 14 }}>Searching for download links...</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>Loading sources, this may take a moment</div>
            </div>
          )}

          {error && !loading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '48px 0', gap: 12, textAlign: 'center',
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#f87171" strokeWidth="1.5" fill="none"/>
                <path d="M12 8v4m0 4h.01" stroke="#f87171" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div style={{ color: '#f87171', fontSize: 15, fontWeight: 600 }}>{error}</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>Try a different title or check back later</div>
            </div>
          )}

          {!loading && !error && links.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Summary badges */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{
                  background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)',
                  borderRadius: 8, padding: '6px 14px', fontSize: 13, color: '#93c5fd',
                }}>
                  {links.length} source{links.length !== 1 ? 's' : ''} found
                </div>
                {sortedSections.map(sec => (
                  <div key={sec} style={{
                    background: `${sectionColor(sec)}15`, border: `1px solid ${sectionColor(sec)}30`,
                    borderRadius: 8, padding: '6px 14px', fontSize: 13, color: sectionColor(sec),
                    fontWeight: 600,
                  }}>
                    {sectionIcon(sec)} {sec}
                  </div>
                ))}
              </div>

              {/* Links grouped by section */}
              {sortedSections.map(sec => (
                <div key={sec}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 16 }}>{sectionIcon(sec)}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {sec}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      ({grouped[sec].length})
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {grouped[sec].map((link, idx) => (
                      <button
                        key={idx}
                        className="dl-link-btn"
                        onClick={() => handleDownload(link.url)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 10, padding: '14px 16px',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                          color: '#fff',
                        }}
                      >
                        {/* Download icon */}
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: `${sectionColor(sec)}20`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 16l-5-5h3V4h4v7h3l-5 5z" fill={sectionColor(sec)}/>
                            <path d="M20 18H4v2h16v-2z" fill={sectionColor(sec)}/>
                          </svg>
                        </div>

                        {/* Info — always show the full text so user knows what they're downloading */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 500, color: '#e2e8f0',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            lineHeight: '1.4',
                          }}>
                            {link.displayName || link.rawText || link.url}
                          </div>

                          {/* Badges row: quality, source, size */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                            {link.quality && (
                              <span style={{
                                background: `${qualityBadgeColor(link.quality)}25`,
                                border: `1px solid ${qualityBadgeColor(link.quality)}40`,
                                padding: '1px 8px', borderRadius: 6, fontSize: 11,
                                color: qualityBadgeColor(link.quality), fontWeight: 700,
                                textTransform: 'uppercase',
                              }}>
                                {link.quality}
                              </span>
                            )}
                            {link.source && (
                              <span style={{
                                background: 'rgba(255,255,255,0.06)',
                                padding: '1px 8px', borderRadius: 6, fontSize: 11,
                                color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600,
                              }}>
                                {link.source}
                              </span>
                            )}
                            {link.size && (
                              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                                📦 {link.size}
                              </span>
                            )}
                            {!link.quality && !link.source && !link.size && (
                              <span style={{ fontSize: 11, color: '#475569' }}>
                                {(() => {
                                  try { return new URL(link.url).hostname; } catch { return 'External link'; }
                                })()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Open arrow */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, opacity: 0.4 }}>
                          <path d="M5 12h14m-6-6l6 6-6 6" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 28px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 11, color: '#475569' }}>
            Links open in your default torrent client or browser
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}