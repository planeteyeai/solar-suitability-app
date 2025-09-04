# Solar Suitability Backend

Backend API for the Solar Suitability Analyzer application.

## Environment Variables Required

Before deploying to Vercel, you need to set up the following environment variables in your Vercel dashboard:

### Google Earth Engine Credentials

1. **GOOGLE_PROJECT_ID** - Your Google Cloud Project ID
2. **GOOGLE_PRIVATE_KEY_ID** - Private key ID from your service account
3. **GOOGLE_PRIVATE_KEY** - The private key (keep quotes and \n characters)
4. **GOOGLE_CLIENT_EMAIL** - Service account email
5. **GOOGLE_CLIENT_ID** - Client ID from your service account

### How to Get These Values

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Earth Engine API
4. Go to IAM & Admin > Service Accounts
5. Create a new service account or use existing
6. Generate a new JSON key
7. Download the JSON file and extract the values

### Setting Up Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings > Environment Variables
4. Add each variable with the corresponding value from your credentials.json

**Important for GOOGLE_PRIVATE_KEY:**

- Copy the entire private key including the quotes
- Keep the `\n` characters as they are
- Example: `"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"`

## Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set the environment variables in Vercel dashboard
4. Deploy

## Local Development

1. Copy `env.example` to `.env`
2. Fill in your actual values
3. Run `npm install`
4. Run `npm start` or `npm run dev`

## API Endpoints

- `GET /` - Health check
- `POST /api/analyze` - Analyze solar suitability for a given geometry
