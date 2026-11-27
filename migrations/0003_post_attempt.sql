-- Spec N5: posts per user in a fixed one-minute window.
create table "post_attempt" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "window_start" integer not null,
  "count" integer not null
);
