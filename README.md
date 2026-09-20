# Silegal - Pengelola Kontrak & IO

A comprehensive contract management application built with React, Node.js, and AI.

## Features
- **Modern UI:** Built with React, Tailwind CSS, and Framer Motion.
- **Authentication:** Secure user authentication powered by Clerk.
- **Backend:** Express.js server providing robust API endpoints.
- **AI Integration:** Leveraging the Google Gemini API for intelligent contract processing and management.
- **Database:** Firebase integration.

## Prerequisites

- Node.js (v18 or higher recommended)
- `npm` or `bun`

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd pengelola-kontrak-&-io
```

### 2. Install Dependencies

Install all necessary packages using npm:

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory (you can copy from `.env.example` if available) and add your necessary environment variables:

```env
GEMINI_API_KEY=your_gemini_api_key
```

### 4. Run the Development Server

Start the Vite development server and Express backend concurrently:

```bash
npm run dev
```

The application will typically run on `http://localhost:5173`.

## Build for Production

To create a production build of the frontend and backend:

```bash
npm run build
```

To start the production server:

```bash
npm start
```

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Lucide React, Framer Motion
- **Backend:** Node.js, Express, TypeScript, Google Gen AI SDK
- **Auth:** Clerk
- **Database/Cloud:** Firebase

## License
MIT
