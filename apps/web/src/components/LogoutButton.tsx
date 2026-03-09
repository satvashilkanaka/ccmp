'use client';

import { signOut, useSession } from 'next-auth/react';

export function LogoutButton() {
  const { data: session } = useSession();

  const handleLogout = async () => {
    // Dynamically extract the OIDC ID Token stored via standard server session
    const idToken = (session as any)?.idToken;

    // URL to terminate the Keycloak federated session (OIDC compliant)
    const keycloakLogoutUrl = `http://localhost:8180/realms/ccmp/protocol/openid-connect/logout?client_id=ccmp-web&post_logout_redirect_uri=${encodeURIComponent(
      window.location.origin
    )}${idToken ? `&id_token_hint=${idToken}` : ''}`;

    // Clear local NextAuth session and redirect to Keycloak to kill the SSO session
    await signOut({ callbackUrl: keycloakLogoutUrl });
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 bg-red-600 text-white font-medium text-sm rounded hover:bg-red-700 transition"
    >
      Sign Out
    </button>
  );
}
