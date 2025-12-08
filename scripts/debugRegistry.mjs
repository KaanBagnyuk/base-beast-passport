// scripts/debugRegistry.mjs
// Отладка BeastScoreRegistry: смотрим ончейн-оракула и скор по адресу

import "dotenv/config";
import { ethers } from "ethers";

const { RPC_URL, BEAST_REGISTRY_ADDRESS } = process.env;

if (!RPC_URL) {
  console.error("❌ RPC_URL is missing in .env");
  process.exit(1);
}
if (!BEAST_REGISTRY_ADDRESS) {
  console.error("❌ BEAST_REGISTRY_ADDRESS is missing in .env");
  process.exit(1);
}

// ABI только для чтения
// ВАЖНО: структура tuple должна совпадать с BeastScore в BeastScoreRegistry:
//
// struct BeastScore {
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
const BEAST_REGISTRY_ABI = [
  "function scoreOracle() view returns (address)",
  "function getScore(address user) view returns (tuple(uint8 activityDaysTier,uint8 txCountTier,uint8 defiSwapsTier,uint8 liquidityTier,uint8 builderTier,uint8 nftMintsTier,uint8 socialTier,uint8 gasSpentTier,uint8 defiVolumeTier,uint8 coinbaseTier,uint8 overallTier))"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const registry = new ethers.Contract(
  BEAST_REGISTRY_ADDRESS,
  BEAST_REGISTRY_ABI,
  provider
);

async function main() {
  const walletToCheck = process.argv[2];

  if (!walletToCheck) {
    console.error(
      "Usage: node scripts/debugRegistry.mjs <WALLET_ADDRESS>\nExample: node scripts/debugRegistry.mjs 0xfd32507B33220E1Be82E9bb83B4Ea74d4B59Cb25"
    );
    process.exit(1);
  }

  console.log("===========================================");
  console.log("🔍 Debug BeastScoreRegistry");
  console.log("Registry: ", BEAST_REGISTRY_ADDRESS);
  console.log("RPC:      ", RPC_URL);
  console.log("User:     ", walletToCheck);
  console.log("===========================================");

  const oracleOnchain = await registry.scoreOracle();
  console.log("🧠 Onchain scoreOracle:", oracleOnchain);

  const score = await registry.getScore(walletToCheck);
  console.log("📦 Raw onchain score tuple:", score);

  // Распакуем в нормальный объект
  const parsed = {
    activityDaysTier: Number(score.activityDaysTier ?? score[0] ?? 0),
    txCountTier: Number(score.txCountTier ?? score[1] ?? 0),
    defiSwapsTier: Number(score.defiSwapsTier ?? score[2] ?? 0),
    liquidityTier: Number(score.liquidityTier ?? score[3] ?? 0),
    builderTier: Number(score.builderTier ?? score[4] ?? 0),
    nftMintsTier: Number(score.nftMintsTier ?? score[5] ?? 0),
    socialTier: Number(score.socialTier ?? score[6] ?? 0),
    gasSpentTier: Number(score.gasSpentTier ?? score[7] ?? 0),
    defiVolumeTier: Number(score.defiVolumeTier ?? score[8] ?? 0),
    coinbaseTier: Number(score.coinbaseTier ?? score[9] ?? 0),
    overallTier: Number(score.overallTier ?? score[10] ?? 0)
  };

  console.log("🔎 Parsed onchain score:", parsed);
}

main().catch((err) => {
  console.error("❌ Error in debugRegistry:", err);
  process.exit(1);
});
