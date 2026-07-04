import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  HELP_CATEGORIES,
  HELP_CATEGORY_ICONS,
  HELP_CONTEXT_CATEGORY,
  HELP_FEEDBACK_STORAGE_KEY,
  WHERE_TO_START_STEPS,
  type HelpCategory,
} from '../data/helpConstants';
import { helpArticles, type HelpArticle } from '../data/helpArticles';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function articlePreview(content: string, maxLength = 100): string {
  const text = stripHtml(content);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function searchArticles(query: string): HelpArticle[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return helpArticles.filter((article) => {
    const inTitle = article.title.toLowerCase().includes(normalized);
    const inKeywords = article.keywords.some((keyword) => keyword.toLowerCase().includes(normalized));
    const inContent = stripHtml(article.content).toLowerCase().includes(normalized);
    return inTitle || inKeywords || inContent;
  });
}

function readFeedbackStore(): Record<string, 'yes' | 'no'> {
  try {
    const raw = window.localStorage.getItem(HELP_FEEDBACK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, 'yes' | 'no'>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeFeedback(articleId: string, value: 'yes' | 'no') {
  const store = readFeedbackStore();
  store[articleId] = value;
  window.localStorage.setItem(HELP_FEEDBACK_STORAGE_KEY, JSON.stringify(store));
}

export default function HelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const articleId = searchParams.get('article');
  const categoryParam = searchParams.get('category');
  const contextParam = searchParams.get('context');
  const searchQueryParam = searchParams.get('q') || '';

  const [searchInput, setSearchInput] = useState(searchQueryParam);
  const [debouncedQuery, setDebouncedQuery] = useState(searchQueryParam);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [feedbackStore, setFeedbackStore] = useState<Record<string, 'yes' | 'no'>>(() => readFeedbackStore());

  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextParam || articleId || categoryParam || searchQueryParam) return;
    const category = HELP_CONTEXT_CATEGORY[contextParam];
    if (!category) return;
    setSearchParams({ context: contextParam, category }, { replace: true });
  }, [articleId, categoryParam, contextParam, searchQueryParam, setSearchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchInput), 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setSearchInput(searchQueryParam);
  }, [searchQueryParam]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [articleId, categoryParam]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectedArticle = useMemo(
    () => (articleId ? helpArticles.find((article) => article.id === articleId) || null : null),
    [articleId],
  );

  const selectedCategory = useMemo(() => {
    if (categoryParam && HELP_CATEGORIES.includes(categoryParam as HelpCategory)) {
      return categoryParam as HelpCategory;
    }
    if (selectedArticle && HELP_CATEGORIES.includes(selectedArticle.section as HelpCategory)) {
      return selectedArticle.section as HelpCategory;
    }
    return null;
  }, [categoryParam, selectedArticle]);

  const articlesByCategory = useMemo(() => {
    return HELP_CATEGORIES.reduce<Record<HelpCategory, HelpArticle[]>>((acc, category) => {
      acc[category] = helpArticles.filter((article) => article.section === category);
      return acc;
    }, {} as Record<HelpCategory, HelpArticle[]>);
  }, []);

  const contextCategory = contextParam ? HELP_CONTEXT_CATEGORY[contextParam] : null;

  const orderedCategories = useMemo(() => {
    if (!contextCategory) return [...HELP_CATEGORIES];
    return [contextCategory, ...HELP_CATEGORIES.filter((category) => category !== contextCategory)];
  }, [contextCategory]);

  const suggestions = useMemo(() => searchArticles(debouncedQuery).slice(0, 6), [debouncedQuery]);

  const searchResults = useMemo(() => {
    if (!searchQueryParam.trim()) return [];
    return searchArticles(searchQueryParam);
  }, [searchQueryParam]);

  const setupSteps = useMemo(() => {
    return WHERE_TO_START_STEPS.map((step) => {
      const article = helpArticles.find((entry) => entry.id === step.id);
      return article ? { ...step, article } : null;
    }).filter((item): item is typeof WHERE_TO_START_STEPS[number] & { article: HelpArticle } => item !== null);
  }, []);

  const openHome = useCallback(() => {
    const next = new URLSearchParams();
    if (contextParam) next.set('context', contextParam);
    setSearchParams(next);
  }, [contextParam, setSearchParams]);

  const openCategory = useCallback(
    (category: HelpCategory) => {
      const next = new URLSearchParams();
      next.set('category', category);
      if (contextParam) next.set('context', contextParam);
      setSearchParams(next);
    },
    [contextParam, setSearchParams],
  );

  const openArticle = useCallback(
    (id: string, options?: { category?: string; q?: string }) => {
      const next = new URLSearchParams();
      next.set('article', id);
      if (options?.category) next.set('category', options.category);
      if (options?.q) next.set('q', options.q);
      if (contextParam) next.set('context', contextParam);
      setSearchParams(next);
    },
    [contextParam, setSearchParams],
  );

  const openSearchResults = useCallback(
    (query: string) => {
      const next = new URLSearchParams();
      next.set('q', query.trim());
      if (contextParam) next.set('context', contextParam);
      setSearchParams(next);
      setSuggestionsOpen(false);
    },
    [contextParam, setSearchParams],
  );

  const handleFeedback = (value: 'yes' | 'no') => {
    if (!selectedArticle) return;
    writeFeedback(selectedArticle.id, value);
    setFeedbackStore((current) => ({ ...current, [selectedArticle.id]: value }));
  };

  const relatedArticles = useMemo(() => {
    if (!selectedArticle) return [];
    return selectedArticle.relatedArticleIds
      .map((id) => helpArticles.find((article) => article.id === id))
      .filter((article): article is HelpArticle => Boolean(article));
  }, [selectedArticle]);

  const showSearchResults = Boolean(searchQueryParam.trim()) && !articleId && !categoryParam;
  const showCategoryView = Boolean(categoryParam) && !articleId;
  const showArticleView = Boolean(selectedArticle);
  const showHome = !showArticleView && !showCategoryView && !showSearchResults;

  const backLabel = searchQueryParam
    ? '← Back to search results'
    : selectedCategory
      ? `← Back to ${selectedCategory}`
      : '← All categories';

  const handleBack = () => {
    if (searchQueryParam) {
      const next = new URLSearchParams();
      next.set('q', searchQueryParam);
      if (contextParam) next.set('context', contextParam);
      setSearchParams(next);
      return;
    }
    if (selectedCategory) {
      openCategory(selectedCategory);
      return;
    }
    openHome();
  };

  return (
    <div className="help-centre">
      <div ref={contentScrollRef} className="help-centre__scroll">
        <div className="help-centre__inner">
          {!showArticleView && (
            <header className="help-centre__hero">
              <h1 className="help-centre__title">Help Centre</h1>
              <p className="help-centre__subtitle">Find answers to your questions about PriceRight</p>

              <div ref={searchWrapRef} className="help-centre__search-wrap">
                <label className="help-centre__search">
                  <Search size={18} strokeWidth={2} />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => {
                      setSearchInput(event.target.value);
                      setSuggestionsOpen(true);
                    }}
                    onFocus={() => setSuggestionsOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && debouncedQuery.trim()) {
                        openSearchResults(debouncedQuery);
                      }
                    }}
                    placeholder="Search for help — e.g. approve prices, add materials, export price list"
                    aria-label="Search help articles"
                    aria-expanded={suggestionsOpen && debouncedQuery.trim().length > 0}
                  />
                </label>

                {suggestionsOpen && debouncedQuery.trim().length > 0 && (
                  <div className="help-centre__suggestions" role="listbox">
                    {suggestions.length === 0 ? (
                      <div className="help-centre__suggestion-empty">
                        No articles found for &apos;{debouncedQuery}&apos; — try different words
                      </div>
                    ) : (
                      suggestions.map((article) => (
                        <button
                          key={article.id}
                          type="button"
                          className="help-centre__suggestion"
                          onClick={() => openArticle(article.id, { q: debouncedQuery.trim() })}
                        >
                          <span className="help-centre__suggestion-title">{article.title}</span>
                          <span className="help-centre__badge">{article.section}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </header>
          )}

          {showHome && (
            <>
              {contextCategory && (
                <section className="help-centre__context-banner">
                  Showing help for <strong>{contextCategory}</strong>
                </section>
              )}

              <section className="help-centre__setup">
                <h2 className="help-centre__setup-heading">Where to start</h2>
                <div className="help-centre__setup-grid">
                  {setupSteps.map(({ step, id, title, description, icon: StepIcon, article }) => (
                    <button
                      key={id}
                      type="button"
                      className="help-centre__setup-card"
                      onClick={() => openArticle(id, { category: 'Getting Started' })}
                    >
                      <span className="help-centre__setup-badge">{step}</span>
                      <StepIcon size={20} strokeWidth={2} className="help-centre__setup-icon" />
                      <div className="help-centre__setup-title">{title}</div>
                      <div className="help-centre__setup-description">{description}</div>
                      <div className="help-centre__setup-link">Read article →</div>
                      <span className="help-centre__setup-meta">{article.readingTimeMinutes} min read</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="help-centre__categories">
                <h2 className="help-centre__section-title">Browse by topic</h2>
                <p className="help-centre__section-subtitle">Explore all help articles organised by topic</p>
                <div className="help-centre__category-grid">
                  {orderedCategories.map((category) => {
                    const Icon = HELP_CATEGORY_ICONS[category];
                    const count = articlesByCategory[category].length;
                    return (
                      <button
                        key={category}
                        type="button"
                        className="help-centre__category-card"
                        onClick={() => openCategory(category)}
                      >
                        <span className="help-centre__category-icon">
                          <Icon size={22} strokeWidth={2} />
                        </span>
                        <span className="help-centre__category-name">{category}</span>
                        <span className="help-centre__category-count">{count} articles</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {showSearchResults && (
            <section className="help-centre__list-section">
              <div className="help-centre__breadcrumb">Help &gt; Search results</div>
              <button type="button" className="help-centre__back-link" onClick={openHome}>
                ← All categories
              </button>
              <h2 className="help-centre__list-title">
                {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for &quot;{searchQueryParam}&quot;
              </h2>
              <div className="help-centre__article-cards">
                {searchResults.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    className="help-centre__article-card"
                    onClick={() => openArticle(article.id, { q: searchQueryParam })}
                  >
                    <div className="help-centre__article-card-title">{article.title}</div>
                    <div className="help-centre__article-card-preview">{articlePreview(article.content)}</div>
                    <div className="help-centre__article-card-meta">
                      <span className="help-centre__badge">{article.section}</span>
                      <span className="help-centre__reading-time">{article.readingTimeMinutes} min read</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showCategoryView && selectedCategory && (
            <section className="help-centre__list-section">
              <div className="help-centre__breadcrumb">Help &gt; {selectedCategory}</div>
              <button type="button" className="help-centre__back-link" onClick={openHome}>
                ← All categories
              </button>
              <h2 className="help-centre__list-title">{selectedCategory}</h2>
              <div className="help-centre__article-cards">
                {articlesByCategory[selectedCategory].map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    className="help-centre__article-card"
                    onClick={() => openArticle(article.id, { category: selectedCategory })}
                  >
                    <div className="help-centre__article-card-title">{article.title}</div>
                    <div className="help-centre__article-card-preview">{articlePreview(article.content)}</div>
                    <div className="help-centre__article-card-meta">
                      <span className="help-centre__reading-time">{article.readingTimeMinutes} min read</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showArticleView && selectedArticle && (
            <article className="help-centre__article-view">
              <div className="help-centre__breadcrumb">
                Help &gt; {selectedArticle.section} &gt; {selectedArticle.title}
              </div>
              <button type="button" className="help-centre__back-link" onClick={handleBack}>
                {backLabel}
              </button>
              <h2 className="help-centre__article-heading">{selectedArticle.title}</h2>
              <div className="help-centre__reading-time help-centre__reading-time--article">
                {selectedArticle.readingTimeMinutes} min read
              </div>
              <div
                className="help-article-body help-centre__article-body"
                dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
              />

              {relatedArticles.length > 0 && (
                <section className="help-centre__related">
                  <h3 className="help-centre__related-title">Related articles</h3>
                  <div className="help-centre__related-grid">
                    {relatedArticles.map((article) => (
                      <button
                        key={article.id}
                        type="button"
                        className="help-centre__related-card"
                        onClick={() =>
                          openArticle(article.id, {
                            category: selectedCategory || article.section,
                            q: searchQueryParam || undefined,
                          })
                        }
                      >
                        <div className="help-centre__related-card-title">{article.title}</div>
                        <div className="help-centre__reading-time">{article.readingTimeMinutes} min read</div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="help-centre__feedback">
                {feedbackStore[selectedArticle.id] ? (
                  <p className="help-centre__feedback-thanks">Thank you for your feedback!</p>
                ) : (
                  <>
                    <p className="help-centre__feedback-question">Was this article helpful?</p>
                    <div className="help-centre__feedback-actions">
                      <button type="button" className="help-centre__feedback-btn" onClick={() => handleFeedback('yes')}>
                        👍 Yes
                      </button>
                      <button type="button" className="help-centre__feedback-btn" onClick={() => handleFeedback('no')}>
                        👎 No
                      </button>
                    </div>
                  </>
                )}
              </section>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
