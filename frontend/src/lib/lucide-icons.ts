import {
  ArrowDown,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleChevronDown,
  CircleChevronRight,
  LucideIcon,
  MoveDown,
} from 'lucide-react';

export const UI_ICON_OPTIONS = [
  { id: 'chevron-down', label: 'Шеврон вниз' },
  { id: 'chevrons-up-down', label: 'Шевроны вверх-вниз' },
  { id: 'move-down', label: 'Стрелка вниз (тонкая)' },
  { id: 'arrow-down', label: 'Стрелка вниз' },
  { id: 'circle-chevron-down', label: 'Круг со шевроном' },
  { id: 'chevron-right', label: 'Шеврон вправо' },
  { id: 'circle-chevron-right', label: 'Круг со шевроном вправо' },
] as const;

export type UiIconId = (typeof UI_ICON_OPTIONS)[number]['id'];

const ICON_MAP: Record<UiIconId, LucideIcon> = {
  'chevron-down': ChevronDown,
  'chevrons-up-down': ChevronsUpDown,
  'move-down': MoveDown,
  'arrow-down': ArrowDown,
  'circle-chevron-down': CircleChevronDown,
  'chevron-right': ChevronRight,
  'circle-chevron-right': CircleChevronRight,
};

export function resolveUiIcon(name?: string | null): LucideIcon {
  if (name && name in ICON_MAP) {
    return ICON_MAP[name as UiIconId];
  }
  return ChevronDown;
}

export function isUiIconId(name?: string | null): name is UiIconId {
  return !!name && name in ICON_MAP;
}