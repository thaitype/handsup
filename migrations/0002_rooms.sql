-- Spec 5: rooms live in D1. Roles are not stored (spec 7.3).
create table "room" (
  "id" text not null primary key,
  "name" text not null,
  "invite_code" text not null unique,
  "created_by" text not null references "user" ("id"),
  "created_at" integer not null
);

create table "room_member" (
  "room_id" text not null references "room" ("id") on delete cascade,
  "user_id" text not null references "user" ("id") on delete cascade,
  "joined_at" integer not null,
  primary key ("room_id", "user_id")
);

create index "room_member_user_id" on "room_member" ("user_id");

-- Spec 7.5: join attempts per user in a fixed one-minute window.
create table "join_attempt" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "window_start" integer not null,
  "count" integer not null
);
