Base Beast Passport 🧟‍♂️
Base Beast Passport is an onchain activity passport for the Base network.

Each wallet gets a dynamic onchain “Beast profile” made of:

•	a Beast Score (0–100) derived from real onchain metrics; and
•	a Base Beast NFT where every visual trait of the monster is tied 1‑to‑1 to those metrics.

•	MVP currently supports:
•	live data from Base mainnet (Blockscout + Moralis Web3 API);
•	offchain multi‑metric score calculation in a Node/Express backend;
•	an onchain BeastScoreRegistry contract on Base with compact tier storage;
•	an ERC‑721 BaseBeastNFT that snapshots the current score at mint time;
•	a React/Vite dApp that displays the live Beast profile, visual slots, and onchain snapshot NFT metadata;
•	a visual layer wired to metric tiers (icons + optional spin animations per trait).
Scoring model
The scoring model is built around 10 metrics. Each metric is mapped into a tier from 0 to 5. All tiers together produce an overall tier (0–5) and an overall Beast Score (0–100).
Core metrics
`activity_days` – number of unique days with at least one transaction on Base; sourced from Base Blockscout / Etherscan API (tx history).
`tx_count` – total number of outgoing transactions (from == wallet); also from Blockscout / Etherscan API.
`gas_spent` – total gasUsed × gasPrice over successful outgoing transactions, summed in ETH.
DeFi metrics
`defi_swaps` – number of DeFi swaps; Moralis `GET /wallets/{address}/swaps` on chain=base.
`defi_volume` – total USD volume across swaps on Base (sum of totalValueUsd). Roadmap: extend to include bridges + LP / lending / borrowing / staking volume.
`liquidity_yield` – current MVP uses `total_usd_value + total_unclaimed_usd_value` from Moralis `GET /wallets/{address}/defi/summary`. Roadmap: upgrade to a time‑weighted liquidity metric Σ (liquidityUSD_position × days_held).
Reputation metrics (MVP)
`builder` – Builder Score (0–100 → 0–5 tier). Currently comes from a manual override / map in `server.js` or from `.env` (`MANUAL_BUILDER_SCORE`). Roadmap: connect to real builder reputation / contribution sources.
`social` – Social Score (0–100 → 0–5 tier). Also manually controlled in `server.js` or via `.env` (`MANUAL_SOCIAL_SCORE`). Roadmap: connect to social / community reputation signals.
KYC metric (Coinbase verified)
`coinbase_verified` – binary KYC / identity signal (0 or 1 raw → tier 0 or 5). For MVP this is read from `.env` as a list of verified addresses (`COINBASE_VERIFIED_ADDRESSES` or `COINBASE_VERIFIED_WALLETS`). If the wallet is in the list, `coinbaseTier = 5`, otherwise `0`. Roadmap: replace the env list with real Coinbase / Guild / Base Names or similar identity sources.
NFT / collection metric
`nft_mints` – number of NFT mints on Base for the wallet: `from_address == 0x0`, `to_address == wallet`, with `exclude_spam=true` in Moralis NFT transfers API. Unique tokens (contract + token_id) are counted.

From these metrics the backend derives:
•	`scores.tiers` – per‑metric tiers (0–5) for all 10 metrics;
•	`scores.overall.tier` – average tier across all metrics, clamped to 0–5;
•	`scores.overall.score` – normalized 0–100 Beast Score.
Beast preview (visual avatar)
The backend returns a `beast_preview` object that maps metric tiers into visual slots of the monster. This is the bridge between raw data and art / 3D.
•	Metric → slot mapping:
•	`size` ← `activity_days` (overall body size / presence);
•	`muscles` ← `tx_count` (muscle / physique);
•	`weapon` ← `defi_swaps` (DeFi activity weapon);
•	`shield` ← `liquidity_yield` (liquidity / yield shield);
•	`armor` ← `builder` (builder armor set);
•	`neck_medallion` ← `nft_mints` (NFT collector medallion);
•	`helmet` ← `social` (social / voice headgear);
•	`ring` ← `gas_spent` (gas‑forged ring);
•	`boots` ← `defi_volume` (DeFi journey boots);
•	`earring` ← `coinbase_verified` (KYC / identity sigil).

User type:
•	`Builder` if `builderTier ≥ 4`;
•	`Influencer` if `socialTier ≥ 4`;
•	`User` otherwise.
Visual traits are configured in `frontend/src/config/beast_visual_config.json` via `icon_key` values per slot/tier. The dApp resolves them to static assets under `frontend/public/assets/{slot}/{icon_key}.png` and optional spin animations `{icon_key}_spin.mp4`.
Architecture
•	High‑level structure:
•	`backend/` – Express + Node.js scoring engine and metadata API;
•	`contracts/` – Solidity contracts on Base mainnet;
•	`frontend/` – React + Vite dApp for the Beast Passport UI;
•	`scripts/` – deployment, score push, debug, mint helpers.
Backend (`backend/server.js`)
The backend is responsible for:
•	fetching live metrics from Blockscout / Etherscan and Moralis;
•	applying manual overrides for Builder / Social scores and env‑based Coinbase verification;
•	mapping raw values → tiers → overall score;
•	building the Beast profile (`scores`, `tiers`, `metrics`, `beast_preview`);
•	exposing onchain‑aware NFT metadata for each minted Beast.
Main endpoints:
•	`GET /` – healthcheck.
•	`GET /api/wallet/:address/score` – builds and returns the full Beast profile for a wallet;
•	`POST /api/wallet/:address/push-onchain` – pulls the latest score from the backend and writes it into `BeastScoreRegistry` on Base using an oracle key;
•	`GET /api/wallet/:address/beast-nft` – detects whether the wallet owns a Base Beast NFT (via Moralis NFT API) and returns basic info;
•	`GET /api/beast/:tokenId/metadata` – dynamic NFT metadata endpoint. Reads the onchain BeastScore for the owner of `tokenId`, converts tiers into attributes (including Coinbase Verified Tier / flag), and returns OpenSea‑compatible JSON.
Smart contracts
**BeastScoreRegistry.sol**
Stores a compact `BeastScore` struct with 11 `uint8` fields per address:
•	activityDaysTier, txCountTier, defiSwapsTier, liquidityTier, builderTier, nftMintsTier, socialTier, gasSpentTier, defiVolumeTier, coinbaseTier, overallTier.
•	Key functions:
•	`setScore(address user, BeastScore score)` – called by a score oracle (offchain backend key);
•	`getScore(address user)` – read‑only view returning the full struct.

**BaseBeastNFT.sol**
ERC‑721 that mints one Base Beast NFT per wallet. On mint:
•	reads the user’s `BeastScore` from `BeastScoreRegistry`;
•	snapshots all tiers into an internal mapping for the new `tokenId`;
•	mints the NFT to the caller.
NFT metadata is served offchain by the backend, but is always consistent with the onchain snapshot.
Frontend dApp (`frontend/`)
The dApp is a small React + Vite application that talks to the backend and, when needed, directly to the Base network via `ethers`.
•	Current features:
•	connect or paste a Base wallet address;
•	call `/api/wallet/:address/score` and render live Beast Score, tiers and metrics;
•	visualize each slot (weapon, armor, boots, earring, etc.) with 2D icons and optional spin animations based on `beast_visual_config.json`;
•	load the onchain BeastScore from the registry via the user’s browser wallet;
•	trigger an onchain mint of the Base Beast NFT via `mintFromScore()`;
•	call `/api/wallet/:address/push-onchain` to push a fresh score from backend → registry;
•	auto‑detect an existing Base Beast NFT for the wallet and display `/api/beast/:tokenId/metadata` snapshot.
Scripts
Helper scripts (TypeScript / Node):
•	`deployBeastScoreRegistry.ts` – deploys the registry to Base;
•	`deployBaseBeastNFT.ts` – deploys the NFT contract;
•	`pushBeastScore.mjs` – fetches score from backend and calls `setScore` on the registry;
•	`debugRegistry.mjs` – reads and pretty‑prints an address’s onchain BeastScore;
•	`mintBeast.mjs` – mints a Base Beast NFT using the current onchain score.
Environment & configuration
Example `.env` (root of the project):
RPC_URL=https://mainnet.base.org

MORALIS_API_KEY=...
ETHERSCAN_API_KEY=...

# Manual overrides for reputation metrics (optional)
MANUAL_BUILDER_SCORE=65
MANUAL_SOCIAL_SCORE=30

# Coinbase KYC / identity MVP (comma‑separated list of wallets)
COINBASE_VERIFIED_ADDRESSES=0xabc...,0xdef...
# or
COINBASE_VERIFIED_WALLETS=0xabc...,0xdef...

# Backend → Base RPC for oracle pushes
BASE_RPC_URL=https://mainnet.base.org
SCORE_ORACLE_PRIVATE_KEY=0x...

# Deployed contracts
BEAST_REGISTRY_ADDRESS=0x...
BEAST_NFT_ADDRESS=0x...

# Backend base URL (used by frontend + internal calls)
BEAST_BACKEND_URL=http://localhost:4000

Roadmap
•	Short‑ and mid‑term items:
•	Replace manual Builder / Social scores with real external reputation sources (builder activity, contributions, social graphs).
•	Upgrade `defi_volume` to include bridges, LP volume, lending, borrowing and staking, not just swaps.
•	Upgrade `liquidity_yield` from current snapshot TVL → full USD×days time‑weighted liquidity metric.
•	Audit coverage of DeFi protocols that may not be visible in Moralis (e.g. Morpho and others) and design fallbacks or custom indexers.
•	Replace env‑based Coinbase verification with proper KYC / identity integrations (Coinbase, Guild, Base Names or similar).
•	Iterate on the 2D visual system and progressively move toward a fully rigged 3D Beast model with attachable / detachable items for each slot.
•	Ship a polished public dApp: connect wallet → see Beast → interact (mint, upgrade, share).
•	Explore partner dashboards, segmentation and analytics tools based on Beast tiers.
Related repos
🎓 Base Playground – learning sandbox for Base & Solidity:
https://github.com/KaanBagnyuk/base-playground
