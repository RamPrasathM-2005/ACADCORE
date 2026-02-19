import { DataTypes } from "sequelize";

export default(sequelize) => {
  const User = sequelize.define("User", {
    userId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    companyId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: "0" },
    userNumber: { type: DataTypes.STRING, allowNull: false, unique: true }, // The unique ID (Register No / Staff ID)
    userName: { type: DataTypes.STRING, allowNull: true },
    userMail: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    roleId: { type: DataTypes.INTEGER, allowNull: false },
    departmentId: { type: DataTypes.INTEGER, allowNull: false }, // Academic Dept ID
    status: { type: DataTypes.ENUM("Active", "Inactive"), defaultValue: "Active" },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    timestamps: true,
    paranoid: true,
    tableName: "users"
  });

  User.associate = (models) => {
    User.belongsTo(models.Company, {
    foreignKey: 'companyId',
    as: 'company'
  });
    User.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
    User.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
    
    // Links to profiles
    User.hasOne(models.Employee, { foreignKey: 'staffNumber', sourceKey: 'userNumber', as: 'employeeProfile' });
    User.hasOne(models.StudentDetails, { foreignKey: 'registerNumber', sourceKey: 'userNumber', as: 'studentProfile' });
    User.hasMany(models.Company, { foreignKey: 'createdBy', as: 'createdCompanies' });
    User.hasMany(models.Company, { foreignKey: 'updatedBy', as: 'updatedCompanies' });
  };

  return User;
};