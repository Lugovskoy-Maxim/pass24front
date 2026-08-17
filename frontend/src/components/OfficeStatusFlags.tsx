import {
  formatOfficeDate,
  officeAvailabilityLabel,
  officeFormatLabel,
  officePaymentLabel,
  officeRoomStatusLabel,
} from '@/lib/api';

type OfficeFlags = {
  availability?: string;
  officeFormat?: string;
  busyUntil?: string;
  roomStatus?: string;
  paymentStatus?: string;
  paidUntil?: string;
  tenantId?: string;
};

export function OfficeStatusFlags({ office }: { office: OfficeFlags }) {
  const chips: Array<{ key: string; text: string; title?: string; warn?: boolean }> =
    [];
  const pay = officePaymentLabel(office.paymentStatus);
  if (pay) {
    chips.push({
      key: 'pay',
      text: office.paidUntil
        ? `${pay} до ${formatOfficeDate(office.paidUntil)}`
        : pay,
      warn: office.paymentStatus !== 'paid',
    });
  }
  const avail = officeAvailabilityLabel(office.availability);
  if (avail) {
    chips.push({
      key: 'avail',
      text: office.busyUntil
        ? `${avail} до ${formatOfficeDate(office.busyUntil)}`
        : avail,
      title:
        'Статус витрины WordPress (tf_room_availability_status), не арендатор в Pass',
    });
  }
  const room = officeRoomStatusLabel(office.roomStatus);
  if (room) chips.push({ key: 'room', text: room });
  const format = officeFormatLabel(office.officeFormat);
  if (format) chips.push({ key: 'fmt', text: format });
  if (office.tenantId) {
    chips.push({ key: 'tenant', text: 'Есть арендатор в Pass' });
  }

  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map((chip) => (
        <span
          key={chip.key}
          title={chip.title}
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            chip.warn
              ? 'bg-amber-50 text-amber-800'
              : chip.key === 'avail'
                ? 'bg-sky-50 text-sky-800'
                : 'bg-[var(--surface-muted)] text-[var(--muted)]'
          }`}
        >
          {chip.text}
          {chip.key === 'avail' ? '*' : ''}
        </span>
      ))}
    </div>
  );
}

export function OfficeSiteStatusNote() {
  return (
    <p className="text-[11px] text-[var(--muted)] mt-3">
      * Занят / свободен на сайте — статус витрины WordPress, не путать с
      арендатором в Pass.
    </p>
  );
}
