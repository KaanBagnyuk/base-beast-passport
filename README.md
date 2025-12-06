README: base-beast-passport
# Base Beast Passport 🧟‍♂️

**Base Beast Passport** is an onchain activity passport for the **Base** network.

Each wallet gets:

- a **Beast Score** (0–100) derived from real onchain metrics, and  
- the ability to mint a **Base Beast NFT**, where every visual trait of the monster is tied to those metrics.

The MVP already:

- pulls live data from Base mainnet (via Moralis + Blockscout),
- computes a multi-metric score offchain,
- pushes the score into an onchain registry on Base,
- mints an ERC‑721 NFT that snapshots the score at mint time.

---

## Scoring model

The scoring model is built around **9 metrics**; each one is mapped into a tier from **0 to 5**.

### Core metrics

- `activity_days` – days with at least one tx on Base  
- `tx_count` – total outgoing txs  
- `gas_spent` – total gas used * gas price (ETH)

### DeFi metrics

- `defi_swaps` – number of DeFi swaps (Moralis `/wallets/{address}/swaps`)  
- `defi_volume` – total USD volume across swaps  
- `liquidity_yield` – `total_usd_value + total_unclaimed_usd_value`
  from Moralis `/wallets/{address}/defi/summary`

### Reputation metrics (MVP)

- `builder` – Builder Score (0–100 → 0–5), currently from a manual map in `server.js`  
- `social` – Social Score (0–100 → 0–5), also from the manual map

### NFT metric

- `nft_mints` – count of NFT mints on Base:  
  `from_address == 0x0`, `to_address == wallet`, `exclude_spam=true`

From these we derive:

- `overall.tier` – average tier (0–5)  
- `overall.score` – normalized 0–100 score

---

## Beast preview (visual avatar)

Metric → trait mapping:

- `size`           ← `activity_days`
- `muscles`        ← `tx_count`
- `weapon`         ← `defi_swaps`
- `shield`         ← `liquidity_yield`
- `armor`          ← `builder`
- `neck_medallion` ← `nft_mints`
- `helmet`         ← `social`
- `ring`           ← `gas_spent`
- `boots`          ← `defi_volume`

User type:

- `Builder` if `builderTier ≥ 4`
- `Influencer` if `socialTier ≥ 4`
- otherwise `User`

Backend returns a `beast_preview` JSON object with `species_id`, `rarity`, `user_type` and all visual traits.

---

## Architecture

- **backend/** – Express + Node.js scoring engine
- **contracts/** – Solidity contracts on Base mainnet
- **scripts/** – deployment, score push, debug, mint helpers

### Backend (`backend/server.js`)

Uses:

- Moralis Web3 API (wallet stats, swaps, DeFi summary, NFT transfers)
- Blockscout API for Base (tx history + gas)
- manual overrides for Builder / Social scores

Main endpoints:

- `GET /` – healthcheck  
- `GET /api/wallet/:address/score` – build the full Beast profile  
- `GET /api/beast/:tokenId/metadata` – static mock NFT metadata (MVP)

### Smart contracts

**BeastScoreRegistry.sol**

Stores a compact `BeastScore` struct (10 `uint8` fields) for each address and exposes:

- `setScore(address user, BeastScore score)` – called by a score oracle
- `getScore(address user)` – read-only view

**BaseBeastNFT.sol**

ERC‑721 that:

1. Reads a user’s `BeastScore` from the registry  
2. Snapshots it into a mapping for the new `tokenId`  
3. Mints the NFT to the caller

This way the NFT reflects the wallet’s state at mint time.

### Scripts

Examples:

- `deployBeastScoreRegistry.ts` – deploy registry to Base  
- `deployBaseBeastNFT.ts` – deploy NFT contract  
- `pushBeastScore.mjs` – fetch score from backend and write it onchain  
- `debugRegistry.mjs` – read and pretty-print a wallet’s onchain score  
- `mintBeast.mjs` – mint a Base Beast NFT using the current onchain score

---

## Environment

Example `.env` (root of the project):

```env
RPC_URL=https://mainnet.base.org

MORALIS_API_KEY=...

ETHERSCAN_API_KEY=...        # optional, depends on your plan

PRIVATE_KEY=0x...            # deployer / dev account

SCORE_ORACLE_PRIVATE_KEY=0x...
BEAST_REGISTRY_ADDRESS=0x...
BEAST_NFT_ADDRESS=0x...
BEAST_BACKEND_URL=http://localhost:4000
```

---

## Roadmap

- Replace manual Builder / Social scores with real APIs (Talent Protocol, social reputation)  
- Improve DeFi coverage for protocols not yet visible in Moralis (e.g. Morpho, others)  
- Make NFT metadata dynamic and driven by `beast_preview` + onchain snapshots  
- Build a minimal dApp: connect wallet → show Beast → mint NFT  
- Offer partner dashboards and segmentation tools using Beast tiers

---

## Related repos

- 🎓 Base Playground – learning sandbox for Base & Solidity:  
  https://github.com/KaanBagnyuk/base-playground

