export declare enum PassType {
    PEDESTRIAN = "pedestrian",
    VEHICLE = "vehicle"
}
export declare enum PassStatus {
    ACTIVE = "active",
    CLOSED = "closed",
    EXPIRED = "expired",
    CANCELLED = "cancelled",
    PENDING = "pending"
}
export declare enum PassRequestStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
    CANCELLED = "cancelled"
}
export declare enum UserRole {
    RESIDENT = "resident",
    TENANT = "tenant",
    EMPLOYEE = "employee",
    SECURITY = "security",
    ADMIN = "admin",
    SUPER_ADMIN = "super_admin"
}
export declare enum EventType {
    PASS_CREATED = "pass_created",
    PASS_CLOSED = "pass_closed",
    ENTRY = "entry",
    EXIT = "exit",
    MANUAL_OPEN = "manual_open",
    REQUEST_CREATED = "request_created",
    REQUEST_APPROVED = "request_approved",
    REQUEST_REJECTED = "request_rejected",
    VEHICLE_DETECTED = "vehicle_detected",
    BLOCKED_ATTEMPT = "blocked_attempt"
}
export declare enum PropertyType {
    RESIDENTIAL_COMPLEX = "residential_complex",
    COTTAGE_VILLAGE = "cottage_village",
    BUSINESS_CENTER = "business_center",
    LOGISTICS = "logistics",
    OTHER = "other"
}
