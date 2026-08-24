"use client";
import { createContext, useContext } from "react";

/**
 * The signed-in user's role, for screens that render differently for staff.
 *
 * The role already travels from the proxy to the server layout in the
 * `x-anadyon-role` header, which the client cannot set. This carries the same
 * value down to client pages so they can render read-only rather than offering
 * an edit that the API will refuse.
 *
 * This is presentation only. Every rule it reflects is enforced in proxy.ts,
 * which is what actually decides whether a request is allowed. A page that
 * ignored this context would show editable fields whose saves return 403 — an
 * annoyance, never a way in.
 */
const RoleContext = createContext<string>("");

export function RoleProvider({ role, children }: { role: string; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): string {
  return useContext(RoleContext);
}

/** True only for an administrator. An unresolved role is never privileged. */
export function useIsAdmin(): boolean {
  return useContext(RoleContext) === "admin";
}
