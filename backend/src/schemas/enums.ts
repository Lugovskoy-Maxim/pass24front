export enum PassType {
  PEDESTRIAN = 'pedestrian', // пешеходный
  VEHICLE = 'vehicle',       // автомобильный
}

export enum PassStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  PENDING = 'pending', // for requests that become passes
}

export enum PassRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum UserRole {
  RESIDENT = 'resident',       // житель / арендатор
  TENANT = 'tenant',           // арендатор (юридическое лицо)
  EMPLOYEE = 'employee',       // сотрудник
  SECURITY = 'security',       // охрана
  ADMIN = 'admin',             // администратор УК / объекта
  SUPER_ADMIN = 'super_admin',
}

export enum EventType {
  PASS_CREATED = 'pass_created',
  PASS_CLOSED = 'pass_closed',
  ENTRY = 'entry',
  EXIT = 'exit',
  MANUAL_OPEN = 'manual_open',
  REQUEST_CREATED = 'request_created',
  REQUEST_APPROVED = 'request_approved',
  REQUEST_REJECTED = 'request_rejected',
  VEHICLE_DETECTED = 'vehicle_detected',
  BLOCKED_ATTEMPT = 'blocked_attempt',
}

export enum PropertyType {
  RESIDENTIAL_COMPLEX = 'residential_complex', // ЖК
  COTTAGE_VILLAGE = 'cottage_village',         // КП
  BUSINESS_CENTER = 'business_center',         // БЦ
  LOGISTICS = 'logistics',
  OTHER = 'other',
}
