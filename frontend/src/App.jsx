import { useEffect, useMemo, useState } from "react";
import visualConfigData from "./config/beast_visual_config.json";

const API_BASE_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

// ───────────────────────────────
// Утилиты
// ───────────────────────────────

function shortAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// Пока всегда один вариант тела: Proto Beast T2/T2
const BEAST_BODY_MEDIA = {
  "2-2": {
    image: "/assets/beast_body/proto_beast_t2.png",
    video: "/assets/beast_body/proto_beast_t2_idle.mp4",
  },
};

function getBeastBodyMedia() {
  return BEAST_BODY_MEDIA["2-2"];
}

// Папки ассетов для слотов
const SLOT_FOLDER_MAP = {
  size: "size",
  muscles: "muscles",
  weapon: "weapon",
  shield: "shield",
  armor: "armor",
  neck_medallion: "neck_medallion",
  helmet: "helmet",
  ring: "ring",
  boots: "boots",
  earring: "earring",
};

function getTraitIconPath(slotKey, tier, iconKey) {
  if (!iconKey || tier === 0) return null;
  const folder = SLOT_FOLDER_MAP[slotKey] || slotKey;
  return `/assets/${folder}/${iconKey}.png`;
}

function getTraitSpinPath(slotKey, tier, iconKey) {
  if (!iconKey || tier === 0) return null;
  const folder = SLOT_FOLDER_MAP[slotKey] || slotKey;
  return `/assets/${folder}/${iconKey}_spin.mp4`;
}

function buildVisualConfigMap(rawConfig) {
  const map = {};
  if (!rawConfig || typeof rawConfig !== "object") return map;
  for (const [slotKey, cfg] of Object.entries(rawConfig)) {
    map[slotKey] = cfg || {};
  }
  return map;
}

// Метрики могут приходить либо массивом, либо объектом
function buildMetricsMap(profile) {
  const rawMetrics = profile?.scores?.metrics;
  const map = {};

  if (Array.isArray(rawMetrics)) {
    for (const m of rawMetrics) {
      if (m && m.key) {
        map[m.key] = m;
      }
    }
    return map;
  }

  if (rawMetrics && typeof rawMetrics === "object") {
    for (const [key, value] of Object.entries(rawMetrics)) {
      if (value && typeof value === "object") {
        const metricKey = value.key || key;
        map[metricKey] = value;
      }
    }
    return map;
  }

  return map;
}

// ───────────────────────────────
// App
// ───────────────────────────────

function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const [profile, setProfile] = useState(null);
  const [hasBeast, setHasBeast] = useState(false);
  const [beastNftInfo, setBeastNftInfo] = useState(null);
  const [beastMetadata, setBeastMetadata] = useState(null);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingBeast, setIsLoadingBeast] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState("");

  const metricsByKey = useMemo(() => buildMetricsMap(profile), [profile]);
  const overall = profile?.scores?.overall || null;
  const beastInfo = profile?.beast_preview || null;

  const visualConfigMap = useMemo(
    () => buildVisualConfigMap(visualConfigData),
    []
  );

  // ───────────────────────────────
  // Подключение кошелька
  // ───────────────────────────────

  async function handleConnect() {
    if (typeof window === "undefined" || !window.ethereum) {
      setError(
        "No wallet detected. Please install MetaMask, Coinbase Wallet or another EVM wallet extension."
      );
      return;
    }
    setError("");
    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (accounts && accounts.length > 0) {
        const addr = String(accounts[0]);
        setWalletAddress(addr);
        setIsConnected(true);
      } else {
        setError("No accounts returned from wallet.");
      }
    } catch (err) {
      console.error("Wallet connect error:", err);
      const msg =
        err && err.message
          ? `Failed to connect wallet: ${err.message}`
          : "Failed to connect wallet.";
      setError(msg);
    } finally {
      setIsConnecting(false);
    }
  }

  // авто-коннект
  useEffect(() => {
    async function tryAutoConnect() {
      if (typeof window === "undefined" || !window.ethereum) return;
      try {
        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });
        if (accounts && accounts.length > 0) {
          const addr = String(accounts[0]);
          setWalletAddress(addr);
          setIsConnected(true);
        }
      } catch (err) {
        console.warn("Auto-connect failed", err);
      }
    }
    tryAutoConnect();
  }, []);

  // ───────────────────────────────
  // Загрузка профиля и Beast NFT
  // ───────────────────────────────

  async function loadProfile(address) {
    if (!address) return;
    setIsLoadingProfile(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/wallet/${address}/score`);
      if (!res.ok) {
        throw new Error(`Score request failed: ${res.status}`);
      }
      const data = await res.json();
      setProfile(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load wallet profile.");
    } finally {
      setIsLoadingProfile(false);
    }
  }

  async function loadBeastNft(address) {
    if (!address) return;
    setIsLoadingBeast(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/wallet/${address}/beast-nft`);
      if (!res.ok) {
        throw new Error(`Beast NFT request failed: ${res.status}`);
      }
      const data = await res.json();
      setBeastNftInfo(data);
      setHasBeast(Boolean(data?.hasBeast));

      if (data?.hasBeast && data?.tokenId != null) {
        const metaRes = await fetch(
          `${API_BASE_URL}/api/beast/${data.tokenId}/metadata`
        );
        if (!metaRes.ok) {
          throw new Error(`Metadata request failed: ${metaRes.status}`);
        }
        const meta = await metaRes.json();
        setBeastMetadata(meta);
      } else {
        setBeastMetadata(null);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load Beast NFT info.");
    } finally {
      setIsLoadingBeast(false);
    }
  }

  useEffect(() => {
    if (!walletAddress) return;
    loadProfile(walletAddress);
    loadBeastNft(walletAddress);
  }, [walletAddress]);

  // ───────────────────────────────
  // Mint / Update
  // ───────────────────────────────

  async function handleMintFirstBeast() {
    if (!walletAddress) return;
    setError("");
    setIsMinting(true);
    try {
      await loadProfile(walletAddress);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/wallet/${walletAddress}/push-onchain`,
          { method: "POST" }
        );
        if (!res.ok) {
          console.warn("push-onchain failed", res.status);
        }
      } catch (err) {
        console.warn("push-onchain error", err);
      }

      await loadBeastNft(walletAddress);
    } catch (err) {
      console.error(err);
      setError("Failed to mint Beast.");
    } finally {
      setIsMinting(false);
    }
  }

  async function handleUpdateBeastAttributes() {
    if (!walletAddress) return;
    setError("");
    setIsMinting(true);
    try {
      await loadProfile(walletAddress);
      if (hasBeast) {
        await loadBeastNft(walletAddress);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update Beast attributes.");
    } finally {
      setIsMinting(false);
    }
  }

  // ───────────────────────────────
  // Выбор контента
  // ───────────────────────────────

  let mainContent = null;

  if (!isConnected) {
    mainContent = (
      <NotConnectedSection
        onConnect={handleConnect}
        isConnecting={isConnecting}
      />
    );
  } else if (isConnected && !hasBeast) {
    mainContent = (
      <MintFirstBeastSection
        walletAddress={walletAddress}
        onMint={handleMintFirstBeast}
        isMinting={isMinting}
        profile={profile}
        isLoadingProfile={isLoadingProfile}
      />
    );
  } else {
    mainContent = (
      <BeastDashboard
        walletAddress={walletAddress}
        profile={profile}
        beastMetadata={beastMetadata}
        metricsByKey={metricsByKey}
        overall={overall}
        beastInfo={beastInfo}
        isLoadingProfile={isLoadingProfile}
        isLoadingBeast={isLoadingBeast}
        onUpdateAttributes={handleUpdateBeastAttributes}
        isUpdating={isMinting}
        visualConfigMap={visualConfigMap}
      />
    );
  }

  // ───────────────────────────────
  // ГЛАВНАЯ ОБЁРТКА (фикс левого края)
  // ───────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <Header
        isConnected={isConnected}
        walletAddress={walletAddress}
        onConnect={handleConnect}
        isConnecting={isConnecting}
      />

      {/* Внешний фон во всю ширину */}
      <main className="pl-0 pr-[1cm] pb-16 pt-8">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {mainContent}
      </main>
    </div>
  );
}

// ───────────────────────────────
// Header
// ───────────────────────────────

function Header({ isConnected, walletAddress, onConnect, isConnecting }) {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="flex items-center justify-between pl-0 pr-[1cm] py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-xl">
            🐉
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide text-slate-100">
              Base Beast Passport
            </div>
            <div className="text-xs text-slate-400">
              Onchain activity avatar for Base
            </div>
          </div>
        </div>

        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 shadow-sm hover:border-blue-500 hover:bg-slate-900/80 disabled:opacity-60"
        >
          {isConnected
            ? shortAddress(walletAddress)
            : isConnecting
            ? "Connecting..."
            : "Connect"}
        </button>
      </div>
    </header>
  );
}

// ───────────────────────────────
// Landing (стейт 0)
// ───────────────────────────────

function NotConnectedSection({ onConnect, isConnecting }) {
  return (
    <section className="grid gap-10 md:grid-cols-[minmax(0,3fr),minmax(0,2fr)] md:items-center">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-[11px] font-medium text-blue-200">
          <span className="text-sm">🐉</span>
          <span>Step 1 — Connect your Base wallet</span>
        </div>

        <h1 className="mt-4 text-3xl font-semibold text-slate-50 md:text-4xl">
          Summon your Base Beast
        </h1>

        <p className="mt-3 max-w-xl text-sm text-slate-400 md:text-base">
          Base Beast Passport turns your onchain activity in the Base network
          into an RPG-style avatar. Your Beast&apos;s body and equipment are
          fully driven by real metrics: transactions, DeFi, NFTs, building and
          social reputation.
        </p>

        <div className="mt-4 space-y-2 text-sm text-slate-300">
          <StepLabel
            index={1}
            text="Connect your wallet on Base — we’ll fetch your live onchain profile."
          />
          <StepLabel
            index={2}
            text="Mint your first Regular Beast with a Proto Beast body."
          />
          <StepLabel
            index={3}
            text="Grow your Beast as you trade, provide liquidity, mint NFTs and build on Base."
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="rounded-full bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-400 disabled:opacity-60"
          >
            {isConnecting ? "Connecting..." : "Connect wallet & start"}
          </button>

          <div className="flex flex-col text-[11px] text-slate-500">
            <span>Network: Base (EVM)</span>
            <span>No gas required to preview your Beast.</span>
          </div>
        </div>
      </div>

      <div className="mt-4 md:mt-0">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-blue-950/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Beast preview
              </div>
              <div className="text-sm font-semibold text-slate-50">
                Onchain profile → avatar
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/80 text-xl">
              🐉
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-400">Every wallet gets:</p>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <Tag>Beast Score (0–100)</Tag>
            <Tag>Activity &amp; Tx tiers</Tag>
            <Tag>DeFi &amp; liquidity</Tag>
            <Tag>NFTs &amp; builder score</Tag>
            <Tag>Social &amp; Coinbase KYC</Tag>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepLabel({ index, text }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[3px] h-4 w-4 rounded-full bg-blue-500/80 text-center text-[10px]">
        {index}
      </span>
      <p>{text}</p>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span className="rounded-full bg-slate-900/80 px-2 py-1 text-slate-200">
      {children}
    </span>
  );
}

// ───────────────────────────────
// Стейт 1 — кошелёк подключён, Beast ещё нет
// ───────────────────────────────

function MintFirstBeastSection({
  walletAddress,
  onMint,
  isMinting,
  profile,
  isLoadingProfile,
}) {
  const overall = profile?.scores?.overall;
  const beastInfo = profile?.beast_preview;

  return (
    <section className="grid gap-8 md:grid-cols-2 md:items-center">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[11px] font-medium text-slate-300">
          <span className="text-sm">✨</span>
          <span>Step 2 — Mint your first Beast</span>
        </div>

        <h1 className="mt-4 text-2xl font-semibold text-slate-50 md:text-3xl">
          Roll your first Regular Beast
        </h1>
        <p className="mt-3 text-sm text-slate-400 md:text-base">
          Your first Beast starts as a Regular Beast with a Proto Beast body
          (Size T2, Muscles T2). Later, as your onchain footprint grows, we’ll
          evolve every part of its body and equipment.
        </p>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Connected wallet</span>
            <span className="font-mono text-slate-100">
              {shortAddress(walletAddress)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <Tag>Beast Type: Regular (default)</Tag>
            <Tag>Size: T2 – Proto Beast</Tag>
            <Tag>Muscles: T2 – Onchain Lifter</Tag>
          </div>

          {overall && (
            <div className="mt-3 border-t border-slate-800 pt-3 text-xs">
              <div className="flex flex-wrap gap-3">
                <Tag>
                  Beast Score:{" "}
                  <span className="font-semibold">{overall.score}</span>/100
                </Tag>
                <Tag>
                  Overall Tier:{" "}
                  <span className="font-semibold">
                    T{overall.tier} – {overall.label}
                  </span>
                </Tag>
                {beastInfo?.rarity && (
                  <Tag>
                    Rarity:{" "}
                    <span className="font-semibold">{beastInfo.rarity}</span>
                  </Tag>
                )}
              </div>
            </div>
          )}

          {isLoadingProfile && (
            <div className="mt-2 text-xs text-slate-500">
              Loading live profile…
            </div>
          )}
        </div>

        <button
          onClick={onMint}
          disabled={isMinting}
          className="mt-6 rounded-full bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-400 disabled:opacity-60"
        >
          {isMinting ? "Minting..." : "Mint your first Beast"}
        </button>
      </div>

      <div className="flex items-center justify-center">
        <div className="flex h-64 w-64 items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-900/40">
          <div className="flex flex-col items-center text-slate-500">
            <span className="text-4xl">🐉</span>
            <span className="mt-2 text-xs">
              Your first Beast will appear here
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────
// Стейт 2 — дашборд зверя
// ───────────────────────────────

function BeastDashboard({
  walletAddress,
  profile,
  beastMetadata,
  metricsByKey,
  overall,
  beastInfo,
  isLoadingProfile,
  isLoadingBeast,
  onUpdateAttributes,
  isUpdating,
  visualConfigMap,
}) {
  const bodyMedia = getBeastBodyMedia();
  const [isBodyPlaying, setIsBodyPlaying] = useState(false);

  const earring = metricsByKey["coinbase_verified"];
  const helmet = metricsByKey["social"];
  const armor = metricsByKey["builder"];
  const neck = metricsByKey["nft_mints"];
  const weapon = metricsByKey["defi_swaps"];
  const shield = metricsByKey["liquidity_yield"];
  const ring = metricsByKey["gas_spent"];
  const boots = metricsByKey["defi_volume"];
  const isVerified = earring?.tier === 5;

  const hasImage = Boolean(bodyMedia?.image);
  const hasVideo = Boolean(bodyMedia?.video);

  return (
    <section className="space-y-6">
      <BeastOverview
        walletAddress={walletAddress}
        overall={overall}
        beastInfo={beastInfo}
        profile={profile}
        beastMetadata={beastMetadata}
      />

      <div className="mt-2">
        <h3 className="text-sm font-semibold text-slate-100">
          Beast Body &amp; Equipment
        </h3>
        <p className="mt-1 text-[11px] text-slate-400">
          Your Beast&apos;s body and gear fully reflect your live onchain
          activity in Base.
        </p>
      </div>

      {/* Основная трёхколоночная область */}
      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Левая колонка со слотами */}
        <div className="flex-1 space-y-3">
          <EquipmentCard
            slotKey="earring"
            title="Beast Earring"
            metric={earring}
            statusLabel="Earring status"
            description="Coinbase / KYC verification."
            visualConfigMap={visualConfigMap}
          />
          <EquipmentCard
            slotKey="helmet"
            title="Beast Helmet"
            metric={helmet}
            statusLabel="Helmet status"
            description="Social / reputation signals."
            visualConfigMap={visualConfigMap}
          />
          <EquipmentCard
            slotKey="armor"
            title="Beast Armor"
            metric={armor}
            statusLabel="Armor status"
            description="Builder / creator score."
            visualConfigMap={visualConfigMap}
          />
          <EquipmentCard
            slotKey="neck_medallion"
            title="Neck Medallion"
            metric={neck}
            statusLabel="Neck Medallion status"
            description="NFT mints and collection activity."
            visualConfigMap={visualConfigMap}
          />
        </div>

        {/* Центр: Beast Body + окно зверя 480x480 */}
        <div className="flex-[1.2] flex flex-col items-center gap-4">
          <div className="w-full max-w-sm">
            <BeastBodySection metricsByKey={metricsByKey} />
          </div>

          <div className="w-full flex justify-center">
            {!hasImage ? (
              <div className="flex flex-col items-center">
                <div className="relative h-[640px] w-[640px] max-w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40 flex items-center justify-center">
                  <span className="text-5xl">🐉</span>
                </div>
                <div className="mt-1 text-center text-[11px] text-slate-500">
                  Beast artwork placeholder
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="group relative h-[640px] w-[640px] max-w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 p-1">
                  <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black">
                    {isBodyPlaying && hasVideo ? (
                      <video
                        key="beast-video"
                        src={bodyMedia.video}
                        autoPlay
                        loop
                        muted
                        playsInline
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    ) : (
                      <img
                        src={bodyMedia.image}
                        alt="Base Beast Body"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block",
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}

                    {/* PLAY поверх PNG */}
                    {!isBodyPlaying && hasVideo && (
                      <button
                        type="button"
                        onClick={() => setIsBodyPlaying(true)}
                        className="absolute inset-0 flex items-center justify-center bg-black/10 text-white transition-colors hover:bg-black/35"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/80 text-[11px] font-semibold text-slate-50 shadow-lg">
                          ▶
                        </div>
                      </button>
                    )}

                    {/* ✕ поверх VIDEO */}
                    {isBodyPlaying && hasVideo && (
                      <button
                        type="button"
                        onClick={() => setIsBodyPlaying(false)}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-black/80 text-xs font-semibold text-slate-100 hover:bg-black"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {hasVideo && (
                  <div className="mt-1 text-center text-[11px] text-slate-500">
                    {isBodyPlaying
                      ? "Tap ✕ to stop animation"
                      : "Click to play animation"}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-1 flex flex-col items-center gap-1">
            <button
              onClick={onUpdateAttributes}
              disabled={isUpdating}
              className="rounded-full bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-400 disabled:opacity-60"
            >
              {isUpdating
                ? "Updating attributes..."
                : "Mint / Update your Beast Attributes"}
            </button>

            {(isLoadingProfile || isLoadingBeast) && (
              <div className="text-xs text-slate-500">
                Refreshing data from backend…
              </div>
            )}
          </div>
        </div>

        {/* Правая колонка со слотами */}
        <div className="flex-1 space-y-3">
          <EquipmentCard
            slotKey="weapon"
            title="Beast Weapon"
            metric={weapon}
            statusLabel="Weapon status"
            description="DeFi swaps and trading."
            visualConfigMap={visualConfigMap}
          />
          <EquipmentCard
            slotKey="shield"
            title="Beast Shield"
            metric={shield}
            statusLabel="Shield status"
            description="Liquidity over time."
            visualConfigMap={visualConfigMap}
          />
          <EquipmentCard
            slotKey="ring"
            title="Beast Ring"
            metric={ring}
            statusLabel="Ring status"
            description="Gas spent on Base."
            visualConfigMap={visualConfigMap}
          />
          <EquipmentCard
            slotKey="boots"
            title="Beast Boots"
            metric={boots}
            statusLabel="Boots status"
            description="DeFi volume across Base."
            visualConfigMap={visualConfigMap}
          />
        </div>
      </div>

      {/* Сводка чисел снизу */}
      <div className="space-y-2">
        <RowInfoLines
          lines={[
            `Verified Beast – ${isVerified ? "Yes" : "No"}`,
            helmet ? `Social Score – ${helmet.raw_value}` : "Social Score – –",
          ]}
        />
        <RowInfoLines
          lines={[
            armor ? `Builder Score – ${armor.raw_value}` : "Builder Score – –",
            neck ? `NFT Mints – ${neck.raw_value}` : "NFT Mints – –",
          ]}
        />
        <RowInfoLines
          lines={[
            weapon ? `DeFi Swaps – ${weapon.raw_value}` : "DeFi Swaps – –",
            shield
              ? `Liquidity – ${shield.raw_value} ($*days snapshot)`
              : "Liquidity – –",
          ]}
        />
        <RowInfoLines
          lines={[
            ring
              ? `Gas spent – ${ring.raw_value} (native units)`
              : "Gas spent – –",
            boots
              ? `DeFi Volume – ${boots.raw_value} ($)`
              : "DeFi Volume – –",
          ]}
        />
      </div>
    </section>
  );
}

function BeastOverview({
  walletAddress,
  overall,
  beastInfo,
  profile,
  beastMetadata,
}) {
  const beastName =
    beastMetadata?.name || beastInfo?.name || shortAddress(walletAddress);
  const userType = beastInfo?.user_type || "-";
  const rarity = beastInfo?.rarity || "-";
  const updatedAt = profile?.updated_at;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            <span>Your Beast dashboard</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-50">
            {beastName}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-800/80 px-2 py-1 text-slate-200">
              User Type: <span className="font-semibold">{userType}</span>
            </span>
            <span className="rounded-full bg-slate-800/80 px-2 py-1 text-slate-200">
              Rarity: <span className="font-semibold">{rarity}</span>
            </span>
          </div>
        </div>

        {overall && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Beast Score
            </div>
            <div className="text-2xl font-bold text-slate-50">
              {overall.score}
              <span className="text-base text-slate-400"> / 100</span>
            </div>
            <div className="mt-1 text-xs text-slate-300">
              Tier T{overall.tier} – {overall.label}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div>
          <span className="text-slate-400">Wallet: </span>
          <span className="font-mono text-slate-300">
            {shortAddress(walletAddress)}
          </span>
        </div>
        {updatedAt && (
          <div>
            <span className="text-slate-400">Last updated: </span>
            <span className="text-slate-300">{updatedAt}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BeastBodySection({ metricsByKey }) {
  const activity = metricsByKey["activity_days"];
  const txCount = metricsByKey["tx_count"];

  const sizeStatus = activity?.tier_label || "Unknown";
  const musclesStatus = txCount?.tier_label || "Unknown";

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-100">Beast Body</h3>
        <span className="text-[12px] uppercase tracking-wide text-slate-500">
          Activity Days &amp; Tx Count
        </span>
      </div>

      <p className="mt-2 text-[12px] text-slate-400">
        Your body size and muscles evolve from your activity days and total
        transactions in Base.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-slate-900/70 p-4">
          <div className="text-[12px] uppercase tracking-wide text-slate-500">
            Size
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {sizeStatus}
          </div>
          <div className="mt-1 text-[12px] text-slate-400">
            Activity Days –{" "}
            <span className="font-mono text-slate-200">
              {activity?.raw_value ?? "–"}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 p-4">
          <div className="text-[12px] uppercase tracking-wide text-slate-500">
            Muscles
          </div>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {musclesStatus}
          </div>
          <div className="mt-1 text-[12px] text-slate-400">
            Tx Count –{" "}
            <span className="font-mono text-slate-200">
              {txCount?.raw_value ?? "–"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────
// Equipment
// ───────────────────────────────

const SLOT_EMOJI = {
  earring: "💎",
  helmet: "🪖",
  armor: "🦺",
  neck_medallion: "🏅",
  weapon: "🗡️",
  shield: "🛡️",
  ring: "💍",
  boots: "👢",
};

function EquipmentCard({
  slotKey,
  title,
  metric,
  statusLabel,
  description,
  visualConfigMap,
}) {
  const cfg = visualConfigMap?.[slotKey] || {};
  const tier = typeof metric?.tier === "number" ? metric.tier : 0;
  const tierNum = tier;
  const tierKey = String(tierNum);
  const tierCfg = cfg.tiers ? cfg.tiers[tierKey] : null;
  const iconKey = tierCfg?.icon_key || null;

  // основная иконка и анимация для текущего tier
  const iconPath =
    iconKey && tierNum > 0 ? getTraitIconPath(slotKey, tierNum, iconKey) : null;
  const spinPath =
    iconKey && tierNum > 0 ? getTraitSpinPath(slotKey, tierNum, iconKey) : null;

  const tierLabel = metric?.tier_label || tierCfg?.name || "Unknown";
  const slotEmoji = SLOT_EMOJI[slotKey] || "⚙️";

  const hasIcon = Boolean(iconPath);
  const hasSpin = Boolean(spinPath);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const boxSize = 240;
  const hasTierConfig = cfg.tiers && Object.keys(cfg.tiers).length > 0;

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/80 text-lg">
            {slotEmoji}
          </div>
          <div>
            <div className="text-[15px] font-semibold text-slate-100">
              {title}
            </div>
            <div className="text-[12px] text-slate-500">{description}</div>
          </div>
        </div>
        {typeof tier === "number" && (
          <div className="text-right text-[12px] text-slate-400">
            <div className="font-mono text-slate-200">T{tier}</div>
            <div className="text-[11px] text-slate-500">tier</div>
          </div>
        )}
      </div>

      <div className="mt-2 text-[12px] text-slate-300">
        {statusLabel} –{" "}
        <span className="font-semibold text-slate-100">{tierLabel}</span>
      </div>

      <div className="mt-2 rounded-xl bg-slate-900/80 p-3 text-[12px] text-slate-500">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">
          Visual slot
        </div>

        {hasIcon || hasSpin ? (
          <>
            <div className="mt-2 flex justify-center">
              <div
                style={{
                  width: boxSize,
                  height: boxSize,
                  borderRadius: 16,
                  overflow: "hidden",
                  background:
                    "radial-gradient(circle at 30% 20%, rgba(96,165,250,0.25), transparent 60%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                {isPlaying && hasSpin ? (
                  <video
                    key={`${slotKey}-spin`}
                    src={spinPath}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{
                      width: "80%",
                      height: "80%",
                      objectFit: "contain",
                      display: "block",
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      setIsPlaying(false);
                    }}
                  />
                ) : hasIcon ? (
                  <img
                    src={iconPath}
                    alt={tierCfg?.name || title}
                    style={{
                      maxWidth: "80%",
                      maxHeight: "80%",
                      objectFit: "contain",
                      display: "block",
                      cursor: hasSpin ? "pointer" : "default",
                    }}
                    onClick={() => {
                      if (hasSpin) setIsPlaying(true);
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}

                {!isPlaying && hasSpin && (
                  <button
                    type="button"
                    onClick={() => setIsPlaying(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/10 text-white transition-colors hover:bg-black/30"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-[10px] font-semibold text-slate-50 shadow-lg">
                      ▶
                    </div>
                  </button>
                )}

                {isPlaying && hasSpin && (
                  <button
                    type="button"
                    onClick={() => setIsPlaying(false)}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-black/80 text-[10px] font-semibold text-slate-100 hover:bg-black"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {hasSpin && (
              <div className="mt-1 text-center text-[10px] text-slate-500">
                {isPlaying
                  ? "Tap ✕ to stop animation"
                  : "Click image or ▶ to play animation"}
              </div>
            )}
          </>
        ) : (
          <div className="mt-1 text-[11px] text-slate-400">
            Item visuals will appear here in the next step.
          </div>
        )}

        {hasTierConfig && (
          <div className="mt-3 border-t border-slate-800 pt-2">
            <button
              type="button"
              onClick={() => setIsGalleryOpen((v) => !v)}
              className="flex items-center gap-1 text-[10px] font-medium text-slate-300 hover:text-blue-300"
            >
              <span>{isGalleryOpen ? "▼" : "▶"}</span>
              <span>Tier gallery (T1–T5)</span>
            </button>

            {isGalleryOpen && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {Object.entries(cfg.tiers)
                  .map(([tKey, tCfg]) => {
                    const tNum = parseInt(tKey, 10);
                    if (Number.isNaN(tNum) || tNum === 0) return null;

                    const tIconPath = tCfg.icon_key
                      ? getTraitIconPath(slotKey, tNum, tCfg.icon_key)
                      : null;

                    if (!tIconPath) return null;

                    const isCurrent = tNum === tierNum;

                    return (
                      <div key={tKey} className="flex flex-col items-center">
                        <div
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: 12,
                            overflow: "hidden",
                            border: isCurrent
                              ? "2px solid rgb(59,130,246)"
                              : "1px solid rgba(30,64,175,0.5)",
                            background:
                              "radial-gradient(circle at 30% 20%, rgba(96,165,250,0.25), transparent 60%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <img
                            src={tIconPath}
                            alt={tCfg?.name || `T${tNum}`}
                            style={{
                              maxWidth: "90%",
                              maxHeight: "90%",
                              objectFit: "contain",
                              display: "block",
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          T{tNum}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RowInfoLines({ lines }) {
  return (
    <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400 md:grid-cols-2">
      {lines.map((line, idx) => (
        <div key={idx} className="flex items-center">
          {line}
        </div>
      ))}
    </div>
  );
}

export default App;
