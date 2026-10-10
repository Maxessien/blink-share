import mongoose, { Mongoose } from "mongoose";

let conn: Mongoose | null = null;

export async function connectDb(uri: string) {
  if (conn) return conn;
  // mongoose.set("strictQuery", true);
  // conn = await mongoose.connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10_000 });
  // console.log("MongoDB connected");
  // return conn;
}
