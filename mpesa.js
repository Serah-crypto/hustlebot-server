const express = require('express');
const axios   = require('axios');
const admin   = require('firebase-admin');
const router  = express.Router();

// ── Get M-Pesa access token ───────────────────────────────────────────────────
async function getMpesaToken() {
    const auth = Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const res = await axios.get(
        'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        { headers: { Authorization: `Basic ${auth}` } }
    );
    return res.data.access_token;
}

// ── Trigger STK Push ──────────────────────────────────────────────────────────
router.post('/mpesa/stk-push', async (req, res) => {
    const { phone, uid } = req.body;
    const amount  = 199;
    const token   = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password  = Buffer.from(
        `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    // Format phone: 07XXXXXXXX → 2547XXXXXXXX
    const formattedPhone = phone.startsWith('0')
        ? '254' + phone.slice(1)
        : phone;

    try {
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                BusinessShortCode: process.env.MPESA_SHORTCODE,
                Password:          password,
                Timestamp:         timestamp,
                TransactionType:   'CustomerPayBillOnline',
                Amount:            amount,
                PartyA:            formattedPhone,
                PartyB:            process.env.MPESA_SHORTCODE,
                PhoneNumber:       formattedPhone,
                CallBackURL:       `${process.env.RENDER_URL}/mpesa/callback`,
                AccountReference:  'HustleScore Premium',
                TransactionDesc:   'HustleScore Premium Subscription'
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        // Save pending payment to Firebase
        await admin.database().ref(`payments/${uid}`).set({
            status:    'pending',
            amount:    amount,
            phone:     formattedPhone,
            checkoutRequestId: response.data.CheckoutRequestID,
            timestamp: Date.now()
        });

        res.json({ success: true, checkoutRequestId: response.data.CheckoutRequestID });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── M-Pesa Callback (Safaricom calls this after payment) ─────────────────────
router.post('/mpesa/callback', async (req, res) => {
    const body     = req.body.Body.stkCallback;
    const resultCode = body.ResultCode;

    if (resultCode === 0) {
        // Payment successful — find the uid from pending payments
        const checkoutId = body.CheckoutRequestID;
        const paymentsRef = admin.database().ref('payments');
        const snapshot = await paymentsRef
            .orderByChild('checkoutRequestId')
            .equalTo(checkoutId)
            .once('value');

        snapshot.forEach(child => {
            const uid = child.key;
            const expiryDate = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days

            // Grant premium in Firebase
            admin.database().ref(`Users/${uid}/premium`).set({
                isPremium:  true,
                expiryDate: expiryDate,
                plan:       'monthly'
            });

            // Update payment record
            admin.database().ref(`payments/${uid}`).update({ status: 'completed' });
        });
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

module.exports = router;
