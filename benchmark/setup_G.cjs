const fs = require('fs');
const path = require('path');
const dir = path.resolve('D:\\#AlphaAgent\\auth-project');
fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(path.join(dir, 'config.js'), `
module.exports = {
  PORT: 3000,
  DB_PATH: "./data.sqlite"
};
`.trim());

fs.writeFileSync(path.join(dir, 'db.js'), `
const Database = require("better-sqlite3");
const path = require("path");
const config = require("./config");
const db = new Database(path.resolve(config.DB_PATH));
db.pragma("journal_mode = WAL");
module.exports = db;
`.trim());

fs.writeFileSync(path.join(dir, 'routes.js'), `
const express = require("express");
const router = express.Router();
router.get("/items", (req, res) => {
  res.json({ items: [] });
});
module.exports = router;
`.trim());

fs.writeFileSync(path.join(dir, 'server.js'), `
const express = require("express");
const config = require("./config");
const routes = require("./routes");
const app = express();
app.use(express.json());
app.use("/api", routes);
app.listen(config.PORT, () => console.log(\`Server on :\${config.PORT}\`));
`.trim());

console.log('Created auth-project with 4 starter files');
