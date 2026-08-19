"use client";
import { useEffect } from "react";

/**
 * Catches an invitation or password-reset that lands on the wrong page.
 *
 * Supabase puts the session in the URL fragment and sends the person to
 * whatever its Redirect URLs allow list permits. When the app's requested
 * destination is not on that list, the parameter is discarded without any
 * error and the Site URL is used instead — so a perfectly valid invitation
 * arrives at the homepage, or at localhost, with the tokens attached and
 * nothing there to receive them.
 *
 * That is not a hypothetical: it happened twice on this project, and neither
 * time did anything fail loudly. The email sent, the link worked, the token
 * was valid. Only the address bar was wrong.
 *
 * This forwards any such arrival to the page that knows what to do with it,
 * carrying the fragment across intact. It means the flow survives a Site URL
 * that points somewhere unhelpful, which is one fewer dashboard setting
 * standing between a new colleague and their account.
 *
 * The fragment never reaches the network — browsers do not send it to the
 * server, and this is a client-side replace, so the tokens stay in the tab.
 * `replace` rather than `push` so the tokens are not left in history.
 */
export default function AuthFragmentRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    const params = new URLSearchParams(hash.slice(1));
    const type = params.get("type");
    const hasToken = params.has("access_token") || params.has("error_description");

    // Only the two flows that end in choosing a password. Anything else — a
    // magic link, an OAuth callback — belongs wherever it landed.
    if (!hasToken || (type !== "recovery" && type !== "invite")) return;

    if (window.location.pathname === "/admin/set-password") return;

    window.location.replace(`/admin/set-password${hash}`);
  }, []);

  return null;
}
