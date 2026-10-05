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
    .trim();
}
export function commentMarker(originator: string, messageId: number) {
  return `[PASS:${originator}:${messageId}]`;
}
export function commentText(message: any, originator: string) {
  return `${message.author_label || 'Резидент'} · ${message.author_type === 'support' ? 'Служба сервиса' : 'Арендатор'}\n${message.message_text}\n\n${commentMarker(originator, message.id)}`;
}
export function bitrixErrorLabel(code?: string) {
  if (!code) return '';
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
