import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendReminderEmail(toEmail, task) {
  const mailOptions = {
    from: `"Smart TaskFlow" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Reminder: "${task.title}" is due tomorrow`,
    html: `
      <div style="font-family: sans-serif; padding: 16px;">
        <h2>Task Reminder</h2>
        <p>Your task <strong>${task.title}</strong> is due tomorrow (${new Date(task.due_date).toDateString()}).</p>
        ${task.description ? `<p>${task.description}</p>` : ""}
        <p>— Smart TaskFlow</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}
export async function sendResetPasswordEmail(toEmail, resetLink) {
  const mailOptions = {
    from: `"Smart TaskFlow" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "Reset your Smart TaskFlow password",
    html: `
      <div style="font-family: sans-serif; padding: 16px;">
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <p><a href="${resetLink}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Reset Password</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}