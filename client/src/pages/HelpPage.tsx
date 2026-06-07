import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Search } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { helpArticles } from '../data/helpArticles';

export default function HelpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { articleId } = useParams<{ articleId?: string }>();
  const from = location.state?.from || '/';

  const [query, setQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    helpArticles.reduce<Record<string, boolean>>((acc, article) => {
      acc[article.section] = true;
      return acc;
    }, {})
  );

  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return helpArticles;
    return helpArticles.filter((article) => article.title.toLowerCase().includes(normalized));
  }, [query]);

  const groupedArticles = useMemo(() => {
    return filteredArticles.reduce<Record<string, typeof helpArticles>>((acc, article) => {
      acc[article.section] = [...(acc[article.section] || []), article];
      return acc;
    }, {});
  }, [filteredArticles]);

  const sections = Object.keys(groupedArticles);
  const selectedArticle = articleId ? helpArticles.find((article) => article.id === articleId) || null : null;
  const selectedIndex = selectedArticle ? helpArticles.findIndex((article) => article.id === selectedArticle.id) : -1;
  const previousArticle = selectedIndex > 0 ? helpArticles[selectedIndex - 1] : null;
  const nextArticle = selectedIndex >= 0 && selectedIndex < helpArticles.length - 1 ? helpArticles[selectedIndex + 1] : null;
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [articleId]);

  const firstArticlePerSection = useMemo(() => {
    const seen = new Set<string>();
    const list: typeof helpArticles = [];
    for (const article of helpArticles) {
      if (seen.has(article.section)) continue;
      seen.add(article.section);
      list.push(article);
    }
    return list;
  }, []);

  const currentTitle = selectedArticle?.title || 'Help & Guide';
  const currentSection = selectedArticle?.section || 'Article Index';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', height: '100vh', backgroundColor: '#f8fafc' }}>
      <aside style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '10px', color: '#0f172a' }}>
            Help Articles
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #dbe2ea', borderRadius: '8px', padding: '0 10px', color: '#64748b' }}>
            <Search size={13} strokeWidth={2} />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search help articles..."
              style={{ border: 0, outline: 'none', width: '100%', padding: '8px 0', fontSize: '14px', background: 'transparent' }}
            />
          </label>
        </div>

        <div style={{ overflowY: 'auto', padding: '12px', flex: 1 }}>
          {sections.length === 0 ? (
            <div style={{ fontSize: '14px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={14} strokeWidth={2} /> No matching articles.
            </div>
          ) : (
            sections.map((section) => (
              <section key={section} style={{ marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => setExpandedSections((current) => ({ ...current, [section]: !current[section] }))}
                  style={{ width: '100%', border: 0, background: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}
                >
                  <span>{section}</span>
                  <span>{expandedSections[section] === false ? '+' : '−'}</span>
                </button>
                {expandedSections[section] !== false && (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {groupedArticles[section].map((article) => {
                      const active = selectedArticle?.id === article.id;
                      return (
                        <button
                          key={article.id}
                          type="button"
                          onClick={() => navigate(`/help/${article.id}`, { state: { from } })}
                          className={`app-panel-tab ${active ? 'is-active' : ''}`}
                          style={{ padding: '8px 10px' }}
                        >
                          {article.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      </aside>

      <section style={{ minWidth: 0, display: 'grid', gridTemplateRows: '56px auto minmax(0, 1fr)', backgroundColor: '#ffffff' }}>
        <div style={{ height: '56px', borderBottom: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr minmax(0, 2fr) 1fr', alignItems: 'center', gap: '12px', padding: '0 18px' }}>
          <div>
            <button
              type="button"
              onClick={() => navigate(from)}
              style={{ border: 0, background: 'transparent', color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '15px', cursor: 'pointer', fontWeight: 600 }}
            >
              <ArrowLeft size={16} strokeWidth={2} />
              Exit Help
            </button>
          </div>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '20px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentTitle}
          </div>
          <div style={{ textAlign: 'right', fontSize: '15px', color: '#64748b' }}>
            {currentSection}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 18px', borderBottom: '1px solid #f0f0f0', marginBottom: '16px', gap: '12px' }}>
          <button
            type="button"
            onClick={() => previousArticle && navigate(`/help/${previousArticle.id}`, { state: { from } })}
            disabled={!previousArticle}
            title={previousArticle?.title || ''}
            style={{
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: previousArticle ? '#334155' : '#94a3b8',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: previousArticle ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Previous article
          </button>

          <div style={{ fontSize: '14px', color: '#888', fontWeight: 400 }}>
            {selectedIndex >= 0 ? `${selectedIndex + 1} of ${helpArticles.length} articles` : `0 of ${helpArticles.length} articles`}
          </div>

          <button
            type="button"
            onClick={() => nextArticle && navigate(`/help/${nextArticle.id}`, { state: { from } })}
            disabled={!nextArticle}
            title={nextArticle?.title || ''}
            style={{
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: nextArticle ? '#334155' : '#94a3b8',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: nextArticle ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Next article
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>

        <div ref={contentScrollRef} style={{ overflowY: 'auto', backgroundColor: '#f8fafc' }}>
          {selectedArticle ? (
            <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 64px 32px' }}>
              <div style={{ marginBottom: '32px', fontSize: '15px', color: '#64748b' }}>Help → {selectedArticle.section}</div>
              <h1 style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '26px', color: '#0f172a' }}>
                {selectedArticle.title}
              </h1>
              <div className="help-article-body" dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />
            </div>
          ) : (
            <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: '32px' }}>
              <div style={{ textAlign: 'center', maxWidth: '760px' }}>
                <BookOpen size={48} strokeWidth={1.8} color="#94a3b8" style={{ marginBottom: '16px' }} />
                <h1 style={{ margin: 0, fontWeight: 700, fontSize: '26px', color: '#0f172a' }}>
                  PriceRight Help &amp; Guide
                </h1>
                <p style={{ margin: '10px 0 22px', fontSize: '16px', color: '#64748b' }}>
                  Select an article from the left to get started, or search for a topic above.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', textAlign: 'left' }}>
                  {firstArticlePerSection.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => navigate(`/help/${article.id}`, { state: { from } })}
                      style={{ border: '1px solid #dbe2ea', borderRadius: '10px', backgroundColor: '#ffffff', padding: '10px 12px', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: '13px', letterSpacing: '0.04em', color: '#64748b', marginBottom: '3px' }}>{article.section}</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{article.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      </section>
    </div>
  );
}
