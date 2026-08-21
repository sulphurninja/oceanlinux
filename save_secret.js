
import mongoose from 'mongoose';
import Reseller from './src/models/resellerModel.js';
import fs from 'fs';

const MONGODB_URI = "mongodb+srv://aditya:adityaaditya@cluster0.u9yyv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function saveSecret() {
    try {
        await mongoose.connect(MONGODB_URI);
        const reseller = await Reseller.findOne({ businessName: "Backtick Labs" }).select('+apiSecret');
        if (reseller) {
            fs.writeFileSync('secret.txt', reseller.apiSecret);
            console.log("Secret saved to secret.txt");
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

saveSecret();
