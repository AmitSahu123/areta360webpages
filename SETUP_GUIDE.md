# Proxy Email Setup Guide

## Your Proxy Email: areta360technologies@gmail.com

### Step 1: Set Up Gmail Account
1. **Enable 2-Factor Authentication** on `areta360technologies@gmail.com`
2. **Generate App Password**:
   - Go to Google Account Settings → Security → App Passwords
   - Generate password for "Mail"
   - Copy the 16-character password

### Step 2: Set Up Email Forwarding
1. **Log into** `areta360technologies@gmail.com`
2. **Go to Settings** → Forwarding and POP/IMAP
3. **Add forwarding addresses**:
   - Add your real admin email (for blog contact forms)
   - Add your real HR email (for career applications)
4. **Verify forwarding** by clicking the verification links sent to your real emails

### Step 3: Create .env File
Create a `.env` file in the backend directory with:

```env
# Original Email Configuration (keep these as fallback)
EMAIL=your-real-email@gmail.com
PASSWORD=your-real-app-password
HR_EMAIL=your-real-hr-email@gmail.com
HR_PASSWORD=your-real-hr-app-password

# Proxy Email Configuration
PROXY_EMAIL=areta360technologies@gmail.com
PROXY_PASSWORD=your-16-character-app-password

# Server Configuration
PORT=3000
```

### Step 4: Test the System
1. **Start your server**: `npm start`
2. **Submit test forms** from your website
3. **Check emails** arrive at your real email addresses
4. **Verify sender** shows `areta360technologies@gmail.com`

## How It Works

### Career Form Submissions:
- **Sent to**: `areta360technologies@gmail.com`
- **Forwarded to**: Your real HR email
- **URL**: Unchanged - same API endpoint

### Blog Contact Form:
- **Sent to**: `areta360technologies@gmail.com`
- **Forwarded to**: Your real admin email
- **URL**: Unchanged - same API endpoint

## Benefits
- ✅ **Professional email**: `areta360technologies@gmail.com`
- ✅ **Real emails hidden**: Not exposed in website code
- ✅ **URLs unchanged**: Same API endpoints work
- ✅ **Single proxy email**: Easy to manage
- ✅ **Automatic forwarding**: To appropriate real emails

## Troubleshooting
- **Authentication error**: Check app password is correct
- **Emails not forwarding**: Verify forwarding settings in Gmail
- **Spam issues**: Check spam/junk folders 