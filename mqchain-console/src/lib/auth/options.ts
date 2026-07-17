import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { OriginClientError } from "@/lib/mqchain/origin-client/errors";
import { authenticateWithOrigin } from "@/lib/mqchain/origin-client/client";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "MQCHAIN credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        try {
          const user = await authenticateWithOrigin(email, password);
          return { id: user.id, email: user.email, name: user.name ?? user.email, role: user.role };
        } catch (error) {
          if (error instanceof OriginClientError && error.status === 401) return null;
          console.error("MQCHAIN Origin authentication request failed.", { status: error instanceof OriginClientError ? error.status : undefined });
          throw new Error("MQCHAIN authentication service is unavailable.");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.role = user.role; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) { session.user.id = token.id as string; session.user.role = token.role as string; }
      return session;
    },
  },
};
