import mongoose from 'mongoose';

const uri = process.env.APISEC_MONGODB_URL;

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(uri, {
            // Modern Mongoose doesn't need useNewUrlParser, useUnifiedTopology etc.
        });
    } catch (error) {
        if (error.name === 'MongooseServerSelectionError') {
            console.error("Database connection failed: IP not registered");
        } else if (error.code === 'ECONNREFUSED') {
            console.error("Database connection failed: The connection was refused by the server. Ensure that the MongoDB server is running and accessible.");
        } else if (error.code === 'EREFUSED') {
            console.error("Database connection failed: The DNS query was refused. This is likely due to DNS server issues or misconfiguration.");
        } else {
            console.error("Database connection failed:", error);
        }
        process.exit(1); // Exit the process if unable to connect
    }
};

// Will keep listening to the events and throw error if any during the entire connection process
mongoose.connection.on('error', err => {
    console.error('Mongoose connection error:', err);
});

// Check only once if the connection is "open"
mongoose.connection.once('open', () => {
    console.log('Connected to MongoDB successfully!');
});

// Initiate connection
connectDB();

export default mongoose;