import express from "express";
import request from "supertest";
import { describe, it } from "vitest";
import { requireOperator } from "../src/http/auth";
import { OPERATOR_AUTH, TEST_OPERATOR_TOKEN } from "./helpers";

function appWith(token: string | undefined) {
  const app = express();
  app.get("/secret", requireOperator(token), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("requireOperator", () => {
  it("rejects a request without an Authorization header", async () => {
    await request(appWith(TEST_OPERATOR_TOKEN))
      .get("/secret")
      .expect(401, { error: "unauthorized" });
  });

  it("rejects a wrong token", async () => {
    await request(appWith(TEST_OPERATOR_TOKEN))
      .get("/secret")
      .set("Authorization", "Bearer wrong")
      .expect(401);
  });

  it("rejects the right token without the Bearer scheme", async () => {
    await request(appWith(TEST_OPERATOR_TOKEN))
      .get("/secret")
      .set("Authorization", TEST_OPERATOR_TOKEN)
      .expect(401);
  });

  it("accepts the right token", async () => {
    await request(appWith(TEST_OPERATOR_TOKEN))
      .get("/secret")
      .set("Authorization", OPERATOR_AUTH)
      .expect(200, { ok: true });
  });

  it("fails closed when no operator token is configured", async () => {
    await request(appWith("")).get("/secret").set("Authorization", "Bearer ").expect(401);
    await request(appWith(undefined)).get("/secret").set("Authorization", "Bearer ").expect(401);
    await request(appWith(undefined))
      .get("/secret")
      .set("Authorization", "Bearer undefined")
      .expect(401);
  });
});
