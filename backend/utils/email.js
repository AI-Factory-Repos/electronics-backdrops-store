const nodemailer = require('nodemailer');

function createTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  // Fallback: log emails to console in development
  return null;
}

function formatCurrency(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

function buildOrderConfirmationHtml(order) {
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">
        ${item.name}${item.variantLabel ? ' — ' + item.variantLabel : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.price)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.price * item.quantity)}</td>
    </tr>
  `).join('');

  const addr = order.shippingAddress;
  const addressHtml = `${addr.firstName} ${addr.lastName}<br/>${addr.address1}${addr.address2 ? ', ' + addr.address2 : ''}<br/>${addr.city}, ${addr.state} ${addr.zipCode}<br/>${addr.country}`;

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"/><title>Order Confirmation</title></head>
    <body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
      <h1 style="color:#2c3e50;">Order Confirmed!</h1>
      <p>Thank you for your order. We've received it and will begin processing shortly.</p>

      <div style="background:#f8f9fa;padding:15px;border-radius:5px;margin:20px 0;">
        <strong>Order ID:</strong> ${order._id}<br/>
        <strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}<br/>
        <strong>Status:</strong> ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
      </div>

      <h2 style="color:#2c3e50;">Items Ordered</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#2c3e50;color:#fff;">
            <th style="padding:10px;text-align:left;">Product</th>
            <th style="padding:10px;text-align:center;">Qty</th>
            <th style="padding:10px;text-align:right;">Price</th>
            <th style="padding:10px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="margin-top:20px;text-align:right;">
        <p>Subtotal: <strong>${formatCurrency(order.subtotal)}</strong></p>
        <p>Shipping: <strong>${formatCurrency(order.shippingCost)}</strong></p>
        <p>Tax: <strong>${formatCurrency(order.tax)}</strong></p>
        <p style="font-size:1.2em;">Total: <strong>${formatCurrency(order.total)}</strong></p>
      </div>

      <h2 style="color:#2c3e50;">Shipping Address</h2>
      <p>${addressHtml}</p>

      ${order.shippingMethod && order.shippingMethod.service ? `<p><strong>Shipping Method:</strong> ${order.shippingMethod.carrier || ''} ${order.shippingMethod.service}${order.shippingMethod.estimatedDays ? ' (' + order.shippingMethod.estimatedDays + ' business days)' : ''}</p>` : ''}

      <hr style="border:none;border-top:1px solid #eee;margin:30px 0;"/>
      <p style="font-size:0.9em;color:#666;">If you have any questions about your order, please contact us. Order ID: ${order._id}</p>
    </body>
    </html>
  `;
}

async function sendOrderConfirmationEmail(order, recipientEmail) {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@electronics-backdrops.com',
    to: recipientEmail,
    subject: `Order Confirmation #${order._id}`,
    html: buildOrderConfirmationHtml(order)
  };

  if (!transporter) {
    console.log('[EMAIL] Order confirmation email (dev mode - not sent):');
    console.log(`  To: ${recipientEmail}`);
    console.log(`  Subject: ${mailOptions.subject}`);
    console.log(`  Order ID: ${order._id}`);
    return;
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Order confirmation sent to ${recipientEmail}:`, info.messageId);
  } catch (err) {
    console.error('[EMAIL] Failed to send order confirmation:', err.message);
    // Do not throw — email failure should not fail the order
  }
}

module.exports = { sendOrderConfirmationEmail };
