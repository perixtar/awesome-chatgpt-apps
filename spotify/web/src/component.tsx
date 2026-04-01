// Must be imported first to ensure Tailwind layers and style foundations are
// defined before any potential component styles
import './main.css';

import React, { useState, useCallback, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

// OpenAI Apps SDK UI Components
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Expand, Collapse, Chat } from '@openai/apps-sdk-ui/components/Icon';

// ============================================================================
// window.openai Type Declarations
// ============================================================================

type DisplayMode = 'inline' | 'pip' | 'fullscreen';

declare global {
  interface Window {
    openai?: {
      toolOutput?: Record<string, unknown> | null;
      toolInput?: Record<string, unknown>;
      toolResponseMetadata?: Record<string, unknown> | null;
      widgetState?: Record<string, unknown> | null;
      locale?: string;
      theme?: 'light' | 'dark';
      displayMode?: DisplayMode;
      maxHeight?: number;
      safeArea?: {
        insets: { top: number; bottom: number; left: number; right: number };
      };
      userAgent?: {
        device: { type: 'mobile' | 'tablet' | 'desktop' | 'unknown' };
        capabilities: { hover: boolean; touch: boolean };
      };
      setWidgetState?: (state: unknown) => Promise<void>;
      callTool?: (toolName: string, args: Record<string, unknown>) => Promise<{ result: string }>;
      sendFollowUpMessage?: (options: { prompt: string }) => Promise<void>;
      requestDisplayMode?: (options: { mode: DisplayMode }) => Promise<{ mode: DisplayMode }>;
      requestModal?: (options: { title?: string; params?: Record<string, unknown> }) => Promise<unknown>;
      requestClose?: () => Promise<void>;
      openExternal?: (payload: { href: string }) => void;
    };
  }
}

// ============================================================================
// React Hooks for window.openai
// ============================================================================

type OpenAiGlobals = {
  toolOutput: Record<string, unknown> | null;
  toolInput: Record<string, unknown>;
  toolResponseMetadata: Record<string, unknown> | null;
  widgetState: Record<string, unknown> | null;
  locale: string;
  theme: 'light' | 'dark';
  displayMode: DisplayMode;
  maxHeight: number;
};

const SET_GLOBALS_EVENT_TYPE = 'openai:set_globals';

export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(
  key: K,
): OpenAiGlobals[K] | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handleSetGlobal = (event: Event) => {
        const detail = (event as CustomEvent)?.detail;
        if (detail?.globals && detail.globals[key] !== undefined) {
          onChange();
        }
      };
      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, { passive: true });
      return () => window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
    },
    [key],
  );

  const getSnapshot = useCallback(
    () => window.openai?.[key] as OpenAiGlobals[K] | undefined,
    [key],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

export function useDisplayMode(): DisplayMode | undefined {
  return useOpenAiGlobal('displayMode');
}

export function useMaxHeight(): number | undefined {
  return useOpenAiGlobal('maxHeight');
}

// ============================================================================
// Spotify Types
// ============================================================================

interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  genre: string;
  durationMs: number;
  imageUrl: string;
  spotifyUrl: string;
  previewSnippet: string;
  releaseYear: number;
  popularity: number;
}

interface ToolOutput {
  tracks?: Track[];
  genres?: string[];
  activeGenre?: string;
  totalCount?: number;
  selectedTrack?: Track;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ============================================================================
// Spotify Logo SVG
// ============================================================================

function SpotifyLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Spotify"
    >
      <circle cx="50" cy="50" r="50" fill="#1DB954" />
      <path
        d="M72.4 45.2c-12.8-7.6-33.9-8.3-46.1-4.6-2 .6-4.1-.5-4.7-2.5s.5-4.1 2.5-4.7c14-3.8 37.3-3.1 52 5.3 1.8 1.1 2.4 3.4 1.3 5.2-1.1 1.7-3.4 2.3-5 1.3z"
        fill="white"
      />
      <path
        d="M66.2 56.2c-.9 1.5-2.8 2-4.3 1.1-10.7-6.6-27-8.5-39.6-4.6-1.7.5-3.4-.5-3.9-2.1-.5-1.7.5-3.4 2.1-3.9 14.4-4.4 32.3-2.3 44.6 5.3 1.5.9 2 2.8 1.1 4.2z"
        fill="white"
      />
      <path
        d="M61.6 66.8c-.7 1.2-2.3 1.6-3.5.9-9.3-5.7-21.1-7-35-3.8-1.3.3-2.7-.5-3-1.9-.3-1.3.5-2.7 1.9-3 15.2-3.5 28.2-2 38.7 4.4 1.2.7 1.6 2.2.9 3.4z"
        fill="white"
      />
    </svg>
  );
}

// ============================================================================
// Track Card Component
// ============================================================================

function TrackCard({
  track,
  index,
  onSelect,
}: {
  track: Track;
  index: number;
  onSelect: (track: Track) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="track-card" onClick={() => onSelect(track)} role="button" tabIndex={0}>
      <div className="track-card-rank">{index + 1}</div>
      <div className="track-card-image-wrapper">
        {!imgError ? (
          <img
            src={track.imageUrl}
            alt={`${track.name} album art`}
            className="track-card-image"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="track-card-image-fallback">
            <SpotifyLogo size={32} />
          </div>
        )}
      </div>
      <div className="track-card-info">
        <p className="track-card-name">{track.name}</p>
        <p className="track-card-artist">{track.artist}</p>
      </div>
      <div className="track-card-meta">
        <Badge color="neutral">{track.genre}</Badge>
        <span className="track-card-duration">{formatDuration(track.durationMs)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Track Detail Panel
// ============================================================================

function TrackDetailPanel({
  track,
  onClose,
  onViewGenre,
}: {
  track: Track;
  onClose: () => void;
  onViewGenre: (genre: string) => void;
}) {
  const [imgError, setImgError] = useState(false);

  const handleOpenSpotify = () => {
    window.openai?.openExternal?.({ href: track.spotifyUrl });
  };

  return (
    <div className="detail-panel">
      <button className="detail-back" onClick={onClose} aria-label="Back to tracks">
        ← Back
      </button>
      <div className="detail-content">
        <div className="detail-image-wrapper">
          {!imgError ? (
            <img
              src={track.imageUrl}
              alt={`${track.name} album art`}
              className="detail-image"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="detail-image-fallback">
              <SpotifyLogo size={60} />
            </div>
          )}
        </div>
        <div className="detail-info">
          <Badge color="neutral">{track.genre}</Badge>
          <h2 className="detail-title">{track.name}</h2>
          <p className="detail-artist">{track.artist}</p>
          <div className="detail-meta-row">
            <span className="detail-meta-item">{track.album}</span>
            <span className="detail-meta-item">{track.releaseYear}</span>
            <span className="detail-meta-item">{formatDuration(track.durationMs)}</span>
          </div>
          <p className="detail-snippet">{track.previewSnippet}</p>
          <div className="detail-actions">
            <Button color="primary" onClick={handleOpenSpotify}>
              Open in Spotify
            </Button>
            <Button variant="soft" color="secondary" onClick={() => onViewGenre(track.genre)}>
              More {track.genre}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Genre Tab Bar
// ============================================================================

function GenreTabs({
  genres,
  active,
  onSelect,
}: {
  genres: string[];
  active: string;
  onSelect: (genre: string) => void;
}) {
  return (
    <div className="genre-tabs" role="tablist">
      {genres.map((genre) => (
        <button
          key={genre}
          role="tab"
          aria-selected={genre === active}
          className={`genre-tab${genre === active ? ' genre-tab--active' : ''}`}
          onClick={() => onSelect(genre)}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main App Component
// ============================================================================

function App() {
  const toolOutput = (useOpenAiGlobal('toolOutput') ?? {}) as ToolOutput;
  const displayMode = useDisplayMode();
  const maxHeight = useMaxHeight();
  const isFullscreen = displayMode === 'fullscreen';

  const [localGenre, setLocalGenre] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(
    toolOutput.selectedTrack ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);

  const tracks = toolOutput.tracks ?? [];
  const genres = toolOutput.genres ?? ['All', 'Pop', 'Hip-Hop', 'R&B', 'Rock', 'Electronic', 'Latin'];
  const activeGenre = localGenre ?? toolOutput.activeGenre ?? 'All';
  const errorMsg = toolOutput.error;

  const displayedTracks = localGenre && localGenre !== 'All'
    ? tracks.filter((t) => t.genre === localGenre)
    : tracks;

  const handleToggleFullscreen = async () => {
    await window.openai?.requestDisplayMode?.({
      mode: isFullscreen ? 'inline' : 'fullscreen',
    });
  };

  const handleGenreSelect = async (genre: string) => {
    setLocalGenre(genre);
    setSelectedTrack(null);
    setIsLoading(true);
    try {
      await window.openai?.callTool?.('list_tracks', {
        genre: genre === 'All' ? undefined : genre,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTrack = (track: Track) => {
    setSelectedTrack(track);
  };

  const handleCloseDetail = () => {
    setSelectedTrack(null);
  };

  const handleViewGenre = async (genre: string) => {
    setSelectedTrack(null);
    setLocalGenre(genre);
    setIsLoading(true);
    try {
      await window.openai?.callTool?.('list_tracks', { genre });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskTracks = async () => {
    await window.openai?.sendFollowUpMessage?.({
      prompt: 'Show me popular tracks on Spotify',
    });
  };

  const trackToShow = selectedTrack ?? toolOutput.selectedTrack ?? null;

  const containerStyle: React.CSSProperties = maxHeight
    ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' }
    : {};

  return (
    <div className="widget-container" style={containerStyle}>
      {/* Header */}
      <header className="spotify-header">
        <div className="spotify-header-brand">
          <SpotifyLogo size={28} />
          <div>
            <p className="text-secondary" style={{ fontSize: '0.7rem', lineHeight: 1 }}>
              Music Discovery
            </p>
            <h1 className="heading-lg" style={{ lineHeight: 1.2 }}>
              Spotify
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="soft" color="secondary" onClick={handleToggleFullscreen}>
            {isFullscreen ? (
              <>
                <Collapse className="size-4" />
                Collapse
              </>
            ) : (
              <>
                <Expand className="size-4" />
                Expand
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Error banner */}
      {errorMsg && (
        <div className="error-banner">
          {errorMsg}
        </div>
      )}

      {/* Detail panel OR track list */}
      {trackToShow ? (
        <TrackDetailPanel
          track={trackToShow}
          onClose={handleCloseDetail}
          onViewGenre={handleViewGenre}
        />
      ) : tracks.length === 0 ? (
        <EmptyMessage
          title="Discover Music"
          description="Ask ChatGPT to show you popular tracks, or filter by genre."
          action={
            <Button color="primary" onClick={handleAskTracks}>
              <Chat className="size-4" />
              Show Tracks
            </Button>
          }
        />
      ) : (
        <>
          {/* Genre tabs */}
          <GenreTabs
            genres={genres}
            active={activeGenre}
            onSelect={handleGenreSelect}
          />

          {/* Track count */}
          <p className="track-count text-secondary">
            {isLoading ? 'Loading...' : `${displayedTracks.length} track${displayedTracks.length !== 1 ? 's' : ''}`}
          </p>

          {/* Track list */}
          {isLoading ? (
            <div className="track-loading">
              <div className="track-loading-spinner" />
            </div>
          ) : displayedTracks.length === 0 ? (
            <div className="widget-empty">
              <p>No tracks found in this genre.</p>
            </div>
          ) : (
            <div className="track-list">
              {displayedTracks.map((track, i) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  index={i}
                  onSelect={handleSelectTrack}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          <footer className="spotify-footer">
            <button
              className="spotify-footer-link"
              onClick={() => window.openai?.openExternal?.({ href: 'https://open.spotify.com' })}
            >
              Open Spotify →
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Mount the widget
// ============================================================================

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

export default App;
