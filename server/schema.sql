CREATE TABLE IF NOT EXISTS users (
  user TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  nick TEXT,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user TEXT NOT NULL,
  course TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (user, course, type)
);
