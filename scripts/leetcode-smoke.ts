import { createLeetCodeClient } from "../src/leetcode/client";
const client = createLeetCodeClient();
const username = process.argv[2] ?? "lee215";
const list = await client.recentAccepted(username);
console.log(`Recent accepted: ${list.length} (max 20)`, list[0]);
console.log("Profile available:", (await client.profileBio(username)) !== null);
