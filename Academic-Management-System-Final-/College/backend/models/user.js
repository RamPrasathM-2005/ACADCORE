// models/user.js
import { DataTypes } from "sequelize";

export default (sequelize) => {
  const User = sequelize.define("User", {
    userId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    companyId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    userNumber: { type: DataTypes.STRING, allowNull: false, unique: true }, 
    userName: { type: DataTypes.STRING, allowNull: true },
    userMail: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    roleId: { type: DataTypes.INTEGER, allowNull: false },
    departmentId: { type: DataTypes.INTEGER, allowNull: false }, 
    status: { type: DataTypes.ENUM("Active", "Inactive"), defaultValue: "Active" },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    timestamps: true,
    paranoid: true,
    tableName: "users"
  });

  User.associate = (models) => {
    // 1. Check associations to prevent crashes if models aren't loaded
    if (models.Company) {
      User.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
    }
    
    if (models.Role) {
      User.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
    }

    if (models.Department) {
      User.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
    }

    // 2. Profile Links
    if (models.Employee) {
      User.hasOne(models.Employee, { foreignKey: 'staffNumber', sourceKey: 'userNumber', as: 'employeeProfile' });
    }
    
    if (models.StudentDetails) {
      User.hasOne(models.StudentDetails, { foreignKey: 'registerNumber', sourceKey: 'userNumber', as: 'studentProfile' });
    }
    
    // 3. CBCS Links (Inverse of CBCSSectionStaff)
    if (models.CBCSSectionStaff) {
      User.hasMany(models.CBCSSectionStaff, { foreignKey: 'staffId', as: 'cbcsAllocations' });
    }
  };

  return User;
};