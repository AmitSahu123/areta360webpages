const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Add debugging before loading .env
console.log('Current working directory:', process.cwd());
const envPath = path.join(process.cwd(), '.env');
console.log('Looking for .env file in:', envPath);

// Check if .env file exists
if (fs.existsSync(envPath)) {
  console.log('.env file exists');
  console.log('File contents:', fs.readFileSync(envPath, 'utf8'));
} else {
  console.log('.env file does not exist');
}

// Load environment variables with explicit path
require('dotenv').config({ path: envPath });

// Debug environment variables
console.log('\nEnvironment variables loaded:');
console.log('EMAIL:', process.env.EMAIL);
console.log('PASSWORD:', process.env.PASSWORD ? '****' : 'not set');
console.log('HR_EMAIL:', process.env.HR_EMAIL);
console.log('HR_PASSWORD:', process.env.HR_PASSWORD ? '****' : 'not set');
console.log('PROXY_EMAIL:', process.env.PROXY_EMAIL);
console.log('PROXY_PASSWORD:', process.env.PROXY_PASSWORD ? '****' : 'not set');
console.log('PORT:', process.env.PORT);

const app = express();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Create a transporter for admin (default)
const adminTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.PROXY_EMAIL || process.env.EMAIL,
    pass: process.env.PROXY_PASSWORD || process.env.PASSWORD
  }
});

// Create a transporter for HR
const hrTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.PROXY_EMAIL || process.env.HR_EMAIL,
    pass: process.env.PROXY_PASSWORD || process.env.HR_PASSWORD
  }
});

// Verify transporter configuration
adminTransporter.verify(function(error, success) {
  if (error) {
    console.log('Admin transporter error:', error);
  } else {
    console.log('Admin transporter is ready to send emails');
  }
});

hrTransporter.verify(function(error, success) {
  if (error) {
    console.log('HR transporter error:', error);
  } else {
    console.log('HR transporter is ready to send emails');
  }
});

// Debug transporter configuration
console.log('\nAdmin transporter configuration:');
console.log('User:', adminTransporter.options.auth.user);
console.log('Pass:', adminTransporter.options.auth.pass ? '****' : 'not set');

// Email submission tracking - limit 3 submissions per email with 24-hour reset
const emailSubmissions = new Map(); // { email: { count: number, firstSubmission: Date } }

// Function to check and update email submission count with 24-hour reset
function checkEmailLimit(email) {
  const now = new Date();
  const submission = emailSubmissions.get(email);
  
  // If no previous submissions or 24 hours have passed, reset
  if (!submission || (now - submission.firstSubmission) > 24 * 60 * 60 * 1000) {
    emailSubmissions.set(email, { count: 1, firstSubmission: now });
    console.log(`🆕 New email or 24h reset: ${email} - 1/3 submissions`);
    return { allowed: true, remaining: 2 };
  }
  
  const currentCount = submission.count;
  console.log(`🔍 Checking email limit for: ${email}, current count: ${currentCount}`);
  
  if (currentCount >= 3) {
    const timeLeft = 24 * 60 * 60 * 1000 - (now - submission.firstSubmission);
    const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
    console.log(`❌ LIMIT EXCEEDED: ${email} has submitted ${currentCount} times. Reset in ${hoursLeft} hours`);
    return { allowed: false, remaining: 0, hoursUntilReset: hoursLeft };
  }
  
  // Update count
  submission.count = currentCount + 1;
  emailSubmissions.set(email, submission);
  console.log(`✅ Email limit updated: ${email} now has ${submission.count}/3 submissions`);
  
  return { allowed: true, remaining: 3 - submission.count };
}

// Debug function to show all email counts with time info
function showAllEmailCounts() {
  console.log('📊 Current email submission counts:');
  const now = new Date();
  for (const [email, submission] of emailSubmissions.entries()) {
    const timeElapsed = now - submission.firstSubmission;
    const hoursElapsed = Math.floor(timeElapsed / (60 * 60 * 1000));
    const hoursLeft = Math.max(0, 24 - hoursElapsed);
    console.log(`   ${email}: ${submission.count}/3 (${hoursLeft}h until reset)`);
  }
}

// API Routes
app.post('/api/career-form', upload.single('resume'), async (req, res) => {
  console.log('Received career form submission:', req.body);
  console.log('File:', req.file);
  
  const { name, email, phone, message } = req.body;
  const resumePath = req.file ? req.file.path : null;

  // Check email submission limit
  const emailCheck = checkEmailLimit(email);
  if (!emailCheck.allowed) {
    console.log(`❌ Email limit exceeded for: ${email}`);
    // Clean up uploaded file if limit exceeded
    if (resumePath) {
      fs.unlink(resumePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    const resetMessage = emailCheck.hoursUntilReset ? 
      ` You can submit again in ${emailCheck.hoursUntilReset} hours.` : 
      ' You can submit again after 24 hours.';
    return res.status(429).json({ 
      message: `You have reached the maximum limit of 3 applications per email address.${resetMessage}`,
      error: 'EMAIL_LIMIT_EXCEEDED',
      hoursUntilReset: emailCheck.hoursUntilReset
    });
  }

  console.log(`📧 Email submission count for ${email}: ${emailSubmissions.get(email).count}/3 (${emailCheck.remaining} remaining)`);

  // Show all email counts for debugging
  showAllEmailCounts();

  // Log email configuration
  const proxyEmail = process.env.PROXY_EMAIL || process.env.HR_EMAIL;
  const hrEmail = 'hr@areta360.com'; // Send TO this email
  console.log('📧 Email Configuration:');
  console.log('   From:', proxyEmail);
  console.log('   To:', hrEmail);
  console.log('   Using proxy email:', !!process.env.PROXY_EMAIL);

  const mailOptions = {
    from: proxyEmail, // Send FROM proxy email
    to: hrEmail, // Send TO hr@areta360.com
    subject: 'New Career Application',
    html: `
      <h2>New Career Application</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Message:</strong> ${message}</p>
      ${resumePath ? `<p><strong>Resume:</strong> Attached</p>` : ''}
    `,
    attachments: resumePath ? [{ path: resumePath }] : []
  };

  try {
    console.log('🚀 Attempting to send email via HR transporter...');
    const info = await hrTransporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('   Email sent to:', hrEmail);
    console.log('   Next step: Check', hrEmail, 'inbox');
    
    // Clean up uploaded file after sending email
    if (resumePath) {
      fs.unlink(resumePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(200).json({ message: 'Application submitted successfully' });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    
    // Clean up uploaded file if email fails
    if (resumePath) {
      fs.unlink(resumePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(500).json({ 
      message: 'Error submitting application',
      error: error.message 
    });
  }
});

// Additional route without /api prefix for frontend compatibility
app.post('/career-form', upload.single('resume'), async (req, res) => {
  console.log('Received career form submission (no /api):', req.body);
  console.log('File:', req.file);
  
  const { name, email, phone, message } = req.body;
  const resumePath = req.file ? req.file.path : null;

  // Check email submission limit
  const emailCheck = checkEmailLimit(email);
  if (!emailCheck.allowed) {
    console.log(`❌ Email limit exceeded for: ${email}`);
    // Clean up uploaded file if limit exceeded
    if (resumePath) {
      fs.unlink(resumePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    const resetMessage = emailCheck.hoursUntilReset ? 
      ` You can submit again in ${emailCheck.hoursUntilReset} hours.` : 
      ' You can submit again after 24 hours.';
    return res.status(429).json({ 
      message: `You have reached the maximum limit of 3 applications per email address.${resetMessage}`,
      error: 'EMAIL_LIMIT_EXCEEDED',
      hoursUntilReset: emailCheck.hoursUntilReset
    });
  }

  console.log(`📧 Email submission count for ${email}: ${emailSubmissions.get(email).count}/3 (${emailCheck.remaining} remaining)`);

  // Show all email counts for debugging
  showAllEmailCounts();

  // Log email configuration
  const proxyEmail = process.env.PROXY_EMAIL || process.env.HR_EMAIL;
  const hrEmail = 'hr@areta360.com'; // Send TO this email
  console.log('📧 Email Configuration:');
  console.log('   From:', proxyEmail);
  console.log('   To:', hrEmail);
  console.log('   Using proxy email:', !!process.env.PROXY_EMAIL);

  const mailOptions = {
    from: proxyEmail, // Send FROM proxy email
    to: hrEmail, // Send TO hr@areta360.com
    subject: 'New Career Application',
    html: `
      <h2>New Career Application</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Message:</strong> ${message}</p>
      ${resumePath ? `<p><strong>Resume:</strong> Attached</p>` : ''}
    `,
    attachments: resumePath ? [{ path: resumePath }] : []
  };

  try {
    console.log('🚀 Attempting to send email via HR transporter...');
    const info = await hrTransporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('   Email sent to:', hrEmail);
    console.log('   Next step: Check', hrEmail, 'inbox');
    
    // Clean up uploaded file after sending email
    if (resumePath) {
      fs.unlink(resumePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(200).json({ message: 'Application submitted successfully' });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    
    // Clean up uploaded file if email fails
    if (resumePath) {
      fs.unlink(resumePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(500).json({ 
      message: 'Error submitting application',
      error: error.message 
    });
  }
});

app.post('/api/blog-form', async (req, res) => {
  console.log('Received blog form submission:', req.body);
  
  const { name, email, phone, message } = req.body;

  // Check email submission limit
  const emailCheck = checkEmailLimit(email);
  if (!emailCheck.allowed) {
    console.log(`❌ Email limit exceeded for: ${email}`);
    const resetMessage = emailCheck.hoursUntilReset ? 
      ` You can submit again in ${emailCheck.hoursUntilReset} hours.` : 
      ' You can submit again after 24 hours.';
    return res.status(429).json({ 
      message: `You have reached the maximum limit of 3 messages per email address.${resetMessage}`,
      error: 'EMAIL_LIMIT_EXCEEDED',
      hoursUntilReset: emailCheck.hoursUntilReset
    });
  }

  console.log(`📧 Email submission count for ${email}: ${emailSubmissions.get(email).count}/3 (${emailCheck.remaining} remaining)`);

  // Show all email counts for debugging
  showAllEmailCounts();

  // Log email configuration
  const proxyEmail = process.env.PROXY_EMAIL || process.env.EMAIL;
  const adminEmail = 'admin@areta360.com'; // Send TO this email
  console.log('📧 Email Configuration:');
  console.log('   From:', proxyEmail);
  console.log('   To:', adminEmail);
  console.log('   Using proxy email:', !!process.env.PROXY_EMAIL);

  const mailOptions = {
    from: proxyEmail, // Send FROM proxy email
    to: adminEmail, // Send TO admin@areta360.com
    subject: 'New Business Connect: Join the Conversation',
    html: `
      <h2>New Business Connect: Join the Conversation</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Message:</strong> ${message}</p>
    `
  };

  try {
    console.log('🚀 Attempting to send email...');
    const info = await adminTransporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('   Email sent to:', adminEmail);
    console.log('   Next step: Check', adminEmail, 'inbox');
    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    res.status(500).json({ 
      message: 'Error sending message',
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Check email submission count endpoint
app.get('/api/email-limit/:email', (req, res) => {
  const email = req.params.email;
  const submission = emailSubmissions.get(email);
  const now = new Date();
  
  if (!submission) {
    return res.status(200).json({
      email: email,
      submitted: 0,
      remaining: 3,
      limit: 3,
      canSubmit: true,
      hoursUntilReset: null
    });
  }
  
  const timeElapsed = now - submission.firstSubmission;
  const hoursElapsed = Math.floor(timeElapsed / (60 * 60 * 1000));
  const hoursLeft = Math.max(0, 24 - hoursElapsed);
  
  // If 24 hours have passed, reset
  if (hoursLeft === 0) {
    emailSubmissions.delete(email);
    return res.status(200).json({
      email: email,
      submitted: 0,
      remaining: 3,
      limit: 3,
      canSubmit: true,
      hoursUntilReset: null
    });
  }
  
  const remaining = Math.max(0, 3 - submission.count);
  
  res.status(200).json({
    email: email,
    submitted: submission.count,
    remaining: remaining,
    limit: 3,
    canSubmit: remaining > 0,
    hoursUntilReset: hoursLeft
  });
});

// Reset email counts endpoint (for testing)
app.post('/api/reset-email-limits', (req, res) => {
  emailSubmissions.clear();
  console.log('🔄 Email submission counts reset');
  showAllEmailCounts();
  res.status(200).json({ message: 'Email submission counts reset successfully' });
});

// Show all email counts endpoint
app.get('/api/all-email-counts', (req, res) => {
  const counts = {};
  for (const [email, submission] of emailSubmissions.entries()) {
    counts[email] = submission.count;
  }
  res.status(200).json(counts);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Email configurations:', {
    admin: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD ? '****' : 'not set'
    },
    hr: {
      user: process.env.HR_EMAIL,
      pass: process.env.HR_PASSWORD ? '****' : 'not set'
    }
  });
}); 