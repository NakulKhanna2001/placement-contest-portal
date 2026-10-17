ALTER TABLE "users" ADD COLUMN "campus" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "study_year" integer;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_campus" CHECK ("users"."campus" in ('sonepat', 'bengaluru', 'pune', 'hyderabad'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_study_year" CHECK ("users"."study_year" between 1 and 4);