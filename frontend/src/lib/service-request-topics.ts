export const SERVICE_REQUEST_TOPICS = {
  service: 'Сервис',
  it: 'IT',
  passes: 'Пропуска',
  services: 'Доп. услуги',
  other: 'Другое',
} as const;

export type ServiceRequestTopic = keyof typeof SERVICE_REQUEST_TOPICS;
