CREATE TYPE "public"."fixture_role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TABLE "fixture_user" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "fixture_role" DEFAULT 'student' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixture_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fixture_session" ADD CONSTRAINT "fixture_session_user_id_fixture_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."fixture_user"("id") ON DELETE cascade ON UPDATE no action;
