import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { isAllowedAccount } from "@/lib/auth-rules";
import { getUserByEmail } from "@/services/viewer-record";
const accessPolicy = () => ({ domain: process.env.ALLOWED_EMAIL_DOMAIN ?? "", allowedEmails: process.env.ALLOWED_EMAILS ?? "" });
declare module "next-auth" {
  interface Session { user: Omit<NonNullable<DefaultSession["user"]>, "id"> & { id: number; role: "student" | "admin" } }
}
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google], session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      if (profile?.email_verified !== true || !isAllowedAccount(profile.email, accessPolicy())) return false;
      const email = profile.email!.toLowerCase();
      const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase());
      const role = admins.includes(email) ? "admin" as const : "student" as const;
      const name = profile.name ?? "Student";
      await getDb().insert(users).values({ email, name, role }).onConflictDoUpdate({ target: users.email, set: { name, role } });
      return true;
    },
    async session({ session, token }) {
      if (token.email && isAllowedAccount(token.email, accessPolicy())) {
        const user = await getUserByEmail(token.email);
        if (user) Object.assign(session.user, { id: user.id, role: user.role });
      }
      return session;
    },
  },
});
