import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import { getLeaderboard } from "./leaderboard";
export const cachedBoard = unstable_cache(async (contestId: number) => getLeaderboard(getDb(), contestId), ["leaderboard"], { revalidate: 5, tags: ["leaderboard"] });
