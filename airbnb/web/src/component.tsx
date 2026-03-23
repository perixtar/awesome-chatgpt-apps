// Must be imported first to ensure Tailwind layers and style foundations are
// defined before any potential component styles
import './main.css';

import React, { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

// OpenAI Apps SDK UI Components
import { Button } from '@openai/apps-sdk-ui/components/Button';
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
      requestModal?: (options: {
        title?: string;
        params?: Record<string, unknown>;
      }) => Promise<unknown>;
      requestClose?: () => Promise<void>;
      uploadFile?: (file: File) => Promise<{ fileId: string }>;
      getFileDownloadUrl?: (options: { fileId: string }) => Promise<{ downloadUrl: string }>;
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
  safeArea: { insets: { top: number; bottom: number; left: number; right: number } };
  userAgent: {
    device: { type: 'mobile' | 'tablet' | 'desktop' | 'unknown' };
    capabilities: { hover: boolean; touch: boolean };
  };
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

export function useWidgetState<T>(defaultState: T): [T, (state: T) => void] {
  const widgetStateFromWindow = useOpenAiGlobal('widgetState') as T | undefined;

  const [state, _setState] = useState<T>(() => {
    return widgetStateFromWindow ?? defaultState;
  });

  useEffect(() => {
    if (widgetStateFromWindow !== undefined) {
      _setState(widgetStateFromWindow);
    }
  }, [widgetStateFromWindow]);

  const setState = useCallback((newState: T) => {
    _setState(newState);
    void window.openai?.setWidgetState?.(newState);
  }, []);

  return [state, setState];
}

// ============================================================================
// Airbnb-specific Types
// ============================================================================

interface Listing {
  id: string;
  title: string;
  price: string;
  pricePerNight: number;
  description: string;
  imageUrl: string;
  location: string;
  rating: number;
  reviewCount: number;
  amenities: string[];
  url: string;
}

interface ListingsToolOutput {
  listings?: Listing[];
  listing?: Listing;
  viewMode?: 'detail' | 'list';
  location?: string;
  dateRange?: string | null;
  guests?: number | null;
  summary?: string;
  error?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5 text-sm font-medium">
      <svg className="size-3.5 text-[#FF385C]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      <span>{rating.toFixed(2)}</span>
    </span>
  );
}

function ListingCard({
  listing,
  onSelect,
}: {
  listing: Listing;
  onSelect: (id: string) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="widget-listing-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(listing.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(listing.id)}
    >
      {/* Image */}
      <div className="widget-listing-image">
        {!imgError ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-secondary">
            <svg className="size-8 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1">
        <p className="font-semibold text-sm leading-tight line-clamp-2">{listing.title}</p>
        <p className="text-secondary text-xs">{listing.location}</p>
        <div className="flex items-center justify-between mt-1">
          <StarRating rating={listing.rating} />
          <span className="text-xs text-secondary">({listing.reviewCount})</span>
        </div>
        <p className="font-bold text-sm mt-0.5">{listing.price}</p>
      </div>
    </div>
  );
}

function DetailView({
  listing,
  onBack,
}: {
  listing: Listing;
  onBack: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  const handleOpenListing = () => {
    window.openai?.openExternal?.({ href: listing.url });
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Back button */}
      <div className="px-4 pt-3 pb-2">
        <button
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-secondary transition-colors"
          onClick={onBack}
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
          All listings
        </button>
      </div>

      {/* Hero image */}
      <div className="widget-detail-image">
        {!imgError ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-secondary">
            <svg className="size-12 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3">
        <div>
          <h2 className="heading-lg">{listing.title}</h2>
          <div className="flex items-center gap-2 mt-1 text-sm text-secondary">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {listing.location}
          </div>
        </div>

        {/* Rating & price */}
        <div className="flex items-center justify-between rounded-xl border border-default bg-surface p-3">
          <div className="flex flex-col gap-0.5">
            <StarRating rating={listing.rating} />
            <span className="text-xs text-secondary">{listing.reviewCount} reviews</span>
          </div>
          <div className="text-right">
            <p className="font-bold text-base">{listing.price}</p>
            <p className="text-xs text-secondary">per night</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-secondary leading-relaxed">{listing.description}</p>

        {/* Amenities */}
        {listing.amenities.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary mb-2">Amenities</p>
            <div className="flex flex-wrap gap-1.5">
              {listing.amenities.map((amenity) => (
                <span
                  key={amenity}
                  className="px-2.5 py-1 rounded-full text-xs border border-default bg-surface-secondary"
                >
                  {amenity}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <Button color="primary" onClick={handleOpenListing} className="w-full mt-1">
          Book on Airbnb
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Widget Component
// ============================================================================

function App() {
  const toolOutput = (useOpenAiGlobal('toolOutput') ?? {}) as ListingsToolOutput;
  const displayMode = useDisplayMode();
  const isFullscreen = displayMode === 'fullscreen';

  // Track selected listing for detail view
  const [selectedListingId, setSelectedListingId] = useWidgetState<string | null>(null);

  // Determine data
  const listings: Listing[] = toolOutput.listings ?? (toolOutput.listing ? [toolOutput.listing] : []);
  const activeViewMode = toolOutput.viewMode === 'detail' && toolOutput.listing
    ? 'detail'
    : selectedListingId
    ? 'detail'
    : 'list';

  // If viewMode is detail from server, use that listing
  const detailListing =
    activeViewMode === 'detail'
      ? (toolOutput.listing ?? listings.find((l) => l.id === selectedListingId) ?? null)
      : null;

  const handleSelectListing = (id: string) => {
    setSelectedListingId(id);
  };

  const handleBack = () => {
    setSelectedListingId(null);
  };

  const handleToggleFullscreen = async () => {
    const newMode = isFullscreen ? 'inline' : 'fullscreen';
    await window.openai?.requestDisplayMode?.({ mode: newMode });
  };

  const handleAskForListings = async () => {
    await window.openai?.sendFollowUpMessage?.({
      prompt: 'Show me available Airbnb listings',
    });
  };

  // ── Detail view ──
  if (activeViewMode === 'detail' && detailListing) {
    return (
      <div className="widget-container p-0">
        {/* Header controls */}
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <div className="flex items-center gap-1.5">
            <AirbnbLogo />
          </div>
          <Button variant="soft" color="secondary" onClick={handleToggleFullscreen}>
            {isFullscreen ? <Collapse className="size-4" /> : <Expand className="size-4" />}
            {isFullscreen ? 'Collapse' : 'Expand'}
          </Button>
        </div>
        <DetailView listing={detailListing} onBack={handleBack} />
      </div>
    );
  }

  // ── Empty state ──
  if (listings.length === 0) {
    return (
      <div className="widget-container">
        <div className="flex items-center justify-between mb-4">
          <AirbnbLogo />
          <Button variant="soft" color="secondary" onClick={handleToggleFullscreen}>
            {isFullscreen ? <Collapse className="size-4" /> : <Expand className="size-4" />}
            {isFullscreen ? 'Collapse' : 'Expand'}
          </Button>
        </div>
        <EmptyMessage
          title="No listings found"
          description="Ask ChatGPT to search for Airbnb listings in your destination."
          action={
            <Button color="primary" onClick={handleAskForListings}>
              <Chat className="size-4" />
              Search listings
            </Button>
          }
        />
      </div>
    );
  }

  // ── Carousel / grid view ──
  const location = toolOutput.location ?? listings[0]?.location ?? 'Available listings';
  const dateRange = toolOutput.dateRange;

  return (
    <div className="widget-container p-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex flex-col gap-0.5">
          <AirbnbLogo />
          <p className="text-secondary text-sm mt-0.5">
            <svg
              className="inline size-3.5 mr-0.5 -mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {location}
            {dateRange && ` · ${dateRange}`}
          </p>
        </div>
        <Button variant="soft" color="secondary" onClick={handleToggleFullscreen}>
          {isFullscreen ? <Collapse className="size-4" /> : <Expand className="size-4" />}
          {isFullscreen ? 'Collapse' : 'Expand'}
        </Button>
      </div>

      {/* Listing grid / carousel */}
      <div className={isFullscreen ? 'widget-listings-grid' : 'widget-listings-carousel'}>
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} onSelect={handleSelectListing} />
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-default">
        <p className="text-xs text-secondary">
          {listings.length} listing{listings.length !== 1 ? 's' : ''} available
          {dateRange ? ` · ${dateRange}` : ''}
        </p>
      </div>
    </div>
  );
}

function AirbnbLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <svg className="size-5 text-[#FF385C]" viewBox="0 0 32 32" fill="currentColor">
        <path d="M16 1C10.343 1 3 9.4 3 16c0 6.627 5.832 12 13 12s13-5.373 13-12c0-6.6-7.343-15-13-15zm0 2c4.418 0 9 7.018 9 13 0 4.971-4.029 9-9 9s-9-4.029-9-9c0-5.982 4.582-13 9-13z" />
        <path d="M16 9.5c-1.933 0-3.5 1.567-3.5 3.5S14.067 16.5 16 16.5s3.5-1.567 3.5-3.5S17.933 9.5 16 9.5zm0 2c.828 0 1.5.672 1.5 1.5S16.828 14.5 16 14.5 14.5 13.828 14.5 13 15.172 11.5 16 11.5z" />
        <path d="M16 17c-3.314 0-6 1.686-6 3.5S12.686 24 16 24s6-1.686 6-3.5S19.314 17 16 17zm0 2c2.21 0 4 .896 4 1.5S18.21 22 16 22s-4-.896-4-1.5.79-1.5 4-1.5z" />
      </svg>
      <span className="font-bold text-sm tracking-tight">airbnb</span>
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
