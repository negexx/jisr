CREATE TABLE "auth_email_days" (
	"day" date PRIMARY KEY NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "auth_email_days_sent_check" CHECK ("auth_email_days"."sent" >= 0)
);
