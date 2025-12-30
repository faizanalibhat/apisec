import 'dotenv/config';
import mongoose from 'mongoose';

const run = async () => {
    try {
        const uri = process.env.APISEC_MONGODB_URL;
        if (!uri) {
            console.error('APISEC_MONGODB_URL is not defined in environment variables.');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);
        console.log('Connected.');

        const collection = mongoose.connection.collection('raw_environments');

        // List indexes to see what we have
        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes.map(i => i.name));

        const indexName = 'postmanEnvironmentId_1_orgId_1';
        const indexExists = indexes.find(i => i.name === indexName);

        if (indexExists) {
            console.log(`Found index '${indexName}'. Dropping it...`);
            await collection.dropIndex(indexName);
            console.log('Index dropped successfully.');
        } else {
            console.log(`Index '${indexName}' not found. It might have consistently named differently or already been dropped.`);
        }

        console.log('Done.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

run();
