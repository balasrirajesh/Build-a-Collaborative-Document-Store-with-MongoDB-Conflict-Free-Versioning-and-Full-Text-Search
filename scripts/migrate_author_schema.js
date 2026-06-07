require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/collaborative-wiki';
const DATABASE_NAME = process.env.DATABASE_NAME || 'collaborative-wiki';

async function migrate() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const documents = client.db(DATABASE_NAME).collection('documents');
    const query = { 'metadata.author': { $type: 'string' } };
    
    let batch = [];
    for await (const doc of documents.find(query)) {
      batch.push({
        updateOne: { filter: { _id: doc._id }, update: { $set: { 'metadata.author': { id: null, name: doc.metadata.author, email: null } } } }
      });
      if (batch.length === 1000) {
        await documents.bulkWrite(batch);
        batch = [];
      }
    }
    if (batch.length > 0) await documents.bulkWrite(batch);
    console.log('Migration completed');
  } finally {
    await client.close();
  }
}

migrate();
