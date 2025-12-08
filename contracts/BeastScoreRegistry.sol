// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BeastScoreRegistry
/// @notice Хранит ончейн-снапшоты Beast Score по кошелькам
///         Структура учитывает 10 метрик (0–5) + overallTier (0–5)
contract BeastScoreRegistry {
    uint8 public constant MAX_TIER = 5;

    /// @notice Структура ончейн-снапшота Beast Score
    /// @dev Все tier-поля должны быть в диапазоне 0–5
    ///      coinbaseTier по нашей логике должен быть либо 0, либо 5
    struct BeastScore {
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

    /// @notice Маппинг кошелёк → ончейн-снапшот BeastScore
    mapping(address => BeastScore) public walletScores;

    /// @notice Адрес оракула, который имеет право писать скор (backend)
    address public scoreOracle;

    event ScoreOracleChanged(address indexed oldOracle, address indexed newOracle);
    event ScoreUpdated(address indexed user, BeastScore score);

    /// @param _scoreOracle Адрес оракула, который будет устанавливать скор
    constructor(address _scoreOracle) {
        require(_scoreOracle != address(0), "Oracle cannot be zero");
        scoreOracle = _scoreOracle;
        emit ScoreOracleChanged(address(0), _scoreOracle);
    }

    modifier onlyScoreOracle() {
        require(msg.sender == scoreOracle, "Not score oracle");
        _;
    }

    /// @notice Смена адреса оракула
    /// @param _newOracle Новый адрес оракула
    function setScoreOracle(address _newOracle) external onlyScoreOracle {
        require(_newOracle != address(0), "Oracle cannot be zero");
        address old = scoreOracle;
        scoreOracle = _newOracle;
        emit ScoreOracleChanged(old, _newOracle);
    }

    /// @notice Установить BeastScore для пользователя
    /// @dev Вызывается только бэкенд-оракулом после пересчёта метрик
    /// @param user Адрес кошелька пользователя
    /// @param score Структура BeastScore с тирами 0–5
    function setScore(address user, BeastScore calldata score) external onlyScoreOracle {
        require(user != address(0), "User cannot be zero");

        // Базовая валидация: все tier-поля в диапазоне 0–5
        _validateTier(score.activityDaysTier);
        _validateTier(score.txCountTier);
        _validateTier(score.defiSwapsTier);
        _validateTier(score.liquidityTier);
        _validateTier(score.builderTier);
        _validateTier(score.nftMintsTier);
        _validateTier(score.socialTier);
        _validateTier(score.gasSpentTier);
        _validateTier(score.defiVolumeTier);
        _validateTier(score.coinbaseTier);
        _validateTier(score.overallTier);

        // Дополнительное правило для coinbaseTier:
        // по логике проекта он либо 0 (не верифицирован), либо 5 (KYC пройден)
        require(
            score.coinbaseTier == 0 || score.coinbaseTier == MAX_TIER,
            "Coinbase tier must be 0 or 5"
        );

        walletScores[user] = score;
        emit ScoreUpdated(user, score);
    }

    /// @notice Получить BeastScore для пользователя
    /// @param user Адрес кошелька
    /// @return Структура BeastScore с сохранёнными тирами
    function getScore(address user) external view returns (BeastScore memory) {
        return walletScores[user];
    }

    /// @dev Внутренний хелпер для проверки, что tier в диапазоне 0–5
    function _validateTier(uint8 tier) internal pure {
        require(tier <= MAX_TIER, "Tier out of range");
    }
}
