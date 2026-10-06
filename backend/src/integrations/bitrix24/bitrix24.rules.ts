import type { CrmStage } from './bitrix24.client';

export function crmTicketStatus(deal: any, stages: CrmStage[]) {
  const stage = stages.find((item) => item.id === String(deal.STAGE_ID));
  const semantic = deal.STAGE_SEMANTIC_ID || stage?.semantic;
  if (['S', 'success'].includes(semantic)) return 'completed';
  if (['F', 'failure'].includes(semantic)) return 'cancelled';
  return 'in_progress';
}
export function crmPlainText(text: string) {
  return String(text || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\[url=(https?:\/\/[^\]]+)\]([^]*?)\[\/url\]/gi, '$2 ($1)')
    .replace(
      /\[\/?(?:b|i|u|s|quote|code|color(?:=[^\]]+)?|size(?:=[^\]]+)?)\]/gi,
      '',
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .trim();
}
export function crmReplyText(comment: string) {
  const text = crmPlainText(comment);
  const marker = /^\(\s*ответ\s*\)\s*/iu.exec(text);
  return marker ? text.slice(marker[0].length).trim() : null;
}
export function crmOfficeReference(
  number: unknown,
  areaSqm: unknown,
  businessCenterName: unknown,
) {
  const officeNumber = String(number || '').trim();
  if (!officeNumber) return '';
  const name = String(businessCenterName || '')
    .replace(/^\s*(?:бизнес[\s-]*центр|бц)\s*/iu, '')
    .replace(/[«»"“”]/g, '')
    .trim();
  const parts = name.match(/[\p{L}]+|\d+/gu) || [];
  const abbreviation = parts
    .map((part) =>
      /^\d+$/.test(part) ? '-' + part : part[0].toLocaleUpperCase('ru'),
    )
    .join('')
    .replace(/^-/, '');
  const area = Number(String(areaSqm ?? '').replace(',', '.'));
  const areaLabel =
    Number.isFinite(area) && area > 0
      ? `-${new Intl.NumberFormat('ru-RU', { useGrouping: false, maximumFractionDigits: 20 }).format(area)} м²`
      : '';
  return `${abbreviation ? abbreviation + '/' : 'Офис '}${officeNumber}${areaLabel}`;
}
export function commentMarker(originator: string, messageId: number) {
  return `[PASS:${originator}:${messageId}]`;
}
export function commentText(message: any) {
  return `Сообщение отправлено ${message.author_type === 'support' ? 'сотрудником' : 'пользователем'} в Pass\n\n${message.message_text}`;
}
export function commentFiles(files?: Record<string, any>) {
  return Object.values(files || {})
    .map((file: any) => ({
      name: String(file.name || ''),
      size: Number(file.size),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.size - b.size);
}
export function matchesPendingComment(message: any, comment: any) {
  const attempt = message.bitrix?.attempt;
  return !!(
    ['sending', 'uncertain'].includes(message.bitrix?.state) &&
    attempt &&
    !attempt.comment_ids.includes(String(comment.ID)) &&
    String(comment.AUTHOR_ID) === attempt.author_id &&
    crmPlainText(comment.COMMENT) === attempt.text &&
    JSON.stringify(commentFiles(comment.FILES)) ===
      JSON.stringify(attempt.files)
  );
}
export function bitrixErrorLabel(code?: string) {
  if (!code) return '';
  if (code === 'file_scope_required')
    return 'Для загрузки вложений добавьте вебхуку Bitrix24 доступ «Диск». Загрузка повторится автоматически.';
  if (code === 'file_access_denied')
    return 'У владельца вебхука Bitrix24 нет доступа к файлу. Проверьте права на вложение.';
  if (code === 'file_too_large')
    return 'Вложение Bitrix24 превышает допустимый размер 10 МБ.';
  if (code?.startsWith('file_'))
    return 'Не удалось загрузить вложение из Bitrix24. Повторная загрузка выполняется автоматически.';
  if (code === 'webhook_not_configured')
    return 'Проверьте полный адрес вебхука в BITRIX_API_KEY на сервере.';
  if (code === 'service_funnel_not_found')
    return 'Воронка «Сервис» недоступна вебхуку.';
  if (code === 'service_funnel_ambiguous')
    return 'Найдено несколько воронок «Сервис». Укажите BITRIX_SERVICE_CATEGORY_ID.';
  if (code === 'service_stages_not_configured')
    return 'В воронке «Сервис» нужна рабочая и успешная завершающая стадия.';
  if (code === 'delivery_uncertain')
    return 'Передача требует сверки с CRM. Повторное создание приостановлено, чтобы избежать дубликата.';
  if (code === 'duplicate_deals')
    return 'Найдено несколько карточек CRM для этой заявки. Требуется сверка.';
  if (code === 'customer_ambiguous')
    return 'В CRM найдено несколько совпадений клиента. Проверьте контакты и компании; автоматическая привязка приостановлена.';
  if (code === 'customer_delivery_uncertain')
    return 'Создание клиента требует сверки с CRM. Повторное создание приостановлено, чтобы избежать дубликата.';
  if (code === 'notification_permission_denied')
    return 'Для уведомлений ответственного добавьте вебхуку Bitrix24 доступ «Чат и уведомления». Назначение сохранено, отправка будет повторена.';
  if (code === 'notification_failed')
    return 'Bitrix24 не подтвердил отправку уведомления. Назначение сохранено, отправка будет повторена.';
  if (code === 'deal_mismatch')
    return 'Связанная карточка перемещена из воронки «Сервис» или изменена её привязка.';
  return 'Нет связи с Bitrix24. Заявка и сообщения сохранены; передача будет повторена автоматически.';
}
