// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./BeastScoreRegistry.sol";

contract BaseBeastNFT is ERC721, Ownable {
    // Ссылка на ончейн-реестр скоров
    BeastScoreRegistry public scoreRegistry;

    // Локальный снапшот скоринга на момент минта
    // Структура зеркалит BeastScoreRegistry.BeastScore,
    // но хранится локально на уровне токена
    struct BeastScoreLocal {
        uint8 activityDaysTier; // 0–5  (Activity Days)
        uint8 txCountTier;      // 0–5  (Tx Count)
        uint8 defiSwapsTier;    // 0–5  (DeFi Swaps)
        uint8 liquidityTier;    // 0–5  (Liquidity & Yield, USD·days)
        uint8 builderTier;      // 0–5  (Builder Score)
        uint8 nftMintsTier;     // 0–5  (NFT Mints)
        uint8 socialTier;       // 0–5  (Social Score)
        uint8 gasSpentTier;     // 0–5  (Gas Spent, ETH)
        uint8 defiVolumeTier;   // 0–5  (DeFi Volume, USD)
        uint8 coinbaseTier;     // 0–5  (Coinbase KYC; по факту 0 или 5)
        uint8 overallTier;      // 0–5  (средний tier по 10 метрикам)
    }

    // Простая визуальная модель (пока без мелких деталей вроде серёжки)
    struct BeastVisual {
        uint8 speciesId; // 0–14
        // 0 = Common, 1 = Rare, 2 = Legendary
        uint8 rarity;
        // 0 = User, 1 = Influencer, 2 = Builder
        uint8 userType;
    }

    uint256 public nextTokenId;
    string private baseTokenURI;

    mapping(uint256 => BeastScoreLocal) public beastScores;
    mapping(uint256 => BeastVisual) public beastVisuals;

    event BeastMinted(
        address indexed user,
        uint256 indexed tokenId,
        BeastVisual visual,
        BeastScoreLocal score
    );

    constructor(address _registry, string memory _baseTokenURI)
        ERC721("Base Beast", "BEAST")
        Ownable(msg.sender)
    {
        require(_registry != address(0), "Registry cannot be zero");
        scoreRegistry = BeastScoreRegistry(_registry);
        baseTokenURI = _baseTokenURI;
    }

    // --- Mint с ончейн-скора ---

    function mintFromScore() external {
        // Берём onchain-скор из реестра
        BeastScoreRegistry.BeastScore memory s = scoreRegistry.getScore(msg.sender);

        // ВАЖНО: в MVP НЕ делаем жёстких require по overallTier,
        // чтобы не ломать минт, если скор = 0 или меняется модель.
        // Если захочется — добавим позже:
        // require(s.overallTier > 0, "No score set for user");

        // Генерим визуальный образ
        BeastVisual memory v = _generateVisual(msg.sender, s);

        // Минтим токен
        uint256 tokenId = nextTokenId;
        nextTokenId += 1;

        _safeMint(msg.sender, tokenId);

        // Сохраняем локальный снапшот скоров
        BeastScoreLocal memory localScore = _convertScore(s);
        beastScores[tokenId] = localScore;
        beastVisuals[tokenId] = v;

        emit BeastMinted(msg.sender, tokenId, v, localScore);
    }

    // --- Внутренняя генерация визуала ---

    function _generateVisual(
        address user,
        BeastScoreRegistry.BeastScore memory s
    ) internal pure returns (BeastVisual memory v) {
        // Простая псевдо-рандомизация на основе адреса и overallTier
        uint256 rand = uint256(
            keccak256(abi.encodePacked(user, s.overallTier))
        );

        uint256 rarityRoll = rand % 100;

        if (rarityRoll < 2) {
            v.rarity = 2; // Legendary (~2%)
        } else if (rarityRoll < 20) {
            v.rarity = 1; // Rare (~18%)
        } else {
            v.rarity = 0; // Common
        }

        // 15 условных видов бейстов
        v.speciesId = uint8((rand / 100) % 15);

        // Логика userType в соответствии с концептом:
        //  - Builder, если builderTier ≥ 4
        //  - Influencer, если socialTier ≥ 4
        //  - иначе User
        if (s.builderTier >= 4) {
            v.userType = 2; // Builder
        } else if (s.socialTier >= 4) {
            v.userType = 1; // Influencer
        } else {
            v.userType = 0; // User
        }
    }

    function _convertScore(
        BeastScoreRegistry.BeastScore memory s
    ) internal pure returns (BeastScoreLocal memory out) {
        out.activityDaysTier = s.activityDaysTier;
        out.txCountTier = s.txCountTier;
        out.defiSwapsTier = s.defiSwapsTier;
        out.liquidityTier = s.liquidityTier;
        out.builderTier = s.builderTier;
        out.nftMintsTier = s.nftMintsTier;
        out.socialTier = s.socialTier;
        out.gasSpentTier = s.gasSpentTier;
        out.defiVolumeTier = s.defiVolumeTier;
        out.coinbaseTier = s.coinbaseTier; // новое поле
        out.overallTier = s.overallTier;
    }

    // --- tokenURI / baseURI ---

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function setBaseTokenURI(string calldata _newBaseURI) external onlyOwner {
        baseTokenURI = _newBaseURI;
    }
}
