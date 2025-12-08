// backend/server.js
// Base Beast backend – v0.20
// - All core metrics onchain-based (Blockscout + Moralis)
// - Manual builder & social scores from .env
// - KYC metric (Coinbase verification) via .env list
// - Dynamic NFT metadata endpoint using onchain BeastScoreRegistry

import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

// -----------------------------
// ESM helpers
// -----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------
// Env / config
// -----------------------------
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || "";

const RPC_URL = process.env.RPC_URL || "";
const BEAST_NFT_ADDRESS = process.env.BEAST_NFT_ADDRESS || "";
const BEAST_REGISTRY_ADDRESS = process.env.BEAST_REGISTRY_ADDRESS || "";

const MANUAL_BUILDER_SCORE_RAW =
  process.env.MANUAL_BUILDER_SCORE !== undefined
    ? Number(process.env.MANUAL_BUILDER_SCORE)
    : undefined;

const MANUAL_SOCIAL_SCORE_RAW =
  process.env.MANUAL_SOCIAL_SCORE !== undefined
    ? Number(process.env.MANUAL_SOCIAL_SCORE)
    : undefined;

// Coinbase KYC – MVP через .env (список адресов, прошедших верификацию)
// Поддерживаем оба варианта ключа:
// - COINBASE_VERIFIED_ADDRESSES=0xabc...,0xdef...
// - COINBASE_VERIFIED_WALLETS=0xabc...,0xdef...
const COINBASE_VERIFIED_ENV =
  process.env.COINBASE_VERIFIED_ADDRESSES ||
  process.env.COINBASE_VERIFIED_WALLETS ||
  "";

const COINBASE_VERIFIED_SET = new Set(
  COINBASE_VERIFIED_ENV.split(/[,\s]+/) // запятая, пробелы, переносы строк
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
);

// Onchain provider + minimal ABIs
let rpcProvider = null;
if (RPC_URL) {
  rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
} else {
  console.warn(
    "⚠️ RPC_URL is missing, onchain NFT metadata will use static fallback."
  );
}

// ВАЖНО: тут уже 11 полей в BeastScore (10 метрик + overallTier),
// включая coinbaseTier перед overallTier
const BEAST_REGISTRY_ABI = [
  "function getScore(address user) view returns (tuple(uint8 activityDaysTier,uint8 txCountTier,uint8 defiSwapsTier,uint8 liquidityTier,uint8 builderTier,uint8 nftMintsTier,uint8 socialTier,uint8 gasSpentTier,uint8 defiVolumeTier,uint8 coinbaseTier,uint8 overallTier))",
];

const BEAST_NFT_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
];

// -----------------------------
// Express app
// -----------------------------
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// -----------------------------
// Utils: load JSON from mocks
// -----------------------------
async function loadJsonFromMocks(filename) {
  const filePath = path.join(__dirname, "mocks", filename);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

// -----------------------------
// Tx stats: Blockscout (fallback после Etherscan)
// -----------------------------
//
// Возвращает:
//   { txCount, activityDays, gasSpentNative }
//
// txCount        — количество исходящих tx (from == address)
// activityDays   — число уникальных дней по всем tx (from или to)
// gasSpentNative — суммарный gasUsed * gasPrice по исходящим успешным tx, в ETH
//
async function fetchTxStats(address) {
  const lowerAddr = String(address || "").toLowerCase();
  const defaults = { txCount: 0, activityDays: 0, gasSpentNative: 0 };

  // 1) Сначала пробуем через Etherscan (может вернуть NOTOK на Base free-tier)
  if (ETHERSCAN_API_KEY) {
    try {
      const url = new URL("https://api.etherscan.io/v2/api");
      url.searchParams.set("chainid", "8453");
      url.searchParams.set("module", "account");
      url.searchParams.set("action", "txlist");
      url.searchParams.set("address", address);
      url.searchParams.set("startblock", "0");
      url.searchParams.set("endblock", "99999999");
      url.searchParams.set("sort", "asc");
      url.searchParams.set("apikey", ETHERSCAN_API_KEY);

      console.log("[TxStats] (Etherscan) Fetching:", url.toString());
      const res = await fetch(url);

      if (res.ok) {
        const json = await res.json();
        if (json.status === "1" && Array.isArray(json.result)) {
          let outgoingCount = 0;
          const activeDays = new Set();
          let totalGasWei = 0n;

          for (const tx of json.result) {
            const from = String(tx.from || "").toLowerCase();
            const ts = Number(tx.timeStamp || tx.timestamp || 0);

            if (ts > 0) {
              const day = new Date(ts * 1000).toISOString().slice(0, 10);
              activeDays.add(day);
            }

            if (from === lowerAddr) {
              outgoingCount += 1;

              if (tx.isError === "1") continue;

              try {
                const gasUsed = BigInt(tx.gasUsed || "0");
                const gasPrice = BigInt(tx.gasPrice || "0");
                totalGasWei += gasUsed * gasPrice;
              } catch (err) {
                console.warn(
                  "[TxStats] (Etherscan) BigInt parse failed",
                  err
                );
              }
            }
          }

          const gasSpentNative =
            totalGasWei > 0n ? Number(totalGasWei) / 1e18 : 0;

          return {
            txCount: outgoingCount,
            activityDays: activeDays.size,
            gasSpentNative,
          };
        } else {
          console.warn(
            "[TxStats] (Etherscan) Empty result or error:",
            json.message
          );
        }
      } else {
        const text = await res.text();
        console.error(
          "[TxStats] (Etherscan) HTTP error:",
          res.status,
          text.slice(0, 300)
        );
      }
    } catch (err) {
      console.error("[TxStats] (Etherscan) error:", err);
    }
  }

  // 2) Основной путь для Base: Blockscout
  try {
    const url = new URL("https://base.blockscout.com/api");
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "txlist");
    url.searchParams.set("address", address);
    url.searchParams.set("startblock", "0");
    url.searchParams.set("endblock", "99999999");
    url.searchParams.set("sort", "asc");

    console.log("[TxStats] (Blockscout) Fetching:", url.toString());
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      console.error(
        "[TxStats] (Blockscout) HTTP error:",
        res.status,
        text.slice(0, 300)
      );
      return defaults;
    }

    const json = await res.json();
    const result = Array.isArray(json.result) ? json.result : [];

    let outgoingCount = 0;
    const activeDays = new Set();
    let totalGasWei = 0n;

    for (const tx of result) {
      const from = String(tx.from || "").toLowerCase();
      const ts = Number(tx.timeStamp || tx.timestamp || 0);

      if (ts > 0) {
        const day = new Date(ts * 1000).toISOString().slice(0, 10);
        activeDays.add(day);
      }

      if (from === lowerAddr) {
        outgoingCount += 1;

        if (tx.isError === "1") continue;

        try {
          const gasUsed = BigInt(tx.gasUsed || "0");
          const gasPrice = BigInt(tx.gasPrice || "0");
          totalGasWei += gasUsed * gasPrice;
        } catch (err) {
          console.warn("[TxStats] (Blockscout) BigInt parse failed", err);
        }
      }
    }

    const gasSpentNative =
      totalGasWei > 0n ? Number(totalGasWei) / 1e18 : 0;

    console.log(
      `[TxStats] (Blockscout) txCount=${outgoingCount}, activityDays=${activeDays.size}, gasSpent=${gasSpentNative} ETH`
    );

    return {
      txCount: outgoingCount,
      activityDays: activeDays.size,
      gasSpentNative,
    };
  } catch (err) {
    console.error("[TxStats] (Blockscout) error:", err);
    return defaults;
  }
}

// -----------------------------
// Moralis: NFT mints with spam filter (unique tokens)
// -----------------------------
async function fetchNftMintsFromMoralis(address) {
  const apiKey = MORALIS_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ MORALIS_API_KEY is missing, returning nftMintsRaw = 0");
    return 0;
  }

  const baseUrl = `https://deep-index.moralis.io/api/v2.2/${address}/nft/transfers`;
  const maxPages = 5;
  const limit = 100;

  let cursor = null;
  const lowerAddr = address.toLowerCase();
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  const mintedTokens = new Set();

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set("chain", "base");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("order", "DESC");
    url.searchParams.set("exclude_spam", "true");

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    console.log(
      `🔍 Moralis NFT transfers page ${page + 1}, cursor=${cursor || "none"}`
    );

    const res = await fetch(url.toString(), {
      headers: {
        "X-API-Key": apiKey,
        accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `❌ Moralis NFT transfers error ${res.status}: ${text.slice(0, 300)}`
      );
      break;
    }

    const data = await res.json();
    const transfers = Array.isArray(data.result) ? data.result : [];

    for (const tx of transfers) {
      const from = (tx.from_address || tx.fromAddress || "").toLowerCase();
      const to = (tx.to_address || tx.toAddress || "").toLowerCase();
      const possibleSpam =
        tx.possible_spam === true || tx.possible_spam === "true";

      if (possibleSpam) continue;

      if (from === zeroAddress && to === lowerAddr) {
        const tokenAddress = (
          tx.token_address ||
          tx.tokenAddress ||
          ""
        ).toLowerCase();
        const tokenId = String(tx.token_id || tx.tokenId || "");

        if (tokenAddress && tokenId) {
          mintedTokens.add(`${tokenAddress}:${tokenId}`);
        }
      }
    }

    cursor = data.cursor;
    if (!cursor) break;
  }

  const totalMints = mintedTokens.size;
  console.log(
    `✅ NFT mints (spam filtered, unique tokens) for ${address}: ${totalMints}`
  );
  return totalMints;
}

// -----------------------------
// Moralis: DeFi swaps & volume
// -----------------------------
async function fetchDefiSwapsFromMoralis(address) {
  if (!MORALIS_API_KEY) {
    return { swapsCount: 0, swapsVolumeUsd: 0 };
  }

  let cursor = null;
  let page = 0;
  const maxPages = 5;

  let swapsCount = 0;
  let swapsVolumeUsd = 0;

  try {
    while (page < maxPages) {
      const url = new URL(
        `https://deep-index.moralis.io/api/v2.2/wallets/${address}/swaps`
      );
      url.searchParams.set("chain", "base");
      url.searchParams.set("limit", "100");
      url.searchParams.set("order", "DESC");
      if (cursor) url.searchParams.set("cursor", cursor);

      console.log("[DeFiSwaps] (Moralis) Fetching:", url.toString());

      const res = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "X-API-Key": MORALIS_API_KEY,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          "[DeFiSwaps] HTTP error:",
          res.status,
          text.slice(0, 300)
        );
        break;
      }

      const json = await res.json();
      const result = Array.isArray(json?.result) ? json.result : [];

      for (const swap of result) {
        swapsCount += 1;
        const v = Number(
          swap.totalValueUsd || swap.total_value_usd || 0
        );
        if (!Number.isNaN(v)) {
          swapsVolumeUsd += v;
        }
      }

      cursor = json.cursor || null;
      page += 1;
      if (!cursor) break;
    }
  } catch (err) {
    console.error("[DeFiSwaps] Error:", err);
  }

  return { swapsCount, swapsVolumeUsd };
}

// -----------------------------
// Moralis: DeFi Liquidity / Yield summary (v0)
// Сейчас возвращает "моментальный" TVL (USD) + unclaimed rewards,
// но тировая шкала уже заточена под будущий USD*DAYS агрегатор.
// -----------------------------
async function fetchLiquidityYieldFromMoralis(address) {
  const apiKey = MORALIS_API_KEY;
  if (!apiKey) {
    console.warn(
      "⚠️ MORALIS_API_KEY is missing, returning liquidityYieldRaw = 0"
    );
    return 0;
  }

  const baseUrl = `https://deep-index.moralis.io/api/v2.2/wallets/${address}/defi/summary`;

  const url = new URL(baseUrl);
  url.searchParams.set("chain", "base");

  console.log(`🔍 Moralis DeFi summary for ${address}: ${url.toString()}`);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "X-API-Key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `❌ Moralis DeFi summary error ${res.status}: ${text.slice(0, 300)}`
    );
    return 0;
  }

  const data = await res.json();

  const totalValue = Number(data.total_usd_value || 0);
  const totalUnclaimed = Number(data.total_unclaimed_usd_value || 0);

  const safeTotal =
    (Number.isFinite(totalValue) ? totalValue : 0) +
    (Number.isFinite(totalUnclaimed) ? totalUnclaimed : 0);

  console.log(
    `✅ DeFi summary for ${address}: total_usd_value=${totalValue}, total_unclaimed_usd_value=${totalUnclaimed}, liquidityUsdDaysRaw=${safeTotal}`
  );

  // Сейчас возвращаем просто текущий USD-объём,
  // в будущем сюда встанет настоящий агрегатор USD*DAYS.
  return safeTotal;
}

// -----------------------------
// Tier mapping helpers
// -----------------------------
function clampTier(t) {
  if (!Number.isFinite(t)) return 0;
  return Math.min(5, Math.max(0, Math.round(t)));
}

function mapActivityDaysToTier(days) {
  if (days >= 365) return 5;
  if (days >= 180) return 4;
  if (days >= 60) return 3;
  if (days >= 10) return 2;
  if (days >= 1) return 1;
  return 0;
}

function mapTxCountToTier(tx) {
  if (tx >= 1000) return 5;
  if (tx >= 200) return 4;
  if (tx >= 50) return 3;
  if (tx >= 10) return 2;
  if (tx >= 1) return 1;
  return 0;
}

function mapDefiSwapsToTier(swaps) {
  if (swaps >= 500) return 5;
  if (swaps >= 100) return 4;
  if (swaps >= 25) return 3;
  if (swaps >= 5) return 2;
  if (swaps >= 1) return 1;
  return 0;
}

function mapNftMintsToTier(mints) {
  if (mints >= 51) return 5;
  if (mints >= 21) return 4;
  if (mints >= 11) return 3;
  if (mints >= 6) return 2;
  if (mints >= 3) return 1;
  return 0;
}

// Новая реалистичная шкала под Base (ETH сожжено на газ)
function mapGasSpentToTier(gasEth) {
  if (!Number.isFinite(gasEth) || gasEth <= 0) return 0;

  if (gasEth >= 0.016) return 5;
  if (gasEth >= 0.008) return 4;
  if (gasEth >= 0.002) return 3;
  if (gasEth >= 0.001) return 2;
  // >0 – 0.000999 ETH
  return 1;
}

// Новая шкала DeFi volume (USD)
function mapDefiVolumeToTier(volumeUsd) {
  if (!Number.isFinite(volumeUsd) || volumeUsd <= 0) return 0;

  if (volumeUsd >= 50000) return 5;
  if (volumeUsd >= 10000) return 4;
  if (volumeUsd >= 2000) return 3;
  if (volumeUsd >= 500) return 2;
  // >0 – 499.999
  return 1;
}

// Шкала для Liquidity & Yield в терминах USD*DAYS
// (пока raw ≈ текущий USD TVL, но числа подобраны под будущий агрегатор)
function mapLiquidityUsdDaysToTier(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw >= 500000) return 5;
  if (raw >= 100000) return 4;
  if (raw >= 20000) return 3;
  if (raw >= 5000) return 2;
  return 1;
}

function mapBuilderScoreToTier(score) {
  if (!Number.isFinite(score)) return 0;
  if (score >= 100) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  if (score > 0) return 1;
  return 0;
}

function mapSocialScoreToTier(score) {
  if (!Number.isFinite(score)) return 0;
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  if (score > 0) return 1;
  return 0;
}

// Coinbase KYC 0/1 → Tier
function mapCoinbaseVerifiedToTier(isVerified) {
  return isVerified ? 5 : 0;
}

// -----------------------------
// KYC helper (MVP)
// -----------------------------
function isCoinbaseVerified(address) {
  const lower = String(address || "").toLowerCase();
  if (!lower) return false;

  if (COINBASE_VERIFIED_SET.has(lower)) {
    return true;
  }

  // TODO: в будущем можно добавить:
  // - Guild (роль Coinbase Onchain Verified)
  // - base.org /name API
  // - др. ончейн/оффчейн провайдеры
  return false;
}

// -----------------------------
// Label helpers
// -----------------------------
function labelActivityDays(tier) {
  switch (tier) {
    case 0:
      return "Dormant";
    case 1:
      return "Explorer";
    case 2:
      return "Regular";
    case 3:
      return "Native";
    case 4:
      return "Grinder";
    case 5:
      return "Base Addict";
    default:
      return "Unknown";
  }
}

function labelTxCount(tier) {
  switch (tier) {
    case 0:
      return "No Activity";
    case 1:
      return "Getting Started";
    case 2:
      return "Active User";
    case 3:
      return "Power User";
    case 4:
      return "Onchain DeGen";
    case 5:
      return "Tx Machine";
    default:
      return "Unknown";
  }
}

function labelDefiSwaps(tier) {
  switch (tier) {
    case 0:
      return "No DeFi";
    case 1:
      return "DeFi Tourist";
    case 2:
      return "DeFi User";
    case 3:
      return "DeFi Farmer";
    case 4:
      return "DeFi DeGen";
    case 5:
      return "DeFi Overlord";
    default:
      return "Unknown";
  }
}

function labelLiquidityYield(tier) {
  switch (tier) {
    case 0:
      return "No Liquidity";
    case 1:
      return "Test LP";
    case 2:
      return "Liquidity Provider";
    case 3:
      return "Yield Farmer";
    case 4:
      return "Protocol Pillar";
    case 5:
      return "Liquidity Whale";
    default:
      return "Unknown";
  }
}

function labelBuilder(tier) {
  switch (tier) {
    case 0:
      return "Not a Builder";
    case 1:
      return "Curious";
    case 2:
      return "Budding Builder";
    case 3:
      return "Experienced Builder";
    case 4:
      return "Base Builder";
    case 5:
      return "Master Architect";
    default:
      return "Unknown";
  }
}

function labelNftMints(tier) {
  switch (tier) {
    case 0:
      return "No NFTs";
    case 1:
      return "NFT Newbie";
    case 2:
      return "NFT Collector";
    case 3:
      return "NFT Enthusiast";
    case 4:
      return "NFT DeGen";
    case 5:
      return "NFT Whale";
    default:
      return "Unknown";
  }
}

function labelSocial(tier) {
  switch (tier) {
    case 0:
      return "Silent";
    case 1:
      return "Observer";
    case 2:
      return "Active";
    case 3:
      return "Voice";
    case 4:
      return "Influencer";
    case 5:
      return "Onchain Celebrity";
    default:
      return "Unknown";
  }
}

function labelGasSpent(tier) {
  switch (tier) {
    case 0:
      return "No Ring";
    case 1:
      return "Faded Ring";
    case 2:
      return "Bronze Ring";
    case 3:
      return "Silver Ring";
    case 4:
      return "Gold Ring";
    case 5:
      return "Mythic Ring";
    default:
      return "Unknown Ring";
  }
}

function labelDefiVolume(tier) {
  switch (tier) {
    case 0:
      return "Barefoot";
    case 1:
      return "Dusty Sandals";
    case 2:
      return "Traveler Boots";
    case 3:
      return "Explorer Boots";
    case 4:
      return "Blazing Boots";
    case 5:
      return "Warp Boots";
    default:
      return "Unknown Boots";
  }
}

function labelCoinbaseVerified(tier) {
  switch (tier) {
    case 0:
      return "Unverified";
    case 5:
      return "Coinbase Onchain Verified";
    default:
      return "Unknown";
  }
}

function labelOverallTier(tier) {
  switch (tier) {
    case 0:
      return "Newcomer";
    case 1:
      return "Base Explorer";
    case 2:
      return "Base Adept";
    case 3:
      return "Base Native";
    case 4:
      return "Base Veteran";
    case 5:
      return "Base Legend";
    default:
      return "Unknown";
  }
}

// Рарити для визуального вида
function computeRarityFromOverallTier(overallTier) {
  if (overallTier >= 5) return "Mythic";
  if (overallTier >= 4) return "Legendary";
  if (overallTier >= 3) return "Epic";
  if (overallTier >= 2) return "Rare";
  if (overallTier >= 1) return "Uncommon";
  return "Common";
}

// -----------------------------
// Overall tier / score
// -----------------------------
function computeOverallTier(tiers) {
  const values = Object.values(tiers).map((t) => Number(t || 0));
  if (!values.length) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return clampTier(avg);
}

function computeOverallScore(tiers) {
  const values = Object.values(tiers).map((t) => Number(t || 0));
  if (!values.length) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  const max = 5 * values.length; // теперь 10 метрик → max = 50
  return Math.round((sum / max) * 100);
}

// -----------------------------
// Beast preview builder
// -----------------------------
function computeUserType(builderTier, socialTier) {
  if (!Number.isFinite(builderTier)) builderTier = 0;
  if (!Number.isFinite(socialTier)) socialTier = 0;

  if (builderTier >= 4) return "Builder";
  if (socialTier >= 4) return "Influencer";
  return "User";
}

function buildBeastPreview(basePreview, tiers) {
  const preview = {
    species_id: basePreview?.species_id ?? 1,
    rarity: computeRarityFromOverallTier(tiers.overall || 0),
    user_type: computeUserType(tiers.builder || 0, tiers.social || 0),
    visual_traits: {},
  };

  const visual = basePreview?.visual_traits || {};

  preview.visual_traits.size = {
    source_metric: "activity_days",
    tier: tiers.activity_days || 0,
    label: labelActivityDays(tiers.activity_days || 0),
    description:
      visual.size?.description ||
      "Activity level over time in the Base network.",
  };

  preview.visual_traits.muscles = {
    source_metric: "tx_count",
    tier: tiers.tx_count || 0,
    label: labelTxCount(tiers.tx_count || 0),
    description:
      visual.muscles?.description ||
      "How many transactions this Beast has pushed onchain.",
  };

  preview.visual_traits.weapon = {
    source_metric: "defi_swaps",
    tier: tiers.defi_swaps || 0,
    label: labelDefiSwaps(tiers.defi_swaps || 0),
    description:
      visual.weapon?.description || "DeFi activity through swaps and trades.",
  };

  preview.visual_traits.shield = {
    source_metric: "liquidity_yield",
    tier: tiers.liquidity_yield || 0,
    label: labelLiquidityYield(tiers.liquidity_yield || 0),
    description:
      visual.shield?.description ||
      "Strength of LP, lending and staking positions.",
  };

  preview.visual_traits.armor = {
    source_metric: "builder",
    tier: tiers.builder || 0,
    label: labelBuilder(tiers.builder || 0),
    description:
      visual.armor?.description ||
      "Builder reputation in the Base ecosystem.",
  };

  preview.visual_traits.neck_medallion = {
    source_metric: "nft_mints",
    tier: tiers.nft_mints || 0,
    label: labelNftMints(tiers.nft_mints || 0),
    description:
      visual.neck_medallion?.description || "NFT minting history on Base.",
  };

  preview.visual_traits.helmet = {
    source_metric: "social",
    tier: tiers.social || 0,
    label: labelSocial(tiers.social || 0),
    description:
      visual.helmet?.description || "Offchain & onchain social influence.",
  };

  preview.visual_traits.ring = {
    source_metric: "gas_spent",
    tier: tiers.gas_spent || 0,
    label: labelGasSpent(tiers.gas_spent || 0),
    description:
      visual.ring?.description ||
      "Ring forged from the gas this Beast has burned on Base.",
  };

  preview.visual_traits.boots = {
    source_metric: "defi_volume",
    tier: tiers.defi_volume || 0,
    label: labelDefiVolume(tiers.defi_volume || 0),
    description:
      visual.boots?.description ||
      "Boots that reflect how much DeFi ground this Beast has covered on Base.",
  };

  // 🔥 Новый визуальный слот: серьга = Coinbase KYC
  preview.visual_traits.earring = {
    source_metric: "coinbase_verified",
    tier: tiers.coinbase_verified || 0,
    label: labelCoinbaseVerified(tiers.coinbase_verified || 0),
    description:
      visual.earring?.description ||
      "Earring that appears when this Beast is verified through Coinbase.",
  };

  return preview;
}

// -----------------------------
// Onchain score helpers for metadata
// -----------------------------
function parseBeastScoreTuple(raw) {
  if (!raw) {
    return {
      activityDaysTier: 0,
      txCountTier: 0,
      defiSwapsTier: 0,
      liquidityTier: 0,
      builderTier: 0,
      nftMintsTier: 0,
      socialTier: 0,
      gasSpentTier: 0,
      defiVolumeTier: 0,
      coinbaseTier: 0,
      overallTier: 0,
    };
  }

  return {
    activityDaysTier: Number(raw.activityDaysTier ?? raw[0] ?? 0),
    txCountTier: Number(raw.txCountTier ?? raw[1] ?? 0),
    defiSwapsTier: Number(raw.defiSwapsTier ?? raw[2] ?? 0),
    liquidityTier: Number(raw.liquidityTier ?? raw[3] ?? 0),
    builderTier: Number(raw.builderTier ?? raw[4] ?? 0),
    nftMintsTier: Number(raw.nftMintsTier ?? raw[5] ?? 0),
    socialTier: Number(raw.socialTier ?? raw[6] ?? 0),
    gasSpentTier: Number(raw.gasSpentTier ?? raw[7] ?? 0),
    defiVolumeTier: Number(raw.defiVolumeTier ?? raw[8] ?? 0),
    coinbaseTier: Number(raw.coinbaseTier ?? raw[9] ?? 0),
    overallTier: Number(raw.overallTier ?? raw[10] ?? 0),
  };
}

async function fetchOnchainBeastScoreForToken(tokenId) {
  if (!rpcProvider || !BEAST_NFT_ADDRESS) {
    throw new Error("Onchain config missing (RPC_URL / BEAST_NFT_ADDRESS)");
  }

  // 1) Узнаём владельца токена по NFT-контракту
  const nft = new ethers.Contract(
    BEAST_NFT_ADDRESS,
    BEAST_NFT_ABI,
    rpcProvider
  );
  const owner = await nft.ownerOf(tokenId);

  // 2) Тянем live-скор из нашего же backend'а
  const backendBaseUrl =
    process.env.BEAST_BACKEND_URL || `http://localhost:${PORT}`;

  const resp = await fetch(
    `${backendBaseUrl.replace(/\/$/, "")}/api/wallet/${owner}/score`
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Failed to fetch live score for owner: ${resp.status} ${text.slice(
        0,
        200
      )}`
    );
  }

  const scoreJson = await resp.json();
  const metrics = scoreJson?.scores?.metrics || {};

  const score = {
    activityDaysTier: metrics.activity_days?.tier ?? 0,
    txCountTier: metrics.tx_count?.tier ?? 0,
    defiSwapsTier: metrics.defi_swaps?.tier ?? 0,
    liquidityTier: metrics.liquidity_yield?.tier ?? 0,
    builderTier: metrics.builder?.tier ?? 0,
    nftMintsTier: metrics.nft_mints?.tier ?? 0,
    socialTier: metrics.social?.tier ?? 0,
    gasSpentTier: metrics.gas_spent?.tier ?? 0,
    defiVolumeTier: metrics.defi_volume?.tier ?? 0,
    coinbaseTier: metrics.coinbase_verified?.tier ?? 0,
    overallTier: scoreJson?.scores?.overall?.tier ?? 0,
  };

  console.log(
    `[metadata] tokenId=${tokenId}, owner=${owner}, score=`,
    score
  );

  return { owner, score };
}

// -----------------------------
// Routes
// -----------------------------
app.get("/", (_req, res) => {
  res.json({ ok: true, name: "Base Beast backend", version: "0.20" });
});

// Main scoring endpoint
app.get("/api/wallet/:address/score", async (req, res) => {
  const { address } = req.params;

  if (!address) {
    return res.status(400).json({ error: "Missing address param" });
  }

  try {
    const baseProfile = await loadJsonFromMocks("wallet_profile_example.json");
    const data = JSON.parse(JSON.stringify(baseProfile));

    // 1) Onchain metrics
    const { txCount, activityDays, gasSpentNative } = await fetchTxStats(
      address
    );
    const nftMintsRaw = await fetchNftMintsFromMoralis(address);
    const { swapsCount, swapsVolumeUsd } = await fetchDefiSwapsFromMoralis(
      address
    );
    const liquidityUsdDaysRaw = await fetchLiquidityYieldFromMoralis(address);

    // 2) Manual overrides for builder / social
    let builderScoreRaw = Number(
      data.scores.metrics.builder.raw_value || 0
    );
    let socialScoreRaw = Number(
      data.scores.metrics.social.raw_value || 0
    );

    const overrides = {};
    if (Number.isFinite(MANUAL_BUILDER_SCORE_RAW)) {
      builderScoreRaw = MANUAL_BUILDER_SCORE_RAW;
      overrides.builder_score = MANUAL_BUILDER_SCORE_RAW;
    }
    if (Number.isFinite(MANUAL_SOCIAL_SCORE_RAW)) {
      socialScoreRaw = MANUAL_SOCIAL_SCORE_RAW;
      overrides.social_score = MANUAL_SOCIAL_SCORE_RAW;
    }
    if (Object.keys(overrides).length > 0) {
      console.log(
        `[ManualScores] Overrides for ${address.toLowerCase()}:`,
        JSON.stringify(overrides)
      );
    }

    // 2.1) Coinbase KYC (MVP: через .env список адресов)
    const coinbaseVerified = isCoinbaseVerified(address);
    const coinbaseTier = mapCoinbaseVerifiedToTier(coinbaseVerified);

    // 3) Mapping raw → tiers
    const activityTier = mapActivityDaysToTier(activityDays);
    const txTier = mapTxCountToTier(txCount);
    const defiSwapsTier = mapDefiSwapsToTier(swapsCount);
    const nftMintsTier = mapNftMintsToTier(nftMintsRaw);
    const gasSpentTier = mapGasSpentToTier(gasSpentNative);
    const defiVolumeTier = mapDefiVolumeToTier(swapsVolumeUsd);
    const liquidityTier = mapLiquidityUsdDaysToTier(liquidityUsdDaysRaw);
    const builderTier = mapBuilderScoreToTier(builderScoreRaw);
    const socialTier = mapSocialScoreToTier(socialScoreRaw);

    const tiers = {
      activity_days: activityTier,
      tx_count: txTier,
      defi_swaps: defiSwapsTier,
      liquidity_yield: liquidityTier,
      builder: builderTier,
      nft_mints: nftMintsTier,
      social: socialTier,
      gas_spent: gasSpentTier,
      defi_volume: defiVolumeTier,
      coinbase_verified: coinbaseTier,
    };

    data.scores.tiers = tiers;

    // 4) metrics.*
    const metrics = data.scores.metrics;

    metrics.activity_days.raw_value = activityDays;
    metrics.activity_days.tier = activityTier;
    metrics.activity_days.tier_label = labelActivityDays(activityTier);

    metrics.tx_count.raw_value = txCount;
    metrics.tx_count.tier = txTier;
    metrics.tx_count.tier_label = labelTxCount(txTier);

    metrics.defi_swaps.raw_value = swapsCount;
    metrics.defi_swaps.tier = defiSwapsTier;
    metrics.defi_swaps.tier_label = labelDefiSwaps(defiSwapsTier);

    metrics.nft_mints.raw_value = nftMintsRaw;
    metrics.nft_mints.tier = nftMintsTier;
    metrics.nft_mints.tier_label = labelNftMints(nftMintsTier);

    metrics.gas_spent.raw_value = gasSpentNative;
    metrics.gas_spent.tier = gasSpentTier;
    metrics.gas_spent.tier_label = labelGasSpent(gasSpentTier);

    metrics.defi_volume.raw_value = swapsVolumeUsd;
    metrics.defi_volume.tier = defiVolumeTier;
    metrics.defi_volume.tier_label = labelDefiVolume(defiVolumeTier);

    metrics.liquidity_yield.raw_value = liquidityUsdDaysRaw;
    metrics.liquidity_yield.tier = liquidityTier;
    metrics.liquidity_yield.tier_label = labelLiquidityYield(liquidityTier);

    metrics.builder.raw_value = builderScoreRaw;
    metrics.builder.tier = builderTier;
    metrics.builder.tier_label = labelBuilder(builderTier);

    metrics.social.raw_value = socialScoreRaw;
    metrics.social.tier = socialTier;
    metrics.social.tier_label = labelSocial(socialTier);

    // coinbase_verified metric – создаём, если в моках её нет
    if (!metrics.coinbase_verified) {
      metrics.coinbase_verified = {
        key: "coinbase_verified",
        label: "Coinbase KYC",
        category: "kyc",
        raw_value: 0,
        tier: 0,
        tier_label: "Unverified",
      };
    }

    metrics.coinbase_verified.raw_value = coinbaseVerified ? 1 : 0;
    metrics.coinbase_verified.tier = coinbaseTier;
    metrics.coinbase_verified.tier_label = labelCoinbaseVerified(coinbaseTier);

    // 5) Overall
    const overallTier = computeOverallTier(tiers);
    const overallLabel = labelOverallTier(overallTier);
    const overallScore = computeOverallScore(tiers);

    data.scores.overall.tier = overallTier;
    data.scores.overall.label = overallLabel;
    data.scores.overall.score = overallScore;

    data.address = address;
    data.network = "base-mainnet";
    data.updated_at = new Date().toISOString();

    // 6) Beast preview
    data.beast_preview = buildBeastPreview(baseProfile.beast_preview, {
      ...tiers,
      overall: overallTier,
    });

    res.json(data);
  } catch (err) {
    console.error("[/api/wallet/:address/score] error:", err);
    res.status(500).json({ error: "Failed to build wallet score" });
  }
});

// Dynamic NFT metadata endpoint (onchain-aware)
app.get("/api/beast/:tokenId/metadata", async (req, res) => {
  const tokenIdStr = req.params.tokenId;
  const tokenId = Number(tokenIdStr);

  if (!Number.isInteger(tokenId) || tokenId < 0) {
    return res.status(400).json({ error: "Invalid tokenId" });
  }

  try {
    const baseMetadata = await loadJsonFromMocks("beast_0_metadata.json");

    if (!rpcProvider || !BEAST_NFT_ADDRESS) {
      console.warn(
        "[/api/beast/:tokenId/metadata] Onchain config missing, returning static mock"
      );
      return res.json({
        ...baseMetadata,
        name: `Base Beast #${tokenId}`,
      });
    }

    const { owner, score } = await fetchOnchainBeastScoreForToken(tokenId);

    const rarity = computeRarityFromOverallTier(score.overallTier);
    const userType = computeUserType(score.builderTier, score.socialTier);

    const isCoinbaseVerifiedOnchain = score.coinbaseTier >= 5;

    const attributes = [
      { trait_type: "Species", value: "Proto Beast" },
      { trait_type: "Rarity", value: rarity },
      { trait_type: "User Type", value: userType },

      {
        display_type: "number",
        trait_type: "Activity Days Tier",
        value: score.activityDaysTier,
      },
      {
        display_type: "number",
        trait_type: "Tx Count Tier",
        value: score.txCountTier,
      },
      {
        display_type: "number",
        trait_type: "DeFi Swaps Tier",
        value: score.defiSwapsTier,
      },
      {
        display_type: "number",
        trait_type: "Liquidity & Yield Tier",
        value: score.liquidityTier,
      },
      {
        display_type: "number",
        trait_type: "Builder Tier",
        value: score.builderTier,
      },
      {
        display_type: "number",
        trait_type: "NFT Mints Tier",
        value: score.nftMintsTier,
      },
      {
        display_type: "number",
        trait_type: "Social Tier",
        value: score.socialTier,
      },
      {
        display_type: "number",
        trait_type: "Gas Spent Tier",
        value: score.gasSpentTier,
      },
      {
        display_type: "number",
        trait_type: "DeFi Volume Tier",
        value: score.defiVolumeTier,
      },
      {
        display_type: "number",
        trait_type: "Coinbase Verified Tier",
        value: score.coinbaseTier,
      },
      {
        trait_type: "Coinbase Verified",
        value: isCoinbaseVerifiedOnchain ? "Yes" : "No",
      },
      {
        trait_type: "Owner",
        value: owner,
      },
    ];

    const metadata = {
      ...baseMetadata,
      name: `Base Beast #${tokenId}`,
      attributes,
    };

    res.json(metadata);
  } catch (err) {
    console.error("[/api/beast/:tokenId/metadata] error:", err);

    const msg = String(err.message || "").toLowerCase();
    if (
      msg.includes("nonexistent token") ||
      msg.includes("owner query for nonexistent token")
    ) {
      return res
        .status(404)
        .json({ error: "Beast not found for this tokenId" });
    }

    res.status(500).json({ error: "Failed to build Beast metadata" });
  }
});

// --- Push live Beast score onchain into BeastScoreRegistry ---
app.post("/api/wallet/:address/push-onchain", async (req, res) => {
  try {
    const userAddress = req.params.address;

    if (!ethers.isAddress(userAddress)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const backendBaseUrl =
      process.env.BEAST_BACKEND_URL || "http://localhost:4000";

    const scoreResp = await fetch(
      `${backendBaseUrl.replace(/\/$/, "")}/api/wallet/${userAddress}/score`
    );

    if (!scoreResp.ok) {
      const text = await scoreResp.text();
      return res.status(500).json({
        error: `Failed to fetch live score: ${scoreResp.status} ${text.slice(
          0,
          200
        )}`,
      });
    }

    const scoreJson = await scoreResp.json();

    const metrics = scoreJson?.scores?.metrics || {};
    const overallTier = scoreJson?.scores?.overall?.tier ?? 0;

    const beastScoreStruct = {
      activityDaysTier: metrics.activity_days?.tier ?? 0,
      txCountTier: metrics.tx_count?.tier ?? 0,
      defiSwapsTier: metrics.defi_swaps?.tier ?? 0,
      liquidityTier: metrics.liquidity_yield?.tier ?? 0,
      builderTier: metrics.builder?.tier ?? 0,
      nftMintsTier: metrics.nft_mints?.tier ?? 0,
      socialTier: metrics.social?.tier ?? 0,
      gasSpentTier: metrics.gas_spent?.tier ?? 0,
      defiVolumeTier: metrics.defi_volume?.tier ?? 0,
      coinbaseTier: metrics.coinbase_verified?.tier ?? 0,
      overallTier,
    };

    const rpcUrl = process.env.BASE_RPC_URL;
    const privateKey = process.env.SCORE_ORACLE_PRIVATE_KEY;
    const registryAddress = process.env.BEAST_REGISTRY_ADDRESS;

    if (!rpcUrl || !privateKey || !registryAddress) {
      return res.status(500).json({
        error:
          "Missing BASE_RPC_URL, SCORE_ORACLE_PRIVATE_KEY or BEAST_REGISTRY_ADDRESS in .env",
      });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const registryAbi = [
      "function setScore(address user, tuple(uint8 activityDaysTier,uint8 txCountTier,uint8 defiSwapsTier,uint8 liquidityTier,uint8 builderTier,uint8 nftMintsTier,uint8 socialTier,uint8 gasSpentTier,uint8 defiVolumeTier,uint8 coinbaseTier,uint8 overallTier) score) external",
    ];

    const registry = new ethers.Contract(registryAddress, registryAbi, wallet);

    const tx = await registry.setScore(userAddress, beastScoreStruct);
    const receipt = await tx.wait();

    return res.json({
      ok: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      score: beastScoreStruct,
    });
  } catch (err) {
    console.error("push-onchain error:", err);
    return res.status(500).json({
      error: err.message || "Internal server error while pushing onchain",
    });
  }
});

// --- Detect Beast NFT for wallet (by address) ---
app.get("/api/wallet/:address/beast-nft", async (req, res) => {
  try {
    const userAddress = req.params.address;

    if (!ethers.isAddress(userAddress)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const nftAddress = (process.env.BEAST_NFT_ADDRESS ||
      "0x80145474Ad3050ec9445D80BF5bfD06612daE4F6").toLowerCase();

    const moralisApiKey = process.env.MORALIS_API_KEY;
    if (!moralisApiKey) {
      return res.status(500).json({
        error: "Missing MORALIS_API_KEY in .env",
      });
    }

    const url = `https://deep-index.moralis.io/api/v2.2/${userAddress}/nft?chain=base&token_addresses=${nftAddress}`;

    const resp = await fetch(url, {
      headers: {
        "X-API-Key": moralisApiKey,
        accept: "application/json",
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(500).json({
        error: `Moralis error ${resp.status}: ${text.slice(0, 200)}`,
      });
    }

    const json = await resp.json();
    const results = json.result || json.nfts || [];

    if (!Array.isArray(results) || results.length === 0) {
      return res.json({
        hasBeast: false,
        contract: nftAddress,
        owner: userAddress,
        nfts: [],
      });
    }

    const first = results[0];

    const tokenIdRaw = first.token_id || first.tokenId;
    const tokenId =
      typeof tokenIdRaw === "string"
        ? tokenIdRaw
        : String(tokenIdRaw ?? "");

    if (!tokenId) {
      return res.json({
        hasBeast: false,
        contract: nftAddress,
        owner: userAddress,
        nfts: [],
      });
    }

    return res.json({
      hasBeast: true,
      contract: nftAddress,
      owner: userAddress,
      tokenId,
      nft: first,
    });
  } catch (err) {
    console.error("beast-nft error:", err);
    return res.status(500).json({
      error: err.message || "Failed to detect Beast NFT.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Base Beast backend listening on http://localhost:${PORT}`);
});
