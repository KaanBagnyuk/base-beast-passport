Base Beast Passport – README
1. Concept overview
Base Beast Passport is an onchain activity passport for the Base network. Every wallet address gets a dynamic “Beast profile” that turns raw onchain metrics into an RPG-style avatar and a mintable NFT.
•	Each wallet currently gets:
•	A Beast Score from 0–100 derived from multiple onchain metrics (activity, DeFi, NFTs, gas, reputation).
•	A Base Beast NFT where each visual trait (body, weapon, armor, boots, etc.) is tied 1:1 to those metric tiers.
The passport can be used as a visual profile for users on Base (identity, reputation, segmentation) and as a playful surface for dashboards or community tools.
2. High‑level flow
1.	User connects a Base wallet in the dApp (or pastes an address).
2.	Frontend calls the backend scoring API for that address.
3.	Backend fetches live data from Blockscout / Etherscan and Moralis, applies overrides and scoring rules, and returns a structured Beast profile.
4.	Frontend renders the Beast dashboard: scores + metrics + visual avatar (body + equipment slots).
5.	User can optionally push the score onchain and mint a Base Beast NFT that snapshots the current tiers.
3. Architecture
The project is split into four main pieces:
•	Backend – scoring engine & metadata API (`backend/`):
•	Node.js + Express service that fetches onchain / DeFi data, computes tiers and overall Beast Score, and exposes JSON APIs for the frontend and scripts.
•	Also exposes ERC‑721 metadata for already minted Base Beast NFTs.
•	Smart contracts (`contracts/`):
•	BeastScoreRegistry – compact storage of per‑address metric tiers and overall tier.
•	BaseBeastNFT – ERC‑721 that reads a wallet’s BeastScore from the registry and snapshots tiers at mint time.
•	Frontend dApp (`frontend/`):
•	React + Vite single‑page app. Connects to the backend for scoring and, when needed, directly to Base via `ethers`.
•	Renders the Beast dashboard, visual slots, animations and NFT snapshot information.
•	Scripts (`scripts/`):
•	Helper scripts for deploying contracts, pushing scores onchain and minting NFTs from the CLI.
4. Scoring model
The scoring model is built around 10 metrics. Each metric is mapped into a tier from 0 to 5. All tiers together produce an overall tier (0–5) and a normalized Beast Score (0–100).
4.1 Core metrics
•	activity_days – Number of unique days with at least one transaction on Base. Sourced from Base Blockscout / Etherscan API.
•	tx_count – Total number of outgoing transactions from the wallet.
•	gas_spent – Total gasUsed × gasPrice over successful outgoing transactions, summed in native ETH.
4.2 DeFi metrics
•	defi_swaps – Number of DeFi swaps. Moralis `GET /wallets/{address}/swaps` on chain=base.
•	defi_volume – Total USD volume across swaps on Base (sum of totalValueUsd). Roadmap: extend to bridges + LP / lending / borrowing / staking volume.
•	liquidity_yield – Current MVP uses `total_usd_value + total_unclaimed_usd_value` from Moralis `GET /wallets/{address}/defi/summary`. Roadmap: upgrade to a time‑weighted liquidity metric Σ (liquidityUSD_position × days_held).
4.3 Reputation, identity and NFTs
•	builder – Builder Score (0–100 → 0–5 tier). MVP uses manual overrides from `server.js` / `.env`. Roadmap: wire to real builder reputation sources (deployments, contributions, verified projects).
•	social – Social Score (0–100 → 0–5 tier). MVP is manual. Roadmap: plug into social / community reputation graphs.
•	coinbase_verified – Binary KYC / identity flag. MVP: wallet in an env list → tier 5, otherwise 0. Roadmap: real identity integrations such as Coinbase, Guild, Base Names, etc.
•	nft_mints – Number of NFT mints on Base (unique contract + token_id with from=0x0 and to=wallet). Spam is filtered where possible.
From these metrics the backend derives per‑metric tiers, an `overall.tier` (0–5) and an `overall.score` (0–100).
5. Visual system & current UI implementation
Metric tiers are mapped into visual slots of the Beast. The mapping is returned in the `beast_preview` object and configured via `frontend/src/config/beast_visual_config.json`.
Slot ↔ metric mapping:
•	size ← activity_days – overall body size / presence
•	muscles ← tx_count – muscle / physique
•	weapon ← defi_swaps – DeFi activity weapon
•	shield ← liquidity_yield – liquidity / yield shield
•	armor ← builder – builder armor set
•	neck_medallion ← nft_mints – NFT collector medallion
•	helmet ← social – social / voice headgear
•	ring ← gas_spent – gas-forged ring
•	boots ← defi_volume – DeFi journey boots
•	earring ← coinbase_verified – Coinbase / KYC earring
Icons and animations are resolved to static assets under `frontend/public/assets/{slot}/{icon_key}.png` and {icon_key}_spin.mp4. This allows art to be iterated independently of logic.
5.1 Beast dashboard layout (current state)
The main in‑app screen is the Beast dashboard. It is rendered once a wallet is connected and a Beast exists.
•	Key blocks:
•	Header – project name and connected wallet address (shortened).
•	Beast overview card – Beast name, user type, rarity, overall Beast Score, tier label and last updated timestamp.
•	Beast Body & Equipment section – three‑column layout with equipment slots on the left and right and the Beast body in the centre.
5.2 Central Beast body window
The Beast body is rendered inside a fixed 480×480 px window so that PNG and MP4 assets share the same framing:
•	Static mode:
•	Shows the PNG body artwork (`proto_beast_t2.png`) using `object-fit: contain`.
•	Displays a semi‑transparent play overlay with a ▶ button.
•	Animated mode:
•	On click, swaps PNG for the idle MP4 loop (`proto_beast_t2_idle.mp4`) while keeping the same 480×480 container.
•	Shows an ✕ button in the top‑right corner to stop the animation and return to the static image.
Helper text under the window explains the interaction (“Click to play animation” / “Tap ✕ to stop animation”).
5.3 Equipment cards with animations and tier gallery
Each equipment slot (earring, helmet, armor, medallion, weapon, shield, ring, boots) is rendered as a compact card with description and visuals.
•	For every card:
•	Top row – icon emoji, slot title, short description and current tier (T0–T5).
•	Status line – e.g. “Helmet status – Active”, driven by `tier_label`.
•	Visual slot – 170×170 px window with a radial‑gradient background. Inside it either a PNG icon or a spin MP4 is shown at ~80% size with `object-fit: contain`.
•	Overlay controls – ▶ overlay to start the spin animation, ✕ button to stop and return to the static icon. Clicking the image also starts the animation when available.
•	Tier gallery:
•	Below the visual slot there is a collapsible “Tier gallery (T1–T5)” section. When expanded it renders small 60×60 previews for all configured tiers of that slot, with the current tier highlighted in blue.
6. Local development
The project uses Node.js tooling for both backend and frontend. Package manager can be `npm`, `yarn` or `pnpm` depending on your preference.
6.1 Prerequisites
•	You will need:
•	Node.js 18+.
•	A package manager (npm / yarn / pnpm).
•	A Moralis API key and a Base RPC URL for live data.
6.2 Setup
6.	Basic setup steps:
7.	Install dependencies in the root, `backend/` and `frontend/` folders as needed.
8.	Create a `.env` file based on the example and fill in RPC URLs, API keys and contract addresses.
9.	Run the backend server (default: http://localhost:4000).
10.	Run the frontend dApp (default: http://localhost:5173).
6.3 Environment variables (summary)
•	RPC_URL, BASE_RPC_URL – Base mainnet RPC endpoints.
•	MORALIS_API_KEY, ETHERSCAN_API_KEY – data providers.
•	MANUAL_BUILDER_SCORE, MANUAL_SOCIAL_SCORE – optional manual reputation overrides.
•	COINBASE_VERIFIED_ADDRESSES / COINBASE_VERIFIED_WALLETS – comma‑separated wallets treated as KYC‑verified.
•	BEAST_REGISTRY_ADDRESS, BEAST_NFT_ADDRESS – deployed contract addresses.
•	BEAST_BACKEND_URL – backend base URL used by scripts and frontend.
7. Implementation status & next steps
7.1 Backend & contracts
•	Status:
•	Metric collection and scoring pipeline – implemented.
•	BeastScoreRegistry contract – implemented and wired to the backend.
•	BaseBeastNFT contract – implemented with snapshotting of tiers at mint time.
•	Next steps:
•	Replace manual Builder / Social scores with real external reputation sources (deployments, contributions, social graphs).
•	Upgrade `defi_volume` and `liquidity_yield` to more complete, time‑weighted metrics.
•	Replace env‑based Coinbase verification with real identity integrations.
7.2 Frontend dApp
•	Implemented so far:
•	Three high‑level states: not connected (landing), connected but no Beast (mint screen), Beast dashboard.
•	Beast overview card with name, rarity, user type and overall score.
•	Beast Body card with Size / Muscles information driven by `activity_days` and `tx_count`.
•	Central Beast body window with static PNG + click‑to‑play MP4 animation (480×480 px container).
•	Equipment cards for all 8 slots with icons, spin animations and a tier gallery (T1–T5).
•	Wiring to `beast_visual_config.json` and assets under `public/assets/*`.
•	Planned / open items:
•	Finalize responsive layout for small screens (mobile & tablet).
•	Polish spacing between text blocks and attribute cards according to the latest visual layout file.
•	Improve loading / error states and skeletons while data is being fetched.
•	Integrate full wallet interaction flow for pushing scores onchain and minting the NFT directly from the dApp.
•	Add lightweight analytics / debug panel (raw metrics, API timings).
•	Create a shareable view / image export for a user’s Beast (social card).
8. Product roadmap (high‑level)
•	Ship a polished public dApp: connect wallet → see Beast → interact (mint, upgrade, share).
•	Iterate the 2D visual system and move toward a fully rigged 3D Beast model with attachable items per slot.
•	Explore partner dashboards and segmentation tools based on Beast tiers.
•	Experiment with quests / achievements that evolve the Beast over time.
