const express = require('express');
const axios   = require('axios');
const admin   = require('firebase-admin');
const router  = express.Router();

// ── Switch this when going live ───────────────────────────────────────────────
const MPESA_BASE_URL = 'https://api.safaricom.co.ke';
// const MPESA_BASE_URL = 'https://api.safaricom.co.ke'; // ← uncomment for production

// ── Get M-Pesa access token ───────────────────────────────────────────────────
async function getMpesaToken() {
    const auth = Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const res = await axios.get(
        `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${auth}` } }
    );
    return res.data.access_token;
}

// ── Trigger STK Push ──────────────────────────────────────────────────────────
router.post('/mpesa/stk-push', async (req, res) => {
    const { phone, uid } = req.body;
    const amount = 199;

    try {
        const token = await getMpesaToken();
        // ... existing code ...
        const response = await axios.post(/* ... */);
        
        console.log('STK Push response:', JSON.stringify(response.data));
        // ... rest of code

    } catch (err) {
        // Log the FULL error including Safaricom's response body
        console.error('STK Push error:', err.message);
        if (err.response) {
            console.error('Safaricom response:', JSON.stringify(err.response.data));
            console.error('Status code:', err.response.status);
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Check payment status ──────────────────────────────────────────────────────
router.get('/mpesa/status/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const snapshot = await admin.database().ref(`payments/${uid}`).get();
        const payment = snapshot.val();
        if (!payment) {
            return res.json({ status: 'not_found' });
        }
        res.json({ status: payment.status, amount: payment.amount, timestamp: payment.timestamp });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;