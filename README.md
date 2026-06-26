# WorldApp Next Wallet 🌍💼

A cutting-edge Web3 MiniApp architecture tailored for seamless **WorldApp** integration. This repository serves as a powerful, real-time data dashboard and digital wallet interface, leveraging the latest WorldID SDK (`@worldcoin/minikit-js`) for decentralized, secure identity verification.

## 🚀 Key Features

- **WorldID Authentication:** Fully integrated `walletAuth` using Worldcoin's MiniKit for fast, privacy-preserving identity verification.
- **Real-Time Intelligence Dashboard:** High-performance data pipelines processing live feeds for financial, geopolitical, and blockchain metrics.
- **Web3 Ready:** Built with `viem` and modern Ethereum tooling, optimized for the World Chain ecosystem.
- **Robust Frontend Architecture:** A scalable Single Page Application (SPA) built with Vite and Next-generation React paradigms.
- **Mobile-First Design:** Fully responsive interface specifically optimized for the WorldApp WebView environment.
- **Modular Services:** Domain-driven design isolating business logic, external API integrations, and layout layers.

## 🛠 Technology Stack

- **Framework:** Vite + React (TypeScript)
- **Web3 Integration:** `@worldcoin/minikit-js`, `viem`
- **State & Data Fetching:** Custom DataLoader, Redis Caching (Upstash)
- **Styling:** Vanilla CSS + CSS Modules / Variables (Tailwind-ready)
- **Backend/API:** Vercel Edge Functions (Serverless) + Node.js background workers

## 📦 Project Structure

```text
.
├── src/                    # Frontend SPA Application
│   ├── app/                # Orchestration & data-loaders
│   ├── components/         # UI Panels & Web3 components
│   ├── config/             # Environment & variant configurations
│   ├── services/           # Business logic & API fetching
│   └── voidnext.ts         # Core WorldID/MiniKit initialization
├── api/                    # Vercel Edge Functions (Serverless APIs)
├── server/                 # Shared server-side logic & caching
├── docker/                 # Production Docker configuration & Nginx
└── docker-compose.yml      # Local and Production Compose orchestration
```

## 🔐 WorldID MiniKit Integration

This application initializes the Worldcoin MiniKit to facilitate the verification handshake. By leveraging `app_staging_f023f8` (or your specific App ID) and the native `MiniKit.walletAuth()` method, it bypasses legacy constraints, ensuring a robust connection between your MiniApp and the WorldApp native shell.

## ⚙️ Local Development

### Prerequisites
- Node.js (v22+ recommended)
- npm or pnpm
- Docker & Docker Compose (optional, for running the full stack with Redis)

### Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Configuration:**
   Copy the example environment file and add your required API keys.
   ```bash
   cp .env.example .env
   ```

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```

4. **Start Full Stack (with Redis cache):**
   ```bash
   docker compose up -d --build
   ```

## 🚢 Deployment

The project is structured to deploy smoothly on **Vercel** (for the Edge API and static frontend) or via **Docker** on any standard VPS.

### Docker Production Build
To build and run the production container:
```bash
docker build -t worldapp-next-wallet .
docker run -d -p 8080:8080 worldapp-next-wallet
```

## 🛡 Security & Verification

This project has been heavily audited to comply with the World App Developer guidelines:
- Zero dependency on local lockfiles for Alpine builds (`viem` pinned directly).
- Adheres to standard Web3 CSP policies.
- Encrypted and cached API proxying.

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
