'use client';

import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/lib/api';
import { kioskApi, kioskStandbyVideoUrl } from '@/lib/kiosk';

export function KioskVideoSettings() {
  const [version, setVersion] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void kioskApi
      .standby()
      .then(({ version }) => {
        if (active) {
          setVersion(version);
          setLoaded(true);
        }
      })
      .catch((reason) => {
        if (active) setError(getErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(replaceWith?: File) {
    if (busy) return;
    if (replaceWith && replaceWith.size > 10 * 1024 * 1024) {
      setError('Размер видео должен быть не больше 10 МБ.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = replaceWith
        ? await kioskApi.uploadStandby(replaceWith)
        : await kioskApi.resetStandby();
      setVersion(result.version);
      setLoaded(true);
      setFile(null);
      if (input.current) input.current.value = '';
      setNotice(
        replaceWith
          ? 'Заставка обновлена.'
          : 'Стандартная заставка восстановлена.',
      );
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6 max-w-3xl space-y-4">
      <h2 className="text-base font-semibold">Видеозаставка киоска</h2>
      <p className="text-[var(--muted)]">
        Один ролик для всех киосков. Загрузите MP4 (H.264) до 10 МБ. Видео
        показывается посетителям без звука.
      </p>
      {loaded && (
        <>
          <p>{version ? 'Загруженный ролик' : 'Стандартная заставка'}</p>
          <video
            key={version ?? 'default'}
            className="w-full max-h-80 rounded-lg bg-black"
            src={kioskStandbyVideoUrl(version)}
            controls
            muted
            playsInline
            preload="metadata"
            aria-label="Текущая видеозаставка"
          />
        </>
      )}
      <label className="block font-medium" htmlFor="kiosk-standby-file">
        Новый ролик
      </label>
      <input
        ref={input}
        id="kiosk-standby-file"
        className="input"
        type="file"
        accept="video/mp4,.mp4"
        disabled={busy}
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setError('');
          setNotice('');
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!file || busy}
          onClick={() => {
            if (file) void save(file);
          }}
        >
          {busy ? 'Сохранение…' : 'Загрузить видео'}
        </button>
        {version && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            Вернуть стандартную заставку
          </button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}
    </section>
  );
}
