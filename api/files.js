// api/files.js - Vercel Serverless Function
import { MongoClient } from 'mongodb';

// MongoDB connection (you can also use other databases like PlanetScale, Supabase)
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'codevault';
const COLLECTION_NAME = 'files';

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }

  if (!MONGODB_URI) {
    throw new Error('Please define MONGODB_URI environment variable');
  }

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    cachedClient = client;
    return client;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

async function getCollection() {
  const client = await connectToDatabase();
  return client.db(DB_NAME).collection(COLLECTION_NAME);
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const collection = await getCollection();

    switch (req.method) {
      case 'GET':
        // Get all files
        const files = await collection.find({}).sort({ createdAt: -1 }).toArray();
        res.status(200).json({ success: true, files });
        break;

      case 'POST':
        // Save new file
        const fileData = req.body;
        
        if (!fileData.id || !fileData.name || !fileData.content) {
          res.status(400).json({ success: false, error: 'Missing required fields' });
          return;
        }

        // Add server timestamps
        fileData.createdAt = new Date();
        fileData.updatedAt = new Date();

        // Check if file already exists
        const existingFile = await collection.findOne({ id: fileData.id });
        
        if (existingFile) {
          // Update existing file
          fileData.createdAt = existingFile.createdAt; // Keep original creation date
          await collection.replaceOne({ id: fileData.id }, fileData);
        } else {
          // Insert new file
          await collection.insertOne(fileData);
        }

        res.status(200).json({ success: true, file: fileData });
        break;

      case 'DELETE':
        const { id, action } = req.query;

        if (action === 'clear') {
          // Clear all files
          await collection.deleteMany({});
          res.status(200).json({ success: true, message: 'All files cleared' });
        } else if (id) {
          // Delete specific file
          const result = await collection.deleteOne({ id });
          
          if (result.deletedCount === 0) {
            res.status(404).json({ success: false, error: 'File not found' });
          } else {
            res.status(200).json({ success: true, message: 'File deleted' });
          }
        } else {
          res.status(400).json({ success: false, error: 'Missing file ID or action' });
        }
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
