"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertyType = exports.EventType = exports.UserRole = exports.PassRequestStatus = exports.PassStatus = exports.PassType = void 0;
var PassType;
(function (PassType) {
    PassType["PEDESTRIAN"] = "pedestrian";
    PassType["VEHICLE"] = "vehicle";
})(PassType || (exports.PassType = PassType = {}));
var PassStatus;
(function (PassStatus) {
    PassStatus["ACTIVE"] = "active";
    PassStatus["CLOSED"] = "closed";
    PassStatus["EXPIRED"] = "expired";
    PassStatus["CANCELLED"] = "cancelled";
    PassStatus["PENDING"] = "pending";
})(PassStatus || (exports.PassStatus = PassStatus = {}));
var PassRequestStatus;
(function (PassRequestStatus) {
    PassRequestStatus["PENDING"] = "pending";
    PassRequestStatus["APPROVED"] = "approved";
    PassRequestStatus["REJECTED"] = "rejected";
    PassRequestStatus["CANCELLED"] = "cancelled";
})(PassRequestStatus || (exports.PassRequestStatus = PassRequestStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["RESIDENT"] = "resident";
    UserRole["TENANT"] = "tenant";
    UserRole["EMPLOYEE"] = "employee";
    UserRole["SECURITY"] = "security";
    UserRole["ADMIN"] = "admin";
    UserRole["SUPER_ADMIN"] = "super_admin";
})(UserRole || (exports.UserRole = UserRole = {}));
var EventType;
(function (EventType) {
    EventType["PASS_CREATED"] = "pass_created";
    EventType["PASS_CLOSED"] = "pass_closed";
    EventType["ENTRY"] = "entry";
    EventType["EXIT"] = "exit";
    EventType["MANUAL_OPEN"] = "manual_open";
    EventType["REQUEST_CREATED"] = "request_created";
    EventType["REQUEST_APPROVED"] = "request_approved";
    EventType["REQUEST_REJECTED"] = "request_rejected";
    EventType["VEHICLE_DETECTED"] = "vehicle_detected";
    EventType["BLOCKED_ATTEMPT"] = "blocked_attempt";
})(EventType || (exports.EventType = EventType = {}));
var PropertyType;
(function (PropertyType) {
    PropertyType["RESIDENTIAL_COMPLEX"] = "residential_complex";
    PropertyType["COTTAGE_VILLAGE"] = "cottage_village";
    PropertyType["BUSINESS_CENTER"] = "business_center";
    PropertyType["LOGISTICS"] = "logistics";
    PropertyType["OTHER"] = "other";
})(PropertyType || (exports.PropertyType = PropertyType = {}));
//# sourceMappingURL=enums.js.map