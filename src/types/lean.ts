/**
 * The Mongoose models in this project are plain JavaScript, so TypeScript sees
 * them as `Model<any>`. That makes `.lean()` resolve to an ambiguous
 * `doc | doc[]` union, and every field access on the result fails.
 *
 * Passing this as an explicit type param — `.lean<LeanDoc>()` — pins the result
 * to a single document so field access works. It is deliberately loose: the
 * schemas are untyped, so a stricter type here would be a lie.
 */
export interface LeanDoc {
  _id: any;
  [key: string]: any;
}
