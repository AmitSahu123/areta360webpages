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
    user: process.env.EMAIL,
    pass: process.env.PASSWORD
  }
});

// Create a transporter for HR
const hrTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.HR_EMAIL,
    pass: process.env.HR_PASSWORD
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

// API Routes
app.post('/api/career-form', upload.single('resume'), async (req, res) => {
  console.log('Received career form submission:', req.body);
  console.log('File:', req.file);
  
  const { name, email, phone, message } = req.body;
  const resumePath = req.file ? req.file.path : null;

  const mailOptions = {
    from: process.env.HR_EMAIL,
    to: process.env.HR_EMAIL,
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
    console.log('Attempting to send email via HR transporter...');
    const info = await hrTransporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.response);
    
    // Clean up uploaded file after sending email
    if (resumePath) {
      fs.unlink(resumePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(200).json({ message: 'Application submitted successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    
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

  const mailOptions = {
    from: process.env.EMAIL,
    to: process.env.EMAIL,
    subject: 'New Blog Contact Form Submission',
    html: `
      <h2>New Blog Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Message:</strong> ${message}</p>
    `
  };

  try {
    console.log('Attempting to send email...');
    const info = await adminTransporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.response);
    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
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

const PORT = process.env.PORT || 5000;
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