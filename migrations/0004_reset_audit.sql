-- Spec 7.4 and N2: who made a reset link for whom, and when. No token is stored, and the
-- rows stay if an account is later removed, so there is no foreign key.
create table "reset_audit" (
  "id" text not null primary key,
  "actor_user_id" text not null,
  "target_user_id" text not null,
  "created_at" integer not null
);

create index "reset_audit_target" on "reset_audit" ("target_user_id", "created_at");
