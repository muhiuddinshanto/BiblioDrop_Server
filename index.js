const express = require('express');
const app = express();
const cors = require("cors");

// ✅ ১. dotenv কনফিগারেশন সবার উপরে (Stripe বা Database ভ্যারিয়েবল রিড করার আগে)
require('dotenv').config();

// ✅ ২. ডটএনভ লোড হওয়ার পর প্রোপারলি Stripe ইনিশিয়েট করা হলো
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// ✅ ৩. আপনার .env ফাইলের নাম অনুযায়ী MONGODB_URI ফিক্স করা হলো
const uri = process.env.DB_URI;

app.use(cors());

// ==================== STRIPE WEBHOOK ROUTE ====================
// ⚠️ CRITICAL: এটি অবশ্যই express.json() মিডলওয়্যারের উপরে থাকবে।
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log("❌ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log("💰 PAYMENT SUCCESS, processing order...");

    try {
      if (!session.metadata) throw new Error("Missing metadata");

      // ✅ আপনার চাওয়া অবিকল মঙ্গোডিবি ডকুমেন্ট ফরম্যাট
      const orderData = {
        BookId: session.metadata.bookid,
        title: session.metadata.title,
        author: session.metadata.author,
        category: session.metadata.category,
        price: parseFloat(session.metadata.price || 0),
        image: session.metadata.image,
        userId: session.metadata.userid,
        PaymentStatus: "completed",
        authorId: session.metadata.authorid,
        date: new Date(),
      };

      const result = await orderCollection.insertOne(orderData);
      console.log("🎉 Order saved to MongoDB successfully! ID:", result.insertedId);

    } catch (error) {
      console.error("❌ Database Insert Error:", error);
      return res.status(500).send("Internal Server Error");
    }
  }

  res.json({ received: true });
});
// ==============================================================
// ==================== STRIPE CHECKOUT ====================

//////////////////////////////////////////////////////////////////
// ✅ Webhook এর নিচে express.json() বসানো হলো যেন অন্য রাউটগুলো বডি রিড করতে পারে
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



// verify Releted Token

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access you' });
  }
  const query = {
    token: token
  }
  const result = await sessionsCollection.findOne(query);
  if (!result) {
    return res.status(401).send({ message: "Invalid session" });
  }
  const userId = result.userId;
  let userQuery;
  try {
    userQuery = { _id: new ObjectId(userId) };
  } catch (e) {
    userQuery = { _id: userId };
  }
  const user = await usersCollection.findOne(userQuery);
  if (!user) {
    return res.status(401).send({ message: "Invalid session" });
  }

  // setData in The object
  req.user = user;

  next();
  console.log(req.headers);
}

const librarianVerify = async (req, res, next) => {
  if (req.user.role !== "librarian") {
    return res.status(403).send({ message: 'Forbidden access' });
  }
  next();
}

const adminVerify = async (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).send({ message: 'Forbidden access' });
  }
  next();
}

const userVerify = async (req, res, next) => {
  if (req.user.role !== "user") {
    return res.status(403).send({ message: 'Forbidden access' });
  }
  next();
}



// গ্লোবাল কালেকশন ভেরিয়েবল
const database = client.db("BiblioDrop");
const booksCollection = database.collection("books");
const orderCollection = database.collection("orders");
const wishlistCollection = database.collection("wishlist");
const usersCollection = database.collection("user");
const sessionsCollection = database.collection("session");
const reviewsCollection = database.collection("reviews");

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}
run().catch(console.dir);








//////////////////////////////////////
app.post('/api/create-checkout-session', verifyToken, async (req, res) => {
  try {
    const { bookId, totalPrice } = req.body;

    // বইয়ের details DB থেকে নিয়ে আসা
    const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
    if (!book) return res.status(404).send({ message: "Book not found" });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: book.title,
              images: [book.image],
            },
            unit_amount: Math.round(totalPrice * 100), // cents এ convert
          },
          quantity: 1,
        },
      ],
      // ✅ Webhook এ order save করার জন্য metadata পাঠানো হচ্ছে
      metadata: {
        bookid: bookId,
        title: book.title,
        author: book.author,
        category: book.category,
        price: String(totalPrice),
        image: book.image || "",
        userid: req.user._id.toString(),
        authorid: book.userId,
      },
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});


app.get('/api/checkout-session/:sessionId', verifyToken, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({
      orderId: session.id.slice(-8).toUpperCase(),
      amount: `$${(session.amount_total / 100).toFixed(2)}`,
      date: new Date(session.created * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      title: session.metadata?.title || "—",
      paymentMethod: "Stripe / Card",
    });
  } catch (error) {
    console.error("Checkout session fetch error:", error);
    res.status(500).json({ error: error.message });
  }
});


///////////////////////////////////////

app.get("/api/users",verifyToken,adminVerify, async (req, res) => {
  const result = await usersCollection.find().toArray();
  res.send(result);
});

app.get("/api/users/librarian", async (req, res) => {
  const query = {};
  const role = req.query.role;
  if (role) {
    query.role = "librarian";
  }
  const result = await usersCollection.find(query).toArray();
  res.send(result);
});

app.get('/api/users/:id',verifyToken,adminVerify, async (req, res) => {
  const { id } = req.params;
  const result = await usersCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.patch('/api/users/:id',verifyToken,adminVerify, async (req, res) => {
  const { id } = req.params;
  const user = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: user };
  const result = await usersCollection.updateOne(filter, updateDoc);
  res.send(result);
});

app.delete('/api/users/:id',verifyToken,adminVerify, async (req, res) => {
  const { id } = req.params;
  const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// ==================== USER DASHBOARD STATS API ====================
// ব্যবহারকারীর ড্যাশবোর্ডের সব রিয়েল ডাটা এবং চার্ট অ্যানালিটিক্স একসাথে রিটার্ন করবে
app.get('/api/user/stats/:userId',verifyToken,userVerify, async (req, res) => {
  try {
    const { userId } = req.params;

    // ১. ডাটাবেজ থেকে নির্দিষ্ট ইউজারের সমস্ত অর্ডার এবং উইশলিস্ট ডাটা নিয়ে আসা
    const userOrders = await orderCollection.find({ userId: userId }).toArray();
    const userWishlist = await wishlistCollection.find({ userId: userId }).toArray();

    // ২. কুইক স্ট্যাটাস কাউন্ট (Delivered এবং Pending)
    const totalBooksRead = userOrders.filter(o => o.status?.toLowerCase() === 'delivered').length;
    const pendingDeliveries = userOrders.filter(o => o.status?.toLowerCase() === 'pending').length;

    // ৩. মোট কত টাকা ইনভেস্ট বা খরচ হয়েছে তার হিসাব
    const totalSpent = userOrders.reduce((acc, curr) => {
      const price = typeof curr.price === 'number' ? curr.price : parseFloat(curr.price || 0);
      return acc + price;
    }, 0);

    // ৪. ট্রেন্ড চার্ট ডাটা প্রিপারেশন (মাসিক খরচ এবং বইয়ের সংখ্যা)
    const monthlyDataMap = {
      'Jan': { name: 'Jan', spent: 0, volumes: 0 }, 'Feb': { name: 'Feb', spent: 0, volumes: 0 },
      'Mar': { name: 'Mar', spent: 0, volumes: 0 }, 'Apr': { name: 'Apr', spent: 0, volumes: 0 },
      'May': { name: 'May', spent: 0, volumes: 0 }, 'Jun': { name: 'Jun', spent: 0, volumes: 0 },
      'Jul': { name: 'Jul', spent: 0, volumes: 0 }, 'Aug': { name: 'Aug', spent: 0, volumes: 0 },
      'Sep': { name: 'Sep', spent: 0, volumes: 0 }, 'Oct': { name: 'Oct', spent: 0, volumes: 0 },
      'Nov': { name: 'Nov', spent: 0, volumes: 0 }, 'Dec': { name: 'Dec', spent: 0, volumes: 0 }
    };

    userOrders.forEach(order => {
      const rawDate = order.date?.$date || order.date || order.createdAt;
      if (rawDate) {
        const month = new Date(rawDate).toLocaleDateString('en-US', { month: 'short' });
        const price = typeof order.price === 'number' ? order.price : parseFloat(order.price || 0);

        if (monthlyDataMap[month]) {
          monthlyDataMap[month].spent += price;
          monthlyDataMap[month].volumes += 1;
        }
      }
    });

    // শুধুমাত্র যে মাসে ট্রানজেকশন হয়েছে সেই মাসগুলো ফিল্টার করা (গ্রাফ সুন্দর দেখানোর জন্য)
    let trendChartData = Object.values(monthlyDataMap).filter(m => m.spent > 0 || m.volumes > 0);

    // ইউজার যদি একেবারে নতুন হয়, তবে কারেন্ট মাসটি ফাঁকা ডাটা দিয়ে পাঠানো হবে যেন গ্রাফ ক্র্যাশ না করে
    if (trendChartData.length === 0) {
      const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short' });
      trendChartData = [monthlyDataMap[currentMonth]];
    }

    // ৫. পাই চার্ট ডাটা প্রিপারেশন (ক্যাটাগরি বা জেনারে ভিত্তিক ডিস্ট্রিবিউশন)
    const categoryMap = {};
    userOrders.forEach(order => {
      const cat = order.category || 'General';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const pieChartData = Object.keys(categoryMap).map(key => ({
      name: key,
      value: categoryMap[key]
    }));

    // রিসেন্ট ৫টি অর্ডার (ড্যাশবোর্ডের ডানপাশের তালিকার জন্য)
    const recentDeliveries = userOrders.slice(-5).reverse();

    // ফাইনাল রেসপন্স পাঠানো
    res.json({
      success: true,
      stats: {
        totalBooksRead,
        pendingDeliveries,
        totalSpent
      },
      trendChartData,
      pieChartData: pieChartData.length > 0 ? pieChartData : [{ name: 'No Orders', value: 1 }],
      orders: userOrders,
      recentDeliveries,
      wishlist: userWishlist
    });

  } catch (error) {
    console.error("User stats fetch error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BOOKS API ====================
app.get('/api/books', async (req, res) => {
  try {
    const matchQuery = {};

    // ✅ status query আসলে সেটা use করো, না আসলে Published দেখাও
    if (req.query.status) {
      matchQuery.status = req.query.status;
    } else if (!req.query.search) {
      matchQuery.status = "Published";
    }

    // 🔍 সার্চ ফিল্টার
    if (req.query.search) {
      matchQuery.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { category: { $regex: req.query.search, $options: "i" } }
      ];
    }

    // 📂 ক্যাটাগরি ফিল্টার
    if (req.query.category) {
      const categories = req.query.category.split(',');
      matchQuery.category = { $in: categories };
    }

    // 💰 প্রাইস ফিল্টার
    if (req.query.maxPrice) {
      matchQuery.price = { $lte: parseFloat(req.query.maxPrice) };
    }

    // 🔄 সর্টিং স্টেজ নির্ধারণ
    let sortStage = { $sort: { date: -1 } }; // ডিফল্ট সর্টিং (নতুন বই আগে)
    if (req.query.sortBy) {
      if (req.query.sortBy === "Price: Low to High") {
        sortStage = { $sort: { price: 1 } };
      } else if (req.query.sortBy === "Price: High to Low") {
        sortStage = { $sort: { price: -1 } };
      }
    }

    // 🛠️ কমন এগ্রিগেশন পাইপলাইন স্টেজ (যা পেজিনেশন থাক বা না থাক, দুই ক্ষেত্রেই লাগবে)
    const basePipeline = [
      { $match: matchQuery },
      sortStage,
      {
        $lookup: {
          from: "user",
          let: { bookUserId: "$userId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", { $toObjectId: "$$bookUserId" }] } } }
          ],
          as: "publisher"
        }
      },
      { $unwind: { path: "$publisher", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          title: 1, author: 1, description: 1, price: 1, category: 1, image: 1, status: 1, date: 1, userId: 1,
          publisher: { name: 1, email: 1, image: 1 }
        }
      }
    ];

    // ========================================================
    // 🔢 আলাদা পেজিনেশন এপিআই ব্লক (যদি URL-এ page প্যারামিটার থাকে)
    // ========================================================
    if (req.query.page) {
      // String থেকে খাঁটি Number-এ রূপান্তর (ক্র্যাশ ফিক্স)
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.perPage) || 9;
      const skip = (page - 1) * perPage;

      // মোট কতটি বই আছে তা ফিল্টার অনুযায়ী গণনা
      const total = await booksCollection.countDocuments(matchQuery);

      // পেজিনেশনের জন্য পাইপলাইনের শেষে $skip এবং $limit পুশ করা হচ্ছে
      const paginationPipeline = [
        ...basePipeline,
        { $skip: skip },
        { $limit: perPage }
      ];

      const books = await booksCollection.aggregate(paginationPipeline).toArray();
      
      // অবজেক্ট আকারে রেসপন্স পাঠানো হচ্ছে { books: [...], total: 38 }
      return res.send({ books, total });
    }

    // ========================================================
    // 🔄 সাধারণ এপিআই ব্লক (যদি URL-এ page না থাকে - সব বই একসাথে যাবে)
    // ========================================================
    const books = await booksCollection.aggregate(basePipeline).toArray();
    
    // সরাসরি অ্যারে আকারে রেসপন্স [book1, book2, ...]
    res.send(books);

  } catch (error) {
    console.error("Books fetch error:", error);
    res.status(500).send({ message: "Failed to fetch books" });
  }
});

app.get('/api/books/search', async (req, res) => {
  try {
    const searchQuery = req.query.search;
    const books = await booksCollection.find({ title: { $regex: searchQuery, $options: 'i' } }).toArray();
    res.send(books);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).send({ message: "Failed to search books" });
  }
})

app.post('/api/books',verifyToken,  async (req, res) => {
  const book = req.body;
  const newBook = { ...book, date: new Date() };
  const result = await booksCollection.insertOne(newBook);
  res.send(result);
});

app.get('/api/books/user/:userId',verifyToken, async (req, res) => {
  const { userId } = req.params;
  const result = await booksCollection.find({ userId }).toArray();
  res.send(result);
});

app.get('/api/books/:id',verifyToken,async (req, res) => {
  const { id } = req.params;
  const result = await booksCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.patch('/api/books/approve/:id',verifyToken,async (req, res) => {
  try {
    const { id } = req.params;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = { $set: { status: "Approved" } };
    const result = await booksCollection.updateOne(filter, updateDoc);
    res.send({ success: true, message: "বইটি সফলভাবে অ্যাপ্রুভ হয়েছে।", result });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

app.patch('/api/books/admin/:id',verifyToken, async (req, res) => {
  const { id } = req.params;
  const book = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: { status: book.status } };
  const result = await booksCollection.updateOne(filter, updateDoc);
  res.send(result);
});

app.delete('/api/books/:id',verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
    res.send({ success: true, message: "ডিলিট সফল হয়েছে।", result });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

app.patch('/api/books/:id',verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData._id;
    const result = await booksCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    res.send({ success: true, result });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

// ==================== ORDERS API ====================
app.get('/api/orders',verifyToken, async (req, res) => {
  const result = await orderCollection.find().toArray();
  res.send(result);
});

app.post('/api/orders', verifyToken, async (req, res) => {
  const order = req.body;
  const newOrder = { ...order, date: new Date() };
  const result = await orderCollection.insertOne(newOrder);
  res.send(result);
});

app.get('/api/orders/user/:authorId',verifyToken, async (req, res) => {
  try {
    const { authorId } = req.params;
    const simpleResult = await orderCollection.find({ authorId: authorId }).toArray();
    if (simpleResult.length === 0) return res.send([]);

    const pipeline = [
      { $match: { authorId: authorId } },
      {
        $lookup: {
          from: "user",
          let: { orderAuthorId: "$authorId" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", { $toObjectId: "$$orderAuthorId" }] } } }],
          as: "authorDetails"
        }
      },
      { $unwind: { path: "$authorDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "user",
          let: { orderUserId: "$userId" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", { $toObjectId: "$$orderUserId" }] } } }],
          as: "customerDetails"
        }
      },
      { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "books",
          let: { orderBookId: "$BookId" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", { $toObjectId: "$$orderBookId" }] } } }],
          as: "bookDetails"
        }
      },
      { $unwind: { path: "$bookDetails", preserveNullAndEmptyArrays: true } },
      { $sort: { date: -1 } }
    ];

    const result = await orderCollection.aggregate(pipeline).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});


app.patch('/api/orders/:id',verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await orderCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
    res.send({ success: true, result });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

// ✅ এই ইউজার এই বই কিনেছে কিনা চেক
app.get('/api/orders/check/:bookId', verifyToken, async (req, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.user._id.toString();

    const order = await orderCollection.findOne({
      BookId: bookId,           // ✅ Capital B
      userId: userId,
      PaymentStatus: "completed" // ✅ status নয়, PaymentStatus
    });

    res.json({ hasPurchased: !!order });
  } catch (error) {
    res.status(500).json({ hasPurchased: false });
  }
});

app.get('/api/orders/:userId',verifyToken, async (req, res) => {
  const { userId } = req.params;
  const result = await orderCollection.find({ userId }).toArray();
  res.send(result);
});

// ==================== WISHLIST API ====================
app.get('/api/wishlist',verifyToken, async (req, res) => {
  const result = await wishlistCollection.find().toArray();
  res.send(result);
});

app.get('/api/wishlist/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await wishlistCollection.aggregate([
      // ১. প্রথমে এই নির্দিষ্ট ইউজারের উইশলিস্ট ফিল্টার করুন
      { $match: { userId: userId } }, 

      // ২. স্ট্র্রিং 'bookId' কে মঙ্গোডিবি 'ObjectId' তে কনভার্ট করার ম্যাজিক ট্রিক
      {
        $addFields: {
          bookObjectId: { $toObjectId: "$bookId" } 
        }
      },

      // ৩. এবার কনভার্ট করা আইডির সাথে 'books' কালেকশন জয়েন করুন
      {
        $lookup: {
          from: 'books',              // আপনার বইয়ের কালেকশনের নাম
          localField: 'bookObjectId', // এখন আমরা কনভার্ট করা আইডি দিয়ে খুঁজবো
          foreignField: '_id',        // বুক কালেকশনের ObjectId
          as: 'bookDetails'
        }
      },

      // ৪. এরে থেকে অবজেক্টে রূপান্তর (যদি কোনো কারণে বুক ডিলিট হয়ে যায়, তাও যেন উইশলিস্ট ক্র্যাশ না করে)
      { $unwind: { path: '$bookDetails', preserveNullAndEmptyArrays: true } }, 

      // ৫. ফ্রন্টএন্ডে ডাটা প্রজেক্ট বা পাস করা
      {
        $project: {
          _id: 1,
          userId: 1,
          bookId: 1,
          // যদি $lookup সফল হয় তবে মেইন বুক কালেকশনের ডাটা দেখাবে, 
          // আর তা না হলে উইশলিস্টে অলরেডি সেভ থাকা ব্যাকআপ ডাটা দেখাবে!
          title: { $ifNull: ['$bookDetails.title', '$title'] },
          image: { $ifNull: ['$bookDetails.image', '$image'] },
          author: { $ifNull: ['$bookDetails.author', '$author'] },
          category: { $ifNull: ['$bookDetails.category', '$category'] },
          price: { $ifNull: ['$bookDetails.price', '$price'] },
          date: 1
        }
      }
    ]).toArray();

    res.send(result);
  } catch (error) {
    console.error("Aggregation Error:", error);
    res.status(500).send({ success: false, message: "Failed to fetch wishlist" });
  }
});

app.delete('/api/wishlist/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) }); // অথবা শুধু id যদি স্ট্রিং হয়
    
    if (result.deletedCount === 1) {
      res.send({ success: true, message: "Removed from wishlist" });
    } else {
      res.status(404).send({ success: false, message: "Item not found" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: "Server error" });
  }
});


app.post('/api/wishlist/:id', verifyToken, async (req, res) => {
  try {
    const bookId = req.params.id; // ইউআরএল থেকে bookId নেওয়া হচ্ছে
    const bookData = req.body;    // বডি থেকে বইয়ের সব ডাটা নেওয়া হচ্ছে

    // ফ্রন্টএন্ড থেকে পাঠানো activeUserId অথবা টোকেন মিডলওয়্যার থেকে আইডি নেওয়া হচ্ছে
    const finalUserId = bookData.activeUserId || req.user?.id || req.user?._id;

    if (!finalUserId) {
      return res.status(401).send({ success: false, message: "User not authenticated" });
    }

    // আপনার ঠিক যেমনটি চাই—পারফেক্ট অবজেক্ট ফরম্যাট
    const wishlistDoc = {
      bookId: bookId,
      title: bookData.title,
      author: bookData.author,
      category: bookData.category,
      price: Number(bookData.price || 0),
      image: bookData.image,
      userId: finalUserId, // 👈 এখন এটি আর null থাকবে না, ইউজারের আইডি বসে যাবে
      date: new Date()    // ISODate ফরম্যাটে সেভ হবে
    };

    const result = await wishlistCollection.insertOne(wishlistDoc);
    res.status(201).send({ success: true, result });
  } catch (error) {
    console.error("Wishlist insertion failed:", error);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
});

// ==================== LIBRARIAN DASHBOARD STATS API ====================
app.get('/api/librarian/stats/:authorId',verifyToken,librarianVerify, async (req, res) => {
  try {
    const { authorId } = req.params;
    const totalBooks = await booksCollection.countDocuments({ userId: authorId });
    const orders = await orderCollection.find({ authorId: authorId }).toArray();

    const totalEarnings = orders
      .filter(o => o.status !== 'pending')
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0);

    const pendingRequests = orders.filter(o => o.status === 'pending').length;

    const monthlyDataMap = {
      'Jan': { name: 'Jan', earnings: 0, requests: 0 }, 'Feb': { name: 'Feb', earnings: 0, requests: 0 },
      'Mar': { name: 'Mar', earnings: 0, requests: 0 }, 'Apr': { name: 'Apr', earnings: 0, requests: 0 },
      'May': { name: 'May', earnings: 0, requests: 0 }, 'Jun': { name: 'Jun', earnings: 0, requests: 0 },
      'Jul': { name: 'Jul', earnings: 0, requests: 0 }, 'Aug': { name: 'Aug', earnings: 0, requests: 0 },
      'Sep': { name: 'Sep', earnings: 0, requests: 0 }, 'Oct': { name: 'Oct', earnings: 0, requests: 0 },
      'Nov': { name: 'Nov', earnings: 0, requests: 0 }, 'Dec': { name: 'Dec', earnings: 0, requests: 0 }
    };

    orders.forEach(order => {
      if (order.date) {
        const monthName = new Date(order.date).toLocaleString('en-US', { month: 'short' });
        if (monthlyDataMap[monthName]) {
          monthlyDataMap[monthName].requests += 1;
          if (order.status !== 'pending') {
            monthlyDataMap[monthName].earnings += (Number(order.price) || 0);
          }
        }
      }
    });

    const activeMonthsTrends = Object.values(monthlyDataMap).filter(month => month.earnings > 0 || month.requests > 0);
    if (activeMonthsTrends.length === 0) {
      const currentMonth = new Date().toLocaleString('en-US', { month: 'short' });
      activeMonthsTrends.push(monthlyDataMap[currentMonth]);
    }

    const bookCountMap = {};
    orders.forEach(order => {
      if (order.BookId) bookCountMap[order.BookId] = (bookCountMap[order.BookId] || 0) + 1;
    });

    const topBookIds = Object.keys(bookCountMap).sort((a, b) => bookCountMap[b] - bookCountMap[a]).slice(0, 3);
    const topBooksData = await booksCollection.find({ _id: { $in: topBookIds.map(id => new ObjectId(id)) } }).toArray();

    const topRequestedBooks = topBooksData.map(book => ({
      id: book._id, title: book.title, author: book.author, image: book.image,
      price: Number(book.price) || 0, requests: bookCountMap[book._id.toString()] || 0
    })).sort((a, b) => b.requests - a.requests);

    res.send({ success: true, stats: { totalBooks, totalEarnings, pendingRequests }, earningTrends: activeMonthsTrends, topRequestedBooks });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});


app.get('/api/admin/transactions', verifyToken,adminVerify, async (req, res) => {
  try {
    const transactions = await orderCollection.aggregate([
      {
        $lookup: {
          from: 'user', // ✅ "users" না, "user" (Better Auth singular)
          let: { buyerId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: '$_id' }, '$$buyerId'] // ✅ safe string comparison
                }
              }
            }
          ],
          as: 'buyerDetails'
        }
      },
      {
        $lookup: {
          from: 'user', // ✅ same fix
          let: { librarianId: '$authorId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: '$_id' }, '$$librarianId'] // ✅ safe string comparison
                }
              }
            }
          ],
          as: 'librarianDetails'
        }
      },
      {
        $project: {
          transactionId: '$_id',
          title: 1,
          userEmail: { $arrayElemAt: ['$buyerDetails.email', 0] },
          librarianEmail: { $arrayElemAt: ['$librarianDetails.email', 0] },
          amount: '$price',
          status: 1,
          date: 1
        }
      },
      { $sort: { date: -1 } }
    ]).toArray();

    res.json(transactions);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ==================== ADMIN DASHBOARD STATS API ====================

app.get('/api/admin/stats',verifyToken,adminVerify, async (req, res) => {
  try {
    // ১. Total Users
    const totalUsers = await usersCollection.countDocuments();

    // ২. Total Books
    const totalBooks = await booksCollection.countDocuments();

    // ৩. Total Deliveries (pending ছাড়া সব completed/approved orders)
    const totalDeliveries = await orderCollection.countDocuments({ status: { $ne: 'pending' } });

    // ৪. Total Revenue (pending ছাড়া সব orders এর price যোগ)
    const revenueResult = await orderCollection.aggregate([
      { $match: { status: { $ne: 'pending' } } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]).toArray();
    const totalRevenue = revenueResult[0]?.total || 0;

    // ৫. Approval Queue (status: "pending" বই গুলো + publisher info)
    const approvalQueue = await booksCollection.aggregate([
      { $match: { status: { $regex: 'pending', $options: 'i' } } },
      {
        $lookup: {
          from: 'user',
          let: { bookUserId: '$userId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$bookUserId' }] } } }
          ],
          as: 'publisherDetails'
        }
      },
      { $unwind: { path: '$publisherDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          title: 1,
          author: 1,
          status: 1,
          date: 1,
          librarian: '$publisherDetails.name',
          librarianEmail: '$publisherDetails.email',
        }
      },
      { $sort: { date: -1 } },
      { $limit: 10 }
    ]).toArray();

    // ৬. Recent Users (latest 10)
    const recentUsers = await usersCollection.find(
      {},
      { projection: { name: 1, email: 1, role: 1, image: 1, createdAt: 1 } }
    ).sort({ createdAt: -1 }).limit(10).toArray();

    // ৭. Recent Books (latest 10)
    const recentBooks = await booksCollection.find(
      {},
      { projection: { title: 1, status: 1, date: 1, category: 1 } }
    ).sort({ date: -1 }).limit(10).toArray();

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalBooks,
        totalDeliveries,
        totalRevenue,
      },
      approvalQueue,
      recentUsers,
      recentBooks,
    });

  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== REVIEW API ====================
// Review POST — শুধু ক্রেতারাই পারবে
app.post('/api/reviews', verifyToken, async (req, res) => {
  try {
    const { bookId, rating, comment } = req.body;
    const userId = req.user._id.toString();

   
    const order = await orderCollection.findOne({
      BookId: bookId,
      userId: userId,
      PaymentStatus: "completed",
      status: "Delivered"
    });

    if (!order) {
      return res.status(403).json({
        success: false,
        message: "Only buyers can leave reviews."
      });
    }

    // ✅ একজন ইউজার একটি বইয়ে একবারই রিভিউ দিতে পারবে
    const existingReview = await reviewsCollection.findOne({ bookId, userId });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "আপনি ইতোমধ্যে এই বইয়ে রিভিউ দিয়েছেন।"
      });
    }

    const review = await reviewsCollection.insertOne({
      bookId,
      userId,
      userName: req.user.name,
      userImage: req.user.image || null,
      rating: parseInt(rating),
      comment,
      createdAt: new Date()
    });

    res.json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/reviews/:reviewId', verifyToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { comment, rating } = req.body;
    
    // 🎯 ফিক্সড: মিডলওয়্যার অনুযায়ী req.user._id ব্যবহার করা হয়েছে এবং ওটাকে স্ট্রিং বানানো হয়েছে
    const userId = req.user?._id?.toString(); 

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized. User identity missing." });
    }

    const existingReview = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });

    if (!existingReview) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }

    // 🎯 ফিক্সড: দুটি আইডিকেই .toString() করে তুলনা করা হচ্ছে যাতে টাইপ কনফ্লিক্ট না হয়
    if (existingReview.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized. You do not own this review." });
    }

    const updateDoc = {
      $set: {
        comment: comment.trim(),
        rating: Number(rating),
        updatedAt: new Date()
      }
    };

    await reviewsCollection.updateOne({ _id: new ObjectId(reviewId) }, updateDoc);

    return res.status(200).json({ success: true, message: "Review updated successfully." });

  } catch (error) {
    console.error("Update error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});
// 🗑️ DELETE REVIEW ROUTE
app.delete('/api/reviews/:reviewId', verifyToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    
    // 🎯 ফিক্সড: মিডলওয়্যার অনুযায়ী req.user._id ব্যবহার করা হয়েছে
    const userId = req.user?._id?.toString(); 

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized. User identity missing." });
    }

    const existingReview = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });

    if (!existingReview) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }

    // 🎯 ফিক্সড: স্ট্রিং তুলনা
    if (existingReview.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Unauthorized. You do not own this review." });
    }

    await reviewsCollection.deleteOne({ _id: new ObjectId(reviewId) });

    return res.status(200).json({ success: true, message: "Review deleted successfully." });

  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});


// 
// ইউজারের দেওয়া সমস্ত রিভিউ গেট করার রাউট
app.get('/api/reviews/user/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const reviews = await reviewsCollection
      .find({ userId: userId.toString() })
      .sort({ createdAt: -1 })
      .toArray();

    const reviewsWithTitle = [];

    for (const review of reviews) {
      let bookDetails = null;
      try {
        // এখানে চেক করা হচ্ছে review.bookId-টি ২৪ ক্যারেক্টারের ভ্যালিড হেক্স স্ট্রিং কি না
        if (review.bookId && ObjectId.isValid(review.bookId)) {
          bookDetails = await booksCollection.findOne(
            { _id: new ObjectId(review.bookId) },
            { projection: { title: 1, image: 1 } }
          );
        }
      } catch (err) {
        console.error("Error fetching book for review:", err.message);
      }

      reviewsWithTitle.push({
        _id: review._id,
        bookId: review.bookId,
        bookTitle: bookDetails ? bookDetails.title : "বই পাওয়া যায়নি",
        bookImage: bookDetails ? bookDetails.image : null,
        userId: review.userId,
        userName: review.userName,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt
      });
    }

    res.json({ success: true, data: reviewsWithTitle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// নির্দিষ্ট বইয়ের সব রিভিউ GET
app.get('/api/reviews/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;

    if (!bookId) {
      return res.status(400).json({ success: false, message: "Book ID is required" });
    }

    // 🎯 মঙ্গোডিবির সাথে আইডি ম্যাচ করানোর সেফ কন্ডিশন
    const query = {
      $or: [
        { bookId: bookId.toString() }, // ১. যদি ডাটাবেজে ভুলবশত স্ট্রিং হিসেবে সেভ হয়ে থাকে
        { bookId: ObjectId.isValid(bookId) ? new ObjectId(bookId) : bookId } // ২. আসল ObjectId ফরম্যাট চেক (মোস্টলি এটাই কাজ করবে)
      ]
    };

    const reviews = await reviewsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data: reviews });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.get("/api/top-librarians", async (req, res) => {
  try {
    const result = await orderCollection.aggregate([
      // শুধুমাত্র completed order গুলো নাও
      {
        $match: {
          status: "Delivered"
        }
      },

      // authorId অনুযায়ী group করো
      {
        $group: {
          _id: "$authorId",
          deliveries: { $sum: 1 }
        }
      },

      // বেশি delivery যার, সে আগে
      {
        $sort: {
          deliveries: -1
        }
      },

      // Top 3
      {
        $limit: 3
      },

      // user collection থেকে librarian info নিয়ে আসো
      {
        $lookup: {
          from: "user",
          let: { librarianId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    "$_id",
                    { $toObjectId: "$$librarianId" }
                  ]
                }
              }
            }
          ],
          as: "librarian"
        }
      },

      {
        $unwind: "$librarian"
      },

      // Final response
      {
        $project: {
          _id: 0,
          id: "$librarian._id",
          name: "$librarian.name",
          avatar: "$librarian.image",
          role: "$librarian.role",
          deliveries: 1
        }
      }

    ]).toArray();

    res.send(result);

  } catch (error) {
    res.status(500).send({
      success: false,
      error: error.message
    });
  }
});




// ✅ ফাইনাল পোর্ট লিসেনার সবার নিচে
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});