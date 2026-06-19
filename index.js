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

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

const database = client.db("BiblioDrop");
const booksCollection = database.collection("books");
const orderCollection = database.collection("orders");
const wishlistCollection = database.collection("wishlist");
const usersCollection = database.collection("user");


app.get("/api/users", async (req, res) => {
  const result = await usersCollection.find().toArray();
  res.send(result);
});

app.get('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const result = await usersCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
})

// ==================== BOOKS API ====================

app.get('/api/books', async (req, res) => {
  const result = await booksCollection.find().toArray();
  res.send(result);
});

app.post('/api/books', async (req, res) => {
  const book = req.body;
  const newBook = { ...book, date: new Date() };
  const result = await booksCollection.insertOne(newBook);
  res.send(result);
});

// ✅ specific route আগে
app.get('/api/books/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await booksCollection.find({ userId }).toArray();
  res.send(result);
});

// ✅ generic route পরে
app.get('/api/books/:id', async (req, res) => {
  const { id } = req.params;
  const result = await booksCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});


// ==================== UPDATE BOOK STATUS API ====================
// নির্দিষ্ট বইয়ের স্ট্যাটাস আপডেট করার রুট (যেমন: published -> unpublished / archived)
app.patch('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body }; // ফ্রন্টএন্ড থেকে আসা সব ডাটা কপি করা হলো

    // ১. সেফটি গার্ড: ফ্রন্টএন্ড থেকে যদি ভুল করে _id পাঠানো হয়, তা ডিলিট করে দেওয়া
    // কারণ MongoDB তে সরাসরি _id আপডেট করতে গেলে এরর মারবে।
    delete updateData._id;

    // ২. চেক করা হচ্ছে বডিতে আসলেই কোনো ডাটা পাঠানো হয়েছে কিনা
    if (Object.keys(updateData).length === 0) {
      return res.status(400).send({ 
        success: false, 
        message: "আপডেট করার জন্য কোনো তথ্য প্রদান করা হয়নি।" 
      });
    }

    const filter = { _id: new ObjectId(id) };
    
    // ৩. ডাইনামিক আপডেট ডকুমেন্ট (বডিতে যা আসবে, শুধু সেটুকুই ডাটাবেজে আপডেট হবে)
    const updateDoc = {
      $set: updateData 
    };

    const result = await booksCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res.status(404).send({ 
        success: false, 
        message: "এই আইডি দিয়ে কোনো বই পাওয়া যায়নি।" 
      });
    }

    res.send({ 
      success: true, 
      message: "বইয়ের তথ্য সফলভাবে ডাটাবেজে আপডেট করা হয়েছে।",
      result 
    });

  } catch (error) {
    console.error("Dynamic Update Book Error:", error.message);
    res.status(500).send({ success: false, error: error.message });
  }
});


// ==================== ORDERS API ====================

app.get('/api/orders', async (req, res) => {
  const result = await orderCollection.find().toArray();
  res.send(result);
});

app.post('/api/orders', async (req, res) => {
  const order = req.body;
  const newOrder = { ...order, date: new Date() };
  const result = await orderCollection.insertOne(newOrder);
  res.send(result);
});

// ✅ specific route আগে — aggregation with book details
app.get('/api/orders/user/:authorId', async (req, res) => {
  try {
    const { authorId } = req.params;

    // ১. প্রথমে চেক করা এই authorId ওয়ালা কোনো অর্ডার আছে কি না
    const simpleResult = await orderCollection.find({ authorId: authorId }).toArray();
    console.log("Simple orders found for this author:", simpleResult.length);

    if (simpleResult.length === 0) return res.send([]);

    // ২. মেইন পাইপলাইন
    const pipeline = [
      // স্টেপ ১: নির্দিষ্ট লাইব্রেরিয়ান/অথরের অর্ডার ফিল্টার
      { 
        $match: { authorId: authorId } 
      },

      // স্টেপ ২: authorId দিয়ে user কালেকশন থেকে লাইব্রেরিয়ানের ডিটেইলস আনা
      {
        $lookup: {
          from: "user", 
          let: { orderAuthorId: "$authorId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", { $toObjectId: "$$orderAuthorId" }] }
              }
            }
          ],
          as: "authorDetails"
        }
      },
      { $unwind: { path: "$authorDetails", preserveNullAndEmptyArrays: true } },

      // স্টেপ ৩: userId দিয়ে user কালেকশন থেকে কাস্টমারের ডিটেইলস আনা
      {
        $lookup: {
          from: "user", 
          let: { orderUserId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", { $toObjectId: "$$orderUserId" }] }
              }
            }
          ],
          as: "customerDetails"
        }
      },
      { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },

      // স্টেপ ৪: BookId দিয়ে books কালেকশন থেকে বইয়ের ডিটেইলস আনা
      {
        $lookup: {
          from: "books",
          let: { orderBookId: "$BookId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", { $toObjectId: "$$orderBookId" }] }
              }
            }
          ],
          as: "bookDetails"
        }
      },
      { $unwind: { path: "$bookDetails", preserveNullAndEmptyArrays: true } },

      // স্টেপ ৫: সরাসরি 'date' ফিল্ড ধরে নিখুঁতভাবে সর্ট করা (যেহেতু এটি প্রোপার ডেট ফরম্যাট)
      { 
        $sort: { date: -1 } 
      }
    ];

    const result = await orderCollection.aggregate(pipeline).toArray();
    console.log("Aggregated orders successfully combined:", result.length);
    
    res.send(result);

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// ✅ generic route পরে
app.get('/api/orders/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await orderCollection.find({ userId }).toArray();
  res.send(result);
});



// ==================== UPDATE ORDER STATUS API ====================
// নির্দিষ্ট অর্ডারের স্ট্যাটাস আপডেট করার রুট (যেমন: pending -> dispatched -> delivered)
app.patch('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // ফ্রন্টএন্ড থেকে নতুন স্ট্যাটাস পাঠানো হবে (যেমন: { status: "dispatched" })

    // ১. স্ট্যাটাস বডিতে পাঠানো হয়েছে কিনা চেক করা
    if (!status) {
      return res.status(400).send({ success: false, message: "স্ট্যাটাস প্রদান করা হয়নি।" });
    }

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: {
        status: status // নতুন স্ট্যাটাস আপডেট হবে
      },
    };

    const result = await orderCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "এই আইডি দিয়ে কোনো অর্ডার পাওয়া যায়নি।" });
    }

    res.send({ 
      success: true, 
      message: `অর্ডারের স্ট্যাটাস সফলভাবে '${status}' এ আপডেট করা হয়েছে।`,
      result 
    });

  } catch (error) {
    console.error("Update Status Error:", error.message);
    res.status(500).send({ success: false, error: error.message });
  }
});


// ==================== WISHLIST API ====================

app.get('/api/wishlist', async (req, res) => {
  const result = await wishlistCollection.find().toArray();
  res.send(result);
});

app.get('/api/wishlist/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await wishlistCollection.find({ userId }).toArray();
  res.send(result);
});

app.post('/api/wishlist', async (req, res) => {
  const wishlist = req.body;
  const newWishlist = { ...wishlist, date: new Date() };
  const result = await wishlistCollection.insertOne(newWishlist);
  res.send(result);
});



// ==================== LIBRARIAN DASHBOARD STATS API (100% DYNAMIC & FILTERED) ====================
app.get('/api/librarian/stats/:authorId', async (req, res) => {
  try {
    const { authorId } = req.params;

    // ১. লাইব্রেরিয়ানের মোট লিস্টিং করা বইয়ের সংখ্যা
    const totalBooks = await booksCollection.countDocuments({ userId: authorId });

    // ২. লাইব্রেরিয়ানের সব অর্ডার নিয়ে আসা
    const orders = await orderCollection.find({ authorId: authorId }).toArray();

    // ৩. টোটাল আর্নিং হিসাব (শুধুমাত্র যেগুলো pending না)
    const totalEarnings = orders
      .filter(o => o.status !== 'pending')
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0);

    // ৪. একটিভ পেন্ডিং রিকোয়েস্ট কাউন্ট
    const pendingRequests = orders.filter(o => o.status === 'pending').length;

    // ==================== ৫. ১০০% ডাইনামিক ও ফিল্টার করা চার্ট ডাটা പ്രസെസിങ് ====================
    // ১২ মাসের ডিফল্ট ম্যাপ স্ট্রাকচার
    const monthlyDataMap = {
      'Jan': { name: 'Jan', earnings: 0, requests: 0 },
      'Feb': { name: 'Feb', earnings: 0, requests: 0 },
      'Mar': { name: 'Mar', earnings: 0, requests: 0 },
      'Apr': { name: 'Apr', earnings: 0, requests: 0 },
      'May': { name: 'May', earnings: 0, requests: 0 },
      'Jun': { name: 'Jun', earnings: 0, requests: 0 },
      'Jul': { name: 'Jul', earnings: 0, requests: 0 },
      'Aug': { name: 'Aug', earnings: 0, requests: 0 },
      'Sep': { name: 'Sep', earnings: 0, requests: 0 },
      'Oct': { name: 'Oct', earnings: 0, requests: 0 },
      'Nov': { name: 'Nov', earnings: 0, requests: 0 },
      'Dec': { name: 'Dec', earnings: 0, requests: 0 }
    };

    // orders অ্যারে লুপ চালিয়ে মাস অনুযায়ী ডাটা সাজানো
    orders.forEach(order => {
      if (order.date) {
        const orderDate = new Date(order.date);
        // ডেট থেকে ৩ অক্ষরের মাসের নাম বের করা (যেমন: 'Jun', 'Jul')
        const monthName = orderDate.toLocaleString('en-US', { month: 'short' }); 

        if (monthlyDataMap[monthName]) {
          // রিকোয়েস্ট সংখ্যা ১ বাড়ানো
          monthlyDataMap[monthName].requests += 1;

          // অর্ডারটি পেন্ডিং না হলে আর্নিংয়ে যোগ করা
          if (order.status !== 'pending') {
            monthlyDataMap[monthName].earnings += (Number(order.price) || 0);
          }
        }
      }
    });

    // অবজেক্ট ম্যাপকে অ্যারে-তে রূপান্তর করা
    const allMonthsTrends = Object.values(monthlyDataMap);

    // ✅ ট্রিক: শুধুমাত্র ডাটা (Earnings > 0 অথবা Requests > 0) আছে এমন মাসগুলো ফিল্টার করা
    const activeMonthsTrends = allMonthsTrends.filter(month => month.earnings > 0 || month.requests > 0);

    // সেফটি চেক: যদি একদম নতুন অ্যাকাউন্ট হয় এবং কোনো অর্ডারই না থাকে, 
    // তাহলে চার্ট যেন পুরোপুরি ব্লাঙ্ক না থাকে, তাই কারেন্ট মাসটি ডিফল্ট হিসেবে পুশ করা।
    if (activeMonthsTrends.length === 0) {
      const currentMonth = new Date().toLocaleString('en-US', { month: 'short' });
      activeMonthsTrends.push(monthlyDataMap[currentMonth]);
    }

    // ==================== ৬. টপ রিকোয়েস্টেড বই ডাইনামিক করা ====================
    // কোন BookId কতবার অর্ডার হয়েছে তা কাউন্ট করা
    const bookCountMap = {};
    orders.forEach(order => {
      if (order.BookId) {
        bookCountMap[order.BookId] = (bookCountMap[order.BookId] || 0) + 1;
      }
    });

    // সবচেয়ে বেশি রিকোয়েস্ট হওয়া শীর্ষ ৩টি বইয়ের আইডি আলাদা করা
    const topBookIds = Object.keys(bookCountMap)
      .sort((a, b) => bookCountMap[b] - bookCountMap[a])
      .slice(0, 3);

    // ওই আইডিগুলো দিয়ে books কালেকশন থেকে বইয়ের ডিটেইলস নিয়ে আসা
    const topBooksData = await booksCollection.find({
      _id: { $in: topBookIds.map(id => new ObjectId(id)) }
    }).toArray();

    // Recharts বা UI এর ফরম্যাট অনুযায়ী সাজানো
    const topRequestedBooks = topBooksData.map(book => ({
      id: book._id,
      title: book.title,
      author: book.author,
      image: book.image,
      price: Number(book.price) || 0,
      requests: bookCountMap[book._id.toString()] || 0
    })).sort((a, b) => b.requests - a.requests); // বেশি রিকোয়েস্টের ক্রমানুসারে সর্টিং


    // চূড়ান্ত রেসপন্স পাঠানো
    res.send({
      success: true,
      stats: { 
        totalBooks, 
        totalEarnings, 
        pendingRequests 
      },
      earningTrends: activeMonthsTrends, // ফিল্টার করা ডাটা
      topRequestedBooks
    });

  } catch (error) {
    console.error("Dashboard Dynamic Stats Error:", error.message);
    res.status(500).send({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});