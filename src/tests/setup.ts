import { beforeAll, afterAll, afterEach } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";
process.env.PORT = "5001";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/invoicegen-test";
process.env.JWT_ACCESS_SECRET =
  "a".repeat(64);
process.env.JWT_REFRESH_SECRET =
  "b".repeat(64);
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.CORS_ORIGINS = "http://localhost:5173";
process.env.ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.EMAIL_FROM = "test@invoicegen.local";
process.env.UPLOAD_DIR = "uploads";
process.env.MAX_UPLOAD_BYTES = "2097152";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const uri = replSet.getUri("invoicegen-test");
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
}, 120_000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});
