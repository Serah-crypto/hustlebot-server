const express = require('express');
const axios   = require('axios');
const admin   = require('firebase-admin');
const router  = express.Router();

// ── Switch this when going live ───────────────────────────────────────────────
const MPESA_BASE_URL = 'https://sandbox.safaricom.co.ke';
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
    const amount    = 199;

    try {
        const token     = await getMpesaToken();
        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
        const password  = Buffer.from(
            `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
        ).toString('base64');

        // Format phone: 07XXXXXXXX → 2547XXXXXXXX
        const formattedPhone = phone.startsWith('0')
            ? '254' + phone.slice(1)
            : phone;

        const response = await axios.post(
            `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
            {
                BusinessShortCode: process.env.MPESA_SHORTCODE,
                Password:          password,
                Timestamp:         timestamp,
                TransactionType:   'CustomerPayBillOnline',
                Amount:            amount,
                PartyA:            formattedPhone,
                PartyB:            process.env.MPESA_SHORTCODE,
                PhoneNumber:       formattedPhone,
                CallBackURL: `${process.env.RENDER_URL}/mpesa/callback`,
                AccountReference:  'HustleScore Premium',
                TransactionDesc:   'HustleScore Premium Subscription'
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        // Save pending payment to Firebase
       await admin.database().ref(`payments/${checkoutRequestId}`).set({
    uid,
    status:            'pending',
    amount:            amount,
    phone:             formattedPhone,
    checkoutRequestId: response.data.CheckoutRequestID,
    timestamp:         Date.now()
});

        res.json({ success: true, checkoutRequestId: response.data.CheckoutRequestID });

    } catch (err) {
        console.error('STK Push error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── M-Pesa Callback (Safaricom calls this after payment) ─────────────────────
router.post('/mpesa/callback', async (req, res) => {
    try {
        const body       = req.body.Body.stkCallback;
        const resultCode = body.ResultCode;

        if (resultCode === 0) {
            const checkoutId = body.CheckoutRequestID;

            // Fetch the payment record directly by checkoutRequestId
            const snapshot = await admin.database()
                .ref(`payments/${checkoutId}`)
                .once('value');

            const payment = snapshot.val();
            if (payment) {
                const uid        = payment.uid;
                const expiryDate = Date.now() + (30 * 24 * 60 * 60 * 1000);

                await Promise.all([
                    admin.database().ref(`Users/${uid}/premium`).set({
                        isPremium:  true,
                        expiryDate: expiryDate,
                        plan:       'monthly'
                    }),
                    admin.database().ref(`payments/${checkoutId}`).update({
                        status: 'completed'
                    })
                ]);
            }
        }

        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    } catch (err) {
        console.error('Callback error:', err.message);
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
});

// ── Check payment status ──────────────────────────────────────────────────────
router.get('/mpesa/status/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const snapshot = await admin.database().ref(`payments/${checkoutId}`).update({ status: 'completed' });
        const payment  = snapshot.val();

        if (!payment) {
            return res.json({ status: 'not_found' });
        }

        res.json({ status: payment.status, amount: payment.amount, timestamp: payment.timestamp });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;