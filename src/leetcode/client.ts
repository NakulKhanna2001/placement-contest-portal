import { z } from "zod";
import type { AcceptedSubmission } from "@/lib/types";
export interface LeetCodeClient {
  recentAccepted(username: string): Promise<AcceptedSubmission[]>;
  profileBio(username: string): Promise<string | null>;
}
const submission = z.object({ id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d+$/)), titleSlug: z.string().min(1), timestamp: z.string().regex(/^\d+$/).transform(v => new Date(Number(v) * 1000)).pipe(z.date()) });
export function createLeetCodeClient(fetchImpl: typeof fetch = fetch): LeetCodeClient {
  async function gql(query: string, username: string): Promise<unknown> {
    const response = await fetchImpl("https://leetcode.com/graphql", {
      method: "POST", headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
      body: JSON.stringify({ query, variables: { u: username } }), signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`LeetCode responded ${response.status}`);
    return response.json();
  }
  return {
    async recentAccepted(username) {
      const body = z.object({ data: z.object({ recentAcSubmissionList: z.array(submission).max(20).nullable() }), errors: z.array(z.unknown()).optional() }).parse(await gql("query($u:String!){recentAcSubmissionList(username:$u,limit:20){id titleSlug timestamp}}", username));
      if (body.errors?.length) throw new Error("LeetCode lookup failed");
      return (body.data.recentAcSubmissionList ?? []).map(s => ({ id: s.id, slug: s.titleSlug, acceptedAt: s.timestamp }));
    },
    async profileBio(username) {
      const body = z.object({ data: z.object({ matchedUser: z.object({ profile: z.object({ aboutMe: z.string().nullable() }) }).nullable() }), errors: z.array(z.object({ message: z.string() })).optional() }).parse(await gql("query($u:String!){matchedUser(username:$u){profile{aboutMe}}}", username));
      if (body.errors?.some(e => !/user does not exist/i.test(e.message))) throw new Error("LeetCode profile lookup failed");
      return body.data.matchedUser ? body.data.matchedUser.profile.aboutMe ?? "" : null;
    },
  };
}
