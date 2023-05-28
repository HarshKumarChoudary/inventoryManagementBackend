const express = require('express');
const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const functions = require('firebase-functions');

const bodyParser = require('body-parser');
require('dotenv').config();

// Initialize the Express app
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Set up Firebase Admin SDK
const serviceAccount = {
  "type": process.env.FIREBASE_TYPE,
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": process.env.FIREBASE_AUTH_URI,
  "token_uri": process.env.FIREBASE_TOKEN_URI,
  "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.STORAGE_BUCKET
});

// Set up Firestore database
const db = admin.firestore();
const bucket = admin.storage().bucket();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Routes
app.get('/api/inventory', (req, res) => {
  // Fetch all inventory from Firestore
  db.collection('inventory')
    .get()
    .then((snapshot) => {
      const inventory = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      res.json(inventory);
    })
    .catch((error) => {
      console.error('Error getting inventory:', error);
      res.status(500).json({ error: 'Failed to fetch inventory' });
    });
});

app.get('/api/inventory/:id', (req, res) => {
  const inventoryId = req.params.id;

  // Fetch a specific inventory from Firestore
  db.collection('inventory')
    .doc(inventoryId)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        res.status(404).json({ error: 'inventory not found' });
      } else {
        res.json({ id: doc.id, ...doc.data() });
      }
    })
    .catch((error) => {
      console.error('Error getting inventory:', error);
      res.status(500).json({ error: 'Failed to fetch inventory' });
    });
});

app.post('/api/inventory', upload.single('image'), (req, res) => {

  const category = String(req.body.category);
  const code = String(req.body.code);
  const description = String(req.body.description);
  const inclusiveTax = req.body.inclusiveTax === 'true';
  const lowStock = Number(req.body.lowStock);
  const name = String(req.body.name);
  const openingStock = Number(req.body.openingStock);
  const price = Number(req.body.price);
  const taxRate = Number(req.body.taxRate);
  const unit = String(req.body.unit);
  const lowStockWarning = req.body.lowStockWarning === 'true';
  // Create a inventory in Firestore
  const inventoryData = {
    category,
    code,
    description,
    inclusiveTax,
    lowStock,
    name,
    openingStock,
    lowStockWarning,
    price,
    taxRate,
    unit
  };

  db.collection('inventory')
    .add(inventoryData)
    .then((docRef) => {
      if (req.file) {
        const imageFileName = `${docRef.id}${path.extname(req.file.originalname)}`;
        const file = bucket.file(imageFileName);

        const stream = file.createWriteStream({
          metadata: {
            contentType: req.file.mimetype
          }
        });

        stream.on('error', (error) => {
          console.error('Error uploading image:', error);
          res.status(500).json({ error: 'Failed to upload image' });
        });

        stream.on('finish', () => {
          file.getSignedUrl({ action: 'read', expires: '01-01-2030' }, (error, url) => {
            if (error) {
              console.error('Error getting download URL:', error);
              res.status(500).json({ error: 'Failed to get download URL' });
            } else {
              db.collection('inventory')
                .doc(docRef.id)
                .update({ image: url })
                .then(() => {
                  res.json({ id: docRef.id, image: url });
                })
                .catch((error) => {
                  console.error('Error updating inventory:', error);
                  res.status(500).json({ error: 'Failed to update inventory' });
                });
            }
          });
        });

        stream.end(req.file.buffer);
      } else {
        res.json({ id: docRef.id });
      }
    })
    .catch((error) => {
      console.error('Error creating inventory:', error);
      res.status(500).json({ error: 'Failed to create inventory' });
    });
});

app.put('/api/inventory/:id', (req, res) => {
  const inventoryId = req.params.id;
  const inventoryData = req.body;

  // Update a specific inventory in Firestore
  db.collection('inventory')
    .doc(inventoryId)
    .set(inventoryData, { merge: true })
    .then(() => {
      res.json({ message: 'inventory updated successfully' });
    })
    .catch((error) => {
      console.error('Error updating inventory:', error);
      res.status(500).json({ error: 'Failed to update inventory' });
    });
});


app.delete('/api/inventory', (req, res) => {
  const inventoryIds = req.body.ids;

  // Delete the specified inventory items from Firestore
  const deletePromises = inventoryIds.map((id) => {
    return db
      .collection('inventory')
      .doc(id)
      .delete();
  });

  Promise.all(deletePromises)
    .then(() => {
      res.json({ message: 'Inventory items deleted successfully' });
    })
    .catch((error) => {
      console.error('Error deleting inventory:', error);
      res.status(500).json({ error: 'Failed to delete inventory items' });
    });
});

// Start the server
const port = process.env.PORT || 3005;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

exports.api = functions.https.onRequest(app);