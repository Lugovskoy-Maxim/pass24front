'use client';

import { useEffect, useState, type FormEvent } from 'react';

interface Rating {
  title: string;
  answer: { score: number; comment: string } | null;
}

export function RatingForm({
  token,
  inline = false,
}: {
  token: string;
  inline?: boolean;
}) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';
  const url = base + '/quality-rating/' + encodeURIComponent(token);
  const [rating, setRating] = useState<Rating>();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const answered = !!rating?.answer;
  const loaded = !!rating;

  useEffect(() => {
    if (answered) return;
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
            setRating((previous) => (previous?.answer ? previous : next));
            if (!loaded || next.answer) setError('');
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
  }, [url, answered, loaded]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        inline ? 'm-3 rounded border p-4' : 'mx-auto my-12 w-full max-w-lg px-4'
      }
    >
      <Heading className="text-2xl font-semibold">Оценка заявки</Heading>
      {rating && !inline && <p className="my-4">{rating.title}</p>}
      {error && (
        <p role="alert" className="my-4">
          {error}
        </p>
      )}
      {!rating && !error && <p role="status">Загрузка…</p>}
      {rating?.answer && (
        <section aria-label="Ваш ответ">
          <p>Ваша оценка: {rating.answer.score} из 5</p>
          {rating.answer.comment && (
            <p className="whitespace-pre-wrap">{rating.answer.comment}</p>
          )}
        </section>
      )}
      {rating && !rating.answer && (
        <form onSubmit={submit} className="grid gap-4">
          <fieldset disabled={pending}>
            <legend>Выберите оценку</legend>
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className="inline-flex items-center gap-1 p-2"
                >
                  <input
                    type="radio"
                    name="score"
                    required
                    checked={score === value}
                    onChange={() => setScore(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-2">
            Комментарий (необязательно)
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={500}
              rows={3}
              disabled={pending}
              className="rounded border p-2"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !score}
            className="btn-primary"
          >
            {pending ? 'Отправка…' : 'Отправить'}
          </button>
        </form>
      )}
    </Container>
  );
}
