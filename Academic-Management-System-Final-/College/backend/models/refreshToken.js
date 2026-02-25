import { DataTypes } from "sequelize";

export default (sequelize) => {
  const RefreshToken = sequelize.define(
    "RefreshToken",
    {
      refreshTokenId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      tokenId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      tokenHash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      replacedByTokenId: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      createdByIp: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      userAgent: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
    },
    {
      tableName: "refresh_tokens",
      timestamps: true,
      indexes: [{ fields: ["userId"] }, { fields: ["expiresAt"] }, { fields: ["revokedAt"] }],
    }
  );

  RefreshToken.associate = (models) => {
    if (models.User) {
      RefreshToken.belongsTo(models.User, { foreignKey: "userId", as: "user" });
    }
  };

  return RefreshToken;
};
