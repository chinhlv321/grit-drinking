CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT,
  discord_webhook TEXT,
  status TEXT DEFAULT 'voting',
  final_date TEXT,
  final_time TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposed_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposed_date_id INTEGER,
  name TEXT NOT NULL,
  vote_type TEXT DEFAULT 'free', -- 'free' or 'busy'
  FOREIGN KEY(proposed_date_id) REFERENCES proposed_dates(id)
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
