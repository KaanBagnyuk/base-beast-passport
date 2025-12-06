import { useState } from "react";
import { ethers } from "ethers";

// --- Config (backend + contracts) ---

const BACKEND_URL =
  import.meta.env.VITE_BEAST_BACKEND_URL || "http://localhost:4000";

const DEFAULT_ADDRESS = "0xfd32507B33220E1Be82E9bb83B4Ea74d4B59Cb25";

const BEAST_NFT_ADDRESS =
  import.meta.env.VITE_BEAST_NFT_ADDRESS ||
  "0x80145474Ad3050ec9445D80BF5bfD06612daE4F6";

const BEAST_REGISTRY_ADDRESS =
  import.meta.env.VITE_BEAST_REGISTRY_ADDRESS ||
  "0xA27858BAe75fc60AE72F41A4Ec2eeBAf6Ffa4bE5";

const BASE_CHAIN_ID = Number(import.meta.env.VITE_BASE_CHAIN_ID || "8453");

// --- Minimal ABIs ---

const BEAST_NFT_ABI = [
  // mintFromScore() external returns (uint256)
  "function mintFromScore() external returns (uint256)",
];

const BEAST_REGISTRY_ABI = [
  // getScore(address user) view returns (BeastScore)
  "function getScore(address user) view returns (tuple(uint8 activityDaysTier,uint8 txCountTier,uint8 defiSwapsTier,uint8 liquidityTier,uint8 builderTier,uint8 nftMintsTier,uint8 socialTier,uint8 gasSpentTier,uint8 defiVolumeTier,uint8 overallTier))",
];

function App() {
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  // onchain / mint state
  const [onchainScore, setOnchainScore] = useState(null);
  const [loadingOnchain, setLoadingOnchain] = useState(false);

  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState("");
  const [mintTx, setMintTx] = useState(null);

  // --- Backend: load Beast profile ---

  const handleLoadProfile = async () => {
    setError("");
    setProfile(null);

    const addr = address.trim();
    if (!addr) {
      setError("Please enter a wallet address.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(
        `${BACKEND_URL.replace(/\/$/, "")}/api/wallet/${addr}/score`
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Backend error ${res.status}: ${text.slice(0, 200)}`);
      }

      const json = await res.json();
      setProfile(json);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load Beast profile.");
    } finally {
      setLoading(false);
    }
  };

  // --- Wallet connect (just to grab address / provider) ---

  const handleUseConnectedWallet = async () => {
    try {
      if (!window.ethereum) {
        setError("No Ethereum provider found (MetaMask / Wallet).");
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || !accounts.length) {
        setError("No accounts returned from wallet.");
        return;
      }

      const addr = accounts[0];
      setAddress(addr);
    } catch (err) {
      console.error(err);
      setError("Failed to get wallet from provider.");
    }
  };

  // --- Helpers: provider on Base Mainnet ---

  async function getBrowserProvider() {
    if (!window.ethereum) {
      throw new Error("No Ethereum provider found (MetaMask / Wallet).");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    if (chainId !== BASE_CHAIN_ID) {
      throw new Error(
        `Please switch your wallet to Base Mainnet (chainId ${BASE_CHAIN_ID}). Current chainId: ${chainId}`
      );
    }

    return provider;
  }

  // --- Onchain: read BeastScore from registry ---

  const handleLoadOnchainScore = async () => {
    setMintError("");
    setOnchainScore(null);

    try {
      setLoadingOnchain(true);

      const addr = address.trim();
      if (!addr) {
        throw new Error("Address is empty.");
      }

      if (!BEAST_REGISTRY_ADDRESS) {
        throw new Error("Registry address is not configured.");
      }

      const provider = await getBrowserProvider();

      const registry = new ethers.Contract(
        BEAST_REGISTRY_ADDRESS,
        BEAST_REGISTRY_ABI,
        provider
      );

      const raw = await registry.getScore(addr);

      const parsed = {
        activityDaysTier: Number(raw.activityDaysTier ?? raw[0] ?? 0),
        txCountTier: Number(raw.txCountTier ?? raw[1] ?? 0),
        defiSwapsTier: Number(raw.defiSwapsTier ?? raw[2] ?? 0),
        liquidityTier: Number(raw.liquidityTier ?? raw[3] ?? 0),
        builderTier: Number(raw.builderTier ?? raw[4] ?? 0),
        nftMintsTier: Number(raw.nftMintsTier ?? raw[5] ?? 0),
        socialTier: Number(raw.socialTier ?? raw[6] ?? 0),
        gasSpentTier: Number(raw.gasSpentTier ?? raw[7] ?? 0),
        defiVolumeTier: Number(raw.defiVolumeTier ?? raw[8] ?? 0),
        overallTier: Number(raw.overallTier ?? raw[9] ?? 0),
      };

      setOnchainScore(parsed);
    } catch (err) {
      console.error(err);
      setMintError(err.message || "Failed to load onchain score.");
    } finally {
      setLoadingOnchain(false);
    }
  };

  // --- Onchain: mint Beast NFT via wallet ---

  const handleMintBeast = async () => {
    setMintError("");
    setMintTx(null);

    try {
      if (!profile) {
        throw new Error("Load Beast profile first.");
      }

      const addr = address.trim();
      if (!addr) {
        throw new Error("Address is empty.");
      }

      if (!BEAST_NFT_ADDRESS) {
        throw new Error("NFT contract address is not configured.");
      }

      setMinting(true);

      const provider = await getBrowserProvider();
      const signer = await provider.getSigner();

      const nft = new ethers.Contract(BEAST_NFT_ADDRESS, BEAST_NFT_ABI, signer);

      const tx = await nft.mintFromScore();
      setMintTx({ hash: tx.hash });

      const receipt = await tx.wait();

      setMintTx({
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
      });
    } catch (err) {
      console.error(err);
      setMintError(err.message || "Failed to mint Beast NFT.");
    } finally {
      setMinting(false);
    }
  };

  // --- Derived data for render ---

  const overall = profile?.scores?.overall;
  const metrics = profile?.scores?.metrics || {};
  const tiers = profile?.scores?.tiers || {};
  const visual = profile?.beast_preview?.visual_traits || {};
  const userType = profile?.beast_preview?.user_type;
  const rarity = profile?.beast_preview?.rarity;

  const metricEntries = Object.entries(metrics);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">
              Base Beast Passport
            </h1>
            <p className="text-sm text-slate-400">
              Onchain activity avatar for Base Mainnet.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Controls */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Wallet address (Base)
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="0x..."
              />
            </div>

            <div className="flex flex-row gap-2 mt-2 md:mt-6">
              <button
                onClick={handleUseConnectedWallet}
                className="flex-1 md:flex-none px-3 py-2 rounded-lg border border-slate-700 text-xs md:text-sm hover:bg-slate-800 transition"
              >
                Use connected wallet
              </button>
              <button
                onClick={handleLoadProfile}
                disabled={loading}
                className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-sky-500 text-xs md:text-sm font-semibold hover:bg-sky-400 disabled:opacity-60 disabled:hover:bg-sky-500 transition"
              >
                {loading ? "Loading..." : "Load Beast Profile"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-2 text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </section>

        {/* Overview + Visual */}
        {profile && (
          <section className="grid gap-4 md:grid-cols-[2fr,3fr]">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-200">
                  Beast Overview
                </h2>
                <span className="text-[11px] text-slate-400">
                  Network: {profile.network}
                </span>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-sky-400">
                  {overall?.score ?? 0}
                </span>
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    Beast Score / 100
                  </span>
                  <span className="text-sm text-slate-300">
                    {overall?.label || "Newcomer"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950/60 rounded-lg border border-slate-800 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Overall Tier
                  </div>
                  <div className="text-lg font-semibold">
                    {overall?.tier ?? 0} / 5
                  </div>
                </div>
                <div className="bg-slate-950/60 rounded-lg border border-slate-800 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Rarity / Type
                  </div>
                  <div className="text-sm">
                    {rarity || "Common"} · {userType || "User"}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-slate-400">
                Address:{" "}
                <span className="font-mono text-slate-300 break-all">
                  {profile.address}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Updated at: {profile.updated_at}
              </div>
            </div>

            {/* Visual traits */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-200">
                  Beast Visual Traits
                </h2>
                <span className="text-[11px] text-slate-500">
                  Preview (text-only MVP)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(visual).map(([key, trait]) => (
                  <div
                    key={key}
                    className="bg-slate-950/60 rounded-lg border border-slate-800 px-3 py-2 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">
                        {key}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Tier {trait.tier ?? 0}/5
                      </span>
                    </div>
                    <div className="text-[11px] text-sky-300">
                      {trait.label}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {trait.description}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Metric: {trait.source_metric}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Metrics table */}
        {profile && metricEntries.length > 0 && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">
                Metrics Breakdown
              </h2>
              <span className="text-[11px] text-slate-500">
                All metrics in tiers 0–5
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800">
                    <th className="text-left px-2 py-2 font-medium text-slate-400">
                      key
                    </th>
                    <th className="text-left px-2 py-2 font-medium text-slate-400">
                      label
                    </th>
                    <th className="text-left px-2 py-2 font-medium text-slate-400">
                      category
                    </th>
                    <th className="text-right px-2 py-2 font-medium text-slate-400">
                      raw
                    </th>
                    <th className="text-right px-2 py-2 font-medium text-slate-400">
                      tier
                    </th>
                    <th className="text-left px-2 py-2 font-medium text-slate-400">
                      tier label
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metricEntries.map(([key, m]) => (
                    <tr
                      key={key}
                      className="border-b border-slate-800/70 hover:bg-slate-900/70"
                    >
                      <td className="px-2 py-1 font-mono text-[11px] text-slate-400">
                        {key}
                      </td>
                      <td className="px-2 py-1 text-slate-100">
                        {m.label}
                      </td>
                      <td className="px-2 py-1 text-slate-400">
                        {m.category}
                      </td>
                      <td className="px-2 py-1 text-right text-slate-200">
                        {typeof m.raw_value === "number"
                          ? m.raw_value.toFixed(4).replace(/\.?0+$/, "")
                          : m.raw_value}
                      </td>
                      <td className="px-2 py-1 text-right text-slate-200">
                        {m.tier}
                      </td>
                      <td className="px-2 py-1 text-slate-300">
                        {m.tier_label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Onchain registry + Mint section */}
        {profile && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-sm font-semibold text-slate-200">
                Onchain registry & mint
              </h2>
              <span className="text-[11px] text-slate-500">
                Base Mainnet · NFT: {BEAST_NFT_ADDRESS.slice(0, 6)}…
                {BEAST_NFT_ADDRESS.slice(-4)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-1">
              <button
                onClick={handleLoadOnchainScore}
                disabled={loadingOnchain || minting}
                className="px-3 py-2 rounded-lg border border-slate-700 text-xs hover:bg-slate-800 disabled:opacity-60"
              >
                {loadingOnchain ? "Loading onchain score..." : "Load onchain score"}
              </button>
              <button
                onClick={handleMintBeast}
                disabled={minting}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-60"
              >
                {minting ? "Minting Beast..." : "Mint Beast NFT"}
              </button>
            </div>

            {onchainScore && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mt-1">
                {Object.entries(onchainScore).map(([key, value]) => (
                  <div
                    key={key}
                    className="bg-slate-950/60 rounded-lg border border-slate-800 px-3 py-2"
                  >
                    <div className="text-[11px] text-slate-500 mb-1">
                      {key}
                    </div>
                    <div className="text-sm text-slate-200 font-semibold">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mintTx && (
              <div className="mt-2 text-[11px] text-emerald-300">
                ✅ Mint transaction sent.
                <br />
                Tx hash:{" "}
                <a
                  href={`https://basescan.org/tx/${mintTx.hash}`}
                  className="underline break-all"
                  target="_blank"
                  rel="noreferrer"
                >
                  {mintTx.hash}
                </a>
                {mintTx.blockNumber && (
                  <>
                    <br />
                    Included in block: {mintTx.blockNumber}
                  </>
                )}
              </div>
            )}

            {mintError && (
              <div className="mt-2 text-[11px] text-red-400 bg-red-950/40 border border-red-800 rounded-md px-3 py-2">
                {mintError}
              </div>
            )}
          </section>
        )}

        {!profile && !loading && !error && (
          <p className="text-xs text-slate-500">
            Enter a Base wallet address and click{" "}
            <span className="text-sky-400 font-semibold">
              Load Beast Profile
            </span>{" "}
            to see the Beast Score and traits.
          </p>
        )}
      </main>
    </div>
  );
}

export default App;
