
import mongoose from 'mongoose';
import Reseller from './src/models/resellerModel.js';

const MONGODB_URI = "mongodb+srv://aditya:adityaaditya@cluster0.u9yyv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const MY_SECRET = "sec_46e0b712a8c81ba29a601103bfb7228720c6d77f2ad3c362d8aa72b1b6690b195";

async function verify() {
    try {
        await mongoose.connect(MONGODB_URI);

        // Find the reseller we created (Backtick Labs) or the latest one
        const reseller = await Reseller.findOne({ businessName: "Backtick Labs" }).select('+apiSecret');

        if (reseller) {
            console.log(`DB Secret Length: ${reseller.apiSecret.length}`);
            console.log(`My Secret Length: ${MY_SECRET.length}`);

            if (reseller.apiSecret === MY_SECRET) {
                console.log("MATCH! The secret is correct.");
            } else {
                console.log("MISMATCH!");
                // Find difference
                console.log(`DB: ${reseller.apiSecret}`);
                console.log(`MY: ${MY_SECRET}`);
            }
        } else {
            console.log("Reseller not found");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

verify();
