CREATE TABLE "request_throttles" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "request_throttles_count_check" CHECK ("request_throttles"."count" >= 1)
);
--> statement-breakpoint
CREATE INDEX "request_throttles_window_start_idx" ON "request_throttles" USING btree ("window_start");