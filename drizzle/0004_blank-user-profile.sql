-- Accounts created before the profile-blanking hooks hold Google's name and picture address, which nothing uses.
UPDATE "user" SET "name" = '', "image" = NULL WHERE "name" <> '' OR "image" IS NOT NULL;
