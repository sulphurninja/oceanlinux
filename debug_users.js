
import mongoose from 'mongoose';
import User from './src/models/userModel.js';

const MONGODB_URI = "mongodb+srv://aditya:adityaaditya@cluster0.u9yyv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function checkLatestUsers() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to DB");

        // Sort by _id descending which includes timestamp
        const users = await User.find().sort({ _id: -1 }).limit(5).lean();

        console.log("Latest 5 Users:");
        users.forEach(u => {
            console.log(`- ID: ${u._id}`);
            console.log(`  Name: ${u.name}`);
            console.log(`  Email: ${u.email}`);
            console.log(`  Type: ${u.userType}`);
            console.log(`  ResellerId: ${u.resellerId}`);
            console.log(`  Created: ${u.createdAt}`);
            console.log('---');
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkLatestUsers();
