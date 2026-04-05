// Dart Scorer - OzBooks Integration
// Records subscription income and sends invoices/receipts via OzBooks API

const fs = require('fs');
const path = require('path');

const OZBOOKS_URL = 'http://localhost:5443';
const API_KEY_PATH = path.join(__dirname, '..', '..', '..', 'employee', 'data', '.internal-api-key');
let apiKey = null;

try {
  apiKey = fs.readFileSync(API_KEY_PATH, 'utf8').trim();
} catch (e) {
  console.error('OzBooks integration: API key not found at', API_KEY_PATH);
}

async function ozbooksRequest(method, endpoint, body) {
  if (!apiKey) {
    console.error('OzBooks integration: No API key configured');
    return null;
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': apiKey,
    },
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${OZBOOKS_URL}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) {
      console.error(`OzBooks API error (${endpoint}):`, data.error || res.status);
      return null;
    }
    return data;
  } catch (e) {
    console.error(`OzBooks API error (${endpoint}):`, e.message);
    return null;
  }
}

// Find or create a client in OzBooks for the subscriber
async function findOrCreateClient(email, displayName) {
  // Search for existing client by email
  const clients = await ozbooksRequest('GET', '/api/clients');
  if (clients) {
    const list = clients.clients || clients;
    const existing = list.find(c => c.email && c.email.toLowerCase() === email.toLowerCase());
    if (existing) return existing;
  }

  // Create new client
  const result = await ozbooksRequest('POST', '/api/clients', {
    type: 'individual',
    name: displayName || email.split('@')[0],
    email: email,
    notes: 'Dart Scorer Pro subscriber (auto-created)',
  });

  return result ? (result.client || result) : null;
}

// Record a subscription payment in OzBooks
// Creates invoice, marks as paid, and sends receipt
async function recordSubscriptionPayment({ email, displayName, plan, amount, paymentDate }) {
  if (!apiKey) return;

  try {
    // 1. Find or create client
    const client = await findOrCreateClient(email, displayName);
    if (!client || !client.id) {
      console.error('OzBooks: Failed to find/create client for', email);
      return;
    }

    const planName = plan === 'monthly' ? 'Monthly' : 'Annual';
    const amountDollars = (amount / 100).toFixed(2);
    const today = paymentDate || new Date().toISOString().slice(0, 10);

    // 2. Create invoice (as 'sent' status so we can record payment)
    const invoice = await ozbooksRequest('POST', '/api/invoices', {
      client_id: client.id,
      invoice_date: today,
      due_date: today,
      status: 'sent',
      income_account_id: 854, // 4010 - App Subscription Income
      tax_rate: 0,
      notes: `Dart Scorer Pro — ${planName} Subscription`,
      items: [{
        description: `Dart Scorer Pro — ${planName} Subscription`,
        quantity: 1,
        unit_price: parseFloat(amountDollars),
      }],
    });

    if (!invoice || !invoice.id) {
      console.error('OzBooks: Failed to create invoice for', email);
      return;
    }

    const invoiceId = invoice.id;

    // 3. Record payment (marks invoice as paid)
    const payment = await ozbooksRequest('POST', '/api/payments', {
      invoice_id: invoiceId,
      payment_date: today,
      amount: parseFloat(amountDollars),
      payment_method: 'credit_card',
      deposit_account_id: 2, // 1010 - Checking Account (where Square deposits)
      reference: 'Square',
      notes: `Dart Scorer Pro ${planName} — ${email}`,
    });

    if (!payment) {
      console.error('OzBooks: Failed to record payment for invoice', invoiceId);
      return;
    }

    // 4. Send receipt email to subscriber
    await ozbooksRequest('POST', `/api/payments/invoice/${invoiceId}/email-receipt`, {
      memo: 'Thank you for subscribing to Dart Scorer Pro!',
    });

    console.log(`OzBooks: Recorded $${amountDollars} payment from ${email} (Invoice #${invoice.invoice_number || invoiceId})`);
  } catch (e) {
    console.error('OzBooks integration error:', e.message);
  }
}

module.exports = {
  recordSubscriptionPayment,
};
