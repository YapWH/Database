const express = require('express');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const mongoose = require('mongoose');
const { exec } = require('child_process');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const path = require('path');

const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = 3000;
const mongoURI = 'mongodb://localhost:27017';
const dbName = 'exp';

let db;

// Connect to MongoDB
async function connectToDatabase() {
    const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    db = client.db(dbName);
}

// Serve static files
app.use(express.static('public'));

// Routessub
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'public.html'));
});

// Get list of files
app.get('/files', async (req, res) => {
    try {
        const files = await db.collection('fs.files').find().toArray();
        res.json(files);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Failed to retrieve file list');
    }
});

// Download file
app.get('/download/:id', async (req, res) => {
    try {
        const bucket = new GridFSBucket(db);
        const file = await db.collection('fs.files').findOne({ _id: new ObjectId(req.params.id) });

        if (!file) {
            return res.status(404).send('File not found');
        }

        const downloadStream = bucket.openDownloadStream(new ObjectId(req.params.id));
        
        // Set response headers
        res.setHeader('Content-disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Content-type', 'application/octet-stream');

        // Pipe file stream to response
        downloadStream.pipe(res);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Failed to download file');
    }
});

// Upload file
app.post('/upload', upload.single('dataset'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        const bucket = new GridFSBucket(db);
        const filename = req.file.originalname;
        const filepath = req.file.path;

        const uploadStream = bucket.openUploadStream(filename);
        const fileStream = fs.createReadStream(filepath);

        fileStream.pipe(uploadStream);

        uploadStream.on('error', () => {
            throw new Error('Failed to upload file');
        });

        uploadStream.on('finish', () => {
            fs.unlinkSync(filepath);
            res.sendStatus(200);
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Failed to upload dataset');
    }
});

// Delete file
app.delete('/delete/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const bucket = new GridFSBucket(db);

        // Find the file in the database
        const file = await db.collection('fs.files').findOne({ _id: new ObjectId(fileId) });
        if (!file) {
            return res.status(404).send('File not found');
        }

        // Delete the file from the database
        //await db.collection('fs.files').deleteOne({ _id: new ObjectId(fileId) });
        await bucket.delete(new ObjectId(fileId)); // Optionally delete from GridFS

        res.status(200).send('File deleted successfully');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Failed to delete file');
    }
});

// Start server
connectToDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        
        const command = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    
        exec(`${command} http://localhost:${PORT}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error opening browser: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Error opening browser: ${stderr}`);
                return;
            }
            console.log('Browser opened successfully');
        });
    });
});
