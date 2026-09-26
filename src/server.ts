import express from "express";

import { config } from "./config.ts";

const app = express();

app.disable("x-powered-by");

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
