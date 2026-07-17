import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

type OriginUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    CredentialsProvider({
      name: "MQCHAIN credentials",

      credentials: {
        email: {
          label: "Email",
          type: "email",
        },

        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";

        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : "";

        if (!email || !password) {
          return null;
        }

        const originUrl = requireEnvironmentVariable(
          "MQCHAIN_ORIGIN_URL",
        ).replace(/\/+$/, "");

        const cloudflareClientId = requireEnvironmentVariable(
          "CF_ACCESS_CLIENT_ID",
        );

        const cloudflareClientSecret = requireEnvironmentVariable(
          "CF_ACCESS_CLIENT_SECRET",
        );

        let response: Response;

        try {
          response = await fetch(
            `${originUrl}/v1/auth/credentials`,
            {
              method: "POST",

              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "CF-Access-Client-Id": cloudflareClientId,
                "CF-Access-Client-Secret": cloudflareClientSecret,
              },

              body: JSON.stringify({
                email,
                password,
              }),

              cache: "no-store",
              redirect: "manual",
              signal: AbortSignal.timeout(10_000),
            },
          );
        } catch (error) {
          console.error(
            "MQCHAIN origin authentication request failed:",
            error,
          );

          throw new Error(
            "MQCHAIN authentication service is unavailable.",
          );
        }

        if (response.status === 401) {
          return null;
        }

        const contentType =
          response.headers.get("content-type") ?? "";

        if (
          !response.ok ||
          !contentType.includes("application/json")
        ) {
          console.error(
            "MQCHAIN origin returned an invalid authentication response:",
            {
              status: response.status,
              contentType,
              redirectLocation:
                response.headers.get("location"),
            },
          );

          throw new Error(
            "MQCHAIN origin authentication failed.",
          );
        }

        const user =
          (await response.json()) as Partial<OriginUser>;

        if (
          typeof user.id !== "string" ||
          typeof user.email !== "string" ||
          typeof user.role !== "string"
        ) {
          console.error(
            "MQCHAIN origin returned an invalid user object.",
          );

          throw new Error(
            "MQCHAIN origin authentication response is invalid.",
          );
        }

        return {
          id: user.id,
          email: user.email,
          name:
            typeof user.name === "string"
              ? user.name
              : user.email,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }

      return session;
    },
  },
};