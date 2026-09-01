'use client';

import { Mail, MapPin, Phone } from 'lucide-react';
import { useConfig } from '@/hooks/useConfig';
import { resolveBrand } from '@/lib/brand-defaults';

export function SiteFooter() {
  const config = useConfig();
  const brand = resolveBrand(config);
  const year = new Date().getFullYear();
  const phone = brand.sitePhone || '+7 495 663-00-00';
  const email = brand.siteEmail || 'renta@mstyle.ru';

  return (
    <footer className="w-full border-t border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)]">
      <div className="w-full max-w-6xl mx-auto px-4 py-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-semibold text-[var(--text)]">
              ООО «М-Стиль Офис»
            </p>
            <p>ИНН 9725135298 · КПП 772501001 · ОГРН 1237700644653</p>
            <p>115093, г. Москва, Партийный переулок, д. 1, корп. 57, стр. 3</p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:items-end">
            <a
              href={`tel:${phone.replace(/[^\d+]/g, '')}`}
              className="inline-flex items-center gap-2 hover:text-[var(--text)] transition"
            >
              <Phone className="w-4 h-4" />
              {phone}
            </a>
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center gap-2 hover:text-[var(--text)] transition"
            >
              <Mail className="w-4 h-4" />
              {email}
            </a>
            <a
              href="https://mstyle.ru/contacts/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 hover:text-[var(--text)] transition"
            >
              <MapPin className="w-4 h-4" />
              mstyle.ru
            </a>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--border)] flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs">
          <p>
            © ООО «М-Стиль Офис» - {year}. Сервис пропусков БЦ М-Стиль Офис.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a
              href="https://mstyle.ru/privacy-policy/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--text)] transition"
            >
              Политика конфиденциальности
            </a>
            <a
              href="https://mstyle.ru/soglasen-s-obrabotkoy-personalnyh-dannyh/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--text)] transition"
            >
              Согласие на обработку персональных данных
            </a>
            <a
              href="https://mstyle.ru/user-agreement/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--text)] transition"
            >
              Пользовательское соглашение
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
