export default (sequelize, DataTypes) => {
  const AppSetting = sequelize.define(
    "AppSetting",
    {
      key: {
        type: DataTypes.STRING(120),
        primaryKey: true,
        allowNull: false,
      },
      value: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      createdBy: { type: DataTypes.STRING(150) },
      updatedBy: { type: DataTypes.STRING(150) },
    },
    {
      tableName: "AppSetting",
      timestamps: true,
      createdAt: "createdDate",
      updatedAt: "updatedDate",
    }
  );

  return AppSetting;
};
