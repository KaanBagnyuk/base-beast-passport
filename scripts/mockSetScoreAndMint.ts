import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const [user] = await ethers.getSigners();
  console.log("Using account:", user.address);

  const registryAddress = "0x8B4feE104054fa90164Bdbff25C767FB956C53ce";
  const nftAddress = "0x9a6C1342f5dab9b86443a1C27E312AD95E12A43e"; // <-- адрес BaseBeastNFT

  const registry = await ethers.getContractAt(
    "BeastScoreRegistry",
    registryAddress
  );
  const nft = await ethers.getContractAt("BaseBeastNFT", nftAddress);

  // ВАЖНО: передаём score как tuple.
  // Порядок полей ДОЛЖЕН 1-в-1 совпадать со struct BeastScore в контракте:
  //
  // struct BeastScore {
  //   uint8 activityDaysTier; // 0
  //   uint8 txCountTier;      // 1
  //   uint8 defiSwapsTier;    // 2
  //   uint8 liquidityTier;    // 3
  //   uint8 builderTier;      // 4
  //   uint8 nftMintsTier;     // 5
  //   uint8 socialTier;       // 6
  //   uint8 gasSpentTier;     // 7
  //   uint8 defiVolumeTier;   // 8
  //   uint8 coinbaseTier;     // 9
  //   uint8 overallTier;      // 10
  // }
  //
  // Здесь просто тестовые значения, чтобы руками проверить минт и отображение.
  const scoreTuple = [
    3, // activityDaysTier      (Base-посетитель с историей)
    4, // txCountTier           (довольно активный)
    2, // defiSwapsTier         (немного DeFi)
    2, // liquidityTier         (базовая ликвидность)
    4, // builderTier           (Base Builder)
    3, // nftMintsTier          (NFT Enthusiast)
    1, // socialTier            (Observer)
    2, // gasSpentTier          (немного газа сожжено)
    3, // defiVolumeTier        (Explorer Boots)
    5, // coinbaseTier          (Coinbase KYC: да → серьга есть)
    4, // overallTier           (Base Veteran)
  ];

  console.log("Setting score in BeastScoreRegistry...");
  const tx1 = await registry.setScore(user.address, scoreTuple);
  await tx1.wait();
  console.log("✅ Score set!");

  // Читаем, что реально лежит в реестре
  const onchainScore = await registry.getScore(user.address);
  console.log("Onchain score from registry:", onchainScore);

  console.log("Minting Base Beast NFT...");
  const tx2 = await nft.mintFromScore();
  await tx2.wait();
  console.log("🎉 Beast minted!");

  const balance = await nft.balanceOf(user.address);
  console.log("Your BEAST NFT balance:", balance.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
