
import mongoose from 'mongoose';
import Reseller from './src/models/resellerModel.js';

const MONGODB_URI = "mongodb+srv://aditya:adityaaditya@cluster0.u9yyv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function recharge() {
    try {
        await mongoose.connect(MONGODB_URI);
        const reseller = await Reseller.findOne({ businessName: "Backtick Labs" });
        if (reseller) {
            reseller.wallet.balance += 5000;
            await reseller.save();
            console.log("Recharged 5000. New Balance: " + reseller.wallet.balance);
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

recharge();
