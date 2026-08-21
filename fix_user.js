
import mongoose from 'mongoose';
import User from './src/models/userModel.js';
import Reseller from './src/models/resellerModel.js';

const MONGODB_URI = "mongodb+srv://aditya:adityaaditya@cluster0.u9yyv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function fixResellerUser() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to DB");

        const email = "umeshsolanki7020@gmail.com";

        const user = await User.findOne({ email });
        const reseller = await Reseller.findOne({ email });

        if (!user || !reseller) {
            console.log("User or Reseller not found");
            return;
        }

        console.log(`Found User: ${user.name} (${user._id})`);
        console.log(`Found Reseller: ${reseller.businessName} (${reseller._id})`);

        // Check current state
        console.log(`Current UserType: ${user.userType}`);
        console.log(`Current ResellerId: ${user.resellerId}`);

        // Update
        // We use updateOne since the model instance 'user' might be bound to an old schema if we were in the app, 
        // but here we are clean. However, to be safe and forceful:
        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    userType: 'reseller',
                    resellerId: reseller._id
                }
            }
        );

        console.log("Update command sent.");

        // Verify
        const updatedUser = await User.findOne({ email }).lean();
        console.log(`New UserType: ${updatedUser.userType}`);
        console.log(`New ResellerId: ${updatedUser.resellerId}`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

fixResellerUser();
