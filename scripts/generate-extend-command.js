const fs = require('fs');
const ips = fs.readFileSync('scripts/extend-orders-expiry-ips.txt', 'utf8')
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean);
const arr = ips.map(ip => JSON.stringify(ip)).join(', ');
const cmd = `db.orders.updateMany(
  { ipAddress: { $in: [ ${arr} ] } },
  [
    { $set: {
      expiryDate: {
        $cond: [
          { $and: [ { $ne: ["$expiryDate", null] }, { $gte: ["$expiryDate", "$$NOW"] } ] },
          { $dateAdd: { startDate: "$expiryDate", unit: "day", amount: 10 } },
          { $dateAdd: { startDate: "$$NOW", unit: "day", amount: 10 } }
        ]
      },
      status: {
        $cond: [
          { $or: [ { $lt: ["$expiryDate", "$$NOW"] }, { $eq: ["$expiryDate", null] } ] },
          "active",
          "$status"
        ]
      }
    }}
  ]
);`;
fs.writeFileSync('scripts/extend-orders-expiry-command.js', cmd, 'utf8');
console.log('Written to scripts/extend-orders-expiry-command.js');
console.log('Total IPs:', ips.length);
