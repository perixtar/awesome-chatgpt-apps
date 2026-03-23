// Must be imported first to ensure Tailwind layers and style foundations are
// defined before any potential component styles
import './main.css';

import React, { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

// OpenAI Apps SDK UI Components
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Expand, Collapse } from '@openai/apps-sdk-ui/components/Icon';

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
      safeArea?: { insets: { top: number; bottom: number; left: number; right: number } };
      userAgent?: { device: { type: 'mobile' | 'tablet' | 'desktop' | 'unknown' }; capabilities: { hover: boolean; touch: boolean } };
      setWidgetState?: (state: unknown) => Promise<void>;
      callTool?: (toolName: string, args: Record<string, unknown>) => Promise<{ result: string }>;
      sendFollowUpMessage?: (options: { prompt: string }) => Promise<void>;
      requestDisplayMode?: (options: { mode: DisplayMode }) => Promise<{ mode: DisplayMode }>;
      requestModal?: (options: { title?: string; params?: Record<string, unknown> }) => Promise<unknown>;
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
  userAgent: { device: { type: 'mobile' | 'tablet' | 'desktop' | 'unknown' }; capabilities: { hover: boolean; touch: boolean } };
};

const SET_GLOBALS_EVENT_TYPE = 'openai:set_globals';

export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(key: K): OpenAiGlobals[K] | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handleSetGlobal = (event: Event) => {
        const detail = (event as CustomEvent)?.detail;
        if (detail?.globals && detail.globals[key] !== undefined) onChange();
      };
      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, { passive: true });
      return () => window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
    },
    [key],
  );
  const getSnapshot = useCallback(() => window.openai?.[key] as OpenAiGlobals[K] | undefined, [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

export function useDisplayMode(): DisplayMode | undefined {
  return useOpenAiGlobal('displayMode');
}

// ============================================================================
// Nike data types
// ============================================================================

interface NikeProduct {
  id: string;
  productName: string;
  productUrl: string;
  imageUrl?: string;
  category: string;
  tagline?: string;
}

interface ToolOutput {
  products?: NikeProduct[];
  category?: string;
  categories?: string[];
  query?: string;
  view?: 'list' | 'search';
}

// ============================================================================
// Category color map (plain hex, used in inline styles to avoid guessed tokens)
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  Running: '#2563eb',
  Basketball: '#ea580c',
  Golf: '#16a34a',
  Football: '#7c3aed',
  Lifestyle: '#db2777',
  Training: '#0891b2',
  Baseball: '#d97706',
  All: '#6b7280',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#6b7280';
}

// ============================================================================
// Product Card
// ============================================================================

function ProductCard({ product, onShop }: { product: NikeProduct; onShop: (url: string) => void }) {
  const color = getCategoryColor(product.category);
  return (
    <div className="rounded-2xl border border-default bg-surface overflow-hidden flex flex-col">
      {product.imageUrl ? (
        <div className="nike-card-img-wrap">
          <img
            src={product.imageUrl}
            alt={product.productName}
            className="nike-card-img"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="nike-card-placeholder" style={{ backgroundColor: color + '15' }}>
          <span className="nike-no-img-label" style={{ color }}>NIKE</span>
        </div>
      )}
      <div className="flex flex-col gap-1 p-3 flex-1">
        <span
          className="nike-category-chip"
          style={{ backgroundColor: color + '18', color }}
        >
          {product.category}
        </span>
        <p className="font-semibold text-sm leading-snug">{product.productName}</p>
        {product.tagline && (
          <p className="text-secondary text-xs leading-snug">{product.tagline}</p>
        )}
        <button
          className="nike-shop-btn mt-auto"
          onClick={() => onShop(product.productUrl)}
          aria-label={`Shop ${product.productName}`}
        >
          Shop Now →
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Category Filter Strip
// ============================================================================

function CategoryFilter({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string;
  onSelect: (cat: string) => void;
}) {
  return (
    <div className="nike-filter-strip" role="tablist" aria-label="Filter by category">
      {categories.map((cat) => (
        <button
          key={cat}
          role="tab"
          aria-selected={selected === cat}
          className={`nike-filter-chip${selected === cat ? ' nike-filter-chip--active' : ''}`}
          onClick={() => onSelect(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main Widget Component
// ============================================================================

function App() {
  const toolOutput = (useOpenAiGlobal('toolOutput') ?? {}) as ToolOutput;
  const displayMode = useDisplayMode();
  const isFullscreen = displayMode === 'fullscreen';

  const allCategories = toolOutput.categories ?? ['All', 'Running', 'Basketball', 'Golf', 'Football', 'Lifestyle', 'Training', 'Baseball'];

  const [activeCategory, setActiveCategory] = useState<string>(toolOutput.category ?? 'All');
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    setActiveCategory(toolOutput.category ?? 'All');
  }, [toolOutput.category]);

  const allProducts = toolOutput.products ?? [];
  const displayedProducts =
    activeCategory === 'All'
      ? allProducts
      : allProducts.filter((p) => p.category === activeCategory);

  const isSearch = toolOutput.view === 'search';
  const searchQuery = toolOutput.query;

  const handleToggleFullscreen = async () => {
    await window.openai?.requestDisplayMode?.({ mode: isFullscreen ? 'inline' : 'fullscreen' });
  };

  const handleShop = useCallback((url: string) => {
    window.openai?.openExternal?.({ href: url });
  }, []);

  const handleCategoryChange = useCallback(
    async (cat: string) => {
      setActiveCategory(cat);
      if (!isSearch) {
        setIsFiltering(true);
        try {
          await window.openai?.callTool?.('list_products', cat === 'All' ? {} : { category: cat });
        } finally {
          setIsFiltering(false);
        }
      }
    },
    [isSearch],
  );

  const handleBrowseAll = async () => {
    await window.openai?.sendFollowUpMessage?.({ prompt: 'Show me all Nike products' });
  };

  const hasProducts = displayedProducts.length > 0;

  const title = isSearch && searchQuery
    ? `"${searchQuery}"`
    : activeCategory === 'All'
    ? 'All Products'
    : activeCategory;

  return (
    <div className={`nike-widget${isFullscreen ? ' nike-widget--fullscreen' : ''}`}>
      {/* Header */}
      <header className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-secondary text-xs uppercase tracking-wider font-medium">Nike</p>
          <h1 className="heading-lg">{title}</h1>
        </div>
        <Button
          variant="soft"
          color="secondary"
          onClick={handleToggleFullscreen}
          aria-label={isFullscreen ? 'Collapse' : 'Expand'}
        >
          {isFullscreen ? <Collapse className="size-4" /> : <Expand className="size-4" />}
        </Button>
      </header>

      {/* Category filter strip */}
      {!isSearch && (
        <CategoryFilter
          categories={allCategories}
          selected={activeCategory}
          onSelect={handleCategoryChange}
        />
      )}

      {/* Search results meta */}
      {isSearch && searchQuery && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-secondary text-sm">
            {displayedProducts.length} result{displayedProducts.length !== 1 ? 's' : ''}
          </span>
          <button className="nike-text-link" onClick={handleBrowseAll}>
            Browse all →
          </button>
        </div>
      )}

      {/* Product grid */}
      <main className="nike-grid-container">
        {isFiltering ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="nike-spinner" />
            <p className="text-secondary text-sm">Loading…</p>
          </div>
        ) : hasProducts ? (
          <div className="nike-product-grid">
            {displayedProducts.map((product) => (
              <ProductCard key={product.id} product={product} onShop={handleShop} />
            ))}
          </div>
        ) : (
          <EmptyMessage
            title={isSearch ? 'No results found' : 'No products in this category'}
            description={
              isSearch
                ? `Nothing matched "${searchQuery}". Try a different term.`
                : 'Ask ChatGPT to show you Nike products.'
            }
            action={
              <Button color="primary" onClick={handleBrowseAll}>
                Browse All Nike Products
              </Button>
            }
          />
        )}
      </main>

      {/* Footer */}
      {hasProducts && (
        <footer className="flex items-center justify-between mt-3 pt-2 border-t border-subtle">
          <span className="text-secondary text-xs">
            {displayedProducts.length} item{displayedProducts.length !== 1 ? 's' : ''}
          </span>
          <button
            className="nike-text-link text-xs"
            onClick={() => handleShop('https://www.nike.com')}
          >
            Visit Nike.com →
          </button>
        </footer>
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
