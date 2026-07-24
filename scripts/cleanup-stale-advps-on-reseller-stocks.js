require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const TARGET_IDS = ['68dacfe58070faa4d34c219e', '69cd7bcd76d57fddb2e40c02'];

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const col = mongoose.connection.db.collection('ipstocks');

  for (const id of TARGET_IDS) {
    const res = await col.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $unset: { 'defaultConfigurations.advps': '' } },
    );
    const after = await col.findOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { projection: { name: 1, 'defaultConfigurations.advps': 1, 'defaultConfigurations.resellerApi.zoneName': 1 } },
    );
    console.log({
      id,
      modified: res.modifiedCount,
      name: after?.name,
      advpsLeft: !!after?.defaultConfigurations?.advps,
      zone: after?.defaultConfigurations?.resellerApi?.zoneName,
    });
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
