export default (sequelize, DataTypes) => {
  const Period = sequelize.define(
    "Period",
    {
      periodId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // maps from frontend payload field: id
      periodNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        validate: { min: 1, max: 12 },
      },
      // maps from frontend payload field: startTime
      startTime: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      // maps from frontend payload field: endTime
      endTime: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      isActive: {
        type: DataTypes.ENUM("YES", "NO"),
        defaultValue: "YES",
      },
      createdBy: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      updatedBy: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
    },
    {
      tableName: "Period",
      timestamps: true,
      createdAt: "createdDate",
      updatedAt: "updatedDate",
      indexes: [
        { unique: true, fields: ["periodNumber"] },
        { fields: ["isActive"] },
      ],
    }
  );

  Period.associate = () => {};

  return Period;
};
