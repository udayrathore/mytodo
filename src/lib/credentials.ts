import { z } from "zod";
export const credential = z.string().min(4).max(256);
export const newCredential = z
  .string()
  .min(14, "Use at least 14 characters.")
  .max(256);
