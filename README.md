# Numberwale Gallabox Chatbot — Backend Server 🤖

This is the backend server and API webhook handler for the Numberwale Gallabox WhatsApp Bot integration. It handles Gallabox webhooks, stores search analytics in MongoDB, parses buyer search queries, generates UPI QR codes, and manages bot status (pause/resume).

---

## ⚙️ Environment Variables (`.env`)

Create a `.env` file in the root directory with the following variables:

```env
PORT=3001
MONGODB_URI=mongodb+srv://...     # MongoDB Connection string
GROQ_API_KEY=gsk_...              # Groq Cloud API Key for AI Parser
GALLABOX_API_KEY=...             # Gallabox API Key
ADMIN_SECRET=...                  # Secret key protecting the analytics and control routes
```

---

## 🚀 Running Locally

To run the server locally for development:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run in development mode (with auto-restart on changes):**
   ```bash
   npm run dev
   ```

3. **Run in production mode:**
   ```bash
   npm start
   ```

---

## 🐧 VPS / Linux Server Setup (Ubuntu, CentOS, etc.)

To host this backend on a VPS and ensure it runs continuously in the background (even if the server reboots), manage it using **PM2**.

### 1. Install PM2 Globally
If you haven't installed PM2 on your VPS yet:
```bash
npm install -g pm2
```

### 2. Start the Server with PM2
Launch the server and assign it a recognizable name:
```bash
pm2 start server.js --name "numberwale-gallabox-wabot"
```

### 3. Enable PM2 Autostart on Boot
To make PM2 start automatically when the Linux server reboots:
```bash
pm2 startup
```
*Note: This command will output a configuration line starting with `sudo env PATH...`. Copy and paste that line into the terminal and press Enter.*

### 4. Save the Current Process List
Save the process state so it persists across system reboots:
```bash
pm2 save
```

---

## 📌 PM2 Commands Reference

Here are the most common commands you will need for managing the server:

* **Check Status:** See if the bot server is active or stopped.
  ```bash
  pm2 status
  ```
* **View Logs:** Monitor live server console outputs and incoming webhook payloads.
  ```bash
  pm2 logs numberwale-gallabox-wabot
  ```
* **Restart Server:** Apply new updates or refresh the running state.
  ```bash
  pm2 restart numberwale-gallabox-wabot
  ```
* **Stop Server:** Pause the server temporarily.
  ```bash
  pm2 stop numberwale-gallabox-wabot
  ```
* **Remove from PM2:** Remove the server from PM2's process list.
  ```bash
  pm2 delete numberwale-gallabox-wabot
  pm2 save
  ```

---

## 🧪 Running Tests

The test scripts have been consolidated in the `tests/` directory:

* Run the search intent parsing simulation:
  ```bash
  node tests/simulate_webhook.js
  ```
* Run local webhook payload simulation:
  ```bash
  node tests/test.js
  ```
* Test Mongoose Schema interaction:
  ```bash
  node tests/test-mongoose-mixed.js
  ```
