import UsersClient from "./UsersClient";

/**
 * Admin-only by omission: proxy.ts sends anyone whose role is not "admin" to
 * /admin/reservations unless the path is listed in its STAFF_PAGES, and this
 * one is deliberately absent. The API behind it checks the role again.
 */
export const metadata = { title: "Users & Access | Anadyon Admin" };

export default function UsersPage() {
  return <UsersClient />;
}
