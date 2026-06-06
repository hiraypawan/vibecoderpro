const express = require("express");
const config = require("./config");
const routes = require("./routes");
const app = express();
app.use(express.json());
app.use("/api", routes);
app.listen(config.PORT, () => console.log(`Server on :${config.PORT}`));