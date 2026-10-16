CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"contest_id" integer NOT NULL,
	"position" integer NOT NULL,
	"unlock_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"submitted_link" text NOT NULL,
	"outcome" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"grace_seconds" integer NOT NULL,
	"bonus_window_seconds" integer NOT NULL,
	"bonus_multiplier" real NOT NULL,
	CONSTRAINT "contest_times" CHECK ("contests"."ends_at" > "contests"."starts_at"),
	CONSTRAINT "contest_config" CHECK ("contests"."grace_seconds" >= 0 and "contests"."bonus_window_seconds" >= 0 and "contests"."bonus_multiplier" >= 1)
);
--> statement-breakpoint
CREATE TABLE "disqualifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"contest_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"report_id" integer,
	"reason" text NOT NULL,
	"created_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"difficulty" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"points" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"contest_id" integer NOT NULL,
	"reporter_id" integer NOT NULL,
	"target_user_id" integer NOT NULL,
	"problem_id" integer,
	"proof_url" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seen_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"submission_id" text NOT NULL,
	"slug" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solves" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"problem_id" integer NOT NULL,
	"submission_id" text,
	"accepted_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"multiplier" real NOT NULL,
	"points" real NOT NULL,
	"source" text NOT NULL,
	"granted_by" integer,
	"evidence" text,
	"status" text DEFAULT 'valid' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"leetcode_username" text,
	"leetcode_verified_at" timestamp with time zone,
	"verify_token" text,
	"last_attempt_at" timestamp with time zone,
	"last_link_attempt_at" timestamp with time zone,
	"next_snapshot_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_log" ADD CONSTRAINT "check_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disqualifications" ADD CONSTRAINT "disqualifications_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disqualifications" ADD CONSTRAINT "disqualifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disqualifications" ADD CONSTRAINT "disqualifications_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disqualifications" ADD CONSTRAINT "disqualifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_submissions" ADD CONSTRAINT "seen_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solves" ADD CONSTRAINT "solves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solves" ADD CONSTRAINT "solves_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solves" ADD CONSTRAINT "solves_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_position" ON "batches" USING btree ("contest_id","position");--> statement-breakpoint
CREATE INDEX "check_user_time" ON "check_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "contest_start" ON "contests" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dq_contest_user" ON "disqualifications" USING btree ("contest_id","user_id");--> statement-breakpoint
CREATE INDEX "problem_batch" ON "problems" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_once" ON "reports" USING btree ("contest_id","reporter_id","target_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seen_user_submission" ON "seen_submissions" USING btree ("user_id","submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "solve_user_problem" ON "solves" USING btree ("user_id","problem_id");--> statement-breakpoint
CREATE INDEX "solve_problem" ON "solves" USING btree ("problem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_leetcode_lower" ON "users" USING btree (lower("leetcode_username"));