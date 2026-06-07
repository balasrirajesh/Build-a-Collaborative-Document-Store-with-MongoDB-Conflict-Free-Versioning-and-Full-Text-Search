require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const { seedDatabase } = require('./seed');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/collaborative-wiki';
const DATABASE_NAME = process.env.DATABASE_NAME || 'collaborative-wiki';

let db, documents;

async function startServer() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DATABASE_NAME);
  documents = db.collection('documents');
  await seedDatabase(db);
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Helpers
const generateSlug = title => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now();

// POST /api/documents
app.post('/api/documents', async (req, res) => {
  const { title, content, tags, authorName, authorEmail } = req.body;
  const slug = generateSlug(title);
  const newDoc = {
    slug, title, content, version: 1, tags: tags || [],
    metadata: { author: { id: `user-${Date.now()}`, name: authorName, email: authorEmail }, createdAt: new Date(), updatedAt: new Date(), wordCount: content.split(/\s+/).length },
    revision_history: []
  };
  await documents.insertOne(newDoc);
  res.status(201).json(await documents.findOne({ slug }));
});

// GET /api/documents/:slug
app.get('/api/documents/:slug', async (req, res) => {
  const doc = await documents.findOne({ slug: req.params.slug });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.metadata && typeof doc.metadata.author === 'string') {
    doc.metadata.author = { id: null, name: doc.metadata.author, email: null };
    // Persist lazy migration without blocking
    documents.updateOne(
      { _id: doc._id },
      { $set: { 'metadata.author': doc.metadata.author } }
    ).catch(console.error);
  }
  res.status(200).json(doc);
});

// DELETE /api/documents/:slug
app.delete('/api/documents/:slug', async (req, res) => {
  const result = await documents.deleteOne({ slug: req.params.slug });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// PUT /api/documents/:slug
app.put('/api/documents/:slug', async (req, res) => {
  const { title, content, version } = req.body;
  const updateResult = await documents.findOneAndUpdate(
    { slug: req.params.slug, version },
    {
      $set: { title, content, 'metadata.updatedAt': new Date() },
      $inc: { version: 1 },
      $push: { revision_history: { $each: [{ version: version + 1, updatedAt: new Date(), authorId: 'system', contentDiff: 'Content updated' }], $slice: -20 } }
    },
    { returnDocument: 'after' }
  );
  if (updateResult) return res.status(200).json(updateResult);
  const currentDoc = await documents.findOne({ slug: req.params.slug });
  if (!currentDoc) return res.status(404).json({ error: 'Not found' });
  return res.status(409).json(currentDoc);
});

// GET /api/search
app.get('/api/search', async (req, res) => {
  const { q, tags } = req.query;
  const query = { $text: { $search: q } };
  if (tags) query.tags = { $all: tags.split(',') };
  const results = await documents.find(query, { projection: { score: { $meta: 'textScore' } } }).sort({ score: { $meta: 'textScore' } }).toArray();
  res.status(200).json(results);
});

// GET /api/analytics/most-edited
app.get('/api/analytics/most-edited', async (req, res) => {
  const results = await documents.aggregate([
    { $project: { title: 1, slug: 1, editCount: { $size: "$revision_history" } } },
    { $sort: { editCount: -1 } },
    { $limit: 10 }
  ]).toArray();
  res.status(200).json(results);
});

// GET /api/analytics/tag-cooccurrence
app.get('/api/analytics/tag-cooccurrence', async (req, res) => {
  const results = await documents.aggregate([
    { $match: { tags: { $exists: true, $not: { $size: 0 } } } },
    { $project: { _id: 1, tags1: "$tags", tags2: "$tags" } },
    { $unwind: "$tags1" }, { $unwind: "$tags2" },
    { $match: { $expr: { $lt: ["$tags1", "$tags2"] } } },
    { $group: { _id: { tag1: "$tags1", tag2: "$tags2" }, count: { $sum: 1 } } },
    { $project: { _id: 0, tags: ["$_id.tag1", "$_id.tag2"], count: 1 } },
    { $sort: { count: -1 } }
  ]).toArray();
  res.status(200).json(results);
});

startServer();
