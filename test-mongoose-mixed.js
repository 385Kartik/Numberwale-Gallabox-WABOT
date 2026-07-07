import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const schema = new Schema({ filters: { type: Schema.Types.Mixed } });
const Model = mongoose.models.Test || mongoose.model('Test', schema);

async function test() {
  const doc = new Model({ filters: { category: "counting-numbers" } });
  const activeFilters = doc.filters;
  const extracted = { category: "mirror-numbers" };
  const merged = { ...activeFilters, ...extracted };
  console.log("Merged keys:", Object.keys(merged));
  console.log("Merged stringified:", JSON.stringify(merged));
  process.exit();
}
test();
