const express = require('express');
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
require('dotenv').config();

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.DB_URI;

app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
  res.send('Hello World!');
});


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


const database = client.db("BiblioDrop");
const booksCollection = database.collection("books");
const orderCollection = database.collection("orders");
const wishlistCollection = database.collection("wishlist");



// api Books
app.get('/api/books', async (req, res) => {
  const result = await booksCollection.find().toArray();
  res.send(result);
})


app.get('/api/books/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) }
  const result = await booksCollection.findOne(query);
  res.send(result);
})



// api Orders

app.get('/api/orders', async (req, res) => {
  const result = await orderCollection.find().toArray();
  res.send(result);
});


app.get('/api/orders/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await orderCollection.find({ userId }).toArray();
  res.send(result);
});

app.post('/api/orders', async (req, res) => {
  const order = req.body;
  const newOrder = {
    ...order,
    date: new Date()
  }
  const result = await orderCollection.insertOne(newOrder);
  res.send(result);
});


// api Wishlist
app.get('/api/wishlist', async (req, res) => {
  const result = await wishlistCollection.find().toArray();
  res.send(result);
})

app.get('/api/wishlist/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await wishlistCollection.find({ userId }).toArray();
  res.send(result);
  
});


app.post('/api/wishlist', async (req, res) => {
  const wishlist = req.body;
  const newWishlist = {
    ...wishlist,
    date: new Date()
  }
  const result = await wishlistCollection.insertOne(newWishlist);
  res.send(result);
});




app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});