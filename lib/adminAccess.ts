// Single source of truth for what a "staff" (non-admin) user may reach.
// proxy.ts enforces it and the admin sidebar renders from it, so the nav can
// never advertise a page the proxy will bounce.

// Admin pages staff may open — the exact page, or any nested route beneath it.
export const STAFF_PAGES = [
  "/admin/calendar",
  "/admin/reservations",
  "/admin/quotes",
  "/admin/customers",
  "/admin/inbox",
];

// API prefixes staff may call with any method: the resources the pages above own.
export const STAFF_API_WRITE = [
  "/api/admin/reservations",
  "/api/admin/quotes",
  "/api/admin/customers",
  "/api/admin/emails",
  "/api/admin/documents",
  "/api/admin/aade/submit",
  "/api/admin/invoices/submit",
  "/api/admin/stripe/create-payment-link",
  "/api/admin/sms",
];

// API prefixes staff may only read. These back admin-only pages (Fleet, Rates)
// but staff pages need to list vehicles and price a reservation.
export const STAFF_API_READ = ["/api/admin/vehicles", "/api/admin/rates"];

// Exact match or a nested route. Never a bare prefix: "/admin/reservations"
// must not also match "/admin/reservations-archive".
function matches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}

export function isStaffPage(pathname: string) {
  return STAFF_PAGES.some(p => matches(pathname, p));
}

export function isStaffApi(pathname: string, method: string) {
  if (STAFF_API_WRITE.some(p => matches(pathname, p))) return true;
  if (method === "GET" || method === "HEAD") {
    return STAFF_API_READ.some(p => matches(pathname, p));
  }
  return false;
}
