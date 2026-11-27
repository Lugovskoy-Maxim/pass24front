'use client';

import { useEffect, useState, type FormEvent } from 'react';
import './rating.css';

export interface RatingAnswer {
  score: number;
  comment: string;
}
type Rating = { title: string; closed: false } | { closed: true };

export function RatingForm({
  token,
  inline = false,
  demo = false,
  chatAnswer,
}: {
  token: string;
  inline?: boolean;
  demo?: boolean;
  chatAnswer?: RatingAnswer;
}) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';
  const url = base + '/quality-rating/' + encodeURIComponent(token);
  const [rating, setRating] = useState<Rating>(demo ? { title: 'Заявка №1842 · Настройка доступа в офис', closed: false } : undefined);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const answered = !!rating?.closed || !!chatAnswer;
  const isLowScore = score >= 1 && score <= 3;
  const loaded = !!rating;

  useEffect(() => {
    if (demo || answered) return;
    const controller = new AbortController();
    let loading = false;
    function refresh() {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      void fetch(url, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          const next: Rating = await response.json();
          if (!controller.signal.aborted) {
            setRating((previous) => (previous?.closed ? previous : next));
            if (!loaded || next.closed) setError('');
          }
        })
        .catch((failure: Error) => {
          if (controller.signal.aborted) return;
          if (!loaded)
            setError(
              failure.message === '404'
                ? 'Запрос оценки не найден.'
                : 'Не удалось загрузить запрос оценки.',
            );
        })
        .finally(() => {
          loading = false;
        });
    }
    refresh();
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [url, answered, loaded, demo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) {
      setRating({ closed: true });
      return;
    }
    setPending(true);
    setError('');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment }),
      });
      if (!response.ok) throw new Error();
      setRating(await response.json());
    } catch {
      setError('Не удалось отправить оценку. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  const Container = inline ? 'section' : 'main';
  const Heading = inline ? 'h3' : 'h1';
  return (
    <Container
      className={
        inline ? 'rating-inline' : 'rating-page'
      }
    >
      <div className="rating-card">
        {!inline && <span className="rating-kicker">PASS24 · M-STYLE</span>}
        <Heading className="rating-title">Оцените нашу работу</Heading>
      {rating && !rating.closed && !inline && (
          <p className="rating-context">{rating.title}</p>
      )}
      {error && (
          <p role="alert" className="rating-error">
          {error}
        </p>
      )}
        {!rating && !chatAnswer && !error && <p role="status" className="rating-loading">Загружаем опрос…</p>}
      {chatAnswer && (
          <section aria-label="Ваш ответ" className="rating-result">
            <p>Ваша оценка</p>
            <strong>{chatAnswer.score}<span> / 5</span></strong>
          {chatAnswer.comment && (
              <p className="rating-comment">{chatAnswer.comment}</p>
          )}
        </section>
      )}
      {rating?.closed && !chatAnswer && (
          <p role="status" className="rating-result">{demo ? 'Спасибо! Демо-отзыв принят.' : 'Опрос закрыт. Ответ уже получен.'}</p>
      )}
      {rating && !answered && (
          <form onSubmit={submit} className="rating-form">
            <fieldset className="rating-choices" disabled={pending}>
              <legend>Как прошла работа по заявке?</legend>
              <p className="rating-hint">Выберите оценку от 1 до 5</p>
              <div className="rating-options">
              {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value} className="rating-option">
                  <input
                    type="radio"
                    name="score"
                    required
                    checked={score === value}
                    onChange={() => setScore(value)}
                  />
                    <span>{value}</span>
                </label>
              ))}
            </div>
          </fieldset>
            <label className="rating-comment-field">
              <span>
                {isLowScore ? 'Что пошло не так?' : 'Комментарий'}{' '}
                <em>необязательно</em>
              </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={500}
                rows={4}
              disabled={pending}
                placeholder={
                  isLowScore
                    ? 'Расскажите, что случилось и что мы могли сделать лучше'
                    : 'Что прошло хорошо? Что можно улучшить?'
                }
            />
          </label>
          <button
            type="submit"
            disabled={pending || !score}
              className="rating-submit"
          >
            {pending ? 'Отправка…' : 'Отправить'}
          </button>
            <p className="rating-privacy">Ваш отзыв поможет нам улучшить качество обслуживания.</p>
        </form>
      )}
      </div>
    </Container>
  );
}
