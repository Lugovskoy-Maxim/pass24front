'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { matchesSearch } from '@/lib/search';

export interface SearchableSelectOption {
  value: string;
  label: string;
  searchText?: string;
}

/** Выбор только из допустимых вариантов; поиск доступен при любом количестве. */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = 'Поиск по офисам',
  label,
  invalid,
  disabled,
  required,
  describedBy,
  officeWords = false,
  emptyMessage = 'Офисы не найдены. Измените запрос.',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  describedBy?: string;
  officeWords?: boolean;
  emptyMessage?: string;
}) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 340 });
  const choices = query.trim()
    ? options
    : [{ value: '', label: placeholder }, ...options];
  const matching = choices.filter((option) =>
    matchesSearch(option.searchText || option.label, query, officeWords),
  );
  const activeIndex = Math.min(focusedIndex, matching.length - 1);
  const selected = options.find((option) => option.value === value);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const select = (option: SearchableSelectOption) => {
    onChange(option.value);
    close();
  };
  const show = () => {
    setQuery('');
    setFocusedIndex(
      Math.max(0, options.findIndex((option) => option.value === value) + 1),
    );
    setOpen(true);
  };
  useEffect(() => {
    if (!open || disabled) return;
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const useAbove = below < 270 && above > below;
      setPlacement({
        above: useAbove,
        maxHeight: Math.min(340, Math.max(120, useAbove ? above : below)),
      });
    };
    position();
    search.current?.focus();
    const dismiss = (event: PointerEvent | FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, disabled]);
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(`${uid}-option-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, query, uid]);
  return (
    <div ref={root} className="search-select">
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`input search-select__trigger ${invalid ? 'input--invalid' : ''}`}
        disabled={disabled}
        aria-label={`${label}${required ? ', обязательное поле' : ''}`}
        aria-describedby={describedBy}
        aria-expanded={open && !disabled}
        aria-controls={`${uid}-options`}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}
      >
        <span title={selected?.label || placeholder}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div
          className="search-select__panel"
          data-above={placement.above}
          style={{ maxHeight: placement.maxHeight }}
        >
          <div className="search-select__search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={search}
              type="text"
              role="combobox"
              aria-label={`Поиск: ${label}`}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={`${uid}-options`}
              aria-activedescendant={
                activeIndex >= 0 ? `${uid}-option-${activeIndex}` : undefined
              }
              value={query}
              placeholder={searchPlaceholder}
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setFocusedIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  close();
                }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setFocusedIndex((index) =>
                    matching.length
                      ? (Math.min(index, matching.length - 1) +
                          (event.key === 'ArrowDown'
                            ? 1
                            : matching.length - 1)) %
                        matching.length
                      : 0,
                  );
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (matching[activeIndex]) select(matching[activeIndex]);
                }
              }}
            />
          </div>
          <div
            id={`${uid}-options`}
            role="listbox"
            aria-label={label}
            className="search-select__options"
          >
            {matching.map((option, index) => (
              <button
                key={option.value}
                id={`${uid}-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={option.value === value}
                className={`search-select__option ${index === activeIndex ? 'is-focused' : ''}`}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => select(option)}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <Check size={16} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <p className="search-select__result" role="status" aria-live="polite">
            {matching.length
              ? `Найдено: ${matching.filter((option) => option.value).length}`
              : emptyMessage}
          </p>
        </div>
      )}
    </div>
  );
}
