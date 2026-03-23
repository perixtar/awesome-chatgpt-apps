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
// Starbucks Menu Types
// ============================================================================

interface MenuItem {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  imageUrl: string;
  description: string;
  link: string;
}

interface ToolOutput {
  menuItems?: MenuItem[];
  categories?: string[];
  subcategories?: Record<string, string[]>;
  activeCategory?: string;
  activeSubcategory?: string | null;
  totalCount?: number;
  selectedItem?: MenuItem;
  error?: string;
}

// ============================================================================
// Starbucks Logo SVG (inline, no external assets)
// ============================================================================

function StarbucksLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Starbucks"
    >
      <circle cx="50" cy="50" r="50" fill="#00704A" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="white" strokeWidth="2" />
      <text
        x="50"
        y="56"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="bold"
        fontFamily="Georgia, serif"
        letterSpacing="1"
      >
        STARBUCKS
      </text>
    </svg>
  );
}

// ============================================================================
// Menu Item Card Component
// ============================================================================

function MenuItemCard({
  item,
  onLearnMore,
}: {
  item: MenuItem;
  onLearnMore: (item: MenuItem) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="menu-card">
      <div className="menu-card-image-wrapper">
        {!imgError ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="menu-card-image"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="menu-card-image-fallback">
            <StarbucksLogo size={40} />
          </div>
        )}
      </div>
      <div className="menu-card-body">
        <p className="menu-card-name">{item.name}</p>
        <Badge color="neutral">{item.subcategory}</Badge>
      </div>
      <button
        className="menu-card-action"
        onClick={() => onLearnMore(item)}
        aria-label={`Learn more about ${item.name}`}
      >
        Learn more
      </button>
    </div>
  );
}

// ============================================================================
// Item Detail Panel
// ============================================================================

function ItemDetailPanel({
  item,
  onClose,
  onViewMenu,
}: {
  item: MenuItem;
  onClose: () => void;
  onViewMenu: (category: string) => void;
}) {
  const [imgError, setImgError] = useState(false);

  const handleOrder = () => {
    window.openai?.openExternal?.({ href: item.link });
  };

  return (
    <div className="detail-panel">
      <button className="detail-back" onClick={onClose} aria-label="Back to menu">
        ← Back
      </button>
      <div className="detail-content">
        <div className="detail-image-wrapper">
          {!imgError ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="detail-image"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="detail-image-fallback">
              <StarbucksLogo size={60} />
            </div>
          )}
        </div>
        <div className="detail-info">
          <Badge color="neutral">{item.subcategory}</Badge>
          <h2 className="detail-title">{item.name}</h2>
          <p className="text-secondary" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
            {item.description}
          </p>
          <div className="detail-actions">
            <Button color="primary" onClick={handleOrder}>
              Order on Starbucks
            </Button>
            <Button variant="soft" color="secondary" onClick={() => onViewMenu(item.category)}>
              View {item.category}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Category Tab Bar
// ============================================================================

function CategoryTabs({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (cat: string) => void;
}) {
  return (
    <div className="category-tabs" role="tablist">
      {categories.map((cat) => (
        <button
          key={cat}
          role="tab"
          aria-selected={cat === active}
          className={`category-tab${cat === active ? ' category-tab--active' : ''}`}
          onClick={() => onSelect(cat)}
        >
          {cat}
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

  // Local UI state
  const [localCategory, setLocalCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(
    toolOutput.selectedItem ?? null,
  );
  const [isLoading, setIsLoading] = useState(false);

  const menuItems = toolOutput.menuItems ?? [];
  const categories = toolOutput.categories ?? ['All', 'Drinks', 'Food', 'At Home Coffee'];
  const activeCategory = localCategory ?? toolOutput.activeCategory ?? 'All';
  const errorMsg = toolOutput.error;

  // Derived: items filtered by localCategory if changed
  const displayedItems = localCategory && localCategory !== 'All'
    ? menuItems.filter((item) => item.category === localCategory)
    : menuItems;

  const handleToggleFullscreen = async () => {
    await window.openai?.requestDisplayMode?.({
      mode: isFullscreen ? 'inline' : 'fullscreen',
    });
  };

  const handleCategorySelect = async (cat: string) => {
    setLocalCategory(cat);
    setSelectedItem(null);
    setIsLoading(true);
    try {
      await window.openai?.callTool?.('list_menu_items', {
        category: cat === 'All' ? undefined : cat,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLearnMore = (item: MenuItem) => {
    setSelectedItem(item);
  };

  const handleCloseDetail = () => {
    setSelectedItem(null);
  };

  const handleViewMenu = async (cat: string) => {
    setSelectedItem(null);
    setLocalCategory(cat);
    setIsLoading(true);
    try {
      await window.openai?.callTool?.('list_menu_items', { category: cat });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskMenu = async () => {
    await window.openai?.sendFollowUpMessage?.({
      prompt: 'Show me the Starbucks menu',
    });
  };

  // If a selectedItem was passed in toolOutput (from get_menu_item_details), show it
  const itemToShow = selectedItem ?? toolOutput.selectedItem ?? null;

  const containerStyle: React.CSSProperties = maxHeight
    ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' }
    : {};

  return (
    <div className="widget-container" style={containerStyle}>
      {/* Header */}
      <header className="sbux-header">
        <div className="sbux-header-brand">
          <StarbucksLogo size={28} />
          <div>
            <p className="text-secondary" style={{ fontSize: '0.7rem', lineHeight: 1 }}>
              Menu
            </p>
            <h1 className="heading-lg" style={{ lineHeight: 1.2 }}>
              Starbucks
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

      {/* Detail panel OR menu grid */}
      {itemToShow ? (
        <ItemDetailPanel
          item={itemToShow}
          onClose={handleCloseDetail}
          onViewMenu={handleViewMenu}
        />
      ) : menuItems.length === 0 ? (
        <EmptyMessage
          title="Explore the Starbucks Menu"
          description="Ask ChatGPT to show you drinks, food, or specific items."
          action={
            <Button color="primary" onClick={handleAskMenu}>
              <Chat className="size-4" />
              Show Menu
            </Button>
          }
        />
      ) : (
        <>
          {/* Category tabs */}
          <CategoryTabs
            categories={categories}
            active={activeCategory}
            onSelect={handleCategorySelect}
          />

          {/* Item count */}
          <p className="menu-count text-secondary">
            {isLoading ? 'Loading…' : `${displayedItems.length} item${displayedItems.length !== 1 ? 's' : ''}`}
          </p>

          {/* Menu cards grid */}
          {isLoading ? (
            <div className="menu-loading">
              <div className="menu-loading-spinner" />
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="widget-empty">
              <p>No items found in this category.</p>
            </div>
          ) : (
            <div className="menu-grid">
              {displayedItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onLearnMore={handleLearnMore}
                />
              ))}
            </div>
          )}

          {/* Footer */}
          <footer className="sbux-footer">
            <button
              className="sbux-footer-link"
              onClick={() => window.openai?.openExternal?.({ href: 'https://www.starbucks.com/menu' })}
            >
              View full menu at starbucks.com →
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
