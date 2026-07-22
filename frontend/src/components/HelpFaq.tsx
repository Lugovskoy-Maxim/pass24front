'use client';

/**
 * Плавающая кнопка «Помощь» (все страницы через layout).
 * Контент: FAQ + инструкции из GET /config (админка → Базовые настройки).
 * Стили: globals.css `.help-faq*`. На mobile — выше bottom nav.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookOpen, CircleHelp, ChevronDown, Mail, Phone, X } from 'lucide-react';
import { useConfig } from '@/hooks/useConfig';
import { resolveFaqItems, resolveGuideSections } from '@/lib/help-faq-content';

type TabId = 'guide' | 'faq';

export function HelpFaq() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('faq');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const config = useConfig();
  const faqItems = useMemo(() => resolveFaqItems(config?.faqItems), [config?.faqItems]);
  const guideSections = useMemo(
    () => resolveGuideSections(config?.helpGuideSections),
    [config?.helpGuideSections],
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) {
      panelRef.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!guideSections.length) {
      setExpandedGuide(null);
      return;
    }
    setExpandedGuide((prev) => (
      prev && guideSections.some((s) => s.id === prev) ? prev : guideSections[0].id
    ));
  }, [guideSections]);

  const toggleGuide = (id: string) => {
    setExpandedGuide((prev) => (prev === id ? null : id));
  };

  const toggleFaq = (id: string) => {
    setExpandedFaq((prev) => (prev === id ? null : id));
  };

  return (
    <div className={`help-faq ${open ? 'help-faq--open' : ''}`}>
      {open && (
        <div
          className="help-faq__backdrop"
          aria-hidden
          onClick={close}
        />
      )}

      <div
        ref={panelRef}
        className="help-faq__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        hidden={!open}
      >
        <div className="help-faq__header">
          <div className="min-w-0">
            <h2 id={titleId} className="help-faq__title">
              Помощь
            </h2>
            <p className="help-faq__subtitle">Инструкции и частые вопросы</p>
          </div>
          <button
            type="button"
            className="help-faq__icon-btn"
            onClick={close}
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="help-faq__tabs" role="tablist" aria-label="Разделы помощи">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'faq'}
            className={`help-faq__tab ${tab === 'faq' ? 'help-faq__tab--active' : ''}`}
            onClick={() => setTab('faq')}
          >
            <CircleHelp className="w-3.5 h-3.5 shrink-0" />
            Вопросы
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'guide'}
            className={`help-faq__tab ${tab === 'guide' ? 'help-faq__tab--active' : ''}`}
            onClick={() => setTab('guide')}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            Инструкции
          </button>
        </div>

        <div className="help-faq__body" role="tabpanel">
          {tab === 'faq' && (
            <ul className="help-faq__list">
              {faqItems.length === 0 ? (
                <li className="help-faq__item">
                  <div className="help-faq__item-body" style={{ padding: '0.75rem' }}>
                    <p>Раздел вопросов пока пуст. Обратитесь к администратору.</p>
                  </div>
                </li>
              ) : (
                faqItems.map((item) => {
                  const isOpen = expandedFaq === item.id;
                  return (
                    <li key={item.id} className="help-faq__item">
                      <button
                        type="button"
                        className="help-faq__item-trigger"
                        aria-expanded={isOpen}
                        onClick={() => toggleFaq(item.id)}
                      >
                        <span>{item.question}</span>
                        <ChevronDown
                          className={`help-faq__chevron ${isOpen ? 'help-faq__chevron--open' : ''}`}
                          aria-hidden
                        />
                      </button>
                      {isOpen && (
                        <div className="help-faq__item-body">
                          <p>{item.answer}</p>
                        </div>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          )}

          {tab === 'guide' && (
            <ul className="help-faq__list">
              {guideSections.length === 0 ? (
                <li className="help-faq__item">
                  <div className="help-faq__item-body" style={{ padding: '0.75rem' }}>
                    <p>Инструкции пока не заполнены. Обратитесь к администратору.</p>
                  </div>
                </li>
              ) : (
                guideSections.map((section) => {
                  const isOpen = expandedGuide === section.id;
                  return (
                    <li key={section.id} className="help-faq__item">
                      <button
                        type="button"
                        className="help-faq__item-trigger"
                        aria-expanded={isOpen}
                        onClick={() => toggleGuide(section.id)}
                      >
                        <span>{section.title}</span>
                        <ChevronDown
                          className={`help-faq__chevron ${isOpen ? 'help-faq__chevron--open' : ''}`}
                          aria-hidden
                        />
                      </button>
                      {isOpen && (
                        <div className="help-faq__item-body">
                          {section.paragraphs?.map((p) => (
                            <p key={p}>{p}</p>
                          ))}
                          {section.steps && section.steps.length > 0 && (
                            <ol className="help-faq__steps">
                              {section.steps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {(config?.sitePhone || config?.siteEmail) && (
          <div className="help-faq__footer">
            <p className="help-faq__footer-label">Нужна помощь администратора?</p>
            <div className="help-faq__contacts">
              {config.sitePhone && (
                <a href={`tel:${config.sitePhone}`} className="help-faq__contact">
                  <Phone className="w-3.5 h-3.5" />
                  {config.sitePhone}
                </a>
              )}
              {config.siteEmail && (
                <a href={`mailto:${config.siteEmail}`} className="help-faq__contact">
                  <Mail className="w-3.5 h-3.5" />
                  {config.siteEmail}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        ref={triggerRef}
        type="button"
        className={`help-faq__trigger ${open ? 'help-faq__trigger--active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? 'Закрыть справку' : 'Открыть вопросы и инструкции'}
        title="Вопросы и инструкции"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X className="help-faq__trigger-icon" strokeWidth={2.25} />
        ) : (
          <CircleHelp className="help-faq__trigger-icon" strokeWidth={2.25} />
        )}
        <span className="help-faq__trigger-label">Помощь</span>
      </button>
    </div>
  );
}
