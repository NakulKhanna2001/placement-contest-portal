import { cache } from "react";
import { auth } from "@/auth";
import { getUserByEmail } from "./viewer-record";

export const getSession = cache(async () => {
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) return null;
  return auth();
});

export const getViewer = cache(async () => {
  const session = await getSession();
  if (!session?.user.id || !session.user.email) return null;
  return getUserByEmail(session.user.email);
});
