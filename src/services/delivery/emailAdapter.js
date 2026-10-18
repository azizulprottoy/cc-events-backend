const nodemailer = require('nodemailer');
const { smtp } = require('../../config/env');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
  }
  return transporter;
}

// endUser: EndUser doc, content: { subject, body, html? }
async function send(endUser, content) {
  if (!endUser.email) throw new Error('EndUser has no email on file');
  if (!smtp.host) {
    console.log(`[email:dev] to=${endUser.email} subject="${content.subject}" body="${content.body}"`);
    return;
  }

  await getTransporter().sendMail({
    from: smtp.from,
    to: endUser.email,
    subject: content.subject || 'Notification',
    text: content.body,
    html: content.html || undefined,
  });
}

module.exports = { send };
