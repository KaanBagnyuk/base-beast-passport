// scripts/mintBeast.mjs
// Минтим Base Beast NFT на основе скоринга в BeastScoreRegistry
// И показываем как тировые значения, так и raw-метрики из backend'а

import "dotenv/config";
import { ethers } from "ethers";

const { RPC_URL, BEAST_NFT_ADDRESS, BEAST_BACKEND_URL } = process.env;

// будем использовать MINTER_PRIVATE_KEY, если есть,
// иначе fallback на PRIVATE_KEY
const MINTER_PRIVATE_KEY =
  process.env.MINTER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

if (!RPC_URL) {
  console.error("❌ RPC_URL is missing in .env");
  process.exit(1);
}
if (!BEAST_NFT_ADDRESS) {
  console.error("❌ BEAST_NFT_ADDRESS is missing in .env");
  process.exit(1);
}
if (!MINTER_PRIVATE_KEY) {
  console.error("❌ MINTER_PRIVATE_KEY or PRIVATE_KEY is missing in .env");
  process.exit(1);
}

const BACKEND_URL = BEAST_BACKEND_URL || "http://localhost:4000";

// --- ABI для BaseBeastNFT (минимальный) ----
//
// BeastScoreLocal в контракте BaseBeastNFT:
//
// struct BeastScoreLocal {
//   uint8 activityDaysTier;
//   uint8 txCountTier;
//   uint8 defiSwapsTier;
//   uint8 liquidityTier;
//   uint8 builderTier;
//   uint8 nftMintsTier;
//   uint8 socialTier;
//   uint8 gasSpentTier;
//   uint8 defiVolumeTier;
//   uint8 coinbaseTier;
//   uint8 overallTier;
// }
const BEAST_NFT_ABI = [
  "function mintFromScore() external",
  "function nextTokenId() public view returns (uint256)",
  "function beastScores(uint256 tokenId) public view returns (uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8)",
  "function ownerOf(uint256 tokenId) public view returns (address)"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const minterWallet = new ethers.Wallet(MINTER_PRIVATE_KEY, provider);
const nft = new ethers.Contract(BEAST_NFT_ADDRESS, BEAST_NFT_ABI, minterWallet);

// --- helper: тянуть raw-метрики из backend ---
// Мы будем звать тот же /api/wallet/:address/score и вытаскивать metrics.*.raw_value
async function fetchRawMetricsFromBackend(address) {
  const url = `${BACKEND_URL.replace(/\/$/, "")}/api/wallet/${address}/score`;
  console.log(`🌐 Fetching raw metrics from backend: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Backend HTTP error ${res.status}: ${text.slice(0, 300)}`
    );
  }

  const json = await res.json();
  const metrics = json?.scores?.metrics;

  if (!metrics) {
    throw new Error("Backend response has no scores.metrics");
  }

  return {
    activity_days: metrics.activity_days?.raw_value ?? 0,
    tx_count: metrics.tx_count?.raw_value ?? 0,
    defi_swaps: metrics.defi_swaps?.raw_value ?? 0,
    liquidity_yield: metrics.liquidity_yield?.raw_value ?? 0,
    builder: metrics.builder?.raw_value ?? 0,
    nft_mints: metrics.nft_mints?.raw_value ?? 0,
    social: metrics.social?.raw_value ?? 0,
    gas_spent: metrics.gas_spent?.raw_value ?? 0,
    defi_volume: metrics.defi_volume?.raw_value ?? 0,
    coinbase_verified: metrics.coinbase_verified?.raw_value ?? 0
  };
}

async function mintBeast() {
  console.log("===========================================");
  console.log("🧟 Minting Base Beast NFT");
  console.log("Network RPC:", RPC_URL);
  console.log("NFT address:", BEAST_NFT_ADDRESS);
  console.log("Minter:     ", minterWallet.address);
  console.log("===========================================");

  const balance = await provider.getBalance(minterWallet.address);
  console.log("Minter balance (ETH):", ethers.formatEther(balance));

  const nextTokenId = await nft.nextTokenId();
  console.log("Next tokenId (before mint):", nextTokenId.toString());

  console.log("⛏️ Calling mintFromScore()...");
  const tx = await nft.mintFromScore();
  console.log("⛽ Tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("✅ Tx mined in block", receipt.blockNumber);

  const mintedTokenId = nextTokenId;
  console.log("🎉 Minted Beast tokenId:", mintedTokenId.toString());

  const owner = await nft.ownerOf(mintedTokenId);
  console.log("Owner of token:", owner);

  const scoreTuple = await nft.beastScores(mintedTokenId);
  const tiers = {
    activityDaysTier: Number(scoreTuple[0]),
    txCountTier: Number(scoreTuple[1]),
    defiSwapsTier: Number(scoreTuple[2]),
    liquidityTier: Number(scoreTuple[3]),
    builderTier: Number(scoreTuple[4]),
    nftMintsTier: Number(scoreTuple[5]),
    socialTier: Number(scoreTuple[6]),
    gasSpentTier: Number(scoreTuple[7]),
    defiVolumeTier: Number(scoreTuple[8]),
    coinbaseTier: Number(scoreTuple[9]),
    overallTier: Number(scoreTuple[10])
  };

  console.log("🔎 Onchain BeastScore snapshot (tiers):");
  console.log(tiers);

  // Дополнительно — показываем raw-метрики из backend
  try {
    const raw = await fetchRawMetricsFromBackend(minterWallet.address);
    console.log("📊 Raw metrics from backend (for this wallet):");
    console.log(raw);
  } catch (err) {
    console.error("⚠️ Failed to fetch raw metrics from backend:", err.message);
  }
}

mintBeast().catch((err) => {
  console.error("❌ Error in mintBeast:", err);
  process.exit(1);
});
