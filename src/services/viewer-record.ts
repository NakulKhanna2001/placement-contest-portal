import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

// React's cache is scoped to a server render, never shared between users or requests.
// Auth, the app shell, and the account page can reuse the same fresh role lookup.
export const getUserByEmail = cache(async (email: string) => {
  const [user] = await getDb().select().from(users).where(eq(users.email, email.toLowerCase()));
  return user ?? null;
});
