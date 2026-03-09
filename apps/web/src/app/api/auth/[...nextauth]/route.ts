import NextAuth, { NextAuthOptions, DefaultSession } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';

declare module 'next-auth' {
  interface Session {
    idToken?: string;
    user: {
      id: string;
      role: string;
    } & DefaultSession['user']
  }
}
export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID || 'ccmp-web',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM || 'ccmp'}`,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        
        console.log("---- KEYCLOAK PROFILE DATA ----");
        console.log(JSON.stringify(profile, null, 2));
        
        // Extract CCMP role from Keycloak realm_access
        const roles = (profile as any)?.realm_access?.roles || [];
        console.log("---- EXTRACTED REALM ROLES ----:", roles);
        
        token.role = ['AGENT','SENIOR_AGENT','SUPERVISOR','QA_ANALYST','OPERATIONS_MANAGER','COMPLIANCE_OFFICER','ADMIN']
          .find((r) => roles.includes(r)) || 'UNKNOWN';
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.user.role = token.role as string;
      session.user.id = token.sub!;
      
      // Expose idToken for federated Keycloak logout
      session.idToken = token.idToken as string;
      
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  debug: true,
};

const handler = NextAuth(authOptions as any);
export { handler as GET, handler as POST };
