// server/db.js —— SQLite 数据库层：建表 + 预编译语句
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true }); // 确保数据目录存在

export const db = new Database(join(dataDir, 'infohub.db'));
db.pragma('journal_mode = WAL'); // 提升读写并发性能

// 建表语句（IF NOT EXISTS 保证幂等：重复执行不报错）
db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL,
    card_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    summary TEXT DEFAULT '',
    time INTEGER,
    tags TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_fav_uid ON favorites(uid);

  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    q TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

// 预编译语句：一次编译反复执行，参数占位符 ? 从根源上防 SQL 注入
export const stmts = {
  favAll:    db.prepare('SELECT * FROM favorites WHERE uid = ? ORDER BY id DESC'),
  favFind:   db.prepare('SELECT id FROM favorites WHERE uid = ? AND card_id = ?'),
  favInsert: db.prepare('INSERT INTO favorites (uid, card_id, title, source, url, summary, time, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  favDelete: db.prepare('DELETE FROM favorites WHERE uid = ? AND card_id = ?'),
  searchLog: db.prepare('INSERT INTO searches (q) VALUES (?)'),
  hot:       db.prepare('SELECT q, COUNT(*) AS cnt FROM searches GROUP BY q ORDER BY cnt DESC, MAX(created_at) DESC LIMIT 10'),
};
