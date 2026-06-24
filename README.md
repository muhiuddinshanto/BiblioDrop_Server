# BiblioDrop Server 📚✨

Welcome to the backend server of **BiblioDrop**—a premium book lending, buying, and library management platform. This server is built using **Node.js**, **Express.js**, and **MongoDB**, featuring secure payment integration via **Stripe** (with webhooks) and robust role-based access control.

---

## 🚀 Key Features

*   **Role-Based Access Control (RBAC):** Customized access and permissions for `Admin`, `Librarian`, and `User` roles.
*   **Stripe Payment Integration:** Secure checkout sessions and asynchronous order processing using **Stripe Webhooks**.
*   **Advanced Analytics Dashboards:**
    *   **Admin Dashboard:** Track platform-wide users, books count, total revenue, approval queues, and transaction histories.
    *   **Librarian Dashboard:** View total published books, earnings stats, monthly requests trends, and top-requested books.
    *   **User Dashboard:** Monitor total books read, pending deliveries, total spent, monthly volume charts, and wishlist items.
*   **Books & Reviews System:**
    *   Pagination, search, filtering, and sorting for books catalog.
    *   Buyer-restricted book reviews (only users who successfully purchased a book can review it).
    *   One-review-per-user limit per book with full CRUD support for their own reviews.
*   **Wishlist System:** Real-time wishlists aggregated with MongoDB queries for fallbacks and performance.

---

## 🛠️ Technology Stack

*   **Runtime:** Node.js (v18+)
*   **Framework:** Express.js
*   **Database:** MongoDB (via official Driver)
*   **Payments:** Stripe SDK & Stripe Webhooks
*   **Hosting/Deployment:** Ready for **Vercel** (`vercel.json` included)

---

## 📋 Prerequisites

Before setting up, ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v16 or higher)
*   [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account or local MongoDB instance

---

## ⚙️ Installation & Setup

1.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd BiblioDrop_Server
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory and add the following keys:
    ```env
    PORT=5000
    DB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/BiblioDrop?retryWrites=true&w=majority
    CLIENT_URL=http://localhost:5173
    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    ```
    *Note: Adjust `CLIENT_URL` to match your frontend application URL.*

4.  **Run Locally (Development):**
    ```bash
    npm start
    # or
    node index.js
    ```
    The server will start running on the port defined in `.env` (default is `5000`).

---

## 🛣️ API Endpoints Summary

### 🔑 Authentication & Authorization (Middlewares)
*   `verifyToken`: Validates session token.
*   `userVerify`: Restricts access to standard users.
*   `librarianVerify`: Restricts access to Librarians.
*   `adminVerify`: Restricts access to Admins.

### 💳 Stripe Checkout & Webhook
*   `POST /api/webhook` - Stripe Webhook for checkout completions (Processes orders safely).
*   `POST /api/create-checkout-session` - Creates a checkout session for a book.
*   `GET /api/checkout-session/:sessionId` - Gets checkout session receipt details.

### 📚 Books API
*   `GET /api/books` - Get books with search, sorting, filtering, and pagination support.
*   `POST /api/books` - Add a new book.
*   `GET /api/books/:id` - Fetch single book by ID.
*   `PATCH /api/books/:id` - Update book details.
*   `DELETE /api/books/:id` - Delete book.
*   `PATCH /api/books/approve/:id` - Approve book status.

### 🛍️ Orders API
*   `GET /api/orders` - Fetch all orders (Admin).
*   `POST /api/orders` - Create an order manual backup.
*   `GET /api/orders/user/:authorId` - Get orders for a specific Librarian's books.
*   `PATCH /api/orders/:id` - Update order status (e.g. pending to delivered).
*   `GET /api/orders/check/:bookId` - Check if the user has purchased the book.

### ❤️ Wishlist API
*   `GET /api/wishlist/:userId` - Get user's wishlist items with book details.
*   `POST /api/wishlist/:id` - Add book to wishlist.
*   `DELETE /api/wishlist/:id` - Remove book from wishlist.

### ⭐ Reviews API
*   `POST /api/reviews` - Post a review (Only buyers of the book, 1 review limit).
*   `PATCH /api/reviews/:reviewId` - Update your review.
*   `DELETE /api/reviews/:reviewId` - Delete your review.
*   `GET /api/reviews/user/:userId` - Get all reviews posted by a user.
*   `GET /api/reviews/book/:bookId` - Get all reviews for a book.

### 📊 Dashboard Stats API
*   `GET /api/admin/stats` - Fetch total users, books, deliveries, revenue, approval queues, and recent activity.
*   `GET /api/librarian/stats/:authorId` - Get librarian specific revenue and top requested books.
*   `GET /api/user/stats/:userId` - Fetch user's reading logs, spent summary, monthly graphs, and category distributions.

---

## 🚀 Deployment

The project is structured to deploy smoothly on **Vercel**. 

To deploy manually using Vercel CLI:
```bash
npm install -g vercel
vercel
vercel --prod
```

Ensure you configure all Environment Variables in the Vercel project settings dashboard.

---

