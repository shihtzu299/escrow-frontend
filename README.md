# AfriLance – Decentralized Freelance Ecosystem for Africa
TESTNET

**Empowering African talent and global clients with secure, transparent, and innovative freelance tools.**

AfriLance is a full-stack decentralized platform built to solve trust, payment, and matching issues in freelance work across Africa and beyond. It combines:

- **AfriLance Escrow** — secure on-chain payments using USDT/USDC with revision cycles, IPFS proofs, and oracle-mediated disputes.
- **Upcoming Gigs Marketplace** — AI-powered job matching, profiles, ratings, and end-to-end freelance collaboration.
- **Blockchain foundation** — trustless, low-fee infrastructure on BNB Chain & Base.

Live (Escrow flow works fine, but lacks some backend functionality for now): https://afrilance.xyz  
X: [@AfriLanceHQ](https://x.com/AfriLanceHQ)  
Telegram Community: https://t.me/AfriLanceCommunity
Farcaster: [@AfriLanceHQ](https://farcaster.xyz/AfriLanceHQ)
Youtube: https://youtube.com/@AfriLanceTube
Backend Git Repo: https://github.com/shihtzu299

## Key Features

- Multi-chain support: BNB Testnet + Base Sepolia (mainnet coming)
- Stablecoin escrow payments (USDT/USDC) with per-escrow token locking
- UMA OO V3 oracle for disputes (live on Base Sepolia)
- Multisig address oracle for disputes on BNB Testnet (Chainlink keeper on Mainnet)
- Strict IPFS proof validation (59-char CID) + in-app visibility for client/freelancer
- Revision messages readable in-app (no Telegram dependency)
- Supabase-powered "My Escrows" history tab
- Real-time Telegram notifications (deposits, submissions, approvals, disputes)
- Clean UX: collapsible Pinata IPFS guide, auto-refresh after actions, wrong-chain warnings
- Safe fee handling to burn/treasury dead address (0.002 BNB / 0.00058 ETH)
- WalletConnect + MetaMask support with deep-link fallback

## Supported Networks & Contracts

| Network         | Chain ID | Status     | Platform Fee       | Oracle              | Explorer Link                     | Factory Address                          |
|-----------------|----------|------------|--------------------|---------------------|-----------------------------------|------------------------------------------|
| BNB Testnet     | 97       | Live       | 0.002 BNB          | Multisig Address   | https://testnet.bscscan.com       | 0xbc389c697272B375FbE0f6917D3B4327391a74ec |
| Base Sepolia    | 84532    | Live       | 0.00058 ETH        | UMA OO V3           | https://sepolia.basescan.org      | 0xf4cf3C25F45Aa66cD7130a98788c907d44855761 |
| BNB Mainnet     | 56       | Planned    | 0.002 BNB          | Chainlink (planned) | https://bscscan.com               | [Placeholder – to be updated]      |
| Base Mainnet    | 8453     | Planned    | 0.00058 ETH        | UMA OO V3           | https://basescan.org              | [Placeholder – to be updated]            |

**Settlement Tokens**  
- USDT/USDC on both testnets (6 decimals on Base, 18 on BNB)  
- Escrow contracts deployed dynamically per job

## Tech Stack

**Frontend**  
- React + Vite + TypeScript  
- viem / wagmi (wallet & contract interactions)  
- Tailwind CSS + Heroicons  
- react-hot-toast (notifications)  
- Supabase (escrow history indexing)

**Backend & Automation**  
- Node.js + TypeScript  
- ethers.js v6 (event listener)  
- Telegraf (Telegram bot)  
- Supabase (database indexing)

**Smart Contracts**  
- Solidity ^0.8.20  
- OpenZeppelin libraries  
- Remix IDE for deployment 

**Storage**  
- IPFS via Pinata (proofs & revisions)

**Security & Audits**
- All contracts use OpenZeppelin secure libraries.
- Treasury address is burn-ready dead address (no stuck funds).
- Backend keys and sensitive data excluded from repo.
- Audit planned before mainnet launch.

**Project Vision**
AfriLance aims to bring financial inclusion, trust, and efficiency to freelance work across Africa by replacing centralized platforms with blockchain-based escrow, AI matching, and transparent collaboration tools.

**License** 
MIT

## Setup

```bash
git clone https://github.com/[your-username]/afrilance-frontend.git
cd afrilance-frontend
npm install
cp .env.example .env
# Fill .env: VITE_RPC_URL, VITE_FACTORY, VITE_USDT, VITE_USDC, VITE_WC_PROJECT_ID, etc.
npm run dev
