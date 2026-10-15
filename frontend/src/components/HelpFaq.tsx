'use client';

/**
 * Плавающая кнопка «Помощь» (все страницы через layout).
 * Контент: FAQ + инструкции из GET /config (админка → Базовые настройки).
 * Стили: globals.css `.help-faq*`. На mobile — выше bottom nav.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  CircleHelp,
  ChevronDown,
  Film,
  ArrowRight,
  Mail,
  Phone,
  X,
  UserRoundPlus,
  TicketCheck,
} from 'lucide-react';
import { useConfig } from '@/hooks/useConfig';
import { resolveFaqItems, resolveGuideSections } from '@/lib/help-faq-content';

const HELP_VIDEOS = [
  {
    id: 'registration',
    title: 'Регистрация в PASS',
    description: 'Создание аккаунта арендатора и подтверждение регистрации.',
    src: '/help/registration.mp4',
    script:
      'Добро пожаловать в PASS. Чтобы создать аккаунт арендатора, откройте страницу входа и выберите вкладку «Регистрация». Заполните фамилию, имя и название компании. Укажите корпоративную электронную почту. При необходимости добавьте номер телефона. Придумайте пароль и повторите его в следующем поле. Выберите подтверждение по электронной почте или по SMS, если оно доступно. Нажмите кнопку отправки кода. Введите код из письма или сообщения. Если письмо не пришло, проверьте папку «Спам». После успешного подтверждения заявка на регистрацию будет отправлена администратору бизнес-центра. Дождитесь одобрения и привязки офиса к вашему аккаунту. Затем войдите в PASS, чтобы заказывать пропуска.',
  },
  {
    id: 'pass-order',
    title: 'Как заказать пропуск',
    description: 'Заполнение заявки на визит и отправка пропуска.',
    src: '/help/pass-order.mp4',
    script:
      'Чтобы оформить визит, откройте раздел «Пропуска» и нажмите «Заказать пропуск». Выберите доступный тип пропуска. Укажите имя посетителя и, если требуется, его телефон. Выберите дату визита из доступных дней. Укажите офис, который встретит гостя. Для автомобильного пропуска заполните государственный номер и модель машины. При необходимости добавьте комментарий и укажите электронную почту, чтобы отправить гостю ссылку. Проверьте заполненные данные и отправьте заявку. После создания откроется электронный пропуск. Поделитесь ссылкой с посетителем, чтобы он мог показать её на входе.',
  },
] as const;

const HELP_VIDEO_CAPTIONS = {
  registration: [
    [0, 7, 'Добро пожаловать в PASS. Откройте страницу входа и выберите «Регистрация».'],
    [7, 17, 'Заполните фамилию, имя и название компании.'],
    [17, 28, 'Укажите корпоративную почту, телефон при необходимости и задайте пароль.'],
    [28, 39, 'Выберите подтверждение по электронной почте или SMS и запросите код.'],
    [39, 50, 'Введите код из письма или сообщения. Проверьте папку «Спам», если письма нет.'],
    [50, 63, 'Дождитесь одобрения регистрации и привязки офиса администратором.'],
    [63, 77, 'После этого войдите в PASS и заказывайте пропуска.'],
  ],
  'pass-order': [
    [0, 4, 'Откройте раздел «Пропуска» и нажмите «Заказать пропуск».'],
    [4, 8, 'Выберите доступный тип пропуска.'],
    [8, 12, 'Укажите имя посетителя и, если нужно, телефон.'],
    [12, 16, 'Выберите дату визита из доступных дней.'],
    [16, 20, 'Укажите офис, который встретит гостя.'],
    [20, 24, 'Для автомобильного пропуска добавьте номер и модель машины.'],
    [24, 27, 'Проверьте данные и отправьте заявку.'],
    [27, 30, 'Поделитесь ссылкой на электронный пропуск с посетителем.'],
  ],
} as const;

const QUICK_GUIDES = [
  {
    id: 'order-pass',
    title: 'Заказать пропуск',
    description: 'Оформить визит гостя',
    videoId: 'pass-order',
    videoTitle: 'Как заказать пропуск',
    icon: TicketCheck,
  },
  {
    id: 'login',
    title: 'Зарегистрироваться',
    description: 'Создать аккаунт арендатора',
    videoId: 'registration',
    videoTitle: 'Регистрация в PASS',
    icon: UserRoundPlus,
  },
] as const;

const QUICK_GUIDE_STEPS: Record<(typeof QUICK_GUIDES)[number]['id'], string[]> = {
  login: [
    'Откройте «Регистрация» и заполните данные компании и владельца.',
    'Подтвердите email или телефон кодом из сообщения.',
    'Дождитесь одобрения аккаунта администратором.',
  ],
  'order-pass': [
    'Откройте «Пропуска» → «Заказать пропуск».',
    'Укажите посетителя, дату визита и офис.',
    'Проверьте заявку и отправьте её.',
  ],
};

const QUICK_GUIDE_ICONS = {
  login: UserRoundPlus,
  'order-pass': TicketCheck,
} as const;

type TabId = 'guide' | 'faq';

export function HelpFaq() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('faq');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [expandedHelpVideo, setExpandedHelpVideo] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const config = useConfig();
  const helpButtonEnabled = config?.helpButtonEnabled !== false;
  const faqItems = useMemo(
    () => resolveFaqItems(config?.faqItems),
    [config?.faqItems],
  );
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
      const previousFocus = document.activeElement as HTMLElement | null;
      const panel = panelRef.current;
      const focusable = () =>
        Array.from(
          panel?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) || [],
        );
      focusable()[0]?.focus();
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== 'Tab') return;
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('keydown', onKey);
        previousFocus?.focus();
      };
    }
  }, [open]);

  const toggleGuide = (id: string) => {
    setExpandedGuide((prev) => (prev === id ? null : id));
  };

  const toggleFaq = (id: string) => {
    setExpandedFaq((prev) => (prev === id ? null : id));
  };

  if (!helpButtonEnabled) return null;

  return (
    <div className={`help-faq ${open ? 'help-faq--open' : ''}`}>
      {open && (
        <div className="help-faq__backdrop" aria-hidden onClick={close} />
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
            <p className="help-faq__subtitle">
              Помощь с регистрацией и пропусками
            </p>
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

        <div
          className="help-faq__tabs"
          role="tablist"
          aria-label="Разделы помощи"
        >
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
          {tab === 'guide' && (
            <section className="help-faq__quick" aria-labelledby={`${titleId}-quick`}>
              <div className="help-faq__quick-heading">
                <span className="help-faq__quick-kicker">ИНСТРУКЦИИ</span>
                <h3 id={`${titleId}-quick`}>Выберите задачу</h3>
              </div>
              <div className="help-faq__quick-actions">
                {QUICK_GUIDES.map((guide, index) => {
                  const isOpen = expandedGuide === guide.id;
                  const video = HELP_VIDEOS.find((item) => item.id === guide.videoId)!;
                  const GuideIcon = QUICK_GUIDE_ICONS[guide.id];
                  return (
                    <article
                      className={`help-faq__quick-card ${isOpen ? 'help-faq__quick-card--open' : ''}`}
                      key={guide.id}
                    >
                      <button
                        className="help-faq__quick-main"
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setExpandedGuide(isOpen ? null : guide.id)
                        }
                      >
                        <span className="help-faq__quick-icon"><GuideIcon aria-hidden /></span>
                        <span className="help-faq__quick-copy">
                          <strong>{guide.title}</strong>
                          <span>{guide.description}</span>
                        </span>
                        <ChevronDown className={`help-faq__quick-arrow ${isOpen ? 'help-faq__quick-arrow--open' : ''}`} aria-hidden />
                      </button>
                      {isOpen && (
                        <div className="help-faq__quick-details">
                          <ol className="help-faq__steps">
                            {QUICK_GUIDE_STEPS[guide.id].map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                          <button
                            className="help-faq__video-link"
                            type="button"
                            onClick={() => setExpandedHelpVideo((prev) => prev === guide.videoId ? null : guide.videoId)}
                            aria-expanded={expandedHelpVideo === guide.videoId}
                          >
                            <Film className="w-4 h-4" aria-hidden />
                            {expandedHelpVideo === guide.videoId ? 'Скрыть видео' : `Смотреть видео · ${guide.videoTitle}`}
                          </button>
                          {expandedHelpVideo === guide.videoId && (
                            <div className="help-faq__inline-video">
                              <p>{video.description}</p>
                              <video className="help-faq__video-player" controls playsInline preload="metadata" aria-label={video.title}>
                                <source src={video.src} type="video/mp4" />
                                Ваш браузер не поддерживает воспроизведение видео.
                              </video>
                              <details className="help-faq__video-script">
                                <summary>Текст видео</summary>
                                <p>{video.script}</p>
                              </details>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {tab === 'faq' && (
            <ul className="help-faq__list">
              {faqItems.length === 0 ? (
                <li className="help-faq__item">
                  <div
                    className="help-faq__item-body"
                    style={{ padding: '0.75rem' }}
                  >
                    <p>
                      Раздел вопросов пока пуст. Обратитесь к администратору.
                    </p>
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
            guideSections.some((section) => {
              const title = section.title.toLocaleLowerCase('ru');
              return !(
                ['login', 'order-pass'].includes(section.id) ||
                title.includes('вход и регистрация') ||
                title.includes('заказ пропуска')
              );
            }) && (
              <section className="help-faq__more-guides" aria-label="Другие инструкции">
                <h3>Другие инструкции</h3>
                <ul className="help-faq__list">
                  {guideSections.map((section) => {
                    const title = section.title.toLocaleLowerCase('ru');
                    if (
                      ['login', 'order-pass'].includes(section.id) ||
                      title.includes('вход и регистрация') ||
                      title.includes('заказ пропуска')
                    )
                      return null;
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
                            {section.paragraphs?.map((p) => <p key={p}>{p}</p>)}
                            {section.steps && section.steps.length > 0 && (
                              <ol className="help-faq__steps">
                                {section.steps.map((step) => <li key={step}>{step}</li>)}
                              </ol>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )
          )}
        </div>

        {(config?.sitePhone || config?.siteEmail) && (
          <div className="help-faq__footer">
            <p className="help-faq__footer-label">
              Нужна помощь администратора?
            </p>
            <div className="help-faq__contacts">
              {config.sitePhone && (
                <a
                  href={`tel:${config.sitePhone}`}
                  className="help-faq__contact"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {config.sitePhone}
                </a>
              )}
              {config.siteEmail && (
                <a
                  href={`mailto:${config.siteEmail}`}
                  className="help-faq__contact"
                >
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
