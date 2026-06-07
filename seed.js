const { MongoClient } = require('mongodb');

async function seedDatabase(db) {
  const collection = db.collection('documents');
  const count = await collection.countDocuments();
  if (count > 0) return;

  await collection.createIndex({ slug: 1 }, { unique: true });
  await collection.createIndex({ title: "text", content: "text" });

  const batchSize = 1000;
  let batch = [];

  for (let i = 1; i <= 10000; i++) {
    const isOldSchema = i % 10 === 0;
    const doc = {
      slug: `document-${i}`,
      title: `Sample Document ${i}`,
      content: `Content for document ${i} with words like mongo, database, guide.`,
      version: 1,
      tags: i % 2 === 0 ? ['mongodb', 'guide'] : ['api-design', 'guide'],
      metadata: { createdAt: new Date(), updatedAt: new Date(), wordCount: 50 },
      revision_history: []
    };

    if (isOldSchema) doc.metadata.author = `Author Name ${i}`;
    else doc.metadata.author = { id: `user-${i}`, name: `Author Name ${i}`, email: `author${i}@example.com` };

    batch.push(doc);
    if (batch.length === batchSize) {
      await collection.insertMany(batch);
      batch = [];
    }
  }
}

module.exports = { seedDatabase };
