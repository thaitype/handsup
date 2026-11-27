/** RoomDO's SQLite schema (spec 5). Each entry runs once, in order, and is never edited. */
const MIGRATIONS: readonly string[] = [
  `create table question (
     id text primary key,
     author_id text not null,
     author_name text not null,
     visibility text not null check (visibility in ('public', 'private')),
     body text not null,
     created_at integer not null,
     resolved_at integer,
     client_request_id text not null,
     unique (author_id, client_request_id)
   );
   create table answer (
     id text primary key,
     question_id text not null,
     author_id text not null,
     author_name text not null,
     body text not null,
     created_at integer not null,
     client_request_id text not null,
     unique (author_id, client_request_id)
   );
   create index answer_question_id on answer (question_id);`,
];

export function migrate(storage: DurableObjectStorage): void {
  storage.sql.exec("create table if not exists schema_version (version integer primary key)");
  const { version } = storage.sql
    .exec<{ version: number }>("select coalesce(max(version), 0) as version from schema_version")
    .one();
  for (let next = version; next < MIGRATIONS.length; next++) {
    storage.transactionSync(() => {
      storage.sql.exec(MIGRATIONS[next]!);
      storage.sql.exec("insert into schema_version (version) values (?)", next + 1);
    });
  }
}
