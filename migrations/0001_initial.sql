CREATE TABLE tend_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1)), image TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE tend_sessions (
  id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE
);
CREATE INDEX tend_sessions_user_idx ON tend_sessions(user_id);
CREATE INDEX tend_sessions_expiry_idx ON tend_sessions(expires_at);
CREATE TABLE tend_accounts (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE,
  access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX tend_accounts_user_idx ON tend_accounts(user_id);
CREATE UNIQUE INDEX tend_accounts_provider_idx ON tend_accounts(provider_id,account_id);
CREATE TABLE tend_verifications (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX tend_verification_identifier_idx ON tend_verifications(identifier);
CREATE TABLE tend_rate_limits (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, last_request INTEGER NOT NULL);
CREATE TABLE tend_workspaces (
  user_id TEXT PRIMARY KEY REFERENCES tend_users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0), schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1), updated_at TEXT NOT NULL
);
CREATE TABLE tend_categories (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE, id TEXT NOT NULL,
  name TEXT NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL, PRIMARY KEY(user_id,id)
);
CREATE TABLE tend_activity_templates (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE, id TEXT NOT NULL, category_id TEXT NOT NULL,
  name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('activity','habit')),
  state TEXT NOT NULL CHECK(state IN ('active','paused','archived')), data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  PRIMARY KEY(user_id,id), FOREIGN KEY(user_id,category_id) REFERENCES tend_categories(user_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX tend_templates_category_idx ON tend_activity_templates(user_id,category_id,state);
CREATE TABLE tend_habits (
  user_id TEXT NOT NULL, template_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekdays','weekly','monthly','custom')),
  schedule_json TEXT NOT NULL CHECK(json_valid(schedule_json)), goal REAL NOT NULL CHECK(goal>0),
  reminder TEXT NOT NULL, pauses_json TEXT NOT NULL CHECK(json_valid(pauses_json)),
  PRIMARY KEY(user_id,template_id), FOREIGN KEY(user_id,template_id) REFERENCES tend_activity_templates(user_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE tend_custom_fields (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE, id TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE, type TEXT NOT NULL CHECK(type IN ('text','number','date','select','checkbox','duration')),
  options_json TEXT NOT NULL CHECK(json_valid(options_json)), PRIMARY KEY(user_id,id), UNIQUE(user_id,name)
);
CREATE TABLE tend_activity_logs (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE, id TEXT NOT NULL, template_id TEXT NOT NULL,
  category_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('completed','planned','skipped')),
  related_id TEXT, data_json TEXT NOT NULL CHECK(json_valid(data_json)), PRIMARY KEY(user_id,id),
  FOREIGN KEY(user_id,template_id) REFERENCES tend_activity_templates(user_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(user_id,category_id) REFERENCES tend_categories(user_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(user_id,related_id) REFERENCES tend_activity_logs(user_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX tend_logs_date_idx ON tend_activity_logs(user_id,date DESC);
CREATE INDEX tend_logs_template_idx ON tend_activity_logs(user_id,template_id,date DESC);
CREATE INDEX tend_logs_category_idx ON tend_activity_logs(user_id,category_id,status,date DESC);
CREATE TABLE tend_custom_field_values (
  user_id TEXT NOT NULL, log_id TEXT NOT NULL, field_id TEXT NOT NULL, value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  PRIMARY KEY(user_id,log_id,field_id),
  FOREIGN KEY(user_id,log_id) REFERENCES tend_activity_logs(user_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(user_id,field_id) REFERENCES tend_custom_fields(user_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE tend_workout_templates (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE, id TEXT NOT NULL,
  name TEXT NOT NULL, exercises_json TEXT NOT NULL CHECK(json_valid(exercises_json)), PRIMARY KEY(user_id,id)
);
CREATE TABLE tend_workout_sessions (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE, id TEXT NOT NULL, date TEXT NOT NULL,
  type TEXT NOT NULL, rest_day INTEGER NOT NULL CHECK(rest_day IN (0,1)), data_json TEXT NOT NULL CHECK(json_valid(data_json)), PRIMARY KEY(user_id,id)
);
CREATE INDEX tend_workouts_date_idx ON tend_workout_sessions(user_id,date DESC);
CREATE TABLE tend_exercises (
  user_id TEXT NOT NULL, session_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL,
  PRIMARY KEY(user_id,session_id,id), FOREIGN KEY(user_id,session_id) REFERENCES tend_workout_sessions(user_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX tend_exercises_name_idx ON tend_exercises(user_id,name);
CREATE TABLE tend_workout_sets (
  user_id TEXT NOT NULL, session_id TEXT NOT NULL, exercise_id TEXT NOT NULL, id TEXT NOT NULL,
  position INTEGER NOT NULL, reps INTEGER NOT NULL CHECK(reps>=0), weight REAL NOT NULL CHECK(weight>=0), duration REAL NOT NULL CHECK(duration>=0),
  PRIMARY KEY(user_id,session_id,exercise_id,id),
  FOREIGN KEY(user_id,session_id,exercise_id) REFERENCES tend_exercises(user_id,session_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE tend_preferences (
  user_id TEXT PRIMARY KEY REFERENCES tend_users(id) ON DELETE CASCADE, data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
CREATE TABLE tend_mutation_receipts (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE, mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,mutation_id)
);
CREATE TABLE tend_photos (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE, id TEXT NOT NULL,
  sha256 TEXT NOT NULL, mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),
  bytes BLOB NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,id), UNIQUE(user_id,sha256)
);
CREATE TABLE tend_upload_parts (
  user_id TEXT NOT NULL REFERENCES tend_users(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL, part INTEGER NOT NULL CHECK(part>=0 AND part<256),
  content TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,upload_id,part)
);
CREATE INDEX tend_upload_parts_created_idx ON tend_upload_parts(user_id,created_at);
