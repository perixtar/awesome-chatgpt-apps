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
  safeArea: {
    insets: { top: number; bottom: number; left: number; right: number };
  };
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
      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, {
        passive: true,
      });
      return () => window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
    },
    [key],
  );

  const getSnapshot = useCallback(
    () => window.openai?.[key] as OpenAiGlobals[K] | undefined,
    [key],
  );

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => undefined,
  );
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
// Stripe Data Types
// ============================================================================

interface StripePlan {
  id: string;
  name: string;
  tagline: string;
  price: string;
  priceSub?: string;
  features: string[];
  cta: string;
  ctaUrl: string;
  highlight?: boolean;
  category: string;
}

interface StripeFee {
  label: string;
  rate: string;
  note?: string;
}

interface PlanHighlight {
  id: string;
  title: string;
  description: string;
  link: string;
}

interface ComparisonRow {
  feature: string;
  availability: Array<{ planId: string; planName: string; included: boolean }>;
}

interface ToolOutput {
  view?: 'list' | 'compare';
  plans?: StripePlan[];
  fees?: StripeFee[];
  highlights?: PlanHighlight[];
  comparisonMatrix?: ComparisonRow[];
  sourceUrl?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

function CheckIcon() {
  return (
    <svg className="stripe-check-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg className="stripe-cross-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="stripe-ext-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3H3C2.44772 3 2 3.44772 2 4V13C2 13.5523 2.44772 14 3 14H12C12.5523 14 13 13.5523 13 13V10M14 2H9M14 2V7M14 2L7 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

interface PlanCardProps {
  plan: StripePlan;
}

function PlanCard({ plan }: PlanCardProps) {
  const handleCta = () => {
    window.openai?.openExternal?.({ href: plan.ctaUrl });
  };

  return (
    <div className={`stripe-plan-card${plan.highlight ? ' stripe-plan-card--highlight' : ''}`}>
      {plan.highlight && (
        <div className="stripe-plan-badge">Most Popular</div>
      )}
      <div className="stripe-plan-header">
        <h2 className="stripe-plan-name">{plan.name}</h2>
        <p className="stripe-plan-tagline">{plan.tagline}</p>
      </div>
      <div className="stripe-plan-price">
        <span className="stripe-plan-price-value">{plan.price}</span>
        {plan.priceSub && (
          <span className="stripe-plan-price-sub">{plan.priceSub}</span>
        )}
      </div>
      <ul className="stripe-plan-features">
        {plan.features.map((f) => (
          <li key={f} className="stripe-plan-feature-item">
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button className={`stripe-cta-btn${plan.highlight ? ' stripe-cta-btn--primary' : ' stripe-cta-btn--secondary'}`} onClick={handleCta}>
        {plan.cta}
        <ExternalLinkIcon />
      </button>
    </div>
  );
}

interface FeeTableProps {
  fees: StripeFee[];
}

function FeeTable({ fees }: FeeTableProps) {
  return (
    <div className="stripe-fee-section">
      <h3 className="stripe-section-title">Transaction Fees</h3>
      <div className="stripe-fee-table">
        {fees.map((fee) => (
          <div key={fee.label} className="stripe-fee-row">
            <span className="stripe-fee-label">{fee.label}</span>
            <div className="stripe-fee-right">
              <span className="stripe-fee-rate">{fee.rate}</span>
              {fee.note && <span className="stripe-fee-note">{fee.note}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CompareViewProps {
  plans: StripePlan[];
  matrix: ComparisonRow[];
}

function CompareView({ plans, matrix }: CompareViewProps) {
  return (
    <div className="stripe-compare">
      {/* Plan headers */}
      <div className="stripe-compare-header" style={{ gridTemplateColumns: `1fr repeat(${plans.length}, 1fr)` }}>
        <div className="stripe-compare-header-empty" />
        {plans.map((p) => (
          <div key={p.id} className={`stripe-compare-plan-col${p.highlight ? ' stripe-compare-plan-col--highlight' : ''}`}>
            <div className="stripe-compare-plan-name">{p.name}</div>
            <div className="stripe-compare-plan-price">{p.price}</div>
          </div>
        ))}
      </div>
      {/* Feature rows */}
      <div className="stripe-compare-body">
        {matrix.map((row) => (
          <div key={row.feature} className="stripe-compare-row" style={{ gridTemplateColumns: `1fr repeat(${plans.length}, 1fr)` }}>
            <div className="stripe-compare-feature">{row.feature}</div>
            {row.availability.map((av) => (
              <div key={av.planId} className={`stripe-compare-cell${av.included ? ' stripe-compare-cell--yes' : ' stripe-compare-cell--no'}`}>
                {av.included ? <CheckIcon /> : <CrossIcon />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface HighlightGridProps {
  highlights: PlanHighlight[];
}

function HighlightGrid({ highlights }: HighlightGridProps) {
  const handleClick = (link: string) => {
    window.openai?.openExternal?.({ href: link });
  };

  return (
    <div className="stripe-highlights-section">
      <h3 className="stripe-section-title">Explore Stripe Products</h3>
      <div className="stripe-highlights-grid">
        {highlights.map((h) => (
          <button key={h.id} className="stripe-highlight-card" onClick={() => handleClick(h.link)}>
            <div className="stripe-highlight-title">{h.title}</div>
            <div className="stripe-highlight-desc">{h.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Tabs
// ============================================================================

type TabId = 'plans' | 'fees' | 'products';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'plans', label: 'Plans' },
  { id: 'fees', label: 'Fees' },
  { id: 'products', label: 'Products' },
];

// ============================================================================
// Main Widget Component
// ============================================================================

function App() {
  const toolOutput = (useOpenAiGlobal('toolOutput') ?? {}) as ToolOutput;
  const displayMode = useDisplayMode();
  const isFullscreen = displayMode === 'fullscreen';

  const [activeTab, setActiveTab] = useState<TabId>('plans');

  const handleToggleFullscreen = async () => {
    const newMode = isFullscreen ? 'inline' : 'fullscreen';
    await window.openai?.requestDisplayMode?.({ mode: newMode });
  };

  const handleAskMore = async () => {
    await window.openai?.sendFollowUpMessage?.({
      prompt: 'Tell me more about Stripe pricing and which plan is right for my business.',
    });
  };

  const { plans = [], fees = [], highlights = [], comparisonMatrix = [], view, sourceUrl } = toolOutput;

  const hasData = plans.length > 0 || fees.length > 0;
  const isCompareView = view === 'compare' && comparisonMatrix.length > 0;

  if (!hasData) {
    return (
      <div className="widget-container">
        <EmptyMessage
          title="No pricing data"
          description="Ask me about Stripe pricing plans or fees."
          action={
            <Button color="primary" onClick={handleAskMore}>
              <Chat className="size-4" />
              Ask about pricing
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="widget-container">
      {/* Header */}
      <header className="stripe-header">
        <div className="stripe-header-left">
          <div className="stripe-logo-lockup">
            <svg className="stripe-logo" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 6.526C0 2.923 2.615 1 5.538 1c1.846 0 3.077.615 4 1.538L8.154 4.308c-.616-.77-1.539-1.231-2.616-1.231-1.077 0-1.846.616-1.846 1.54 0 2.307 5.847 1.538 5.847 5.846 0 3.538-2.77 5.23-5.847 5.23C1.539 15.692 0 14.616 0 14.616L1.385 12.77c.615.77 1.692 1.385 3.077 1.385 1.077 0 2.154-.615 2.154-1.692C6.616 10.308.77 10.923 0 6.526zm14.308 8.55V7.692H12V5.539h2.308V3.077l2.615-.616V5.54H19.23V7.692h-2.307v6.923c0 .77.307 1.23 1.077 1.23.461 0 .923-.153 1.23-.461v2.154c-.461.308-1.23.462-2 .462-1.923 0-2.922-1-2.922-2.924zm9.077-7.23c.77-1.385 2-2.308 3.538-2.308v2.77c-2.23 0-3.538 1.077-3.538 3.384V16H20.77V5.538h2.615v2.308zM30 3.692c-.923 0-1.538-.616-1.538-1.539C28.462.923 29.077.308 30 .308c.923 0 1.538.615 1.538 1.538 0 .923-.615 1.539-1.538 1.539v.307zm-1.308 12.31V5.538h2.616V16h-2.616zm8 0V9.538c0-1.538-.77-2.153-1.846-2.153-.615 0-1.077.153-1.538.461V5.538c.461-.153 1.077-.307 1.692-.307 2.154 0 4.308 1 4.308 3.846V16h-2.616zm8.769.307c-3.077 0-5.23-2.461-5.23-5.538 0-3.077 2.153-5.538 5.23-5.538 1.539 0 2.77.615 3.539 1.538L47.615 8.23c-.461-.615-1.23-1.077-2.154-1.077-1.692 0-2.77 1.385-2.77 3.077 0 1.692 1.078 3.077 2.77 3.077.924 0 1.693-.461 2.154-1.077l1.692 1.539c-.77.923-2 1.538-3.538 1.538zm7.231-.307V2.615H55.23V16h-2.77v.307z" fill="currentColor"/>
            </svg>
            <span className="stripe-header-title">Pricing</span>
          </div>
        </div>
        <div className="stripe-header-actions">
          <Button variant="soft" color="secondary" onClick={handleToggleFullscreen}>
            {isFullscreen ? (
              <><Collapse className="size-4" /> Collapse</>
            ) : (
              <><Expand className="size-4" /> Expand</>
            )}
          </Button>
        </div>
      </header>

      {/* If compare view, show the comparison table directly */}
      {isCompareView ? (
        <div className="stripe-body">
          <CompareView plans={plans} matrix={comparisonMatrix} />
          {fees.length > 0 && <FeeTable fees={fees} />}
          {sourceUrl && (
            <a className="stripe-source-link" href={sourceUrl} onClick={(e) => { e.preventDefault(); window.openai?.openExternal?.({ href: sourceUrl! }); }}>
              View full pricing on stripe.com <ExternalLinkIcon />
            </a>
          )}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="stripe-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`stripe-tab${activeTab === tab.id ? ' stripe-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="stripe-body">
            {activeTab === 'plans' && (
              <div className="stripe-plans-grid">
                {plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            )}

            {activeTab === 'fees' && fees.length > 0 && (
              <FeeTable fees={fees} />
            )}

            {activeTab === 'products' && highlights.length > 0 && (
              <HighlightGrid highlights={highlights} />
            )}

            {sourceUrl && (
              <a className="stripe-source-link" href={sourceUrl} onClick={(e) => { e.preventDefault(); window.openai?.openExternal?.({ href: sourceUrl! }); }}>
                View full pricing on stripe.com <ExternalLinkIcon />
              </a>
            )}
          </div>
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
