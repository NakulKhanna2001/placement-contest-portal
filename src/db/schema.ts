import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp, integer, real, uniqueIndex, index, check } from "drizzle-orm/pg-core";
const time = (name: string) => timestamp(name, { withTimezone: true });
export const users = pgTable("users", {
  id: serial("id").primaryKey(), email: text("email").notNull().unique(), name: text("name").notNull().default(""),
  role: text("role", { enum: ["student", "admin"] }).notNull().default("student"),
  leetcodeUsername: text("leetcode_username"), leetcodeVerifiedAt: time("leetcode_verified_at"), verifyToken: text("verify_token"),
  lastAttemptAt: time("last_attempt_at"), lastLinkAttemptAt: time("last_link_attempt_at"),
  // Legacy scheduling column retained for migration compatibility; no cron uses it.
  nextSnapshotAt: time("next_snapshot_at"),
  createdAt: time("created_at").notNull().defaultNow(),
}, t => [uniqueIndex("users_leetcode_lower").on(sql`lower(${t.leetcodeUsername})`)]);
export const contests = pgTable("contests", {
  id: serial("id").primaryKey(), title: text("title").notNull(), startsAt: time("starts_at").notNull(), endsAt: time("ends_at").notNull(),
  status: text("status", { enum: ["draft", "scheduled"] }).notNull().default("scheduled"),
  graceSeconds: integer("grace_seconds").notNull(), bonusWindowSeconds: integer("bonus_window_seconds").notNull(), bonusMultiplier: real("bonus_multiplier").notNull(),
}, t => [check("contest_times", sql`${t.endsAt} > ${t.startsAt}`), check("contest_config", sql`${t.graceSeconds} >= 0 and ${t.bonusWindowSeconds} >= 0 and ${t.bonusMultiplier} >= 1`), index("contest_start").on(t.startsAt)]);
export const batches = pgTable("batches", {
  id: serial("id").primaryKey(), contestId: integer("contest_id").notNull().references(() => contests.id), position: integer("position").notNull(),
  unlockAt: time("unlock_at").notNull(), closesAt: time("closes_at").notNull(),
}, t => [uniqueIndex("batch_position").on(t.contestId, t.position)]);
export const problems = pgTable("problems", {
  id: serial("id").primaryKey(), batchId: integer("batch_id").notNull().references(() => batches.id),
  difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(), slug: text("slug").notNull(), title: text("title").notNull(), points: integer("points").notNull(),
}, t => [index("problem_batch").on(t.batchId)]);
export const solves = pgTable("solves", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id), problemId: integer("problem_id").notNull().references(() => problems.id),
  submissionId: text("submission_id"), acceptedAt: time("accepted_at").notNull(), verifiedAt: time("verified_at").notNull().defaultNow(),
  multiplier: real("multiplier").notNull(), points: real("points").notNull(), source: text("source", { enum: ["auto", "manual"] }).notNull(),
  grantedBy: integer("granted_by").references(() => users.id), evidence: text("evidence"), status: text("status", { enum: ["valid", "revoked"] }).notNull().default("valid"),
}, t => [uniqueIndex("solve_user_problem").on(t.userId, t.problemId), index("solve_problem").on(t.problemId)]);
export const seenSubmissions = pgTable("seen_submissions", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id), submissionId: text("submission_id").notNull(),
  slug: text("slug").notNull(), acceptedAt: time("accepted_at").notNull(), firstSeenAt: time("first_seen_at").notNull().defaultNow(),
}, t => [uniqueIndex("seen_user_submission").on(t.userId, t.submissionId)]);
export const checkLog = pgTable("check_log", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id), submittedLink: text("submitted_link").notNull(),
  outcome: text("outcome").notNull(), error: text("error"), createdAt: time("created_at").notNull().defaultNow(),
}, t => [index("check_user_time").on(t.userId, t.createdAt)]);
export const reports = pgTable("reports", {
  id: serial("id").primaryKey(), contestId: integer("contest_id").notNull().references(() => contests.id), reporterId: integer("reporter_id").notNull().references(() => users.id),
  targetUserId: integer("target_user_id").notNull().references(() => users.id), problemId: integer("problem_id").references(() => problems.id),
  proofUrl: text("proof_url").notNull(), description: text("description").notNull(), status: text("status", { enum: ["pending", "upheld", "dismissed"] }).notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => users.id), reviewedAt: time("reviewed_at"), createdAt: time("created_at").notNull().defaultNow(),
}, t => [uniqueIndex("report_once").on(t.contestId, t.reporterId, t.targetUserId)]);
export const disqualifications = pgTable("disqualifications", {
  id: serial("id").primaryKey(), contestId: integer("contest_id").notNull().references(() => contests.id), userId: integer("user_id").notNull().references(() => users.id),
  reportId: integer("report_id").references(() => reports.id), reason: text("reason").notNull(), createdBy: integer("created_by").notNull().references(() => users.id),
}, t => [uniqueIndex("dq_contest_user").on(t.contestId, t.userId)]);
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(), actorId: integer("actor_id").references(() => users.id), action: text("action").notNull(), target: text("target").notNull(),
  details: text("details").notNull().default(""), createdAt: time("created_at").notNull(),
});
