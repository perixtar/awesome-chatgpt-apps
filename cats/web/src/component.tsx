// Must be imported first to ensure Tailwind layers and style foundations are
// defined before any potential component styles
import './main.css';

import React, { useCallback, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

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
  theme: 'light' | 'dark';
  displayMode: DisplayMode;
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

// ============================================================================
// Data Types
// ============================================================================

interface Article {
  title: string;
  author: string;
  category: string;
  url: string;
  imageUrl?: string;
}

interface ToolOutput {
  articles?: Article[];
  query?: string | null;
  category?: string | null;
  total?: number;
}

// ============================================================================
// Category Badge Colors
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  'cat behavior': '#4A90D9',
  'cat health': '#27AE60',
  'cat products': '#E67E22',
  'cat nutrition': '#9B59B6',
  'cat basics': '#FF6B35',
  'cat stories': '#E91E8C',
  'cat diseases and medical conditions': '#C0392B',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] ?? '#888888';
}

// ============================================================================
// Article Card
// ============================================================================

function ArticleCard({ article }: { article: Article }) {
  const color = getCategoryColor(article.category);

  const handleReadMore = () => {
    if (window.openai?.openExternal) {
      window.openai.openExternal({ href: article.url });
    } else {
      window.open(article.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="article-card">
      {/* Thumbnail */}
      <div className="article-img-wrap">
        {article.imageUrl ? (
          <img
            src={article.imageUrl}
            alt={article.title}
            className="article-img"
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              target.style.display = 'none';
              const placeholder = target.nextElementSibling as HTMLElement | null;
              if (placeholder) placeholder.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="article-img-placeholder"
          style={{
            background: `${color}22`,
            display: article.imageUrl ? 'none' : 'flex',
          }}
          aria-hidden="true"
        >
          <span style={{ fontSize: 32 }}>🐱</span>
        </div>
      </div>

      {/* Content */}
      <div className="article-content">
        {/* Category badge */}
        <span
          className="article-badge"
          style={{ background: `${color}22`, color }}
        >
          {article.category}
        </span>

        {/* Title */}
        <h2 className="article-title">{article.title}</h2>

        {/* Author */}
        <p className="article-author text-secondary">by {article.author}</p>

        {/* Read More */}
        <button
          className="article-read-more"
          onClick={handleReadMore}
          type="button"
          aria-label={`Read more about ${article.title}`}
        >
          Read More →
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Skeleton Card (loading state)
// ============================================================================

function SkeletonCard() {
  return (
    <div className="article-card skeleton-card" aria-hidden="true">
      <div className="skeleton-img" />
      <div className="article-content">
        <div className="skeleton-badge" />
        <div className="skeleton-title" />
        <div className="skeleton-title skeleton-title-short" />
        <div className="skeleton-author" />
      </div>
    </div>
  );
}

// ============================================================================
// Main Widget Component
// ============================================================================

function App() {
  const toolOutput = (useOpenAiGlobal('toolOutput') ?? null) as ToolOutput | null;

  const articles = toolOutput?.articles ?? null;
  const query = toolOutput?.query ?? null;
  const category = toolOutput?.category ?? null;
  const isLoading = toolOutput === null;

  // Build header subtitle
  let subtitle = 'Cat care articles from Cats.com';
  if (query) subtitle = `Search results for "${query}"`;
  else if (category) subtitle = `Category: ${category}`;

  const handleBrowseAll = async () => {
    await window.openai?.sendFollowUpMessage?.({
      prompt: 'Show me all cat articles',
    });
  };

  return (
    <div className="widget-container cats-widget">
      {/* Header */}
      <header className="cats-header">
        <div className="cats-header-left">
          <span className="cats-logo" aria-hidden="true">🐾</span>
          <div>
            <h1 className="heading-lg cats-title">Cats.com</h1>
            <p className="text-secondary cats-subtitle">{subtitle}</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main>
        {isLoading ? (
          // Loading: skeleton cards
          <div className="article-grid">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : articles && articles.length > 0 ? (
          // Article grid
          <div className="article-grid">
            {articles.map((article, idx) => (
              <ArticleCard key={`${article.url}-${idx}`} article={article} />
            ))}
          </div>
        ) : (
          // Empty state
          <div className="widget-empty cats-empty">
            <span className="cats-empty-icon" aria-hidden="true">🔍</span>
            <p className="cats-empty-title">No articles found</p>
            <p className="text-secondary cats-empty-desc">
              {query
                ? `No results for "${query}". Try a different keyword.`
                : category
                ? `No articles in "${category}". Try a different category.`
                : 'No articles available. Try browsing or searching.'}
            </p>
            <button
              className="cats-browse-btn"
              onClick={handleBrowseAll}
              type="button"
            >
              Browse All Articles
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      {articles && articles.length > 0 && (
        <footer className="cats-footer">
          <span className="text-secondary">{articles.length} article{articles.length !== 1 ? 's' : ''}</span>
          <a
            className="cats-footer-link"
            href="https://cats.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (window.openai?.openExternal) {
                e.preventDefault();
                window.openai.openExternal({ href: 'https://cats.com' });
              }
            }}
          >
            Visit Cats.com →
          </a>
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
