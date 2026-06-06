const Database = require("better-sqlite3");
const path = require("path");
const config = require("./config");
const db = new Database(path.resolve(config.DB_PATH));
db.pragma("journal_mode = WAL");
module.exports = db;