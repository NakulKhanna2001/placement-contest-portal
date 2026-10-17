import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { isAllowedAccount, isAllowedGoogleProfile, roleForEmail } from "@/lib/auth-rules";
import { getUserByEmail } from "@/services/viewer-record";
import { hasVerifiedLeetCode } from "@/lib/contest-access";
const accessPolicy = () => ({
  domain: process.env.ALLOWED_EMAIL_DOMAIN ?? "",
  allowedEmails: process.env.ALLOWED_EMAILS ?? "",
  allowAllGoogleAccounts: process.env.ALLOW_ALL_GOOGLE_ACCOUNTS === "true",
});
declare module "next-auth" {
  interface Session { user: Omit<NonNullable<DefaultSession["user"]>, "id"> & { id: number; role: "student" | "admin"; leetcodeVerified: boolean } }
}
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google], session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile, account }) {
      if (account?.provider !== "google" || !isAllowedGoogleProfile(profile, accessPolicy())) return false;
      const email = profile.email.toLowerCase();
      const role = roleForEmail(email, [process.env.ADMIN_EMAILS, process.env.ADDITIONAL_ADMIN_EMAILS].filter(Boolean).join(","));
      const name = profile.name ?? "Student";
      await getDb().insert(users).values({ email, name, role }).onConflictDoUpdate({ target: users.email, set: { name, role } });
      return true;
    },
    async session({ session, token }) {
      Object.assign(session.user, { leetcodeVerified: false });
      if (token.email && isAllowedAccount(token.email, accessPolicy())) {
        const user = await getUserByEmail(token.email);
        if (user) Object.assign(session.user, { id: user.id, role: user.role, leetcodeVerified: hasVerifiedLeetCode(user) });
      }
      return session;
    },
  },
});
