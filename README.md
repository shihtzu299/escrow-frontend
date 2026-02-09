## AfriLance Escrow – Decentralized escrow for stablecoin freelance payments on Base Sepolia & BNB Testnet. Set terms, lock funds, and settle securely.

**Empowering African talent and global clients with secure, transparent, and innovative freelance tools.**

AfriLlance provides secure payments and instant paylinks for the on-chain economy. Send, receive, and protect stablecoin payments across Base and BNB Chain. Whether you need trusted escrow for freelance payments or simple links for everyday funds transfer. It combines:

- **AfriLance Escrow** — secure on-chain payments using USDT/USDC with revision cycles, IPFS proofs, and oracle-mediated disputes.
- **Afrilance Paylinks** is a decentralized payment link system built on Base that enables instant stablecoin payments through simple, shareable links.
- **Blockchain foundation** — trustless, low-fee infrastructure on BNB Chain & Base.

Live on TESTNET (Escrow flow works fine, but lacks some backend functionality for now): [https://afrilance.xyz ](https://testnet.afrilance.xyz/) 
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
To become the leading on-chain work and payments infrastructure for Africa and emerging markets.

**Mission**
To provide simple, decentralized, secure, and accessible financial tools that empower individuals and businesses globally.

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
